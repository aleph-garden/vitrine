// Kept apart from main.test.ts: mock.module is process-global in bun, and
// only these tests want a fake Inrupt session.

import { beforeEach, describe, expect, mock, test } from 'bun:test'

const LOGIN_URL = 'https://pod.example/notes/Zeitplan.md'
const WANTED_URL = 'https://pod.example/notes/Wanted.md'

/** The URL the silent re-login hands back, or undefined for no restore. */
let restored: string | undefined
const fetched: string[] = []

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
  history.replaceState(null, '', LOGIN_URL)
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
})
