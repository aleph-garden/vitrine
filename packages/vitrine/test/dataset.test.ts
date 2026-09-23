import { describe, expect, test } from 'bun:test'
import { createRuntime, VIEW_ATTR } from '../src/dom.ts'
import {
  ALEPH,
  about,
  createRenderer,
  fallbackView,
  holds,
  type Quad,
  type Resource,
  subjectsGridView,
  subjectsListView,
  type Term,
  type View
} from '../src/index.ts'
import { renderInline } from '../src/ssr.ts'
import { DEFERRED_ATTR, mounting, TRANSCLUDE_ATTR, thingOf } from '../src/transclusion.ts'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const PERSON = 'https://schema.org/Person'
const NAME = 'https://schema.org/name'
const MODIFIED = 'http://purl.org/dc/terms/modified'
const DOC = 'https://pod.example/people.ttl'

const named = (value: string): Term => ({ termType: 'NamedNode', value })
const text = (value: string): Term => ({ termType: 'Literal', value })
const q = (s: string, p: string, o: Term, g?: string): Quad => ({
  subject: named(s),
  predicate: named(p),
  object: o,
  ...(g === undefined ? {} : { graph: named(g) })
})

/** Two people described in one document, the way a parser reads them: no
 *  graph of their own, so the renderer files them under the document. */
const people: Quad[] = [
  q(`${DOC}#mara`, RDF_TYPE, named(PERSON)),
  q(`${DOC}#mara`, NAME, text('Mara Lind')),
  q(`${DOC}#jonas`, RDF_TYPE, named(PERSON)),
  q(`${DOC}#jonas`, NAME, text('Jonas Berg')),
  {
    subject: { termType: 'BlankNode', value: 'b0' },
    predicate: named(NAME),
    object: text('nobody')
  }
]

const turtle = { contentType: 'text/turtle', parse: async () => people }

const document = (over: Partial<Resource> = {}): Resource => ({
  iri: DOC,
  contentType: 'text/turtle',
  body: '',
  quads: [q(DOC, MODIFIED, text('2026-09-23'), ALEPH.Meta)],
  allow: ['read'],
  ...over
})

const card: View = {
  id: 'urn:card',
  when: [{ type: PERSON }],
  render: async (_resource, ctx) => ({
    html: `<article>${ctx.about().one(NAME)}</article>`
  })
}

describe('the dataset', () => {
  test('parse files what the body says under the document, other graphs untouched', async () => {
    const parsed = await createRenderer({ parsers: [turtle], views: [] }).parse(document())
    const graphs = new Set(parsed.quads.map((x) => x.graph?.value))
    expect(graphs).toEqual(new Set([ALEPH.Meta, DOC]))
    expect(parsed.quads.filter((x) => x.graph?.value === DOC)).toHaveLength(people.length)
  })

  test('a quad that names its own graph keeps it', async () => {
    const dataset = {
      contentType: 'application/trig',
      parse: async () => [q('s', NAME, text('x'), 'urn:g')]
    }
    const parsed = await createRenderer({ parsers: [dataset], views: [] }).parse(
      document({ contentType: 'application/trig' })
    )
    expect(parsed.quads.some((x) => x.graph?.value === 'urn:g')).toBe(true)
  })

  test('a second parse replaces what the body said before', async () => {
    const stale = document({ quads: [q(DOC, NAME, text('stale'), DOC)] })
    const parsed = await createRenderer({ parsers: [turtle], views: [] }).parse(stale)
    expect(about(parsed, DOC).all(NAME)).toEqual([])
  })
})

describe('about', () => {
  const resource = document({
    quads: [
      q(DOC, MODIFIED, text('from the store'), ALEPH.Meta),
      q(DOC, NAME, text('from the body'), DOC),
      q(DOC, NAME, text('from elsewhere'), 'https://pod.example/people.ttl.meta')
    ]
  })

  test('reads every graph by default', () => {
    expect(about(resource).all(NAME)).toEqual(['from the body', 'from elsewhere'])
    expect(about(resource).one(MODIFIED)).toBe('from the store')
  })

  test('.meta and .content narrow to the store and to the body', () => {
    expect(about(resource).meta.one(MODIFIED)).toBe('from the store')
    expect(about(resource).meta.one(NAME)).toBeUndefined()
    expect(about(resource).content.all(NAME)).toEqual(['from the body'])
  })

  test('.from takes the union of the graphs it names, and chained it intersects', () => {
    const other = 'https://pod.example/people.ttl.meta'
    expect(about(resource).from(DOC, other).all(NAME)).toEqual(['from the body', 'from elsewhere'])
    expect(about(resource).from(DOC, other).from(other).all(NAME)).toEqual(['from elsewhere'])
    expect(about(resource).meta.from(DOC).one(MODIFIED)).toBeUndefined()
  })

  test('stands on the subject the rendering is about', () => {
    const focused = { ...document({ quads: people }), subject: `${DOC}#mara` }
    expect(about(focused).one(NAME)).toBe('Mara Lind')
    expect(about(focused, `${DOC}#jonas`).one(NAME)).toBe('Jonas Berg')
  })

  test('a node keeps the restriction it was read under', () => {
    const r = document({
      quads: [q(DOC, 'urn:p', named('urn:o'), DOC), q('urn:o', NAME, text('meta'), ALEPH.Meta)]
    })
    expect(about(r).content.node('urn:p').one(NAME)).toBeUndefined()
    expect(about(r).node('urn:p').one(NAME)).toBe('meta')
  })
})

describe('selection over the graph', () => {
  test('{ graph: true } holds when the body produced quads, and only then', async () => {
    const renderer = createRenderer({ parsers: [turtle], views: [] })
    expect(holds({ graph: true }, await renderer.parse(document()))).toBe(true)
    expect(holds({ graph: true }, document())).toBe(false)
    expect(holds({ graph: false }, document())).toBe(true)
  })

  test('a fragment naming a subject moves the focus, and type is tested there', async () => {
    const renderer = createRenderer({
      parsers: [turtle],
      views: [card, subjectsGridView, fallbackView]
    })
    const parsed = await renderer.parse(document())
    expect(renderer.select(parsed)?.id).toBe(subjectsGridView.id)
    expect(renderer.select(parsed, { fragment: 'mara' })?.id).toBe('urn:card')
    const drawn = await renderer.render(document(), context(), { fragment: 'mara' })
    expect(drawn.html).toBe('<article>Mara Lind</article>')
  })

  test('a fragment that names no subject leaves the focus on the document', async () => {
    const renderer = createRenderer({ parsers: [turtle], views: [card, subjectsGridView] })
    const parsed = await renderer.parse(document())
    expect(renderer.select(parsed, { fragment: 'Heading' })?.id).toBe(subjectsGridView.id)
  })
})

describe('the subjects views', () => {
  test('embed every subject named by a fragment and draw the rest as statements', async () => {
    const shown: { iri: string; fragment?: string }[] = []
    const renderer = createRenderer({ parsers: [turtle], views: [subjectsGridView] })
    const ctx = context(async (iri, show) => {
      shown.push({ iri, fragment: show?.fragment })
      return `<i>${show?.fragment}</i>`
    })
    const { html } = await renderer.render(document(), ctx)
    expect(shown).toEqual([
      { iri: DOC, fragment: 'mara' },
      { iri: DOC, fragment: 'jonas' }
    ])
    expect(html).toContain('class="subjects subjects-grid"')
    expect(html).toContain('<i>mara</i>')
    expect(html).toContain('_:b0')
    expect(html).not.toContain('Mara Lind')
  })

  test('the list lays the same subjects out as a list', async () => {
    const renderer = createRenderer({ parsers: [turtle], views: [subjectsListView] })
    const { html } = await renderer.render(
      document(),
      context(async () => '')
    )
    expect(html).toContain('class="subjects subjects-list"')
  })

  test('on one subject, they draw that subject alone', async () => {
    const renderer = createRenderer({ parsers: [turtle], views: [subjectsGridView] })
    const { html } = await renderer.render(document(), context(), { fragment: 'jonas' })
    expect(html).toContain('Jonas Berg')
    expect(html).not.toContain('Mara Lind')
    expect(html).not.toContain('class="subjects')
  })

  test('in the browser, each subject is its own instance, chosen by its type', async () => {
    const renderer = createRenderer({
      parsers: [turtle],
      views: [card, subjectsGridView, fallbackView]
    })
    const runtime = createRuntime(renderer, async () => document())
    const el = globalThis.document.createElement('div')
    globalThis.document.body.append(el)
    await runtime.mount(el, DOC)
    expect(el.getAttribute(VIEW_ATTR)).toBe(subjectsGridView.id)
    expect([...el.querySelectorAll('article')].map((a) => a.textContent)).toEqual([
      'Mara Lind',
      'Jonas Berg'
    ])
    expect(el.querySelector(`[${DEFERRED_ATTR}]`)).toBeNull()
  })

  test('on the server too', async () => {
    const renderer = createRenderer({
      parsers: [turtle],
      views: [card, subjectsGridView, fallbackView]
    })
    const html = await renderInline(renderer, async () => document(), DOC)
    expect(html).toContain('<article>Mara Lind</article>')
    expect(html).toContain('<article>Jonas Berg</article>')
    expect(html).not.toContain(DEFERRED_ATTR)
  })
})

describe('cycles are counted per thing', () => {
  test('a document embedding its own subjects is none, a subject embedding itself is one', () => {
    const chain = [thingOf(DOC)]
    expect(mounting(chain, thingOf(DOC, { fragment: 'mara' }), 3)).toBe('auto')
    const deeper = [...chain, thingOf(DOC, { fragment: 'mara' })]
    expect(mounting(deeper, thingOf(DOC, { fragment: 'mara' }), 3)).toBe('cycle')
    expect(mounting(deeper, thingOf(DOC), 3)).toBe('cycle')
  })

  test('the placeholder still names the document and carries the fragment', async () => {
    const renderer = createRenderer({ parsers: [turtle], views: [subjectsGridView] })
    const html = await renderInline(renderer, async () => document(), DOC, undefined, 1)
    expect(html).toContain(`${TRANSCLUDE_ATTR}="${DOC}"`)
    expect(html).toContain('&quot;fragment&quot;:&quot;mara&quot;')
  })
})

/** A context for a render that is not mounted: the renderer answers `about`,
 *  `inner` and `state` itself. */
function context(
  transclude: (iri: string, show?: { fragment?: string }) => Promise<string> = async () => ''
) {
  return {
    resolve: () => Promise.reject(new Error('no resolve')),
    about: () => {
      throw new Error('answered by the renderer')
    },
    emit: () => {},
    events: (async function* () {})(),
    transclude,
    render: () => Promise.reject(new Error('answered by the renderer')),
    state: ((_key: string, initial?: unknown) => ({ get: () => initial, set() {} })) as never
  }
}
