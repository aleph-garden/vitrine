// The resource a host shows and the location that shows it. Each host brings
// its own scheme: a pod's location is the resource, and aleph.garden's
// carries the IRI behind a reserved segment.

import type { Show } from '@aleph-garden/vitrine'

export type Address = {
  /** The resource: no query, no fragment. */
  readonly iri: string
  readonly show?: Show
  /** The location that shows it, under the host's own origin. */
  readonly href: string
}

export type AddressScheme = {
  /** The resource the given location shows. */
  of(href: string): Address
  /** The location that shows a link target, or undefined when this host
   *  leaves the target to the browser. */
  for(url: string): Address | undefined
}

/** The show a URL carries: the `view` query parameter and the fragment. */
export function showOf(url: URL): Show | undefined {
  const view = url.searchParams.get('view') ?? undefined
  const fragment = url.hash ? decodeURIComponent(url.hash.slice(1)) : undefined
  if (view === undefined && fragment === undefined) return undefined
  const show: Show = {}
  if (view !== undefined) show.view = view
  if (fragment !== undefined) show.fragment = fragment
  return show
}

/** The location itself as the resource, which is a pod's whole scheme and
 *  the case every host falls back to for its own origin. */
export function locationAddress(href: string): Address {
  const url = new URL(href)
  return { iri: `${url.origin}${url.pathname}`, show: showOf(url), href }
}
