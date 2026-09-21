import { describe, expect, test } from 'bun:test'
import { AS, type Event } from '@aleph-garden/vitrine'
import type { Instance, Runtime } from '@aleph-garden/vitrine/dom'
import { fetchResource } from '@aleph-garden/vitrine/http'
import { parseTurtle } from '@aleph-garden/vitrine-turtle'
import type { Address, AddressScheme } from '../src/address.ts'
import { hintOf, locationAddress } from '../src/address.ts'
import { installNavigation } from '../src/navigation.ts'
import { anonymousSession, type Fetch, issuerOf, type Session } from '../src/session.ts'

const response = (body: string, headers: Record<string, string>, status = 200) =>
  new Response(body, { status, headers })

const fetchOf =
  (r: Response, seen: { url?: string; accept?: string } = {}): Fetch =>
  async (input, init) => {
    seen.url = String(input)
    seen.accept = new Headers(init?.headers).get('accept') ?? undefined
    return r
  }

/** A pod's scheme: the location is the resource, a foreign origin is the
 *  browser's. */
const selfOnly: AddressScheme = {
  of: locationAddress,
  for: (url) => {
    const target = new URL(url)
    return target.origin === location.origin ? locationAddress(target.href) : undefined
  }
}

/** aleph.garden's scheme: any IRI, behind a reserved first segment. */
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

describe('issuerOf', () => {
  const WEBID = 'https://me.example/profile/card#me'

  test('reads solid:oidcIssuer from the profile document', async () => {
    const seen: { url?: string; accept?: string } = {}
    const profile = `@prefix solid: <http://www.w3.org/ns/solid/terms#> .
      <${WEBID}> solid:oidcIssuer <https://issuer.example/> .`
    const issuer = await issuerOf(
      fetchOf(response(profile, { 'content-type': 'text/turtle' }), seen),
      WEBID,
      parseTurtle
    )
    expect(seen.url).toBe('https://me.example/profile/card')
    expect(seen.accept).toBe('text/turtle')
    expect(issuer).toBe('https://issuer.example/')
  })

  test('rejects when the profile names none', async () => {
    await expect(
      issuerOf(
        fetchOf(
          response('<#me> a <https://schema.org/Person> .', { 'content-type': 'text/turtle' })
        ),
        WEBID,
        parseTurtle
      )
    ).rejects.toThrow(`no solid:oidcIssuer in ${WEBID}`)
  })

  test('rejects with the status when the profile document is missing', async () => {
    await expect(
      issuerOf(fetchOf(response('not found', {}, 404)), WEBID, parseTurtle)
    ).rejects.toThrow(`404 ${WEBID}`)
  })
})

describe('installNavigation', () => {
  /** `fails`, when given, is what every mount rejects with. */
  const fakeRuntime = (fails?: unknown) => {
    const mounted: { iri: string; hint?: unknown }[] = []
    const dispatched: Event[] = []
    const listeners = new Set<(e: Event) => void>()
    let current: Instance | undefined
    const runtime: Runtime = {
      async mount(region, iri, hint) {
        mounted.push({ iri, hint })
        if (fails !== undefined) throw fails
        current = {
          id: 'i',
          iri,
          hint,
          region,
          chain: [iri],
          dependencies: new Set(),
          dispose() {}
        }
        return current
      },
      async dispatch(e) {
        dispatched.push(e)
      },
      instances: () => (current ? [current] : []),
      listen(l) {
        listeners.add(l)
        return () => listeners.delete(l)
      }
    }
    const emit = (e: Event) => {
      for (const l of listeners) l(e)
    }
    return { runtime, mounted, dispatched, emit }
  }

  const host = (
    address: AddressScheme = selfOnly,
    webId?: string,
    credentialed: (origin: string) => boolean = () => true
  ) => {
    const session: Session = {
      webId,
      fetch: async () => new Response(''),
      async login() {
        return undefined as never
      }
    }
    return { address, session, credentialed }
  }

  test('an as:View for another resource mounts it and pushes history', async () => {
    const { runtime, mounted, emit } = fakeRuntime()
    const root = document.createElement('div')
    await runtime.mount(root, 'https://pod.example/a.md')
    installNavigation(runtime, root, host())
    emit({
      type: AS.View,
      object: 'https://pod.example/b.md',
      target: 'https://pod.example/b.md#Intro'
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(mounted.at(-1)).toEqual({ iri: 'https://pod.example/b.md', hint: { fragment: 'Intro' } })
    expect(location.href).toBe('https://pod.example/b.md#Intro')
  })

  test('under a scheme that opens any IRI, an as:View for another origin pushes it behind the host origin', async () => {
    const { runtime, mounted, emit } = fakeRuntime()
    const root = document.createElement('div')
    history.replaceState(null, '', 'https://pod.example/x')
    await runtime.mount(root, 'https://pod.example/x')
    installNavigation(runtime, root, host(anyIri))
    emit({
      type: AS.View,
      object: 'https://other.example/a.md',
      target: 'https://other.example/a.md#Intro'
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(location.href).toBe('https://pod.example/-/https://other.example/a.md#Intro')
    expect(mounted.at(-1)).toEqual({
      iri: 'https://other.example/a.md',
      hint: { fragment: 'Intro' }
    })
  })

  test('under a scheme that opens its own origin only, an as:View for another origin goes to the browser', async () => {
    const { runtime, mounted, emit } = fakeRuntime()
    const root = document.createElement('div')
    history.replaceState(null, '', 'https://pod.example/x')
    await runtime.mount(root, 'https://pod.example/x')
    const before = mounted.length
    const assigned: string[] = []
    const assign = location.assign
    location.assign = (url: string | URL) => {
      assigned.push(String(url))
    }
    try {
      installNavigation(runtime, root, host(selfOnly))
      emit({
        type: AS.View,
        object: 'https://other.example/a.md',
        target: 'https://other.example/a.md#Intro'
      })
      await new Promise((r) => setTimeout(r, 0))
    } finally {
      location.assign = assign
    }
    expect(assigned).toEqual(['https://other.example/a.md#Intro'])
    expect(mounted.length).toBe(before)
    expect(location.href).toBe('https://pod.example/x')
  })

  test('an as:View for a non-http(s) object the scheme declines navigates nowhere', async () => {
    const { runtime, mounted, emit } = fakeRuntime()
    const root = document.createElement('div')
    history.replaceState(null, '', 'https://pod.example/x')
    await runtime.mount(root, 'https://pod.example/x')
    const before = mounted.length
    const assigned: string[] = []
    const assign = location.assign
    location.assign = (url: string | URL) => {
      assigned.push(String(url))
    }
    try {
      installNavigation(runtime, root, host(selfOnly))
      emit({ type: AS.View, object: 'javascript:alert(1)' })
      await new Promise((r) => setTimeout(r, 0))
    } finally {
      location.assign = assign
    }
    expect(assigned).toEqual([])
    expect(mounted.length).toBe(before)
    expect(location.href).toBe('https://pod.example/x')
  })

  test('an as:View with an unparsable object throws nothing and mounts nothing', async () => {
    const { runtime, mounted, emit } = fakeRuntime()
    const root = document.createElement('div')
    history.replaceState(null, '', 'https://pod.example/x')
    await runtime.mount(root, 'https://pod.example/x')
    const before = mounted.length
    installNavigation(runtime, root, host(selfOnly))
    emit({ type: AS.View, object: 'not a url' })
    await new Promise((r) => setTimeout(r, 0))
    expect(mounted.length).toBe(before)
    expect(location.href).toBe('https://pod.example/x')
  })

  test('an as:View for the same resource only replaces the hash; the runtime re-renders', async () => {
    const { runtime, mounted, dispatched, emit } = fakeRuntime()
    const root = document.createElement('div')
    await runtime.mount(root, 'https://pod.example/b.md')
    installNavigation(runtime, root, host())
    const before = mounted.length
    emit({
      type: AS.View,
      object: 'https://pod.example/b.md',
      target: 'https://pod.example/b.md#Usage'
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(mounted.length).toBe(before)
    expect(dispatched).toHaveLength(0)
    expect(location.hash).toBe('#Usage')
  })

  test('popstate to another resource mounts it, to a hash of the same one dispatches as:View', async () => {
    const { runtime, mounted, dispatched } = fakeRuntime()
    const root = document.createElement('div')
    history.replaceState(null, '', 'https://pod.example/c.md')
    await runtime.mount(root, 'https://pod.example/c.md')
    installNavigation(runtime, root, host())
    history.replaceState(null, '', 'https://pod.example/c.md#Two')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await new Promise((r) => setTimeout(r, 0))
    expect(dispatched.at(-1)).toMatchObject({
      type: AS.View,
      object: 'https://pod.example/c.md',
      target: 'https://pod.example/c.md#Two'
    })
    history.replaceState(null, '', 'https://pod.example/d.md?view=urn:x')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await new Promise((r) => setTimeout(r, 0))
    expect(mounted.at(-1)).toEqual({ iri: 'https://pod.example/d.md', hint: { view: 'urn:x' } })
  })

  test('a mount that fails with a 401 asks for a login in the region', async () => {
    const unauthorized = Object.assign(new Error('401 https://pod.example/private.md'), {
      status: 401
    })
    const { runtime, emit } = fakeRuntime(unauthorized)
    const root = document.createElement('div')
    installNavigation(runtime, root, host())
    emit({
      type: AS.View,
      object: 'https://pod.example/private.md',
      target: 'https://pod.example/private.md'
    })
    await new Promise((r) => setTimeout(r, 0))
    const needed = root.querySelector('.login-needed')
    expect(needed?.textContent).toBe('This resource needs a login. Open at source')
    const link = needed?.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://pod.example/private.md')
    expect(link?.getAttribute('target')).toBe('_top')
  })

  test('a 401 under a session names the origin the session does not reach', async () => {
    const unauthorized = Object.assign(new Error('401 https://other.example/private.md'), {
      status: 401
    })
    const { runtime, emit } = fakeRuntime(unauthorized)
    const root = document.createElement('div')
    installNavigation(
      runtime,
      root,
      host(anyIri, 'https://me.example/card#me', () => false)
    )
    emit({
      type: AS.View,
      object: 'https://other.example/private.md',
      target: 'https://other.example/private.md'
    })
    await new Promise((r) => setTimeout(r, 0))
    const needed = root.querySelector('.login-needed')
    expect(needed?.textContent).toBe(
      'Your session does not apply to other.example. Open at source to log in there.'
    )
    const link = needed?.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://other.example/private.md')
    expect(link?.getAttribute('target')).toBe('_top')
  })

  test('a 401 on an origin the session does reach shows the message and the link', async () => {
    const unauthorized = Object.assign(new Error('401 https://pod.example/private.md'), {
      status: 401
    })
    const { runtime, emit } = fakeRuntime(unauthorized)
    const root = document.createElement('div')
    installNavigation(runtime, root, host(selfOnly, 'https://me.example/card#me'))
    emit({
      type: AS.View,
      object: 'https://pod.example/private.md',
      target: 'https://pod.example/private.md'
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(root.querySelector('.login-needed')).toBeNull()
    expect(root.querySelector('.error')?.textContent).toContain(
      '401 https://pod.example/private.md'
    )
  })

  test('any other failed mount shows the message and a link to the resource', async () => {
    const { runtime, emit } = fakeRuntime(new TypeError('Failed to fetch'))
    const root = document.createElement('div')
    installNavigation(runtime, root, host(anyIri))
    emit({
      type: AS.View,
      object: 'https://other.example/a.md',
      target: 'https://other.example/a.md'
    })
    await new Promise((r) => setTimeout(r, 0))
    const error = root.querySelector('.error')
    expect(error?.textContent).toContain('Failed to fetch')
    const link = error?.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://other.example/a.md')
    expect(link?.getAttribute('target')).toBe('_top')
    expect(link?.textContent).toBe('Open at source')
  })
})

describe('anonymousSession', () => {
  test('has no WebID and no login', () => {
    const session = anonymousSession()
    expect(session.webId).toBeUndefined()
    expect(session.login).toBeUndefined()
  })

  test('fetches without credentials', async () => {
    const realFetch = globalThis.fetch
    const seen: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      seen.push(String(input))
      return new Response('# a', { headers: { 'content-type': 'text/markdown' } })
    }) as typeof globalThis.fetch
    try {
      const resource = await fetchResource(anonymousSession().fetch, 'https://pod.example/a.md')
      expect(resource.body).toBe('# a')
      expect(seen).toEqual(['https://pod.example/a.md'])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
