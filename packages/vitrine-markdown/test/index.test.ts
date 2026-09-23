import { describe, expect, test } from 'bun:test'
import type { Context, Event, Quad, Resource, Show } from '@aleph-garden/vitrine'
import { invalidateWikilinkIndex, markdownView, NOTE_CLASS, wikilinkIndex } from '../src/index.ts'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const LDP_CONTAINER = 'http://www.w3.org/ns/ldp#Container'
const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const SOLID = 'http://www.w3.org/ns/solid/terms#'

const iri = (value: string) => ({ termType: 'NamedNode', value }) as const
const q = (s: string, p: string, o: string): Quad => ({
  subject: iri(s),
  predicate: iri(p),
  object: iri(o)
})

const POD = 'https://pod.example'
const WEBID = 'https://me.example/profile#me'
const TYPE_INDEX = `${POD}/settings/privateTypeIndex.jsonld`

// A pod with a profile, a type index registering notes/ for NoteDigitalDocument,
// and two note containers.
const pod = (): Record<string, Resource> => {
  const md = (path: string, body: string): Resource => ({
    iri: `${POD}${path}`,
    contentType: 'text/markdown',
    body,
    quads: [],
    allow: ['read']
  })
  const container = (path: string, children: string[]): Resource => ({
    iri: `${POD}${path}`,
    contentType: 'text/turtle',
    body: '',
    quads: [
      q(`${POD}${path}`, RDF_TYPE, LDP_CONTAINER),
      ...children.map((c) => q(`${POD}${path}`, LDP_CONTAINS, `${POD}${path}${c}`)),
      ...children
        .filter((c) => c.endsWith('/'))
        .map((c) => q(`${POD}${path}${c}`, RDF_TYPE, LDP_CONTAINER))
    ],
    allow: ['read']
  })
  const rdf = (iriValue: string, graph: Quad[]): Resource => ({
    iri: iriValue,
    contentType: 'text/turtle',
    body: '',
    quads: graph,
    allow: ['read']
  })
  return {
    [WEBID.split('#')[0]!]: rdf(WEBID.split('#')[0]!, [
      q(WEBID, `${SOLID}privateTypeIndex`, TYPE_INDEX)
    ]),
    [TYPE_INDEX]: rdf(TYPE_INDEX, [
      q(`${TYPE_INDEX}#notes`, RDF_TYPE, `${SOLID}TypeRegistration`),
      q(`${TYPE_INDEX}#notes`, `${SOLID}forClass`, NOTE_CLASS),
      q(`${TYPE_INDEX}#notes`, `${SOLID}instanceContainer`, `${POD}/notes/`)
    ]),
    [`${POD}/notes/`]: container('/notes/', ['Matrix.md', 'algebra/']),
    [`${POD}/notes/algebra/`]: container('/notes/algebra/', ['Körper.md', 'image.png']),
    [`${POD}/notes/Matrix.md`]: md(
      '/notes/Matrix.md',
      '# Matrix\n\nEine [[Körper|Körper-Matrix]].\n'
    ),
    [`${POD}/notes/algebra/Körper.md`]: md(
      '/notes/algebra/Körper.md',
      '## Definition\n\nEin Körper.\n'
    )
  }
}

const ctxFor = (entries: Record<string, Resource>) => {
  const calls: string[] = []
  const events: Event[] = []
  const transcluded: { iri: string; show?: Show }[] = []
  const ctx: Context = {
    resolve: async (iriValue) => {
      calls.push(iriValue)
      const r = entries[iriValue]
      if (!r) throw Object.assign(new Error(`404 ${iriValue}`), { status: 404 })
      return r
    },
    emit: (e) => void events.push(e),
    events: (async function* () {})(),
    transclude: async (iriValue, show) => {
      transcluded.push({ iri: iriValue, show })
      return `<div data-test-transclude="${iriValue}"></div>`
    },
    about: () => {
      throw new Error('no resource is drawn here')
    },
    render: () => Promise.reject(new Error('no view below')),
    state: ((_key: string, initial?: unknown) => ({
      get: () => initial,
      set() {}
    })) as Context['state']
  }
  return { ctx, calls, events, transcluded }
}

const view = () => markdownView({ sparqlEndpoint: `${POD}/sparql`, webId: WEBID })
const note = (body: string, path = '/notes/Note.md'): Resource => ({
  iri: `${POD}${path}`,
  contentType: 'text/markdown',
  body,
  quads: [],
  allow: ['read']
})

describe('wikilinkIndex', () => {
  test('maps basenames from the type index containers, recursively, to IRIs', async () => {
    const { ctx, calls } = ctxFor(pod())
    invalidateWikilinkIndex(WEBID, `${POD}/notes/`)
    const index = await wikilinkIndex(ctx, WEBID)
    expect(index.lookup('Matrix')).toBe(`${POD}/notes/Matrix.md`)
    expect(index.lookup('Körper')).toBe(`${POD}/notes/algebra/Körper.md`)
    expect(index.lookup('algebra/Körper')).toBe(`${POD}/notes/algebra/Körper.md`)
    expect(index.lookup('image.png')).toBe(`${POD}/notes/algebra/image.png`)
    expect(index.lookup('Nope')).toBeUndefined()
    expect(calls).toContain(TYPE_INDEX)
    expect(calls).toContain(`${POD}/notes/algebra/`)
  })

  test('is built once per WebID until a container is invalidated', async () => {
    const { ctx, calls } = ctxFor(pod())
    invalidateWikilinkIndex(WEBID, `${POD}/notes/`)
    await wikilinkIndex(ctx, WEBID)
    const before = calls.length
    await wikilinkIndex(ctx, WEBID)
    expect(calls.length).toBe(before)
    invalidateWikilinkIndex(WEBID, `${POD}/notes/algebra/`)
    await wikilinkIndex(ctx, WEBID)
    expect(calls.length).toBeGreaterThan(before)
  })
})

describe('markdownView', () => {
  test('applies to text/markdown', () => {
    expect(view().when).toEqual([{ contentType: 'text/markdown' }])
  })

  test('renders headings and paragraphs under Obsidian classes', async () => {
    const { ctx } = ctxFor(pod())
    const { html } = await view().render(note('# Title\n\nText.\n'), ctx)
    expect(html).toMatch(/class="[^"]*\bmarkdown-preview-view\b/)
    expect(html).toContain('<h1')
    expect(html).toContain('Title')
    expect(html).toContain('<p>Text.</p>')
  })

  test('renders frontmatter as a properties block and applies cssclasses and tags', async () => {
    const { ctx } = ctxFor(pod())
    const body =
      '---\ntitle: X\ntags: [math, algebra]\ncssclasses: [wide]\naliases: [Y]\n---\nBody\n'
    const { html } = await view().render(note(body), ctx)
    expect(html).toMatch(/class="[^"]*\bwide\b/)
    expect(html).toContain('metadata-container')
    expect(html).toContain('title')
    expect(html).toContain('X')
    expect(html).toMatch(/class="[^"]*\btag\b[^"]*"[^>]*>#math</)
  })

  test('resolves wikilinks in all forms through the index', async () => {
    const { ctx } = ctxFor(pod())
    invalidateWikilinkIndex(WEBID, `${POD}/notes/`)
    const body = '[[Matrix]] [[Matrix|die Matrix]] [[Körper#Definition]] [[Matrix#^b1]] [[Nope]]'
    const { html } = await view().render(note(body), ctx)
    expect(html).toContain(`<a class="internal-link" href="${POD}/notes/Matrix.md">Matrix</a>`)
    expect(html).toContain(`href="${POD}/notes/Matrix.md">die Matrix</a>`)
    expect(html).toContain(
      `href="${POD}/notes/algebra/K%C3%B6rper.md#Definition">Körper &gt; Definition</a>`
    )
    expect(html).toContain(`href="${POD}/notes/Matrix.md#^b1"`)
    expect(html).toMatch(/<a class="internal-link is-unresolved"[^>]*>Nope<\/a>/)
    expect(html).not.toMatch(/is-unresolved" href=/)
  })

  test('embeds a note by transcluding it, and an image as img', async () => {
    const { ctx, transcluded } = ctxFor(pod())
    invalidateWikilinkIndex(WEBID, `${POD}/notes/`)
    const { html } = await view().render(note('![[Körper]]\n\n![[image.png]]\n'), ctx)
    expect(transcluded).toEqual([{ iri: `${POD}/notes/algebra/Körper.md`, show: undefined }])
    expect(html).toContain(`data-test-transclude="${POD}/notes/algebra/Körper.md"`)
    expect(html).not.toContain('Ein Körper.')
    expect(html).toContain(`<img src="${POD}/notes/algebra/image.png"`)
  })

  test('embeds a heading as a clipped transclusion', async () => {
    const { ctx, transcluded } = ctxFor(pod())
    invalidateWikilinkIndex(WEBID, `${POD}/notes/`)
    await view().render(note('![[Körper#Definition]]\n'), ctx)
    expect(transcluded).toEqual([
      { iri: `${POD}/notes/algebra/Körper.md`, show: { fragment: 'Definition', clip: true } }
    ])
  })

  test('embeds a block as a clipped transclusion', async () => {
    const { ctx, transcluded } = ctxFor(pod())
    invalidateWikilinkIndex(WEBID, `${POD}/notes/`)
    await view().render(note('![[Matrix#^b1]]\n'), ctx)
    expect(transcluded).toEqual([
      { iri: `${POD}/notes/Matrix.md`, show: { fragment: '^b1', clip: true } }
    ])
  })

  test('embeds its own note without recursing: the runtime decides', async () => {
    const entries = pod()
    entries[`${POD}/notes/Matrix.md`]!.body = '![[Matrix]]'
    const { ctx, transcluded } = ctxFor(entries)
    invalidateWikilinkIndex(WEBID, `${POD}/notes/`)
    const { html } = await view().render(entries[`${POD}/notes/Matrix.md`]!, ctx)
    expect(transcluded).toEqual([{ iri: `${POD}/notes/Matrix.md`, show: undefined }])
    expect(html).not.toContain('is-unresolved')
  })

  test('clip renders the section the fragment names and nothing else', async () => {
    const { ctx } = ctxFor(pod())
    const body = '# Eins\n\nErster Text.\n\n## Zwei\n\nZweiter Text.\n\n## Drei\n\nDritter Text.\n'
    const { html } = await view().render(note(body), ctx, { fragment: 'Zwei', clip: true })
    expect(html).toContain('Zweiter Text.')
    expect(html).toContain('Zwei')
    expect(html).not.toContain('Erster Text.')
    expect(html).not.toContain('Dritter Text.')
  })

  test('clip renders the block the fragment names, without its marker', async () => {
    const { ctx } = ctxFor(pod())
    const body = 'Erster Absatz.\n\nZweiter Absatz. ^b1\n\nDritter Absatz.\n'
    const { html } = await view().render(note(body), ctx, { fragment: '^b1', clip: true })
    expect(html).toContain('Zweiter Absatz.')
    expect(html).not.toContain('^b1')
    expect(html).not.toContain('Erster Absatz.')
    expect(html).not.toContain('Dritter Absatz.')
  })

  test('a fragment without clip keeps the whole note', async () => {
    const { ctx } = ctxFor(pod())
    const body = '# Eins\n\nErster Text.\n\n## Zwei\n\nZweiter Text.\n'
    const { html } = await view().render(note(body), ctx, { fragment: 'Zwei' })
    expect(html).toContain('Erster Text.')
    expect(html).toContain('Zweiter Text.')
    expect(html).toContain('is-flashing')
  })

  test('renders tags, tasks and callouts', async () => {
    const { ctx } = ctxFor(pod())
    const body =
      'Hallo #tag/sub\n\n- [ ] offen\n- [x] fertig 📅 2026-09-17\n\n> [!warning] Titel\n> Inhalt\n'
    const { html } = await view().render(note(body), ctx)
    expect(html).toMatch(/<a class="tag"[^>]*>#tag\/sub<\/a>/)
    expect(html).toMatch(
      /<li[^>]*class="task-list-item[^"]*"[^>]*><input[^>]*type="checkbox"[^>]*disabled/
    )
    expect(html).toContain('checked')
    expect(html).toContain('📅 2026-09-17')
    expect(html).toMatch(/<div class="callout" data-callout="warning">/)
    expect(html).toContain('Titel')
    expect(html).toContain('Inhalt')
  })

  test('renders math with KaTeX and mermaid as a pre for hydrate', async () => {
    const { ctx } = ctxFor(pod())
    const { html, hydrate } = await view().render(
      note('$a^2$\n\n```mermaid\ngraph TD; A-->B\n```\n'),
      ctx
    )
    expect(html).toContain('class="katex')
    expect(html).toContain('<pre class="mermaid">graph TD; A--&gt;B')
    expect(typeof hydrate).toBe('function')
  })

  test('runs a sparql block through resolve and renders a table', async () => {
    const entries = pod()
    const query = 'SELECT ?s WHERE { ?s ?p ?o } LIMIT 1'
    const endpoint = `${POD}/sparql?query=${encodeURIComponent(query)}`
    entries[endpoint] = {
      iri: endpoint,
      contentType: 'application/sparql-results+json',
      body: JSON.stringify({
        head: { vars: ['s'] },
        results: { bindings: [{ s: { type: 'uri', value: 'https://x.example/1' } }] }
      }),
      quads: [],
      allow: ['read']
    }
    const { ctx, calls } = ctxFor(entries)
    const { html } = await view().render(note(`\`\`\`sparql\n${query}\n\`\`\`\n`), ctx)
    expect(calls).toContain(endpoint)
    expect(html).toMatch(
      /<table class="sparql-results">[\s\S]*<th>s<\/th>[\s\S]*https:\/\/x\.example\/1/
    )
  })

  test('renders a sparql block as code when no endpoint is configured', async () => {
    const { ctx, calls } = ctxFor(pod())
    const query = 'SELECT ?s WHERE { ?s ?p ?o } LIMIT 1'
    const { html } = await markdownView({ webId: WEBID }).render(
      note(`\`\`\`sparql\n${query}\n\`\`\`\n`),
      ctx
    )
    expect(html).toContain('<pre><code class="language-sparql">')
    expect(html).toContain('SELECT ?s WHERE')
    expect(calls.filter((c) => c.includes('sparql'))).toEqual([])
  })

  test('marks the fragment heading as flashing', async () => {
    const { ctx } = ctxFor(pod())
    const { html } = await view().render(note('# Top\n\n## Setup\n\nx\n'), ctx, {
      fragment: 'Setup'
    })
    expect(html).toMatch(/<h2[^>]*id="Setup"[^>]*class="[^"]*\bis-flashing\b/)
  })

  test('escapes raw html in the source', async () => {
    const { ctx } = ctxFor(pod())
    const { html } = await view().render(note('<script>alert(1)</script>\n'), ctx)
    expect(html).not.toContain('<script>')
  })

  test('renders the real vault fixtures without throwing', async () => {
    const { ctx } = ctxFor(pod())
    const dir = `${import.meta.dir}/fixtures`
    for (const name of ['Matrix.md', 'Treppennormalform.md', 'Zeitplan.md', 'Ship Terms.md']) {
      const body = await Bun.file(`${dir}/${name}`).text()
      const { html } = await view().render(note(body, `/notes/${name}`), ctx)
      expect(html.length).toBeGreaterThan(0)
    }
  })
})
