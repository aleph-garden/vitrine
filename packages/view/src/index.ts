// Contracts and the pipeline. No RDF library, no DOM: quads are plain data,
// and everything that touches elements lives in ./dom.ts.

// ---------------------------------------------------------------- data

export type Mode = 'read' | 'write' | 'append' | 'control'

export type Term = {
  termType: 'NamedNode' | 'BlankNode' | 'Literal'
  value: string
  datatype?: string
  language?: string
  direction?: 'ltr' | 'rtl'
}

export type Quad = {
  subject: Term
  predicate: Term
  object: Term
  graph?: Term
}

export type Resource = {
  iri: string
  contentType: string
  body: string | Uint8Array
  graph?: Quad[]
  meta: Quad[]
  allow: Mode[]
}

// ActivityStreams 2.0 activity as a plain object.
export type Event = {
  type: string
  object?: string
  actor?: string
  target?: string
  [key: string]: unknown
}

export const AS = {
  Update: 'https://www.w3.org/ns/activitystreams#Update',
  View: 'https://www.w3.org/ns/activitystreams#View'
} as const

export const ALEPH = {
  Select: 'https://aleph.garden/ns/view#Select'
} as const

// ------------------------------------------------------------- context

export type Context = {
  resolve(iri: string): Promise<Resource>
  emit(event: Event): void
  events: AsyncIterable<Event>
}

// ----------------------------------------------------------- selection

export type Condition =
  | { contentType: string | RegExp }
  | { container: boolean }
  | { type: string }
  | { ask: string }

export type Rule = {
  view: string
  when: Condition[]
}

// ---------------------------------------------------------------- view

export type Hint = {
  view?: string
  fragment?: string
}

export type Patch = {
  slot?: string
  html: string
}

export type Handle = {
  update?(event: Event): Patch | void
  dispose?(): void
}

export type Rendered = {
  html: string
  hydrate?(root: Element, ctx: Context): Handle | void
}

export type View = {
  id: string
  /** Where this view applies by default; a registry rule overrides. */
  when?: Condition[]
  render(resource: Resource, ctx: Context, hint?: Hint): Promise<Rendered>
}

// -------------------------------------------------------------- parser

export type Parser = {
  contentType: string | RegExp
  parse(resource: Resource): Promise<Quad[]>
}

// ------------------------------------------------------------ renderer

export type Registry = {
  parsers: Parser[]
  views: View[]
  /** User overrides, consulted before the views' own `when`. */
  rules?: Rule[]
}

export type Renderer = {
  /** Fills `graph` through the first parser whose contentType matches. */
  parse(resource: Resource): Promise<Resource>
  /** Hint first, then registry rules in order, then each view's `when`
   *  in registration order; undefined when nothing holds. */
  select(resource: Resource, hint?: Hint): View | undefined
  /** parse, select, render. Rejects when no view applies. */
  render(resource: Resource, ctx: Context, hint?: Hint): Promise<Rendered>
}

export function createRenderer(registry: Registry): Renderer {
  const byId = new Map(registry.views.map((v) => [v.id, v]))
  const all = (when: Condition[], r: Resource) => when.every((c) => holds(c, r))

  const parse = async (resource: Resource): Promise<Resource> => {
    const parser = registry.parsers.find((p) => matchesType(p.contentType, resource.contentType))
    if (!parser) return resource
    return { ...resource, graph: await parser.parse(resource) }
  }

  const select = (resource: Resource, hint?: Hint): View | undefined => {
    const hinted = hint?.view === undefined ? undefined : byId.get(hint.view)
    if (hinted) return hinted
    for (const rule of registry.rules ?? []) {
      const v = byId.get(rule.view)
      if (v && all(rule.when, resource)) return v
    }
    return registry.views.find((v) => v.when !== undefined && all(v.when, resource))
  }

  const render = async (resource: Resource, ctx: Context, hint?: Hint): Promise<Rendered> => {
    const parsed = await parse(resource)
    const view = select(parsed, hint)
    if (!view) throw new Error(`no view applies to ${resource.iri} (${resource.contentType})`)
    return view.render(parsed, ctx, hint)
  }

  return { parse, select, render }
}

/** The condition holds for the resource. `ask` never holds here. */
export function holds(condition: Condition, resource: Resource): boolean {
  if ('contentType' in condition) return matchesType(condition.contentType, resource.contentType)
  if ('container' in condition) return isContainer(resource) === condition.container
  if ('type' in condition) return typesOf(resource).includes(condition.type)
  return false
}

function matchesType(expected: string | RegExp, contentType: string): boolean {
  const mediaType = contentType.split(';', 1)[0]!.trim().toLowerCase()
  return typeof expected === 'string'
    ? expected.toLowerCase() === mediaType
    : expected.test(mediaType)
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const LDP_CONTAINER = 'http://www.w3.org/ns/ldp#Container'

// ---------------------------------------------------------- quad helpers
// Plain scans over quad arrays, so that views and conditions read `meta`
// and `graph` without an RDF library.

export function objects(quads: Quad[], subject: string, predicate: string): Term[] {
  return quads
    .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
    .map((q) => q.object)
}

export function isContainer(resource: Resource): boolean {
  return objects(resource.meta, resource.iri, RDF_TYPE).some((t) => t.value === LDP_CONTAINER)
}

export function typesOf(resource: Resource): string[] {
  return objects(resource.graph ?? [], resource.iri, RDF_TYPE).map((t) => t.value)
}

// --------------------------------------------------------- built-in views
// Both read `meta` and `graph` as plain quads, so they live here.

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const DC_MODIFIED = 'http://purl.org/dc/terms/modified'

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function childName(parent: string, child: string): string {
  const rest = child.startsWith(parent) ? child.slice(parent.length) : child
  return decodeURIComponent(rest)
}

export const containerView: View = {
  id: 'https://aleph.garden/ns/view#Container',
  when: [{ container: true }],
  async render(resource) {
    const items = objects(resource.meta, resource.iri, LDP_CONTAINS).map((child) => {
      const iri = child.value
      const container = objects(resource.meta, iri, RDF_TYPE).some((t) => t.value === LDP_CONTAINER)
      const modified = objects(resource.meta, iri, DC_MODIFIED)[0]?.value
      const cls = container ? 'child is-container' : 'child'
      const time = modified
        ? ` <time datetime="${escapeHtml(modified)}">${escapeHtml(modified)}</time>`
        : ''
      return `<li class="${cls}"><a href="${escapeHtml(iri)}">${escapeHtml(childName(resource.iri, iri))}</a>${time}</li>`
    })
    return { html: `<ul class="container-listing">${items.join('')}</ul>` }
  }
}

function termHtml(term: Term): string {
  if (term.termType === 'NamedNode')
    return `<a href="${escapeHtml(term.value)}">${escapeHtml(term.value)}</a>`
  if (term.termType === 'BlankNode') return `<span class="bnode">_:${escapeHtml(term.value)}</span>`
  const tag = term.language ? `<span class="lang">@${escapeHtml(term.language)}</span>` : ''
  return `<span class="literal">${escapeHtml(term.value)}</span>${tag}`
}

function graphHtml(graph: Quad[]): string {
  const bySubject = new Map<string, Quad[]>()
  for (const quad of graph) {
    const key = quad.subject.value
    bySubject.set(key, [...(bySubject.get(key) ?? []), quad])
  }
  const groups = [...bySubject.entries()].map(([subject, quads]) => {
    const rows = quads
      .map((q) => `<tr><td>${termHtml(q.predicate)}</td><td>${termHtml(q.object)}</td></tr>`)
      .join('')
    return `<tbody class="subject"><tr><th colspan="2">${termHtml(quads[0]!.subject)}</th></tr>${rows}</tbody>`
  })
  return `<table class="statements">${groups.join('')}</table>`
}

export const fallbackView: View = {
  id: 'https://aleph.garden/ns/view#Fallback',
  when: [],
  async render(resource) {
    if (resource.graph) return { html: graphHtml(resource.graph) }
    if (typeof resource.body === 'string' && resource.contentType.startsWith('text/')) {
      return { html: `<pre class="raw">${escapeHtml(resource.body)}</pre>` }
    }
    return {
      html: `<p class="download"><a href="${escapeHtml(resource.iri)}" download>${escapeHtml(resource.iri)}</a> (${escapeHtml(resource.contentType)})</p>`
    }
  }
}
