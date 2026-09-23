// A menu as a frame field: a button that opens a list of entries, each of
// which emits one event when picked. It knows nothing about views or rules;
// what an entry means is the event it carries.

import type { Field } from './frame.ts'
import { type Event, escapeHtml } from './index.ts'
import { placeMenu } from './placement.ts'

/** One entry. `checked` marks it as the current one; `note` is shown muted
 *  after the label. */
export type Entry = {
  label: string
  event: Event
  checked?: boolean
  note?: string
}

let menus = 0

/** A button labelled `label` that opens `entries` as a native popover, under
 *  `heading` when one is given. Picking an entry emits its event and closes
 *  the menu. The popover sits in the top layer, so a frame or a region that
 *  clips its content cannot cut it off. */
export function menu(label: string, entries: Entry[], heading?: string): Field {
  const id = `aleph-menu-${++menus}`
  const items = entries
    .map((entry, index) => {
      const checked = entry.checked ? ' aria-checked="true"' : ' aria-checked="false"'
      const note = entry.note
        ? `<span class="aleph-menu-note">${escapeHtml(entry.note)}</span>`
        : ''
      return `<button class="aleph-menu-entry" type="button" role="menuitemradio"${checked} data-entry="${index}"><span class="aleph-menu-mark" aria-hidden="true">${entry.checked ? '&#10003;' : ''}</span><span class="aleph-menu-label">${escapeHtml(entry.label)}</span>${note}</button>`
    })
    .join('')
  const head = heading ? `<div class="aleph-menu-heading">${escapeHtml(heading)}</div>` : ''
  return {
    html: `<button class="aleph-menu-button" type="button" popovertarget="${id}" aria-haspopup="menu"><span>${escapeHtml(label)}</span><span aria-hidden="true">&#9662;</span></button><div class="aleph-menu" id="${id}" popover role="menu">${head}${items}</div>`,
    hydrate(corner, ctx) {
      const button = corner.querySelector<HTMLButtonElement>('.aleph-menu-button')
      const list = corner.querySelector<HTMLElement>('.aleph-menu')
      if (!button || !list) return
      // Anchor names are document-wide, so each menu gets its own. Set here
      // rather than in the markup, since a strict CSP refuses inline styles.
      button.style.setProperty('anchor-name', `--${id}`)
      list.style.setProperty('position-anchor', `--${id}`)
      const anchored = typeof CSS !== 'undefined' && CSS.supports?.('anchor-name', `--${id}`)
      const place = (event: globalThis.Event) => {
        if (anchored || (event as ToggleEvent).newState !== 'open') return
        const { top, left } = placeMenu(
          button.getBoundingClientRect(),
          { width: list.offsetWidth, height: list.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight }
        )
        list.style.top = `${top}px`
        list.style.left = `${left}px`
      }
      const pick = (event: MouseEvent) => {
        const entry = (event.target as Element | null)?.closest<HTMLElement>('[data-entry]')
        if (!entry) return
        const chosen = entries[Number(entry.dataset.entry)]
        if (!chosen) return
        list.hidePopover?.()
        ctx.emit(chosen.event)
      }
      list.addEventListener('toggle', place)
      list.addEventListener('click', pick)
      return {
        dispose() {
          list.removeEventListener('toggle', place)
          list.removeEventListener('click', pick)
        }
      }
    }
  }
}
