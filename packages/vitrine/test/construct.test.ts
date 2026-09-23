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
    return ctx.render(person)
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
  render: () => Promise.reject(new Error('answered by the renderer')),
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

const NODE = 'https://example.org/Node'
const CHILD = 'https://example.org/child'

/** A tree of three nodes, `a` holding `b` holding `c`, in one document. */
const tree: Resource = {
  iri: DOC,
  contentType: 'text/turtle',
  body: '',
  quads: ['a', 'b', 'c'].flatMap((n, i, all) => [
    q(`${DOC}#${n}`, RDF_TYPE, named(NODE)),
    ...(all[i + 1] ? [q(`${DOC}#${n}`, CHILD, named(`${DOC}#${all[i + 1]}`))] : [])
  ]),
  subject: `${DOC}#a`,
  allow: ['read']
}

/** Draws a node and each child with whatever the rules pick for it, which is
 *  this view again: the child is a different focus. */
const branch: View = {
  id: 'urn:branch',
  when: [{ type: NODE }],
  async render(resource, ctx) {
    const children = await Promise.all(
      ctx
        .about()
        .all(CHILD)
        .map((child) => ctx.render({ ...resource, subject: child }))
    )
    const name = (resource.subject ?? '').split('#')[1]
    return { html: `<li>${name}<ul>${children.map((c) => c.html).join('')}</ul></li>` }
  }
}

const last: View = {
  id: 'urn:last-resort',
  when: [],
  render: async (resource) => ({ html: `<p>${resource.subject ?? resource.iri}</p>` })
}

describe('recursion through ctx.render', () => {
  test('a view draws its own branches when the focus differs', async () => {
    const renderer = createRenderer({ parsers: [], views: [branch] })
    const drawn = await renderer.render(tree, context)
    expect(drawn.html).toBe('<li>a<ul><li>b<ul><li>c<ul></ul></li></ul></li></ul></li>')
  })

  test('the same resource and focus passes over the view already drawing it', async () => {
    const again: View = {
      id: 'urn:again',
      when: [{ type: PERSON }],
      render: async (resource, ctx) => {
        const below = await ctx.render(resource)
        return { html: `<div>${below.html}</div>` }
      }
    }
    const person: Resource = {
      ...vcard,
      quads: [
        q(DOC, RDF_TYPE, named(PERSON)),
        q(DOC, NAME, { termType: 'Literal', value: 'Mara Lind' })
      ]
    }
    const renderer = createRenderer({ parsers: [], views: [again, card] })
    const drawn = await renderer.render(person, context)
    expect(drawn.html).toBe('<div><article>Mara Lind</article></div>')
  })

  test('past the depth, only views without conditions are left', async () => {
    let step = 0
    // Derives a resource no cycle would ever catch: a new IRI every time.
    const spawn: View = {
      id: 'urn:spawn',
      when: [{ type: NODE }],
      async render(resource, ctx) {
        step += 1
        const next = `${DOC}/${step}`
        const below = await ctx.render({
          ...resource,
          iri: next,
          subject: next,
          quads: [q(next, RDF_TYPE, named(NODE))]
        })
        return { html: `<i>${below.html}</i>` }
      }
    }
    const renderer = createRenderer({ parsers: [], views: [spawn, last] })
    const drawn = await renderer.render(tree, context, undefined, 3)
    expect(drawn.html).toBe(`<i><i><i><p>${DOC}/3</p></i></i></i>`)
  })
})
