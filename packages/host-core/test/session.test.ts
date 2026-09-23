// Kept apart from the other host-core tests: mock.module is process-global
// in bun, and only these want a fake Inrupt session.

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { View } from '@aleph-garden/vitrine'
import { parseTurtle, turtleParser } from '@aleph-garden/vitrine-turtle'
import type { Address, AddressScheme } from '../src/address.ts'
import { locationAddress, showOf } from '../src/address.ts'
import type { Host } from '../src/boot.ts'

const LOGIN_URL = 'https://pod.example/notes/Zeitplan.md'
const WANTED_URL = 'https://pod.example/notes/Wanted.md'
const FOREIGN_URL = 'https://other.example/a.md'
const RAW_VIEW = 'https://example.org/views#Raw'

const PROFILE_URL = 'https://id.example/me'
const PROFILE_WEBID = `${PROFILE_URL}#me`
const PROFILE = `@prefix solid: <http://www.w3.org/ns/solid/terms#> .
  @prefix pim: <http://www.w3.org/ns/pim/space#> .
  <${PROFILE_WEBID}> solid:oidcIssuer <https://idp.example/> ; pim:storage <https://store.example/> .`

/** A host that opens any IRI, so that a test reaches a foreign origin from
 *  the one origin happy-dom serves. The address scheme aleph.garden uses. */
const PREFIX = '/-/'
const anyIri: AddressScheme = {
  of(href): Address {
    const url = new URL(href)
    if (!url.pathname.startsWith(PREFIX)) return locationAddress(href)
    return { iri: decodeURI(url.pathname.slice(PREFIX.length)), show: showOf(url), href }
  },
  for(url): Address {
    const target = new URL(url)
    if (target.origin === location.origin) return anyIri.of(target.href)
    return {
      iri: `${target.origin}${target.pathname}`,
      show: showOf(target),
      href: `${location.origin}${PREFIX}${target.href}`
    }
  }
}

const noteView: View = {
  id: 'https://example.org/views#Note',
  when: [{ contentType: 'text/markdown' }],
  async render() {
    return { html: '<div class="note"></div>' }
  }
}
const rawView: View = {
  id: RAW_VIEW,
  when: [],
  async render() {
    return { html: '<pre class="raw"></pre>' }
  }
}

/** The frame as index.html carries it; boot installs the chrome in a corner. */
const frame = (): HTMLElement => {
  const el = document.createElement('div')
  el.className = 'frame'
  for (const place of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const corner = document.createElement('div')
    corner.className = `corner ${place}`
    el.append(corner)
  }
  return el
}

/** The URL the silent re-login hands back, or undefined for no restore. */
let restored: string | undefined
/** The WebID the fake session reports, and the status its profile answers with. */
let webId: string
let profileStatus: number
/** What the session fetch saw; the token rides on these requests. */
const fetched: string[] = []
/** What the stubbed global fetch saw; these carry no credentials. */
const anonymous: string[] = []

class FakeSession {
  // Constructed inside createSession, so this reads whatever the test set.
  info = { webId, isLoggedIn: true }
  private listeners = new Map<string, ((url: string) => void)[]>()
  events = {
    on: (name: string, fn: (url: string) => void) => {
      const list = this.listeners.get(name) ?? []
      list.push(fn)
      this.listeners.set(name, list)
    }
  }
  fetch = async (input: string) => {
    fetched.push(String(input))
    return new Response('# wanted', { headers: { 'content-type': 'text/markdown' } })
  }
  async handleIncomingRedirect() {
    if (restored === undefined) return
    for (const fn of this.listeners.get('sessionRestore') ?? []) fn(restored)
  }
  async login() {}
}

mock.module('@inrupt/solid-client-authn-browser', () => ({
  Session: FakeSession,
  EVENTS: { SESSION_RESTORED: 'sessionRestore' }
}))

const { boot } = await import('../src/boot.ts')
const { anonymousSession, createSession } = await import('../src/session.ts')

const host = (over: Partial<Host> = {}): Host => ({
  address: anyIri,
  parseTurtle,
  parsers: () => [turtleParser()],
  session: () => createSession(),
  views: () => [noteView, rawView],
  ...over
})

beforeEach(() => {
  restored = undefined
  webId = 'https://pod.example/profile#me'
  profileStatus = 200
  fetched.length = 0
  anonymous.length = 0
  sessionStorage.clear()
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    anonymous.push(url)
    if (url === PROFILE_URL) {
      return new Response(profileStatus === 200 ? PROFILE : 'no', {
        status: profileStatus,
        headers: { 'content-type': 'text/turtle' }
      })
    }
    return new Response('# foreign', { headers: { 'content-type': 'text/markdown' } })
  }) as typeof globalThis.fetch
  history.replaceState(null, '', LOGIN_URL)
})

afterEach(() => {
  // The stub stays in place: a boot leaves a popstate listener on the window,
  // and a later test's popstate reaches the runtime it installed, which would
  // fetch for real.
  for (const script of document.head.querySelectorAll('script[type="application/ld+json"]')) {
    script.remove()
  }
})

describe('createSession', () => {
  test('puts the restored URL in the address bar', async () => {
    restored = WANTED_URL
    await createSession()
    expect(location.href).toBe(WANTED_URL)
  })

  test('leaves the address alone without a restore', async () => {
    await createSession()
    expect(location.href).toBe(LOGIN_URL)
  })
})

describe('boot', () => {
  test('mounts the resource the restored URL names', async () => {
    restored = `${WANTED_URL}#Intro`
    await boot(host(), frame(), document.createElement('div'))
    expect(fetched).toContain(WANTED_URL)
    expect(fetched).not.toContain(LOGIN_URL)
  })

  test('reaches another origin without the session', async () => {
    history.replaceState(null, '', `https://pod.example${PREFIX}${FOREIGN_URL}`)
    await boot(host(), frame(), document.createElement('div'))
    expect(anonymous).toContain(FOREIGN_URL)
    expect(fetched).not.toContain(FOREIGN_URL)
  })

  test("reaches the WebID's origin with the session", async () => {
    history.replaceState(null, '', WANTED_URL)
    await boot(host(), frame(), document.createElement('div'))
    expect(fetched).toContain(WANTED_URL)
    expect(anonymous).not.toContain(WANTED_URL)
  })

  test('runs the host ready hook once the session is open', async () => {
    const seen: (string | undefined)[] = []
    await boot(
      host({ ready: (session) => seen.push(session.webId) }),
      frame(),
      document.createElement('div')
    )
    expect(seen).toEqual(['https://pod.example/profile#me'])
  })

  test('a host that holds no session fetches everything without one', async () => {
    history.replaceState(null, '', WANTED_URL)
    await boot(
      host({ session: async () => anonymousSession() }),
      frame(),
      document.createElement('div')
    )
    expect(anonymous).toContain(WANTED_URL)
    expect(fetched).toHaveLength(0)
  })
})

describe('boot and the profile the WebID names', () => {
  const mount = async (iri: string): Promise<Element> => {
    history.replaceState(null, '', `https://pod.example${PREFIX}${iri}`)
    const root = document.createElement('div')
    await boot(host(), frame(), root)
    return root
  }

  beforeEach(() => {
    webId = PROFILE_WEBID
  })

  test('reaches the storage and the issuer the profile names with the session', async () => {
    await mount('https://store.example/x')
    expect(fetched).toContain('https://store.example/x')
    expect(anonymous).not.toContain('https://store.example/x')

    await mount('https://idp.example/x')
    expect(fetched).toContain('https://idp.example/x')
    expect(anonymous).not.toContain('https://idp.example/x')
  })

  test('reaches an origin the profile leaves out without the session', async () => {
    await mount('https://other.example/x')
    expect(anonymous).toContain('https://other.example/x')
    expect(fetched).not.toContain('https://other.example/x')
  })

  test('reads the profile once a tab', async () => {
    await mount('https://store.example/x')
    await mount('https://store.example/y')
    expect(anonymous.filter((url) => url === PROFILE_URL)).toHaveLength(1)
    expect(fetched).toContain('https://store.example/y')
  })

  test('a profile that does not answer leaves the WebID origin alone credentialed', async () => {
    profileStatus = 500
    const root = await mount('https://store.example/x')
    expect(anonymous).toContain('https://store.example/x')
    expect(fetched).not.toContain('https://store.example/x')
    expect(root.querySelector('.note')).not.toBeNull()

    await mount('https://id.example/x')
    expect(fetched).toContain('https://id.example/x')
  })
})

describe('boot and the host document', () => {
  const hostDocument = (node: object) => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(node)
    document.head.append(script)
  }

  test('registers only the views the document names', async () => {
    hostDocument({ '@type': 'Host', views: [RAW_VIEW] })
    const root = document.createElement('div')
    await boot(host(), frame(), root)
    expect(root.querySelector('pre.raw')).not.toBeNull()
    expect(root.querySelector('.note')).toBeNull()
  })

  test('registers the whole bundle when the document names no views', async () => {
    const root = document.createElement('div')
    await boot(host(), frame(), root)
    expect(root.querySelector('.note')).not.toBeNull()
  })
})
