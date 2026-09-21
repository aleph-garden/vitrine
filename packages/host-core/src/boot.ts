// What every host does in the same order: read the deployment's document,
// open the session, register the views it was given, mount the resource the
// location names, and install navigation and the chrome. What differs is the
// Host it is handed.

import type { Parser, View } from '@aleph-garden/vitrine'
import { AS, createRenderer } from '@aleph-garden/vitrine'
import { createResolveCache } from '@aleph-garden/vitrine/cache'
import { createRuntime } from '@aleph-garden/vitrine/dom'
import type { Fetch } from '@aleph-garden/vitrine/http'
import { fetchResource } from '@aleph-garden/vitrine/http'
import type { AddressScheme } from './address.ts'
import { installChrome } from './chrome.ts'
import type { Config } from './config.ts'
import { readConfig } from './config.ts'
import { installNavigation } from './navigation.ts'
import { mountInto } from './region.ts'
import { credentialedOrigins, issuerOf, type ParseTurtle, type Session } from './session.ts'

export type Host = {
  /** Every view this host can register, in the order it prefers them. The
   *  document's `views` chooses among these. The session is an argument
   *  because a view may be bound to the visitor. */
  views(config: Config, session: Session): View[]
  parsers(config: Config): Parser[]
  address: AddressScheme
  /** The session this host holds for a visitor. */
  session(config: Config): Promise<Session>
  /** Turtle to quads, for a container's listing and the WebID's profile. */
  parseTurtle: ParseTurtle
  /** Anything one host does and the other does not, run once the session is
   *  open and before the first mount. Failures here are its own. */
  ready?(session: Session, config: Config): void
}

export async function boot(host: Host, chrome: Element, root: Element): Promise<void> {
  const config = readConfig(document)
  const session = await host.session(config)
  host.ready?.(session, config)

  const bundle = host.views(config, session)
  const byId = new Map(bundle.map((view) => [view.id, view]))
  const renderer = createRenderer({
    parsers: host.parsers(config),
    views: config.views ? config.views.flatMap((id) => byId.get(id) ?? []) : bundle,
    rules: config.rules
  })

  const credentialed = await credentialedOrigins(session, config.issuer, host.parseTurtle)
  const bare: Fetch = (input, init) => globalThis.fetch(input, init)
  // One resolve per resource, so a page full of transclusions of one note
  // fetches it once. The entry stands until the resource says it changed.
  const cache = createResolveCache((target) =>
    fetchResource(
      credentialed(new URL(target).origin) ? session.fetch : bare,
      target,
      host.parseTurtle
    )
  )
  const runtime = createRuntime(renderer, cache.resolve)
  runtime.listen((event) => {
    if (event.type === AS.Update && typeof event.object === 'string') cache.invalidate(event.object)
  })

  const region = { session, credentialed }
  installNavigation(runtime, root, { ...region, address: host.address })
  installChrome(chrome, {
    ...region,
    issuer: config.issuer,
    runtime,
    address: host.address,
    resolveIssuer: (webId) => issuerOf(session.fetch, webId, host.parseTurtle)
  })

  const { iri, hint } = host.address.of(location.href)
  await mountInto(runtime, root, iri, hint, region)
}
