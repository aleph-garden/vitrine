// A pod serves the host as the text/html representation of the resource
// requested, so the location is the resource and there is nothing to unwrap.
// A link to another origin is the browser's, which is what a pod's visitors
// expect, and it is why no prefixed form exists here to read back.

import type { AddressScheme } from '@aleph-garden/host-core'
import { locationAddress } from '@aleph-garden/host-core'

export const podAddress: AddressScheme = {
  of: locationAddress,
  for(url) {
    const target = new URL(url)
    return target.origin === location.origin ? locationAddress(target.href) : undefined
  }
}
