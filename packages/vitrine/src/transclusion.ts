// What a transcluded child is called and what its placeholder looks like.
// Nothing here builds DOM: the browser runtime and the server host write
// the same markup, and the reader below takes an element the caller found.

import { escapeHtml, type Hint } from './index.ts'

export const TRANSCLUDE_ATTR = 'data-aleph-transclude'
export const HINT_ATTR = 'data-aleph-hint'
/** Why the runtime left this placeholder unmounted. */
export const DEFERRED_ATTR = 'data-aleph-deferred'
/** Set on a placeholder whose child could not be mounted. */
export const ERROR_ATTR = 'data-aleph-error'

/** Why a placeholder was left unmounted. `cycle`: the IRI is already an
 *  ancestor. `depth`: the chain reached the limit. */
export type Deferral = 'cycle' | 'depth'

/** What the runtime does with a placeholder when it walks a region. */
export type Mounting = 'auto' | Deferral

/** How deep the runtime mounts on its own. */
export const TRANSCLUDE_DEPTH = 3

/** `auto`, or the reason this child is not mounted without being asked. A
 *  deferred placeholder stays a placeholder, so an ancestor IRI reads as a
 *  spiral one level at a time instead of looping. */
export function mounting(chain: readonly string[], iri: string, depth: number): Mounting {
  if (chain.includes(iri)) return 'cycle'
  return chain.length >= depth ? 'depth' : 'auto'
}

/** Identity of a child under one parent: same key, same instance across a
 *  parent re-render. */
export function transclusionKey(iri: string, hint?: Hint): string {
  return `${iri} ${canonical(hint)}`
}

/** The hint as a string, with its keys in one order and its absent entries
 *  dropped, so that two hints meaning the same thing read the same. */
function canonical(hint: Hint | undefined): string {
  const entries = Object.entries(hint ?? {})
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return JSON.stringify(Object.fromEntries(entries))
}

/** The element a view drops into its own HTML in place of the child. The
 *  runtime mounts into it, or, with `deferred`, leaves it for a later ask. */
export function placeholderHtml(iri: string, hint?: Hint, deferred?: Deferral): string {
  const carried = canonical(hint)
  const hintAttr = carried === '{}' ? '' : ` ${HINT_ATTR}="${escapeHtml(carried)}"`
  const why = deferred === undefined ? '' : ` ${DEFERRED_ATTR}="${deferred}"`
  return `<div ${TRANSCLUDE_ATTR}="${escapeHtml(iri)}"${hintAttr}${why}></div>`
}

/** The IRI, hint and deferral a placeholder carries; nothing when the
 *  element is not one. */
export function readPlaceholder(
  element: Element
): { iri: string; hint?: Hint; deferred?: Deferral } | undefined {
  const iri = element.getAttribute(TRANSCLUDE_ATTR)
  if (iri === null) return undefined
  const carried = element.getAttribute(HINT_ATTR)
  const deferred = element.getAttribute(DEFERRED_ATTR) as Deferral | null
  return {
    iri,
    ...(carried === null ? {} : { hint: JSON.parse(carried) as Hint }),
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
