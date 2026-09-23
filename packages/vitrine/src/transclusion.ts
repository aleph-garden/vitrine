// What a transcluded child is called and what its placeholder looks like.
// Nothing here builds DOM: the browser runtime and the server host write
// the same markup, and the reader below takes an element the caller found.

import { escapeHtml, type Show } from './index.ts'

export const TRANSCLUDE_ATTR = 'data-aleph-transclude'
export const SHOW_ATTR = 'data-aleph-show'
/** Why the runtime left this placeholder unmounted. */
export const DEFERRED_ATTR = 'data-aleph-deferred'
/** Set on a placeholder whose child could not be mounted. */
export const ERROR_ATTR = 'data-aleph-error'

/** Why a placeholder was left unmounted. `cycle`: the same thing is already
 *  an ancestor. `depth`: the chain reached the limit. */
export type Deferral = 'cycle' | 'depth'

/** What the runtime does with a placeholder when it walks a region. */
export type Mounting = 'auto' | Deferral

/** How deep the runtime mounts on its own. */
export const TRANSCLUDE_DEPTH = 3

/** `auto`, or the reason this child is not mounted without being asked.
 *  `chain` and `thing` are what `thingOf` answers, so a document embedding
 *  its own subjects is no cycle while a subject embedding itself is. A
 *  deferred placeholder stays a placeholder, so an ancestor reads as a spiral
 *  one level at a time instead of looping. */
export function mounting(chain: readonly string[], thing: string, depth: number): Mounting {
  if (chain.includes(thing)) return 'cycle'
  return chain.length >= depth ? 'depth' : 'auto'
}

/** What an embedding is about, for cycle detection: the IRI, with the
 *  fragment the show names when there is one. */
export function thingOf(iri: string, show?: Show): string {
  return show?.fragment === undefined ? iri : `${iri}#${show.fragment}`
}

/** Identity of a child under one parent: same key, same instance across a
 *  parent re-render. */
export function transclusionKey(iri: string, show?: Show): string {
  return `${iri} ${canonical(show)}`
}

/** The show as a string, with its keys in one order and its absent entries
 *  dropped, so that two shows meaning the same thing read the same. */
function canonical(show: Show | undefined): string {
  const entries = Object.entries(show ?? {})
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return JSON.stringify(Object.fromEntries(entries))
}

/** The element a view drops into its own HTML in place of the child. The
 *  runtime mounts into it, or, with `deferred`, leaves it for a later ask. */
export function placeholderHtml(iri: string, show?: Show, deferred?: Deferral): string {
  const carried = canonical(show)
  const showAttr = carried === '{}' ? '' : ` ${SHOW_ATTR}="${escapeHtml(carried)}"`
  const why = deferred === undefined ? '' : ` ${DEFERRED_ATTR}="${deferred}"`
  return `<div ${TRANSCLUDE_ATTR}="${escapeHtml(iri)}"${showAttr}${why}></div>`
}

/** The IRI, show and deferral a placeholder carries; nothing when the
 *  element is not one. */
export function readPlaceholder(
  element: Element
): { iri: string; show?: Show; deferred?: Deferral } | undefined {
  const iri = element.getAttribute(TRANSCLUDE_ATTR)
  if (iri === null) return undefined
  const carried = element.getAttribute(SHOW_ATTR)
  const deferred = element.getAttribute(DEFERRED_ATTR) as Deferral | null
  return {
    iri,
    ...(carried === null ? {} : { show: JSON.parse(carried) as Show }),
    ...(deferred === null ? {} : { deferred })
  }
}

/** What goes into the placeholder when the child's resolve rejected: a 401
 *  on a private note, a 404, the CORS wall in front of a foreign page. Both
 *  hosts write the same element, so both fail alike. */
export function errorHtml(iri: string, error: unknown): string {
  const status = (error as { status?: number } | null)?.status
  const said =
    status === undefined ? '' : ` <span class="status">${escapeHtml(String(status))}</span>`
  return `<p class="transclusion-error">${escapeHtml(iri)}${said}</p>`
}
