// Kept apart from main.test.ts: mock.module is process-global in bun, and
// only these tests want a fake Inrupt session.

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const LOGIN_URL = 'https://pod.example/notes/Zeitplan.md'
const WANTED_URL = 'https://pod.example/notes/Wanted.md'
const FOREIGN_URL = 'https://other.example/a.md'
const FALLBACK_VIEW = 'https://w3id.org/aleph/ns/view#Fallback'

/** The URL the silent re-login hands back, or undefined for no restore. */
let restored: string | undefined
/** What the session fetch saw; the token rides on these requests. */
const fetched: string[] = []
/** What the stubbed global fetch saw; these carry no credentials. */
const anonymous: string[] = []
let realFetch: typeof globalThis.fetch

class FakeSession {
  info = { webId: 'https://pod.example/profile#me', isLoggedIn: true }
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
  fetched.length = 0
  anonymous.length = 0
  realFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    anonymous.push(String(input))
    return new Response('# foreign', { headers: { 'content-type': 'text/markdown' } })
  }) as typeof globalThis.fetch
  history.replaceState(null, '', LOGIN_URL)
})

afterEach(() => {
  globalThis.fetch = realFetch
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

  test('registers the whole bundle when the document names no views', async () => {
    const root = document.createElement('div')
    await boot(document.createElement('header'), root)
    expect(root.querySelector('.markdown-preview-view')).not.toBeNull()
  })
})
