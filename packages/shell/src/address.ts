// The resource the shell shows and the location that shows it. One value and
// two constructors, one per direction; the shell's origin is location.origin
// on every host, so neither of them takes it.

import type { Hint } from '@aleph-garden/vitrine'

export type Address = {
  /** The resource: no query, no fragment. */
  readonly iri: string
  readonly hint?: Hint
  /** The location that shows it, under the shell's origin. */
  readonly href: string
}

/** From the address bar: the path after the origin when it begins with
 *  http:// or https://, the location itself otherwise. */
export function addressOf(href: string): Address {
  const url = new URL(href)
  const path = url.pathname.slice(1)
  const iri = /^https?:\/\//.test(path) ? path : `${url.origin}${url.pathname}`
  return { iri, hint: hintOf(url), href }
}

/** From a link target (an IRI with optional query and fragment): unwrapped
 *  through addressOf when it is already under the shell's origin (so a
 *  pasted shell location resolves to the resource it names), placed behind
 *  the shell origin at `${origin}/${target.href}` otherwise. */
export function addressFor(url: string): Address {
  const target = new URL(url)
  if (target.origin === location.origin) return addressOf(target.href)
  return {
    iri: `${target.origin}${target.pathname}`,
    hint: hintOf(target),
    href: `${location.origin}/${target.href}`
  }
}

/** The hint a URL carries: the `view` query parameter and the fragment. */
function hintOf(url: URL): Hint | undefined {
  const view = url.searchParams.get('view') ?? undefined
  const fragment = url.hash ? decodeURIComponent(url.hash.slice(1)) : undefined
  if (view === undefined && fragment === undefined) return undefined
  const hint: Hint = {}
  if (view !== undefined) hint.view = view
  if (fragment !== undefined) hint.fragment = fragment
  return hint
}
