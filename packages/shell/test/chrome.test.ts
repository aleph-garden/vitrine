import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { AS, type Event } from '@aleph-garden/view'
import type { Instance, Runtime } from '@aleph-garden/view/dom'
import { installChrome } from '../src/chrome.ts'
import { anonymousSession, type Fetch, installNavigation, type Session } from '../src/main.ts'

const fakeRuntime = () => {
  const dispatched: Event[] = []
  const listeners = new Set<(e: Event) => void>()
  const runtime: Runtime = {
    async mount(region, iri, hint) {
      return { id: 'i', iri, hint, region, dependencies: new Set(), dispose() {} }
    },
    async dispatch(event) {
      dispatched.push(event)
    },
    instances: () => [],
    listen(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  const emit = (event: Event) => {
    for (const listener of listeners) listener(event)
  }
  return { runtime, dispatched, emit }
}

/** A runtime that actually tracks the mounted instance, so installNavigation
 *  can find it through instances() the way the real one does. */
const fakeNavigableRuntime = () => {
  const listeners = new Set<(e: Event) => void>()
  let current: Instance | undefined
  const runtime: Runtime = {
    async mount(region, iri, hint) {
      current = { id: 'i', iri, hint, region, dependencies: new Set(), dispose() {} }
      return current
    },
    async dispatch() {},
    instances: () => (current ? [current] : []),
    listen(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  const emit = (event: Event) => {
    for (const listener of listeners) listener(event)
  }
  return { runtime, emit }
}

const fakeSession = (webId?: string, fetch: Fetch = async () => new Response('')) => {
  const logins: string[] = []
  const session: Session = {
    webId,
    fetch,
    async login(issuer) {
      logins.push(issuer)
      return undefined as never
    }
  }
  return { session, logins }
}

const turtle =
  (body: string): Fetch =>
  async () =>
    new Response(body, { headers: { 'content-type': 'text/turtle' } })

/** The session reaches every origin, which is what most of these tests want. */
const everywhere = () => true

const submit = (form: HTMLFormElement, value: string): boolean => {
  form.querySelector('input')!.value = value
  return form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
}

describe('installChrome', () => {
  let host: HTMLElement

  beforeEach(() => {
    host = document.createElement('header')
    document.body.append(host)
    history.replaceState(null, '', 'https://pod.example/notes/a.md')
  })

  afterEach(() => host.remove())

  test('names the origin and the IRI on show, and mirrors the IRI into the title', () => {
    history.replaceState(null, '', 'https://pod.example/https://other.example/a.md')
    const { runtime, emit } = fakeRuntime()
    installChrome(host, fakeSession().session, undefined, runtime, everywhere)
    expect(host.querySelector('.showing .origin')?.textContent).toBe('other.example')
    expect(host.querySelector('.showing .iri')?.textContent).toBe('https://other.example/a.md')
    expect(document.title).toBe('https://other.example/a.md · Aleph Garden')

    history.replaceState(null, '', 'https://pod.example/notes/b.md')
    emit({ type: AS.View, object: 'https://pod.example/notes/b.md' })
    expect(host.querySelector('.showing .origin')?.textContent).toBe('pod.example')
    expect(host.querySelector('.showing .iri')?.textContent).toBe('https://pod.example/notes/b.md')
    expect(document.title).toBe('https://pod.example/notes/b.md · Aleph Garden')
  })

  test('the IRI field dispatches an as:View and keeps the page', () => {
    const { runtime, dispatched } = fakeRuntime()
    installChrome(host, fakeSession().session, undefined, runtime, everywhere)
    const form = host.querySelector<HTMLFormElement>('form.open')!
    expect(submit(form, 'https://pod.toph.so/public/')).toBe(false)
    expect(dispatched).toEqual([{ type: AS.View, object: 'https://pod.toph.so/public/' }])
  })

  test('names the WebID in place of a login control when logged in', () => {
    const { runtime } = fakeRuntime()
    const { session } = fakeSession('https://me.example/card#me')
    installChrome(host, session, 'https://pod.example/', runtime, everywhere)
    expect(host.querySelector('.webid')?.textContent).toBe('https://me.example/card#me')
    expect(host.querySelector('.login')).toBeNull()
  })

  test('the login button goes to the configured issuer', () => {
    const { runtime } = fakeRuntime()
    const { session, logins } = fakeSession()
    installChrome(host, session, 'https://pod.example/', runtime, everywhere)
    host.querySelector<HTMLButtonElement>('button.login')!.click()
    expect(logins).toEqual(['https://pod.example/'])
  })

  test('without an issuer, the WebID form reads one from the profile', async () => {
    const { runtime } = fakeRuntime()
    const { session, logins } = fakeSession(
      undefined,
      turtle(`@prefix solid: <http://www.w3.org/ns/solid/terms#> .
        <https://me.example/card#me> solid:oidcIssuer <https://issuer.example/> .`)
    )
    installChrome(host, session, undefined, runtime, everywhere)
    const form = host.querySelector<HTMLFormElement>('form.login')!
    expect(submit(form, 'https://me.example/card#me')).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(logins).toEqual(['https://issuer.example/'])
    expect(form.querySelector('.error')).toBeNull()
  })

  test('a profile that names no issuer leaves the message in the form', async () => {
    const { runtime } = fakeRuntime()
    const { session, logins } = fakeSession(undefined, turtle(''))
    installChrome(host, session, undefined, runtime, everywhere)
    const form = host.querySelector<HTMLFormElement>('form.login')!
    submit(form, 'https://me.example/card#me')
    await new Promise((r) => setTimeout(r, 0))
    expect(logins).toEqual([])
    expect(form.querySelector('p.error')?.textContent).toContain('no solid:oidcIssuer')
  })

  test('marks the resource on show anonymous while the session does not reach it', () => {
    history.replaceState(null, '', 'https://pod.example/https://other.example/a.md')
    const { runtime, emit } = fakeRuntime()
    const { session } = fakeSession('https://me.example/card#me')
    installChrome(host, session, undefined, runtime, (o) => o === 'https://pod.example')
    expect(host.querySelector('.anonymous')?.textContent).toBe('anonymous here')

    history.replaceState(null, '', 'https://pod.example/notes/b.md')
    emit({ type: AS.View, object: 'https://pod.example/notes/b.md' })
    expect(host.querySelector('.anonymous')).toBeNull()
  })

  test('marks nothing anonymous without a session', () => {
    history.replaceState(null, '', 'https://pod.example/https://other.example/a.md')
    const { runtime } = fakeRuntime()
    installChrome(host, fakeSession().session, undefined, runtime, () => false)
    expect(host.querySelector('.anonymous')).toBeNull()
  })

  test('a host without a session shows no login control and no WebID', () => {
    const { runtime } = fakeRuntime()
    installChrome(host, anonymousSession(), 'https://pod.example/', runtime, everywhere)
    expect(host.querySelector('.login')).toBeNull()
    expect(host.querySelector('.webid')).toBeNull()
    expect(host.querySelector('.anonymous')).toBeNull()
  })

  test('a host without a session keeps what is on show and the IRI field', () => {
    const { runtime, dispatched } = fakeRuntime()
    installChrome(host, anonymousSession(), undefined, runtime, everywhere)
    expect(host.querySelector('.showing .origin')?.textContent).toBe('pod.example')
    expect(host.querySelector('.showing .iri')?.textContent).toBe('https://pod.example/notes/a.md')
    const form = host.querySelector<HTMLFormElement>('form.open')!
    expect(submit(form, 'https://pod.toph.so/public/')).toBe(false)
    expect(dispatched).toEqual([{ type: AS.View, object: 'https://pod.toph.so/public/' }])
  })

  test('installed after installNavigation, the chrome shows the resource navigation mounts', async () => {
    const { runtime, emit } = fakeNavigableRuntime()
    const root = document.createElement('div')
    await runtime.mount(root, 'https://pod.example/notes/a.md')
    installNavigation(runtime, root, {
      opens: 'self',
      session: fakeSession().session,
      credentialed: everywhere
    })
    installChrome(host, fakeSession().session, undefined, runtime, everywhere)

    emit({
      type: AS.View,
      object: 'https://pod.example/notes/b.md',
      target: 'https://pod.example/notes/b.md#Intro'
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(host.querySelector('.showing .iri')?.textContent).toBe('https://pod.example/notes/b.md')
  })
})
