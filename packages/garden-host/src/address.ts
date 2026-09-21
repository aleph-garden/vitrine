// aleph.garden opens any IRI, so a location has to carry one that is not its
// own. It goes behind a reserved first segment:
//
//   https://aleph.garden/-/https://pod.toph.so/notes/a.md
//
// The segment, rather than the IRI's scheme, is what marks a viewer location.
// The routing that picks between the host and a static file then tests one
// segment, a path naming no IRI is a plain 404, and a subject under `urn:`,
// `did:` or `tag:` is addressable without an allowlist of schemes.
//
// The IRI stays unencoded, so that a reader can read it and copy it out.

import type { Address, AddressScheme } from '@aleph-garden/host-core'
import { hintOf, locationAddress } from '@aleph-garden/host-core'

export const PREFIX = '/-/'

export const gardenAddress = {
  of(href): Address {
    const url = new URL(href)
    if (!url.pathname.startsWith(PREFIX)) return locationAddress(href)
    return { iri: decodeURI(url.pathname.slice(PREFIX.length)), hint: hintOf(url), href }
  },
  for(url): Address {
    const target = new URL(url)
    if (target.origin === location.origin) return gardenAddress.of(target.href)
    return {
      iri: `${target.origin}${target.pathname}`,
      hint: hintOf(target),
      href: `${location.origin}${PREFIX}${target.href}`
    }
  }
  // `for` never declines: this host opens every IRI, which is its purpose.
} satisfies AddressScheme
