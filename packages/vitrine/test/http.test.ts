import { describe, expect, test } from 'bun:test'
import { dcterms, ldp } from '@aleph-garden/terms'
import type { Fetch } from '../src/http.ts'
import { fetchResource } from '../src/http.ts'
import { about, isContainer } from '../src/index.ts'

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
