import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { AS, type Event } from '@aleph-garden/vitrine'
import type { Instance, Runtime } from '@aleph-garden/vitrine/dom'
import { parseTurtle } from '@aleph-garden/vitrine-turtle'
import type { Address, AddressScheme } from '../src/address.ts'
import { hintOf, locationAddress } from '../src/address.ts'
import type { Chrome } from '../src/chrome.ts'
import { installChrome } from '../src/chrome.ts'
import { installNavigation } from '../src/navigation.ts'
import { anonymousSession, type Fetch, issuerOf, type Session } from '../src/session.ts'

/** The chrome is installed on aleph.garden's scheme here, so that a foreign
 *  IRI has a location to be shown at. */
const PREFIX = '/-/'
const anyIri: AddressScheme = {
  of(href): Address {
    const url = new URL(href)
    if (!url.pathname.startsWith(PREFIX)) return locationAddress(href)
    return { iri: decodeURI(url.pathname.slice(PREFIX.length)), hint: hintOf(url), href }
  },
  for(url): Address {
    const target = new URL(url)
    if (target.origin === location.origin) return anyIri.of(target.href)
    return {
      iri: `${target.origin}${target.pathname}`,
      hint: hintOf(target),
      href: `${location.origin}${PREFIX}${target.href}`
    }
  }
}

/** What a host hands the chrome. `resolveIssuer` is the real one: reading
 *  the profile needs a Turtle parser, which is the host's to supply. */
const chromeFor = (
  session: Session,
  issuer: string | undefined,
  runtime: Runtime,
  credentialed: (origin: string) => boolean
): Chrome => ({
  session,
  issuer,
  runtime,
  credentialed,
  address: anyIri,
  resolveIssuer: (webId) => issuerOf(session.fetch, webId, parseTurtle)
})

const fakeRuntime = () => {
  const dispatched: Event[] = []
  const listeners = new Set<(e: Event) => void>()
  const runtime: Runtime = {
    async mount(region, iri, hint) {
      return { id: 'i', iri, hint, region, chain: [iri], dependencies: new Set(), dispose() {} }
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
      current = { id: 'i', iri, hint, region, chain: [iri], dependencies: new Set(), dispose() {} }
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

/** The frame as index.html carries it: four corners, the chrome in the first. */
const frame = (): HTMLElement => {
  const el = document.createElement('div')
  el.id = 'chrome'
  el.className = 'frame'
  for (const place of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const corner = document.createElement('div')
    corner.className = `corner ${place}`
    el.append(corner)
  }
  return el
}

describe('installChrome', () => {
  let host: HTMLElement

  const icon = () => host.querySelector<HTMLButtonElement>('button.icon')!
  const pressEscape = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

  beforeEach(() => {
    host = frame()
    document.body.append(host)
    history.replaceState(null, '', 'https://pod.example/notes/a.md')
  })

  afterEach(() => host.remove())

  test('closed, the frame carries the icon and the host name and nothing else', () => {
    const { runtime } = fakeRuntime()
    installChrome(
      host,
      chromeFor(fakeSession().session, 'https://pod.example/', runtime, everywhere)
    )
    const corner = host.querySelector('.corner.top-left')!
    expect(corner.querySelector('button.icon img')?.getAttribute('src')).toBe('/aleph.svg')
    expect(icon().getAttribute('aria-expanded')).toBe('false')
    expect(corner.querySelector('.host')?.textContent).toBe('pod.example')
    expect(host.querySelector('.panel')).toBeNull()
    expect(host.querySelector('form')).toBeNull()
    expect(host.querySelector('.iri')).toBeNull()
    expect(host.querySelector('.webid')).toBeNull()
    expect(host.querySelector('.login')).toBeNull()
  })

  test('the dot says whether the session reaches the origin on show', () => {
    history.replaceState(null, '', 'https://pod.example/-/https://other.example/a.md')
    const { runtime, emit } = fakeRuntime()
    const { session } = fakeSession('https://me.example/card#me')
    installChrome(
      host,
      chromeFor(session, undefined, runtime, (o) => o === 'https://pod.example')
    )
    expect(host.querySelector('.dot')?.getAttribute('data-state')).toBe('anonymous')

    history.replaceState(null, '', 'https://pod.example/notes/b.md')
    emit({ type: AS.View, object: 'https://pod.example/notes/b.md' })
    expect(host.querySelector('.dot')?.getAttribute('data-state')).toBe('reaches')
  })

  test('a host without a session shows no dot', () => {
    const { runtime } = fakeRuntime()
    installChrome(host, chromeFor(anonymousSession(), 'https://pod.example/', runtime, everywhere))
    expect(host.querySelector('.dot')).toBeNull()
  })

  test('the icon opens the panel and a second click closes it', () => {
    const { runtime } = fakeRuntime()
    installChrome(
      host,
      chromeFor(fakeSession().session, 'https://pod.example/', runtime, everywhere)
    )
    icon().click()
    const panel = host.querySelector('.corner.top-left > .panel')!
    expect(icon().getAttribute('aria-expanded')).toBe('true')
    expect(panel.querySelector('.iri')?.textContent).toBe('https://pod.example/notes/a.md')
    expect(panel.querySelector('form.open')).not.toBeNull()
    expect(panel.querySelector('button.login')).not.toBeNull()

    icon().click()
    expect(host.querySelector('.panel')).toBeNull()
    expect(icon().getAttribute('aria-expanded')).toBe('false')
  })

  test('Escape closes the panel', () => {
    const { runtime } = fakeRuntime()
    installChrome(host, chromeFor(fakeSession().session, undefined, runtime, everywhere))
    icon().click()
    expect(host.querySelector('.panel')).not.toBeNull()
    pressEscape()
    expect(host.querySelector('.panel')).toBeNull()
    expect(icon().getAttribute('aria-expanded')).toBe('false')
  })

  test('names the host and the IRI on show, and mirrors the IRI into the title', () => {
    history.replaceState(null, '', 'https://pod.example/-/https://other.example/a.md')
    const { runtime, emit } = fakeRuntime()
    installChrome(host, chromeFor(fakeSession().session, undefined, runtime, everywhere))
    icon().click()
    expect(host.querySelector('.host')?.textContent).toBe('other.example')
    expect(host.querySelector('.panel .iri')?.textContent).toBe('https://other.example/a.md')
    expect(document.title).toBe('https://other.example/a.md · Aleph Garden')

    history.replaceState(null, '', 'https://pod.example/notes/b.md')
    emit({ type: AS.View, object: 'https://pod.example/notes/b.md' })
    expect(host.querySelector('.host')?.textContent).toBe('pod.example')
    expect(host.querySelector('.panel .iri')?.textContent).toBe('https://pod.example/notes/b.md')
    expect(document.title).toBe('https://pod.example/notes/b.md · Aleph Garden')
  })

  test('the host name follows popstate', () => {
    const { runtime } = fakeRuntime()
    installChrome(host, chromeFor(fakeSession().session, undefined, runtime, everywhere))
    history.replaceState(null, '', 'https://pod.example/-/https://other.example/a.md')
    window.dispatchEvent(new Event('popstate'))
    expect(host.querySelector('.host')?.textContent).toBe('other.example')
  })

  test('the IRI field dispatches an as:View and keeps the page', () => {
    const { runtime, dispatched } = fakeRuntime()
    installChrome(host, chromeFor(fakeSession().session, undefined, runtime, everywhere))
    icon().click()
    const form = host.querySelector<HTMLFormElement>('form.open')!
    expect(submit(form, 'https://pod.toph.so/public/')).toBe(false)
    expect(dispatched).toEqual([{ type: AS.View, object: 'https://pod.toph.so/public/' }])
  })

  test('names the WebID in place of a login control when logged in', () => {
    const { runtime } = fakeRuntime()
    const { session } = fakeSession('https://me.example/card#me')
    installChrome(host, chromeFor(session, 'https://pod.example/', runtime, everywhere))
    icon().click()
    expect(host.querySelector('.webid')?.textContent).toBe('https://me.example/card#me')
    expect(host.querySelector('.login')).toBeNull()
  })

  test('the login button goes to the configured issuer', () => {
    const { runtime } = fakeRuntime()
    const { session, logins } = fakeSession()
    installChrome(host, chromeFor(session, 'https://pod.example/', runtime, everywhere))
    icon().click()
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
    installChrome(host, chromeFor(session, undefined, runtime, everywhere))
    icon().click()
    const form = host.querySelector<HTMLFormElement>('form.login')!
    expect(submit(form, 'https://me.example/card#me')).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(logins).toEqual(['https://issuer.example/'])
    expect(form.querySelector('.error')).toBeNull()
  })

  test('a profile that names no issuer leaves the message in the form', async () => {
    const { runtime } = fakeRuntime()
    const { session, logins } = fakeSession(undefined, turtle(''))
    installChrome(host, chromeFor(session, undefined, runtime, everywhere))
    icon().click()
    const form = host.querySelector<HTMLFormElement>('form.login')!
    submit(form, 'https://me.example/card#me')
    await new Promise((r) => setTimeout(r, 0))
    expect(logins).toEqual([])
    expect(form.querySelector('p.error')?.textContent).toContain('no solid:oidcIssuer')
  })

  test('a host without a session shows no login control and no WebID', () => {
    const { runtime } = fakeRuntime()
    installChrome(host, chromeFor(anonymousSession(), 'https://pod.example/', runtime, everywhere))
    icon().click()
    expect(host.querySelector('.login')).toBeNull()
    expect(host.querySelector('.webid')).toBeNull()
  })

  test('a host without a session keeps what is on show and the IRI field', () => {
    const { runtime, dispatched } = fakeRuntime()
    installChrome(host, chromeFor(anonymousSession(), undefined, runtime, everywhere))
    icon().click()
    expect(host.querySelector('.host')?.textContent).toBe('pod.example')
    expect(host.querySelector('.panel .iri')?.textContent).toBe('https://pod.example/notes/a.md')
    const form = host.querySelector<HTMLFormElement>('form.open')!
    expect(submit(form, 'https://pod.toph.so/public/')).toBe(false)
    expect(dispatched).toEqual([{ type: AS.View, object: 'https://pod.toph.so/public/' }])
  })

  test('installed after installNavigation, the chrome shows the resource navigation mounts', async () => {
    const { runtime, emit } = fakeNavigableRuntime()
    const root = document.createElement('div')
    await runtime.mount(root, 'https://pod.example/notes/a.md')
    installNavigation(runtime, root, {
      address: anyIri,
      session: fakeSession().session,
      credentialed: everywhere
    })
    installChrome(host, chromeFor(fakeSession().session, undefined, runtime, everywhere))
    icon().click()

    emit({
      type: AS.View,
      object: 'https://pod.example/notes/b.md',
      target: 'https://pod.example/notes/b.md#Intro'
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(host.querySelector('.panel .iri')?.textContent).toBe('https://pod.example/notes/b.md')
  })
})
