// A frame is a wrapper view: it draws the view that would have drawn the
// resource without it, and sets up to four corner fields over that output.
// Like any view it is picked by a rule or named in a show, so the same view
// can be framed where it is embedded one way and drawn bare, to the pixel,
// where it is embedded another.

import {
  AS,
  type Context,
  escapeHtml,
  type Handle,
  type Resource,
  type Show,
  type View,
  wrap
} from './index.ts'
import { menu } from './menu.ts'

/** The four places a field can sit, named by writing direction. */
export type Corner = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'

/** What sits in one corner. `html` is inserted verbatim; `hydrate` receives
 *  the corner's own element. */
export type Field = {
  html: string
  hydrate?(corner: Element, ctx: Context): Handle | void
}

/** Computes one corner for one render. `view` is the view that drew the
 *  body inside the frame. Answering undefined leaves the corner empty. */
export type FieldOf = (
  resource: Resource,
  view: View,
  ctx: Context,
  show?: Show
) => Field | string | undefined | Promise<Field | string | undefined>

const CORNERS: Corner[] = ['top-start', 'top-end', 'bottom-start', 'bottom-end']

/** The state key under which a frame keeps the view it draws inside. The
 *  frame reads it and `viewSwitch` sets it; both run with the frame's own
 *  context, so the key is the frame's and the view inside never sees it. */
const INSIDE = 'view'

let frames = 0

/** A wrapper view with id `id` that fills `corners`. A corner not named, or
 *  whose field answers undefined, stays empty. It carries no `when`: a rule
 *  or a show picks it. What it draws inside is the rules' choice until a
 *  field sets its state otherwise; the fields receive the frame's own
 *  context for that. */
export function frameView(id: string, corners: Partial<Record<Corner, FieldOf>>): View {
  return {
    id,
    async render(resource, ctx, show) {
      const inner = await ctx.inner({ view: ctx.state(INSIDE).get() })
      const filled: [Corner, Field][] = []
      for (const corner of CORNERS) {
        const field = await corners[corner]?.(resource, inner.view, ctx, show)
        if (field !== undefined)
          filled.push([corner, typeof field === 'string' ? { html: field } : field])
      }
      const frame = `${++frames}`
      const edges = [
        filled.some(([c]) => c.startsWith('top')) ? ' data-top' : '',
        filled.some(([c]) => c.startsWith('bottom')) ? ' data-bottom' : ''
      ].join('')
      const cells = filled
        .map(([c, f]) => `<div class="aleph-corner" data-corner="${c}">${f.html}</div>`)
        .join('')
      return wrap(
        inner,
        (body) => `<div class="aleph-frame" data-frame="${frame}"${edges}>${cells}${body}</div>`,
        (root, ctx) => {
          const handles: Handle[] = []
          for (const [corner, field] of filled) {
            const element = root.querySelector(
              `[data-frame="${frame}"] > [data-corner="${corner}"]`
            )
            const handle = element && field.hydrate?.(element, ctx)
            if (handle) handles.push(handle)
          }
          if (!handles.length) return
          const handle: Handle = {
            dispose: () => {
              for (const h of handles) h.dispose?.()
            }
          }
          if (handles.some((h) => h.update))
            handle.update = (event) => {
              for (const h of handles) {
                const patch = h.update?.(event)
                if (patch) return patch
              }
            }
          return handle
        }
      )
    }
  }
}

// ------------------------------------------------------ fields shipped here

/** The last path segment of the resource's IRI, with the full IRI as its
 *  title. A container keeps its trailing slash. */
export const name: FieldOf = (resource) => {
  const path = new URL(resource.iri).pathname
  const segment = path.split('/').filter(Boolean).pop() ?? resource.iri
  const shown = decodeURIComponent(segment) + (path.endsWith('/') && segment ? '/' : '')
  return `<span class="aleph-frame-name" title="${escapeHtml(resource.iri)}">${escapeHtml(shown)}</span>`
}

/** The resource's content type, without parameters. */
export const contentType: FieldOf = (resource) =>
  escapeHtml(resource.contentType.split(';', 1)[0]!.trim())

/** The last segment of a view id, after its fragment mark or last slash. */
function shortId(id: string): string {
  return id.split(/[#/]/).filter(Boolean).pop() ?? id
}

/** The id of the view that drew the body, shortened to its last segment. */
export const viewName: FieldOf = (_resource, view) => escapeHtml(shortId(view.id))

/** A menu naming the view that drew the body and offering `choices`, each a
 *  view id and a label. Picking one sets the frame's state, so the frame is
 *  drawn again around the view picked and keeps it through later re-renders.
 *
 *  The entries carry `as:View` events, since that is what a pick means, but
 *  none of them is emitted: the menu is handed a context whose `emit` takes
 *  them in, so the choice stays with this frame and no other instance of the
 *  resource, nor the view inside, hears about it. */
export function viewSwitch(choices: [view: string, label: string][]): FieldOf {
  return (resource, view, ctx) => {
    const inside = ctx.state(INSIDE)
    const current = choices.find(([id]) => id === view.id)?.[1] ?? shortId(view.id)
    const picker = menu(
      current,
      choices.map(([id, label]) => ({
        label,
        event: { type: AS.View, object: resource.iri, view: id },
        checked: id === view.id
      })),
      'View'
    )
    return {
      html: picker.html,
      hydrate: (corner, hydrating) =>
        picker.hydrate?.(corner, {
          ...hydrating,
          emit(event) {
            const picked = event.type === AS.View && event.object === resource.iri
            if (picked && typeof event.view === 'string') inside.set(event.view)
            else hydrating.emit(event)
          }
        })
    }
  }
}
