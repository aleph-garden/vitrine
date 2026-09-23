// Contracts and the pipeline. No RDF library, no DOM: quads are plain data,
// and everything that touches elements lives in ./dom.ts.

import { dcterms, ldp, rdf } from '@aleph-garden/terms'

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
  Select: 'https://w3id.org/vitrine/ns#Select'
} as const

// ------------------------------------------------------------- context

export type Context = {
  /** Answers the resource at `iri`, parsed the way a rendered one is: when a
   *  registered parser reads its content type, `graph` holds the quads. */
  resolve(iri: string): Promise<Resource>
  emit(event: Event): void
  events: AsyncIterable<Event>
  /** Brings `iri` in as a child with a life of its own, and answers the HTML
   *  to insert verbatim. Whether that string is the rendered child or a
   *  placeholder a host fills in later is the host's business. */
  transclude(iri: string, show?: Show): Promise<string>
  /** Draws this resource again with the view that would have drawn it were
   *  the calling view not there: selection skips every view already drawing
   *  it in this render, so a wrapper never picks itself or one around it.
   *  `show` may name the inner view; fragment and clip default to this
   *  render's own. Rejects when no view is left. */
  inner(show?: Show): Promise<Drawn>
  /** A value this view keeps for this instance under `key`, `initial` until
   *  it is set. It survives every re-render of the instance, and `set`
   *  re-renders it, so a view reads its state while rendering and sets it
   *  from a handler, never while rendering. Keys are scoped to the calling
   *  view: a wrapper and the view inside it never see each other's.
   *
   *  The state lives as long as the instance. Mounting the region again, or
   *  navigating away, starts it over. Values must survive JSON, because a
   *  host may keep them past the instance one day, in the address or in
   *  storage. */
  state<T>(key: string, initial: T): State<T>
  state<T = string>(key: string): State<T | undefined>
}

export type State<T> = {
  get(): T
  set(value: T): void
}

/** A `state` over `values`, for a host building its own context. `changed`
 *  runs after every `set`; a host that re-renders passes that here. */
export function stateIn(
  values: Map<string, unknown>,
  changed: () => void = () => {}
): Context['state'] {
  return ((key: string, initial?: unknown) => ({
    get: () => (values.has(key) ? values.get(key) : initial),
    set(value: unknown) {
      values.set(key, value)
      changed()
    }
  })) as Context['state']
}

/** A view's output together with the view that drew it: what `inner` and
 *  `Renderer.render` answer. */
export type Drawn = Rendered & { view: View }

// ----------------------------------------------------------- selection

export type Condition =
  | { iri: string | RegExp }
  | { contentType: string | RegExp }
  | { container: boolean }
  | { type: string }
  | { ask: string }

export type Rule = {
  view: string
  when: Condition[]
}

// ---------------------------------------------------------------- view

/** What of a resource to show, and how: the view to draw it with, the part
 *  that is meant, and whether to show that part alone. */
export type Show = {
  /** The view to draw with. When it names a registered view it wins over
   *  every rule. */
  view?: string
  /** The part of the resource that is meant, named the way the media type
   *  names parts: a heading or a block id in Markdown, the subject an IRI
   *  denotes in RDF. */
  fragment?: string
  /** Render `fragment` alone, without the rest of the resource. A view that
   *  does not understand it ignores it. */
  clip?: boolean
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

let bodies = 0

/** A wrapper's output around what `inner` drew. `around` receives the inner
 *  body, the inner HTML inside one element of its own, and answers the
 *  wrapper's whole markup with that body placed in it once. Hydrating hands
 *  the inner view the body as its root and the wrapper `hydrate` the whole
 *  root. A patch the inner view answers without a slot lands on the body,
 *  so the wrapper's own markup survives it; every other event reaches the
 *  wrapper's handle once the inner one has not answered it. */
export function wrap(
  inner: Rendered,
  around: (body: string) => string,
  hydrate?: (root: Element, ctx: Context) => Handle | void
): Rendered {
  // The body is a named slot so the runtime can find it for a patch. The
  // name is unique per wrap, because nested wrappers each have a body and
  // the runtime patches the first element carrying the name.
  const slot = `aleph-body-${++bodies}`
  return {
    html: around(`<div data-slot="${slot}">${inner.html}</div>`),
    hydrate(root, ctx) {
      const body = root.querySelector(`[data-slot="${slot}"]`) ?? root
      const own = inner.hydrate?.(body, ctx)
      const outer = hydrate?.(root, ctx)
      if (!own && !outer) return
      const handle: Handle = {
        dispose() {
          own?.dispose?.()
          outer?.dispose?.()
        }
      }
      // Only when a layer answers events itself: a handle with `update` takes
      // the runtime's own re-render on as:View and as:Update away.
      if (own?.update || outer?.update)
        handle.update = (event) => {
          const patch = own?.update?.(event)
          if (patch) return patch.slot === undefined ? { ...patch, slot } : patch
          return outer?.update?.(event)
        }
      return handle
    }
  }
}

export type View = {
  id: string
  /** Where this view applies by default; a registry rule overrides. */
  when?: Condition[]
  render(resource: Resource, ctx: Context, show?: Show): Promise<Rendered>
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
  /** Show first, then registry rules in order, then each view's `when`
   *  in registration order; undefined when nothing holds. */
  select(resource: Resource, show?: Show): View | undefined
  /** parse, select, render, answering the output with the view that drew it,
   *  the outermost one when that view wraps others. The context each view
   *  receives carries `inner` for this resource and `state` scoped to that
   *  view. Rejects when no view applies. */
  render(resource: Resource, ctx: Context, show?: Show): Promise<Drawn>
}

export function createRenderer(registry: Registry): Renderer {
  const byId = new Map(registry.views.map((v) => [v.id, v]))
  const all = (when: Condition[], r: Resource) => when.every((c) => holds(c, r))

  const parse = async (resource: Resource): Promise<Resource> => {
    const parser = registry.parsers.find((p) => matchesType(p.contentType, resource.contentType))
    if (!parser) return resource
    return { ...resource, graph: await parser.parse(resource) }
  }

  // `past` holds the ids of the views already drawing this resource in this
  // render; a view in it is passed over wherever it would have been picked.
  const pick = (resource: Resource, show: Show | undefined, past: readonly string[]) => {
    const open = (v: View | undefined) => (v && !past.includes(v.id) ? v : undefined)
    const shown = show?.view === undefined ? undefined : open(byId.get(show.view))
    if (shown) return shown
    for (const rule of registry.rules ?? []) {
      const v = open(byId.get(rule.view))
      if (v && all(rule.when, resource)) return v
    }
    return registry.views.find((v) => open(v) && v.when !== undefined && all(v.when, resource))
  }

  // One layer of a render. The view picked here is handed a context whose
  // `inner` draws the next layer with this view added to `past`, and whose
  // `state` keys carry this view's id. The chain lives in these closures
  // rather than in the context type, so a view never sees it and a host
  // building its own context never has to carry it.
  const layer = async (
    resource: Resource,
    ctx: Context,
    show: Show | undefined,
    past: readonly string[]
  ): Promise<Drawn> => {
    const view = pick(resource, show, past)
    if (!view) throw new Error(`no view applies to ${resource.iri} (${resource.contentType})`)
    const own = (base: Context): Context => ({
      ...base,
      inner: (innerShow) =>
        layer(resource, ctx, { fragment: show?.fragment, clip: show?.clip, ...innerShow }, [
          ...past,
          view.id
        ]),
      state: ((key: string, initial?: unknown) =>
        base.state(`${view.id} ${key}`, initial)) as Context['state']
    })
    const rendered = await view.render(resource, own(ctx), show)
    const { hydrate } = rendered
    // The context a host hydrates with is scoped the same way, so the state a
    // view sets from a handler is the state it reads while rendering.
    return hydrate
      ? { ...rendered, view, hydrate: (root, base) => hydrate(root, own(base)) }
      : { ...rendered, view }
  }

  const select = (resource: Resource, show?: Show) => pick(resource, show, [])

  const render = async (resource: Resource, ctx: Context, show?: Show): Promise<Drawn> =>
    layer(await parse(resource), ctx, show, [])

  return { parse, select, render }
}

/** The condition holds for the resource. `iri` equals the resource IRI or,
 *  as a RegExp, tests true against it. `ask` never holds here. */
export function holds(condition: Condition, resource: Resource): boolean {
  if ('iri' in condition)
    return typeof condition.iri === 'string'
      ? condition.iri === resource.iri
      : condition.iri.test(resource.iri)
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

// ---------------------------------------------------------- quad helpers
// Plain scans over quad arrays, so that views and conditions read `meta`
// and `graph` without an RDF library.

export function objects(quads: Quad[], subject: string, predicate: string): Term[] {
  return quads
    .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
    .map((q) => q.object)
}

export type Reader = {
  /** The subject this reader is on. */
  readonly iri: string
  /** The objects as they are, for a datatype or a language tag. */
  terms(predicate: string): Term[]
  /** Every object as a string, in quad order. */
  all(predicate: string, opts?: { lang?: string }): string[]
  /** The first object as a string. */
  one(predicate: string, opts?: { lang?: string }): string | undefined
  /** A reader on the first object. An absent object, or a literal, yields a
   *  reader that finds nothing, so a chain reads to the end without a check
   *  at every step. */
  node(predicate: string): Reader
}

/** A reader over `source`, on `subject`. The subject defaults to the
 *  resource's own IRI and the quads to its `graph`, which is the pair a view
 *  reads almost every time. */
export function about(source: Resource | Quad[], subject?: string): Reader {
  const quads = Array.isArray(source) ? source : (source.graph ?? [])
  const iri = subject ?? (Array.isArray(source) ? '' : source.iri)
  const self: Reader = {
    iri,
    terms: (predicate) => objects(quads, iri, predicate),
    all: (predicate, opts) => byLanguage(self.terms(predicate), opts?.lang).map((t) => t.value),
    one: (predicate, opts) => self.all(predicate, opts)[0],
    node(predicate) {
      const first = self.terms(predicate)[0]
      return about(quads, first && first.termType !== 'Literal' ? first.value : '')
    }
  }
  return self
}

/** The literals tagged `lang` when there are any, the untagged ones
 *  otherwise; every term when no language is asked for. */
function byLanguage(terms: Term[], lang?: string): Term[] {
  if (lang === undefined) return terms
  const tagged = terms.filter((t) => t.language === lang)
  return tagged.length > 0 ? tagged : terms.filter((t) => t.language === undefined)
}

/** Whether the response states that this resource is an `ldp:Container`.
 *  Reads `typesOf`, so a `Link; rel="type"` header and an `rdf:type`
 *  statement in the body are the same claim: a server is free to make it in
 *  either place, and LDP asks for the header rather than requiring it. */
export function isContainer(resource: Resource): boolean {
  return typesOf(resource).includes(ldp.Container)
}

/** Every `rdf:type` the response states of the resource's own subject, from
 *  the envelope and from the body alike. A `Link; rel="type"` header and an
 *  `rdf:type` statement in the graph are the same claim made in two places,
 *  so neither overrules the other and a resource with no RDF in it is
 *  typeable all the same. */
export function typesOf(resource: Resource): string[] {
  const here = (quads: Quad[]) => about(quads, resource.iri).all(rdf.type)
  return [...new Set([...here(resource.meta), ...here(resource.graph ?? [])])]
}

// --------------------------------------------------------- built-in views
// Both read `meta` and `graph` as plain quads, so they live here.

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
  id: 'https://aleph.garden/views/container',
  when: [{ container: true }],
  async render(resource) {
    // Containment arrives in the envelope or in the body, the two places
    // `typesOf` reads a type from, and both carry it when the server sent the
    // type link and a parser read the body. Hence the union and the dedup:
    // one member, one entry, wherever the statement came from.
    const stated = [...resource.meta, ...(resource.graph ?? [])]
    const items = [...new Set(about(stated, resource.iri).all(ldp.contains))].map((iri) => {
      const child = about(stated, iri)
      const container = child.all(rdf.type).includes(ldp.Container)
      const modified = child.one(dcterms.modified)
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
  const groups = [...bySubject.entries()].map(([, quads]) => {
    const rows = quads
      .map((q) => `<tr><td>${termHtml(q.predicate)}</td><td>${termHtml(q.object)}</td></tr>`)
      .join('')
    return `<tbody class="subject"><tr><th colspan="2">${termHtml(quads[0]!.subject)}</th></tr>${rows}</tbody>`
  })
  return `<table class="statements">${groups.join('')}</table>`
}

export const fallbackView: View = {
  id: 'https://aleph.garden/views/fallback',
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
