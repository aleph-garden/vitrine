import { describe, expect, test } from 'bun:test'
import {
  ALEPH,
  type Context,
  containerView,
  fallbackView,
  fileRowView,
  folderView,
  type Quad,
  type Resource
} from '../src/index.ts'
import { stateIn } from '../src/state.ts'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const LDP_CONTAINER = 'http://www.w3.org/ns/ldp#Container'
const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const DC_MODIFIED = 'http://purl.org/dc/terms/modified'

const iri = (value: string) => ({ termType: 'NamedNode', value }) as const
const q = (s: string, p: string, o: Quad['object'] | string): Quad => ({
  subject: iri(s),
  predicate: iri(p),
  object: typeof o === 'string' ? iri(o) : o
})
/** The statements as the store states them. */
const meta = (quads: Quad[]): Quad[] => quads.map((x) => ({ ...x, graph: iri(ALEPH.Meta) }))
/** The statements as the body of `doc` states them. */
const body = (doc: string, quads: Quad[]): Quad[] => quads.map((x) => ({ ...x, graph: iri(doc) }))

const noop: Context = {
  resolve: () => Promise.reject(new Error('no resolve')),
  emit: () => {},
  events: (async function* () {})(),
  transclude: async () => '',
  about: () => {
    throw new Error('no resource is drawn here')
  },
  render: () => Promise.reject(new Error('no view below')),
  state: stateIn(new Map())
}

describe('containerView', () => {
  const root = 'https://pod.example/notes/'
  const container: Resource = {
    iri: root,
    contentType: 'text/turtle',
    body: '',
    quads: meta([
      q(root, RDF_TYPE, LDP_CONTAINER),
      q(root, LDP_CONTAINS, `${root}a.md`),
      q(root, LDP_CONTAINS, `${root}sub/`),
      q(`${root}sub/`, RDF_TYPE, LDP_CONTAINER),
      q(`${root}a.md`, DC_MODIFIED, {
        termType: 'Literal',
        value: '2026-09-17T10:00:00Z',
        datatype: 'http://www.w3.org/2001/XMLSchema#dateTime'
      })
    ]),
    allow: ['read']
  }

  test('lists each child as a link with its name', async () => {
    const { html } = await containerView.render(container, noop)
    expect(html).toContain(`href="${root}a.md"`)
    expect(html).toContain('>a.md<')
    expect(html).toContain(`href="${root}sub/"`)
    expect(html).toContain('>sub/<')
  })

  test('marks child containers and shows modified where stated', async () => {
    const { html } = await containerView.render(container, noop)
    expect(html).toMatch(/<li[^>]*class="[^"]*\bis-container\b[^"]*"[^>]*>[\s\S]*sub\//)
    expect(html).toContain('2026-09-17T10:00:00Z')
  })

  test('escapes names', async () => {
    const r: Resource = {
      ...container,
      quads: meta([q(root, RDF_TYPE, LDP_CONTAINER), q(root, LDP_CONTAINS, `${root}a<b>.md`)])
    }
    const { html } = await containerView.render(r, noop)
    expect(html).not.toContain('<b>')
    expect(html).toContain('a&lt;b&gt;.md')
  })

  // A server that states containment in the body and sends no
  // `Link; rel="type"` leaves the store's graph empty of it, so a listing
  // read from that graph alone comes back with nothing in it.
  test('lists children stated only in the body', async () => {
    const r: Resource = {
      iri: root,
      contentType: 'text/turtle',
      body: '',
      quads: body(root, [
        q(root, RDF_TYPE, LDP_CONTAINER),
        q(root, LDP_CONTAINS, `${root}a.md`),
        q(root, LDP_CONTAINS, `${root}sub/`),
        q(`${root}sub/`, RDF_TYPE, LDP_CONTAINER)
      ]),
      allow: ['read']
    }
    const { html } = await containerView.render(r, noop)
    expect(html).toContain(`href="${root}a.md"`)
    expect(html).toMatch(/<li[^>]*class="[^"]*\bis-container\b[^"]*"[^>]*>[\s\S]*sub\//)
  })

  // Both sources carry the same statements when the server sends the header
  // and a parser reads the body. One member, one entry.
  test('lists a child stated by the store and by the body once', async () => {
    const r: Resource = {
      ...container,
      quads: [
        ...meta([q(root, RDF_TYPE, LDP_CONTAINER), q(root, LDP_CONTAINS, `${root}a.md`)]),
        ...body(root, [q(root, RDF_TYPE, LDP_CONTAINER), q(root, LDP_CONTAINS, `${root}a.md`)])
      ]
    }
    const { html } = await containerView.render(r, noop)
    expect(html.match(new RegExp(`href="${root}a\\.md"`, 'g'))).toHaveLength(1)
  })
})

describe('folderView', () => {
  const root = 'https://pod.example/trip/'
  const folder: Resource = {
    iri: root,
    contentType: 'text/turtle',
    body: '',
    quads: [
      ...meta([q(root, RDF_TYPE, LDP_CONTAINER), q(root, LDP_CONTAINS, `${root}a.md`)]),
      ...body(root, [q(root, LDP_CONTAINS, `${root}a.md`), q(root, LDP_CONTAINS, `${root}sub/`)])
    ],
    allow: ['read']
  }

  test('transcludes each member once, as a row', async () => {
    const asked: [string, string | undefined][] = []
    const ctx: Context = {
      ...noop,
      transclude: async (iri, show) => {
        asked.push([iri, show?.view])
        return `<div data-aleph-transclude="${iri}"></div>`
      }
    }
    const { html } = await folderView.render(folder, ctx)
    expect(asked).toEqual([
      [`${root}a.md`, fileRowView.id],
      [`${root}sub/`, fileRowView.id]
    ])
    expect(html.match(/<li class="folder-row">/g)).toHaveLength(2)
  })
})

describe('fileRowView', () => {
  const file: Resource = {
    iri: 'https://pod.example/trip/a%20b.md',
    contentType: 'text/markdown; charset=utf-8',
    body: '# Plan\n',
    quads: [],
    allow: ['read']
  }

  test('names the member and links it', async () => {
    const { html } = await fileRowView.render(file, noop)
    expect(html).toContain(
      '<a class="file-row-name" href="https://pod.example/trip/a%20b.md" target="_blank" rel="noopener">a b.md</a>'
    )
  })

  test('takes the date and size the parent container states', async () => {
    const parent: Resource = {
      iri: 'https://pod.example/trip/',
      contentType: 'text/turtle',
      body: '',
      quads: body('https://pod.example/trip/', [
        q(file.iri, DC_MODIFIED, {
          termType: 'Literal',
          value: '2026-09-17T10:00:00Z',
          datatype: 'http://www.w3.org/2001/XMLSchema#dateTime'
        }),
        q(file.iri, 'http://www.w3.org/ns/posix/stat#size', {
          termType: 'Literal',
          value: '3267',
          datatype: 'http://www.w3.org/2001/XMLSchema#integer'
        })
      ]),
      allow: ['read']
    }
    const ctx: Context = {
      ...noop,
      resolve: async (iri) => {
        if (iri !== parent.iri) throw new Error(`resolved ${iri}`)
        return parent
      }
    }
    const { html } = await fileRowView.render(file, ctx)
    expect(html).toContain('<time datetime="2026-09-17T10:00:00Z">2026-09-17</time>')
    expect(html).toContain('<span class="file-row-size">3.3 kB</span>')
  })

  test("falls back to the body's length without a parent", async () => {
    const { html } = await fileRowView.render(file, noop)
    expect(html).toContain('<span class="file-row-size">7 B</span>')
    expect(html).not.toContain('<time')
  })

  test("keeps a container's trailing slash", async () => {
    const r: Resource = { ...file, iri: 'https://pod.example/trip/sub/' }
    const { html } = await fileRowView.render(r, noop)
    expect(html).toContain('>sub/</a>')
  })
})

describe('fallbackView', () => {
  test('renders a graph as statements grouped by subject with linked IRIs', async () => {
    const r: Resource = {
      iri: 'https://pod.example/x.ttl',
      contentType: 'text/turtle',
      body: '',
      quads: body('https://pod.example/x.ttl', [
        q('https://pod.example/x.ttl#me', RDF_TYPE, 'https://schema.org/Person'),
        q('https://pod.example/x.ttl#me', 'https://schema.org/name', {
          termType: 'Literal',
          value: 'Toph',
          language: 'de'
        })
      ]),
      allow: ['read']
    }
    const { html } = await fallbackView.render(r, noop)
    expect(html).toContain(`href="https://schema.org/Person"`)
    expect(html).toContain('Toph')
    expect(html.match(/<tbody/g)?.length ?? html.match(/class="subject"/g)?.length).toBe(1)
  })

  test('renders other text as preformatted, escaped', async () => {
    const r: Resource = {
      iri: 'https://pod.example/x.txt',
      contentType: 'text/plain',
      body: '<script>x</script>',
      quads: [],
      allow: ['read']
    }
    const { html } = await fallbackView.render(r, noop)
    expect(html).toMatch(/^<pre/)
    expect(html).toContain('&lt;script&gt;')
  })

  test('renders binary as a download link', async () => {
    const r: Resource = {
      iri: 'https://pod.example/x.bin',
      contentType: 'application/octet-stream',
      body: new Uint8Array([1, 2, 3]),
      quads: [],
      allow: ['read']
    }
    const { html } = await fallbackView.render(r, noop)
    expect(html).toContain(`href="https://pod.example/x.bin"`)
    expect(html).toContain('download')
  })
})
