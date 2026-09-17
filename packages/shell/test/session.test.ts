// Kept apart from main.test.ts: mock.module is process-global in bun, and
// only these tests want a fake Inrupt session.

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const LOGIN_URL = 'https://pod.example/notes/Zeitplan.md'
const WANTED_URL = 'https://pod.example/notes/Wanted.md'
const FOREIGN_URL = 'https://other.example/a.md'
const FALLBACK_VIEW = 'https://w3id.org/aleph/ns/view#Fallback'

const PROFILE_URL = 'https://id.example/me'
const PROFILE_WEBID = `${PROFILE_URL}#me`
const PROFILE = `@prefix solid: <http://www.w3.org/ns/solid/terms#> .
  @prefix pim: <http://www.w3.org/ns/pim/space#> .
  <${PROFILE_WEBID}> solid:oidcIssuer <https://idp.example/> ; pim:storage <https://store.example/> .`

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

const { boot, createSession } = await import('../src/main.ts')

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
    await boot(document.createElement('header'), document.createElement('div'))
    expect(fetched).toContain(WANTED_URL)
    expect(fetched).not.toContain(LOGIN_URL)
  })

  test('reaches another origin without the session', async () => {
    history.replaceState(null, '', `https://pod.example/${FOREIGN_URL}`)
    await boot(document.createElement('header'), document.createElement('div'))
    expect(anonymous).toContain(FOREIGN_URL)
    expect(fetched).not.toContain(FOREIGN_URL)
  })

  test("reaches the WebID's origin with the session", async () => {
    history.replaceState(null, '', WANTED_URL)
    await boot(document.createElement('header'), document.createElement('div'))
    expect(fetched).toContain(WANTED_URL)
    expect(anonymous).not.toContain(WANTED_URL)
  })
})

describe('boot and the profile the WebID names', () => {
  const mount = async (iri: string): Promise<Element> => {
    history.replaceState(null, '', `https://pod.example/${iri}`)
    const root = document.createElement('div')
    await boot(document.createElement('header'), root)
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
    expect(root.querySelector('.markdown-preview-view')).not.toBeNull()

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
    hostDocument({ '@type': 'Host', views: [FALLBACK_VIEW] })
    const root = document.createElement('div')
    await boot(document.createElement('header'), root)
    expect(root.querySelector('pre.raw')).not.toBeNull()
    expect(root.querySelector('.markdown-preview-view')).toBeNull()
  })

  test('a document with session false fetches everything without the session', async () => {
    hostDocument({ '@type': 'Host', session: false })
    history.replaceState(null, '', WANTED_URL)
    await boot(document.createElement('header'), document.createElement('div'))
    expect(anonymous).toContain(WANTED_URL)
    expect(fetched).toHaveLength(0)
  })

  test('registers the whole bundle when the document names no views', async () => {
    const root = document.createElement('div')
    await boot(document.createElement('header'), root)
    expect(root.querySelector('.markdown-preview-view')).not.toBeNull()
  })
})
