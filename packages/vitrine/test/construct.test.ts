import { describe, expect, test } from 'bun:test'
import { createRenderer, type Quad, type Resource, type Term, type View } from '../src/index.ts'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const VCARD = 'http://www.w3.org/2006/vcard/ns#Individual'
const FN = 'http://www.w3.org/2006/vcard/ns#fn'
const PERSON = 'https://schema.org/Person'
const NAME = 'https://schema.org/name'
const DOC = 'https://pod.example/card.ttl'

const named = (value: string): Term => ({ termType: 'NamedNode', value })
const q = (s: string, p: string, o: Term): Quad => ({
  subject: named(s),
  predicate: named(p),
  object: o,
  graph: named(DOC)
})

const vcard: Resource = {
  iri: DOC,
  contentType: 'text/turtle',
  body: '',
  quads: [q(DOC, RDF_TYPE, named(VCARD)), q(DOC, FN, { termType: 'Literal', value: 'Mara Lind' })],
  allow: ['read']
}

/** Draws nothing of its own: it restates a vCard as a schema.org person and
 *  hands the result to whatever the rules pick for that. */
const construct: View = {
  id: 'urn:vcard-as-person',
  when: [{ type: VCARD }],
  async render(resource, ctx) {
    const name = ctx.about().one(FN) ?? ''
    const person: Resource = {
      ...resource,
      quads: [
        q(resource.iri, RDF_TYPE, named(PERSON)),
        q(resource.iri, NAME, { termType: 'Literal', value: name })
      ]
    }
    return ctx.inner({}, person)
  }
}

const card: View = {
  id: 'urn:card',
  when: [{ type: PERSON }],
  render: async (_resource, ctx) => ({ html: `<article>${ctx.about().one(NAME)}</article>` })
}

const context = {
  resolve: () => Promise.reject(new Error('no resolve')),
  about: () => {
    throw new Error('answered by the renderer')
  },
  emit: () => {},
  events: (async function* () {})(),
  transclude: async () => '',
  inner: () => Promise.reject(new Error('answered by the renderer')),
  state: ((_key: string, initial?: unknown) => ({ get: () => initial, set() {} })) as never
}

describe('a view that hands on a derived resource', () => {
  test('the rules pick a view for the derived resource by its own type', async () => {
    const renderer = createRenderer({ parsers: [], views: [construct, card] })
    const drawn = await renderer.render(vcard, context)
    expect(drawn.html).toBe('<article>Mara Lind</article>')
    // The drawing answers with its outermost view, the one the resource chose.
    expect(drawn.view.id).toBe('urn:vcard-as-person')
  })

  test('the constructing view is passed over below itself', async () => {
    const renderer = createRenderer({ parsers: [], views: [construct] })
    await expect(renderer.render(vcard, context)).rejects.toThrow(/no view/i)
  })
})
