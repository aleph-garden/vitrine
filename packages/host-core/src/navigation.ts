// The address bar and the region, kept in step. The address scheme decides
// what a host opens in place: a target it declines is the browser's.

import { AS } from '@aleph-garden/vitrine'
import type { Runtime } from '@aleph-garden/vitrine/dom'
import type { AddressScheme } from './address.ts'
import { mountInto, type Region } from './region.ts'

export type Navigation = Region & { address: AddressScheme }

/** as:View events from the runtime and popstate drive the address and the
 *  region: another resource is a `mount`, the same resource with a different
 *  fragment is a `dispatch` and no refetch. A target the scheme declines is
 *  handed to the browser, which leaves the page. */
export function installNavigation(runtime: Runtime, root: Element, host: Navigation): void {
  const current = () => runtime.instances().find((i) => i.region === root)

  runtime.listen((event) => {
    if (event.type !== AS.View || typeof event.object !== 'string') return
    const url = typeof event.target === 'string' ? event.target : event.object
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      // The IRI field dispatches raw user input; an unparsable value stops here.
      return
    }
    const address = host.address.for(url)
    if (!address) {
      // Only hand http(s) links to the browser; anything else (e.g. javascript:)
      // would otherwise execute in the host's own origin.
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') location.assign(url)
      return
    }
    if (current()?.iri === address.iri) {
      history.replaceState(null, '', address.href)
      return
    }
    history.pushState(null, '', address.href)
    void mountInto(runtime, root, address.iri, address.hint, host)
  })

  window.addEventListener('popstate', () => {
    const { iri, hint } = host.address.of(location.href)
    if (current()?.iri === iri) {
      void runtime.dispatch({ type: AS.View, object: iri, target: location.href })
    } else {
      void mountInto(runtime, root, iri, hint, host)
    }
  })
}
