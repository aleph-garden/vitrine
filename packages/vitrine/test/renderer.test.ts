import { describe, expect, test } from 'bun:test'
import {
  type Context,
  createRenderer,
  holds,
  isContainer,
  objects,
  type Quad,
  type Resource,
  typesOf,
  type View
} from '../src/index.ts'
import { stateIn } from '../src/state.ts'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const LDP_CONTAINER = 'http://www.w3.org/ns/ldp#Container'
const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'

const iri = (value: string) => ({ termType: 'NamedNode', value }) as const
const q = (s: string, p: string, o: string): Quad => ({
  subject: iri(s),
  predicate: iri(p),
  object: iri(o)
})

const resource = (over: Partial<Resource> = {}): Resource => ({
  iri: 'https://pod.example/notes/a.md',
  contentType: 'text/markdown',
  body: '# a',
  meta: [],
  allow: ['read'],
  ...over
})

const noop: Context = {
  resolve: () => Promise.reject(new Error('no resolve')),
  emit: () => {},
  events: (async function* () {})(),
  transclude: async () => '',
  inner: () => Promise.reject(new Error('no inner view')),
  state: stateIn(new Map())
}

const view = (id: string, when?: View['when']): View => ({
  id,
  when,
  render: async () => ({ html: `<p>${id}</p>` })
})

describe('quad helpers', () => {
  const container = resource({
    iri: 'https://pod.example/notes/',
    contentType: 'text/turtle',
    meta: [
      q('https://pod.example/notes/', RDF_TYPE, LDP_CONTAINER),
      q('https://pod.example/notes/', LDP_CONTAINS, 'https://pod.example/notes/a.md'),
      q('https://pod.example/notes/', LDP_CONTAINS, 'https://pod.example/notes/b.md')
    ]
  })

  test('objects returns every object for subject and predicate', () => {
    const found = objects(container.meta, container.iri, LDP_CONTAINS).map((t) => t.value)
    expect(found).toEqual(['https://pod.example/notes/a.md', 'https://pod.example/notes/b.md'])
  })

  test('isContainer reads rdf:type ldp:Container from meta', () => {
    expect(isContainer(container)).toBe(true)
    expect(isContainer(resource())).toBe(false)
  })

  test('isContainer reads rdf:type ldp:Container from graph as well', () => {
    const bodyTyped = resource({
      iri: 'https://pod.example/notes/',
      contentType: 'text/turtle',
      graph: [
        q('https://pod.example/notes/', RDF_TYPE, LDP_CONTAINER),
        q('https://pod.example/notes/', LDP_CONTAINS, 'https://pod.example/notes/a.md')
      ]
    })
    expect(isContainer(bodyTyped)).toBe(true)
  })

  test("typesOf reads the subject's rdf:type from graph, empty without graph", () => {
    const typed = resource({
      graph: [q('https://pod.example/notes/a.md', RDF_TYPE, 'https://schema.org/Note')]
    })
    expect(typesOf(typed)).toEqual(['https://schema.org/Note'])
    expect(typesOf(resource())).toEqual([])
  })

  test('typesOf unions the types in meta with the ones in graph, without repeats', () => {
    const both = resource({
      meta: [
        q('https://pod.example/notes/a.md', RDF_TYPE, 'https://schema.org/CreativeWork'),
        q('https://pod.example/notes/a.md', RDF_TYPE, 'https://schema.org/Note')
      ],
      graph: [q('https://pod.example/notes/a.md', RDF_TYPE, 'https://schema.org/Note')]
    })
    expect(typesOf(both)).toEqual(['https://schema.org/CreativeWork', 'https://schema.org/Note'])
  })
})

describe('holds', () => {
  test('iri compares the resource IRI exactly', () => {
    expect(holds({ iri: 'https://pod.example/notes/a.md' }, resource())).toBe(true)
    expect(holds({ iri: 'https://pod.example/notes/b.md' }, resource())).toBe(false)
  })

  test('iri accepts a regular expression', () => {
    expect(holds({ iri: /\/notes\/[^/]+\.md$/ }, resource())).toBe(true)
    expect(holds({ iri: /^https:\/\/other\.example\// }, resource())).toBe(false)
  })

  test('contentType compares the media type with parameters stripped', () => {
    const r = resource({ contentType: 'text/markdown; charset=utf-8' })
    expect(holds({ contentType: 'text/markdown' }, r)).toBe(true)
    expect(holds({ contentType: 'text/turtle' }, r)).toBe(false)
  })

  test('contentType accepts a regular expression', () => {
    expect(holds({ contentType: /^image\// }, resource({ contentType: 'image/png' }))).toBe(true)
  })

  test('container matches presence and absence', () => {
    const c = resource({ meta: [q('x', RDF_TYPE, LDP_CONTAINER)], iri: 'x' })
    expect(holds({ container: true }, c)).toBe(true)
    expect(holds({ container: false }, c)).toBe(false)
    expect(holds({ container: false }, resource())).toBe(true)
  })

  test('type needs the statement in graph and never holds without graph', () => {
    const typed = resource({ graph: [q(resource().iri, RDF_TYPE, 'https://schema.org/Note')] })
    expect(holds({ type: 'https://schema.org/Note' }, typed)).toBe(true)
    expect(holds({ type: 'https://schema.org/Note' }, resource())).toBe(false)
  })

  test('ask never holds in the core', () => {
    expect(holds({ ask: 'ASK { ?s ?p ?o }' }, resource())).toBe(false)
  })
})

describe('select', () => {
  const markdown = view('urn:md', [{ contentType: 'text/markdown' }])
  const container = view('urn:container', [{ container: true }])
  const fallback = view('urn:fallback', [])

  test('picks the first view whose own conditions hold, in registration order', () => {
    const r = createRenderer({ parsers: [], views: [markdown, container, fallback] })
    expect(r.select(resource())?.id).toBe('urn:md')
    expect(r.select(resource({ contentType: 'text/plain' }))?.id).toBe('urn:fallback')
  })

  test("registry rules are consulted before the views' own conditions", () => {
    const r = createRenderer({
      parsers: [],
      views: [markdown, fallback],
      rules: [{ view: 'urn:fallback', when: [{ contentType: 'text/markdown' }] }]
    })
    expect(r.select(resource())?.id).toBe('urn:fallback')
  })

  test('an iri rule reaches a view that has no conditions of its own', () => {
    const landing = view('urn:landing')
    const r = createRenderer({
      parsers: [],
      views: [landing, markdown],
      rules: [{ view: 'urn:landing', when: [{ iri: 'https://pod.example/' }] }]
    })
    expect(r.select(resource({ iri: 'https://pod.example/' }))?.id).toBe('urn:landing')
    expect(r.select(resource())?.id).toBe('urn:md')
  })

  test('show wins when it names a registered view, is ignored otherwise', () => {
    const r = createRenderer({ parsers: [], views: [markdown, fallback] })
    expect(r.select(resource(), { view: 'urn:fallback' })?.id).toBe('urn:fallback')
    expect(r.select(resource(), { view: 'urn:unknown' })?.id).toBe('urn:md')
  })

  test('a view without conditions never applies on its own', () => {
    const r = createRenderer({ parsers: [], views: [view('urn:silent')] })
    expect(r.select(resource())).toBeUndefined()
  })
})

describe('parse and render', () => {
  const turtle = {
    contentType: 'text/turtle',
    parse: async (r: Resource) => [q(r.iri, RDF_TYPE, 'https://schema.org/Thing')]
  }

  test('parse fills graph through the matching parser and leaves others alone', async () => {
    const r = createRenderer({ parsers: [turtle], views: [] })
    const parsed = await r.parse(resource({ contentType: 'text/turtle' }))
    expect(typesOf(parsed)).toEqual(['https://schema.org/Thing'])
    expect((await r.parse(resource())).graph).toBeUndefined()
  })

  test('render parses, selects by the parsed type, and renders', async () => {
    const thing = view('urn:thing', [{ type: 'https://schema.org/Thing' }])
    const r = createRenderer({ parsers: [turtle], views: [thing] })
    const out = await r.render(resource({ contentType: 'text/turtle' }), noop)
    expect(out.html).toBe('<p>urn:thing</p>')
  })

  test('render rejects when no view applies', async () => {
    const r = createRenderer({ parsers: [], views: [] })
    await expect(r.render(resource(), noop)).rejects.toThrow(/no view/i)
  })
})
