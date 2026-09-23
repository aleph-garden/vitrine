import { describe, expect, test } from 'bun:test'
import { dcterms, ldp, rdf } from '@aleph-garden/terms'
import type { Fetch } from '../src/http.ts'
import { fetchResource } from '../src/http.ts'
import {
  about,
  type Context,
  containerView,
  createRenderer,
  fallbackView,
  holds,
  isContainer,
  stateIn
} from '../src/index.ts'

const RDF_TYPE = rdf.type

const noop: Context = {
  resolve: () => Promise.reject(new Error('no resolve')),
  emit: () => {},
  events: (async function* () {})(),
  transclude: async () => '',
  inner: () => Promise.reject(new Error('no inner view')),
  state: stateIn(new Map())
}

/** Enough of a Turtle reader for the one container fixture below: the point
 *  here is that fetchResource calls what it was handed and folds the quads
 *  into `meta`, which a real parser is not needed to show. */
const parseMeta = (text: string, baseIRI: string) =>
  [...text.matchAll(/<([^>]+)>\s+<([^>]+)>\s+<([^>]+)>\s*\./g)].map(([, s, p, o]) => ({
    subject: { termType: 'NamedNode' as const, value: new URL(s!, baseIRI).href },
    predicate: { termType: 'NamedNode' as const, value: p! },
    object: { termType: 'NamedNode' as const, value: new URL(o!, baseIRI).href }
  }))

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
    expect(about(r.meta, r.iri).one(dcterms.modified)).toBe('2026-09-17T10:00:00.000Z')
  })

  test('a type declared only in the Link header reaches a { type } condition', async () => {
    const r = await fetchResource(
      fetchOf(
        response('%PDF-1.7', {
          'content-type': 'application/pdf',
          link: '<https://schema.org/Invoice>; rel="type"'
        })
      ),
      'https://pod.example/invoice.pdf'
    )
    expect(r.graph).toBeUndefined()
    expect(holds({ type: 'https://schema.org/Invoice' }, r)).toBe(true)
  })

  test('marks a container from the Link header and lists its children from the body', async () => {
    const turtle = [
      `<https://pod.example/notes/> <${ldp.contains}> <https://pod.example/notes/a.md> .`,
      `<https://pod.example/notes/> <${ldp.contains}> <https://pod.example/notes/sub/> .`,
      `<https://pod.example/notes/sub/> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${ldp.Container}> .`
    ].join('\n')
    const r = await fetchResource(
      fetchOf(
        response(turtle, {
          'content-type': 'text/turtle',
          link: '<http://www.w3.org/ns/ldp#Container>; rel="type", <http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          'wac-allow': 'user="read"'
        })
      ),
      'https://pod.example/notes/',
      parseMeta
    )
    expect(isContainer(r)).toBe(true)
    const children = about(r.meta, r.iri).all(ldp.contains)
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

// A conforming Solid server may state a container's type in the body and send
// no `Link; rel="type"`. quadpod does exactly that, measured 2026-09-22. The
// resource then reaches the pipeline with an empty `meta` and everything in
// `graph`, so containment has to be readable from there end to end.
describe('a container typed only in its body', () => {
  const root = 'https://pod.example/notes/'
  // The statements quadpod's own listing carries, written one per line
  // because the reader above is a regular expression rather than a parser.
  const turtle = [
    `<${root}> <${RDF_TYPE}> <${ldp.BasicContainer}> .`,
    `<${root}> <${RDF_TYPE}> <${ldp.Container}> .`,
    `<${root}> <${ldp.contains}> <${root}a.md> .`,
    `<${root}> <${ldp.contains}> <${root}sub/> .`,
    `<${root}sub/> <${RDF_TYPE}> <${ldp.Container}> .`
  ].join('\n')

  const fetched = () =>
    fetchResource(
      fetchOf(
        response(turtle, {
          'content-type': 'text/turtle',
          link: `<${root}.aux/notes/.acl>; rel="acl"`,
          'wac-allow': 'user="read write append control",public=""'
        })
      ),
      root,
      parseMeta
    )

  test('reaches containerView and lists its children', async () => {
    const r = await fetched()
    expect(r.meta.some((q) => q.predicate.value === ldp.contains)).toBe(false)

    const renderer = createRenderer({
      parsers: [
        { contentType: 'text/turtle', parse: async (res) => parseMeta(res.body as string, res.iri) }
      ],
      views: [containerView, fallbackView]
    })
    const parsed = await renderer.parse(r)
    expect(renderer.select(parsed)?.id).toBe(containerView.id)

    const { html } = await renderer.render(r, noop)
    expect(html).toContain(`href="${root}a.md"`)
    expect(html).toContain(`href="${root}sub/"`)
  })

  test('still reports the requester modes it was sent', async () => {
    expect((await fetched()).allow).toEqual(['read', 'write', 'append', 'control'])
  })
})
