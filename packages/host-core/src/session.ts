// Who the visitor is and which origins a token of theirs may reach. One copy
// for every host: the origins a DPoP token goes to are one of the two places
// a mistake here is expensive.

import { pim, solid } from '@aleph-garden/terms'
import type { Quad, Reader } from '@aleph-garden/vitrine'
import { about } from '@aleph-garden/vitrine'
import type { Fetch } from '@aleph-garden/vitrine/http'
import { EVENTS, Session as OidcSession } from '@inrupt/solid-client-authn-browser'

export type { Fetch }

export type Session = {
  webId: string | undefined
  /** fetch with the Solid-OIDC token attached when logged in. */
  fetch: Fetch
  /** Redirects to the issuer; the page comes back with a session. Absent on
   *  a host without a session: the chrome then shows no login. */
  login?(issuer: string): Promise<never>
}

/** Handles the incoming redirect; the issuer is login's argument. */
export async function createSession(): Promise<Session> {
  const session = new OidcSession()
  // A restored session goes through a silent re-login that lands back on the
  // redirectUrl of the login, which is whichever resource the user was on
  // then. The URL wanted now comes back with this event; the app has to put
  // it in the address itself. Emitted inside handleIncomingRedirect, so the
  // address is right once the await below resolves.
  session.events.on(EVENTS.SESSION_RESTORED, (url) => history.replaceState(null, '', url))
  await session.handleIncomingRedirect({ restorePreviousSession: true, url: location.href })
  return {
    webId: session.info.webId,
    fetch: session.fetch,
    async login(issuer) {
      await session.login({
        oidcIssuer: issuer,
        redirectUrl: location.href,
        clientName: 'Aleph Garden'
      })
      return new Promise<never>(() => {})
    }
  }
}

/** The session of a host that holds none: no WebID, bare fetch, no login.
 *  Every origin is then reached anonymously. */
export function anonymousSession(): Session {
  return { webId: undefined, fetch: (input, init) => globalThis.fetch(input, init) }
}

/** Turtle to quads. An argument everywhere it is needed, because the parser
 *  carries a dependency neither this package nor the core names. */
export type ParseTurtle = (text: string, baseIRI: string) => Quad[]

/** A reader over the WebID's profile document, the fragment dropped. Rejects
 *  with the status on a non-2xx answer. */
export async function readProfile(
  fetch: Fetch,
  webId: string,
  parse: ParseTurtle
): Promise<Reader> {
  const profile = new URL(webId)
  profile.hash = ''
  const response = await fetch(profile.href, { headers: { accept: 'text/turtle' } })
  if (!response.ok) throw new Error(`${response.status} ${webId}`)
  return about(parse(await response.text(), profile.href), webId)
}

/** solid:oidcIssuer from the WebID's profile document. */
export async function issuerOf(fetch: Fetch, webId: string, parse: ParseTurtle): Promise<string> {
  const issuer = (await readProfile(fetch, webId, parse)).one(solid.oidcIssuer)
  if (!issuer) throw new Error(`no solid:oidcIssuer in ${webId}`)
  return issuer
}

/** The origins the profile names as the WebID's issuer and storage, kept in
 *  sessionStorage so a tab reads the profile once. A profile that does not
 *  answer, or does not parse, names no origin and raises nothing. */
export async function profileOrigins(
  fetch: Fetch,
  webId: string,
  parse: ParseTurtle
): Promise<string[]> {
  const key = `aleph:origins:${webId}`
  try {
    const cached = sessionStorage.getItem(key)
    if (cached) return JSON.parse(cached) as string[]
    const profile = await readProfile(fetch, webId, parse)
    const origins = [
      ...new Set(
        [...profile.all(solid.oidcIssuer), ...profile.all(pim.storage)].map(
          (iri) => new URL(iri).origin
        )
      )
    ]
    sessionStorage.setItem(key, JSON.stringify(origins))
    return origins
  } catch {
    return []
  }
}

/** The origins a token of this visitor's may reach: the host's own, the
 *  WebID's, the configured issuer's, and those the profile names as the
 *  WebID's issuer and storage. A DPoP token names the visitor and their
 *  issuer to whoever receives it, so every other IRI is fetched bare. */
export async function credentialedOrigins(
  session: Session,
  issuer: string | undefined,
  parse: ParseTurtle
): Promise<(origin: string) => boolean> {
  const bare: Fetch = (input, init) => globalThis.fetch(input, init)
  const origins = new Set([location.origin])
  for (const source of [session.webId, issuer]) {
    if (source) origins.add(new URL(source).origin)
  }
  if (session.webId) {
    for (const origin of await profileOrigins(bare, session.webId, parse)) origins.add(origin)
  }
  return (origin) => origins.has(origin)
}
