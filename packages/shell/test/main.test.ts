import { describe, expect, test } from 'bun:test'
import { AS, type Event, isContainer, objects, typesOf } from '@aleph-garden/view'
import type { Instance, Runtime } from '@aleph-garden/view/dom'
import {
  type Fetch,
  fetchResource,
  installNavigation,
  issuerOf,
  turtleParser
} from '../src/main.ts'

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const DC_MODIFIED = 'http://purl.org/dc/terms/modified'

const response = (body: string, headers: Record<string, string>, status = 200) =>
  new Response(body, { status, headers })

const fetchOf =
  (r: Response, seen: { url?: string; accept?: string } = {}): Fetch =>
  async (input, init) => {
    seen.url = String(input)
    seen.accept = new Headers(init?.headers).get('accept') ?? undefined
    return r
  }

describe('fetchResource', () => {
  test('asks for raw types, never text/html', async () => {
    const seen: { url?: string; accept?: string } = {}
    await fetchResource(
      fetchOf(response('# a', { 'content-type': 'text/markdown' }), seen),
      'https://pod.example/a.md'
    )
    expect(seen.url).toBe('https://pod.example/a.md')
    expect(seen.accept).toContain('text/markdown')
    expect(seen.accept).toContain('text/turtle')
    expect(seen.accept).not.toContain('text/html')
  })

  test('builds a document resource from body and headers', async () => {
    const r = await fetchResource(
      fetchOf(
        response('# a', {
          'content-type': 'text/markdown; charset=utf-8',
          'last-modified': 'Wed, 17 Sep 2026 10:00:00 GMT',
          'wac-allow': 'user="read write", public="read"',
          link: '<http://www.w3.org/ns/ldp#Resource>; rel="type", <https://pod.example/a.md.acl>; rel="acl"'
        })
      ),
      'https://pod.example/a.md'
    )
    expect(r.iri).toBe('https://pod.example/a.md')
    expect(r.contentType).toBe('text/markdown; charset=utf-8')
    expect(r.body).toBe('# a')
    expect(r.allow).toEqual(['read', 'write'])
    expect(isContainer(r)).toBe(false)
    expect(objects(r.meta, r.iri, DC_MODIFIED)[0]?.value).toBe('2026-09-17T10:00:00.000Z')
  })

  test('marks a container from the Link header and lists its children from the body', async () => {
    const turtle = `
      @prefix ldp: <http://www.w3.org/ns/ldp#> .
      <https://pod.example/notes/> a ldp:Container, ldp:BasicContainer ;
        ldp:contains <https://pod.example/notes/a.md>, <https://pod.example/notes/sub/> .
      <https://pod.example/notes/sub/> a ldp:Container .
    `
    const r = await fetchResource(
      fetchOf(
        response(turtle, {
          'content-type': 'text/turtle',
          link: '<http://www.w3.org/ns/ldp#Container>; rel="type", <http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          'wac-allow': 'user="read"'
        })
      ),
      'https://pod.example/notes/'
    )
    expect(isContainer(r)).toBe(true)
    const children = objects(r.meta, r.iri, LDP_CONTAINS).map((t) => t.value)
    expect(children).toEqual(['https://pod.example/notes/a.md', 'https://pod.example/notes/sub/'])
    expect(isContainer({ ...r, iri: 'https://pod.example/notes/sub/' })).toBe(true)
  })

  test('keeps binary bodies as bytes', async () => {
    const r = await fetchResource(
      fetchOf(response('', { 'content-type': 'image/png' })),
      'https://pod.example/x.png'
    )
    expect(r.body).toBeInstanceOf(Uint8Array)
  })

  test('rejects with the status on a non-2xx answer', async () => {
    await expect(
      fetchResource(
        fetchOf(response('nope', { 'content-type': 'text/plain' }, 401)),
        'https://pod.example/p'
      )
    ).rejects.toMatchObject({ status: 401 })
  })
})

describe('turtleParser', () => {
  test('parses Turtle into plain quads', async () => {
    const parser = turtleParser()
    expect(parser.contentType).toBe('text/turtle')
    const quads = await parser.parse({
      iri: 'https://pod.example/x.ttl',
      contentType: 'text/turtle',
      body: '<#me> a <https://schema.org/Person> ; <https://schema.org/name> "Toph"@de .',
      meta: [],
      allow: ['read']
    })
    expect(
      typesOf({
        iri: 'https://pod.example/x.ttl#me',
        contentType: '',
        body: '',
        meta: [],
        allow: [],
        graph: quads
      })
    ).toEqual(['https://schema.org/Person'])
    const name = quads.find((q) => q.predicate.value === 'https://schema.org/name')!
    expect(name.object).toEqual({
      termType: 'Literal',
      value: 'Toph',
      language: 'de',
      datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'
    })
    expect(Object.getPrototypeOf(name.object)).toBe(Object.prototype)
  })
})

describe('issuerOf', () => {
  const WEBID = 'https://me.example/profile/card#me'

  test('reads solid:oidcIssuer from the profile document', async () => {
    const seen: { url?: string; accept?: string } = {}
    const profile = `@prefix solid: <http://www.w3.org/ns/solid/terms#> .
      <${WEBID}> solid:oidcIssuer <https://issuer.example/> .`
    const issuer = await issuerOf(
      fetchOf(response(profile, { 'content-type': 'text/turtle' }), seen),
      WEBID
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
        WEBID
      )
    ).rejects.toThrow(`no solid:oidcIssuer in ${WEBID}`)
  })
})

describe('installNavigation', () => {
  const fakeRuntime = () => {
    const mounted: { iri: string; hint?: unknown }[] = []
    const dispatched: Event[] = []
    const listeners = new Set<(e: Event) => void>()
    let current: Instance | undefined
    const runtime: Runtime = {
      async mount(region, iri, hint) {
        mounted.push({ iri, hint })
        current = { id: 'i', iri, hint, region, dependencies: new Set(), dispose() {} }
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

  test('an as:View for another resource mounts it and pushes history', async () => {
    const { runtime, mounted, emit } = fakeRuntime()
    const root = document.createElement('div')
    await runtime.mount(root, 'https://pod.example/a.md')
    installNavigation(runtime, root)
    emit({
      type: AS.View,
      object: 'https://pod.example/b.md',
      target: 'https://pod.example/b.md#Intro'
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(mounted.at(-1)).toEqual({ iri: 'https://pod.example/b.md', hint: { fragment: 'Intro' } })
    expect(location.href).toBe('https://pod.example/b.md#Intro')
  })

  test('an as:View for another origin pushes the IRI behind the shell origin', async () => {
    const { runtime, mounted, emit } = fakeRuntime()
    const root = document.createElement('div')
    history.replaceState(null, '', 'https://pod.example/x')
    await runtime.mount(root, 'https://pod.example/x')
    installNavigation(runtime, root)
    emit({
      type: AS.View,
      object: 'https://other.example/a.md',
      target: 'https://other.example/a.md#Intro'
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(location.href).toBe('https://pod.example/https://other.example/a.md#Intro')
    expect(mounted.at(-1)).toEqual({
      iri: 'https://other.example/a.md',
      hint: { fragment: 'Intro' }
    })
  })

  test('an as:View for the same resource only replaces the hash; the runtime re-renders', async () => {
    const { runtime, mounted, dispatched, emit } = fakeRuntime()
    const root = document.createElement('div')
    await runtime.mount(root, 'https://pod.example/b.md')
    installNavigation(runtime, root)
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
    installNavigation(runtime, root)
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
})
