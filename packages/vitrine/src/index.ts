// Contracts and the pipeline. No RDF library, no DOM: quads are plain data,
// and everything that touches elements lives in ./dom.ts.

import { dcterms, ldp, rdf, vitrine } from '@aleph-garden/terms'

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

/** What an IRI answered, seen from the front: `body` and `contentType` for the
 *  bytes, `quads` for everything known about it. */
export type Resource = {
  iri: string
  contentType: string
  body: string | Uint8Array
  /** Everything known about this IRI, as one dataset. Each quad's graph says
   *  where it came from: what the body says sits in the graph named by `iri`,
   *  what is known about the resource from outside its content (its type as
   *  the store states it, when it changed, its members) in `ALEPH.Meta`, and a
   *  further document a resolver brought in under that document's IRI. A
   *  view reads it through `about`, which takes the union unless asked for
   *  less. */
  quads: Quad[]
  /** The subject within the resource this rendering is about, set by the
   *  renderer from `show.fragment` when the quads describe `iri#fragment`.
   *  Absent: the resource's own IRI. */
  subject?: string
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
  Select: vitrine.Select,
  /** The graph holding what is known about a resource from outside its
   *  content. Whoever resolves the IRI fills it: from HTTP headers, from a
   *  file's metadata, from whatever the transport tells. */
  Meta: vitrine.Meta
} as const

// ------------------------------------------------------------- context

export type Context = {
  /** Answers the resource at `iri`, parsed the way a rendered one is: when a
   *  registered parser reads its content type, its quads hold what the body
   *  says. */
  resolve(iri: string): Promise<Resource>
  /** A reader over the resource being drawn, on `subject`, by default the
   *  subject the rendering is about: `about(resource)` without the import. A
   *  resource the view resolved itself is read with `about` directly. */
  about(subject?: string): Reader
  emit(event: Event): void
  events: AsyncIterable<Event>
  /** Brings `iri` in as a child with a life of its own, and answers the HTML
   *  to insert verbatim. Whether that string is the rendered child or a
   *  placeholder a host fills in later is the host's business. */
  transclude(iri: string, show?: Show): Promise<string>
  /** Draws a resource the way vitrine draws any: the rules pick a view, and
   *  its output comes back as HTML with `hydrate`. Without `resource` it
   *  draws the one being drawn, with the view that would have drawn it were
   *  the calling view not there, so a wrapper never picks itself or one
   *  around it. Given `resource`, it draws that one: a derived resource, a
   *  graph turned from one shape into another, handed on to the rules.
   *
   *  A view is passed over only where it already draws the same resource
   *  with the same focus in this render, which is a cycle. A different
   *  resource may be drawn by the same view again, a tree drawing its
   *  branches with itself. Past RENDER_DEPTH nested calls, or the depth a
   *  host sets, the call draws with a view that has no conditions, the
   *  registry's last resort, since a view that derives a new resource on
   *  every step would never meet a cycle. `show` may name the view;
   *  fragment and clip default to this render's own. Rejects when no view
   *  is left. */
  render(resource?: Resource, show?: Show): Promise<Drawn>
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

/** A view's output together with the view that drew it: what `ctx.render`
 *  and `Renderer.render` answer. */
export type Drawn = Rendered & { view: View }

// ----------------------------------------------------------- selection

export type Condition =
  | { iri: string | RegExp }
  | { contentType: string | RegExp }
  | { container: boolean }
  /** Holds when the body produced quads: the resource can be read as a graph,
   *  whatever its content type. */
  | { graph: boolean }
  /** Holds when the subject the rendering is about has this `rdf:type`. For
   *  a thing described in RDF the type does what the content type does for
   *  bytes. */
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
   *  names parts: a heading or a block id in Markdown, the subject
   *  `iri#fragment` in RDF, which then becomes the resource's `subject`. */
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

/** The attribute that names the view which drew an element's content: set
 *  by the runtime on every region it holds, with the outermost view, and by
 *  `wrap` on the body of every layer below it, with that layer's view. A
 *  stylesheet scopes a view's rules with
 *  `@scope ([data-aleph-view="<view id>"]) to ([data-aleph-view])`, so they
 *  reach that view's own markup whether it draws a region or the inside of a
 *  wrapper, and stop at the next view down. */
export const VIEW_ATTR = 'data-aleph-view'

let bodies = 0

/** A wrapper's output around what `ctx.render` drew. `around` receives the inner
 *  body, the inner HTML inside one element of its own, and answers the
 *  wrapper's whole markup with that body placed in it once. When `inner`
 *  names the view that drew it, as a `Drawn` does, the body carries that
 *  view's id in `VIEW_ATTR`, so the inner view's scoped styles apply inside
 *  the wrapper and the wrapper's stop at the body. Hydrating hands
 *  the inner view the body as its root and the wrapper `hydrate` the whole
 *  root. A patch the inner view answers without a slot lands on the body,
 *  so the wrapper's own markup survives it; every other event reaches the
 *  wrapper's handle once the inner one has not answered it. */
export function wrap(
  inner: Rendered & { view?: View },
  around: (body: string) => string,
  hydrate?: (root: Element, ctx: Context) => Handle | void
): Rendered {
  // The body is a named slot so the runtime can find it for a patch. The
  // name is unique per wrap, because nested wrappers each have a body and
  // the runtime patches the first element carrying the name.
  const slot = `aleph-body-${++bodies}`
  return {
    html: around(
      `<div data-slot="${slot}"${inner.view ? ` ${VIEW_ATTR}="${escapeHtml(inner.view.id)}"` : ''}>${inner.html}</div>`
    ),
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

/** Reads quads out of a body. The first parser registered for a content type
 *  is the one that runs; the renderer puts what it answers into the graph
 *  named by the resource's IRI. A quad that names its own graph keeps it, so
 *  a dataset format loses nothing. */
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
  /** Puts what the first parser whose contentType matches reads out of the
   *  body into the graph named by the resource's IRI, replacing whatever
   *  that graph held. */
  parse(resource: Resource): Promise<Resource>
  /** Show first, then registry rules in order, then each view's `when`
   *  in registration order; undefined when nothing holds. Conditions are
   *  tested on the subject `show.fragment` names, where the quads describe
   *  one. */
  select(resource: Resource, show?: Show): View | undefined
  /** parse, select, render, answering the output with the view that drew it,
   *  the outermost one when that view wraps others. The context each view
   *  receives carries `render` for this resource and `state` scoped to that
   *  view. `depth` bounds nested `ctx.render` calls, RENDER_DEPTH unless
   *  given. Rejects when no view applies. */
  render(resource: Resource, ctx: Context, show?: Show, depth?: number): Promise<Drawn>
}

/** How many `ctx.render` calls may nest in one render before only views
 *  without conditions are left. */
export const RENDER_DEPTH = 8

/** One view drawing one resource and focus, the unit a cycle repeats. */
type Drawing = { view: string; thing: string }

const thingDrawn = (resource: Resource) => `${resource.iri} ${resource.subject ?? resource.iri}`

export function createRenderer(registry: Registry): Renderer {
  const byId = new Map(registry.views.map((v) => [v.id, v]))
  const all = (when: Condition[], r: Resource) => when.every((c) => holds(c, r))

  const parse = async (resource: Resource): Promise<Resource> => {
    const parser = registry.parsers.find((p) => matchesType(p.contentType, resource.contentType))
    if (!parser) return resource
    const document: Term = { termType: 'NamedNode', value: resource.iri }
    const read = (await parser.parse(resource)).map((q) =>
      q.graph ? q : { ...q, graph: document }
    )
    const kept = resource.quads.filter((q) => q.graph?.value !== resource.iri)
    return { ...resource, quads: [...kept, ...read] }
  }

  // `past` holds what is already being drawn in this render: each view with
  // the resource and focus it draws. A view is passed over only for the same
  // resource and focus, and past `limit` only views without conditions are
  // left, so a chain that derives a new resource on every step still ends.
  const pick = (
    resource: Resource,
    show: Show | undefined,
    past: readonly Drawing[],
    limit: number
  ) => {
    const here = thingDrawn(resource)
    const open = (v: View | undefined) =>
      v && !past.some((d) => d.view === v.id && d.thing === here) ? v : undefined
    if (past.length >= limit)
      return registry.views.find((v) => open(v) && v.when !== undefined && v.when.length === 0)
    const shown = show?.view === undefined ? undefined : open(byId.get(show.view))
    if (shown) return shown
    for (const rule of registry.rules ?? []) {
      const v = open(byId.get(rule.view))
      if (v && all(rule.when, resource)) return v
    }
    return registry.views.find((v) => open(v) && v.when !== undefined && all(v.when, resource))
  }

  // One layer of a render. The view picked here is handed a context whose
  // `render` draws the next layer with this drawing added to `past`, and
  // whose `state` keys carry this view's id. The chain lives in these
  // closures rather than in the context type, so a view never sees it and a
  // host building its own context never has to carry it.
  const layer = async (
    resource: Resource,
    ctx: Context,
    show: Show | undefined,
    past: readonly Drawing[],
    limit: number
  ): Promise<Drawn> => {
    const view = pick(resource, show, past, limit)
    if (!view) throw new Error(`no view applies to ${resource.iri} (${resource.contentType})`)
    const drawing = { view: view.id, thing: thingDrawn(resource) }
    const own = (base: Context): Context => ({
      ...base,
      about: (subject) => about(resource, subject),
      render: (derived, innerShow) =>
        layer(
          derived ?? resource,
          ctx,
          { fragment: show?.fragment, clip: show?.clip, ...innerShow },
          [...past, drawing],
          limit
        ),
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

  const select = (resource: Resource, show?: Show) =>
    pick(focused(resource, show), show, [], RENDER_DEPTH)

  const render = async (
    resource: Resource,
    ctx: Context,
    show?: Show,
    depth: number = RENDER_DEPTH
  ): Promise<Drawn> => layer(focused(await parse(resource), show), ctx, show, [], depth)

  return { parse, select, render }
}

/** The resource standing on the subject `show.fragment` names, when its quads
 *  describe `iri#fragment`. A fragment that names no subject, a heading in
 *  Markdown for one, leaves the focus where it was. */
function focused(resource: Resource, show: Show | undefined): Resource {
  if (show?.fragment === undefined) return resource
  const subject = `${resource.iri}#${show.fragment}`
  return resource.quads.some((q) => q.subject.value === subject)
    ? { ...resource, subject }
    : resource
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
  if ('graph' in condition) return hasContent(resource) === condition.graph
  if ('type' in condition) return typesOf(resource).includes(condition.type)
  return false
}

/** Whether the body produced quads: the graph named by the IRI holds any. */
function hasContent(resource: Resource): boolean {
  return resource.quads.some((q) => q.graph?.value === resource.iri)
}

function matchesType(expected: string | RegExp, contentType: string): boolean {
  const mediaType = contentType.split(';', 1)[0]!.trim().toLowerCase()
  return typeof expected === 'string'
    ? expected.toLowerCase() === mediaType
    : expected.test(mediaType)
}

// ---------------------------------------------------------- quad helpers
// Plain scans over quad arrays, so that views and conditions read a
// resource's statements without an RDF library.

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
  /** A reader on the first object, over the same statements. An absent
   *  object, or a literal, yields a reader that finds nothing, so a chain
   *  reads to the end without a check at every step. */
  node(predicate: string): Reader
  /** The same subject, reading only the statements in these graphs. A
   *  reader already restricted narrows further: chained, they intersect. */
  from(...graphs: string[]): Reader
  /** Only what is known about the resource from outside its content:
   *  `from(ALEPH.Meta)`. */
  readonly meta: Reader
  /** Only what the resource's own body says: `from(iri)` of the resource the
   *  reader was made for; over a bare quad array, the quads in no graph. */
  readonly content: Reader
}

/** A reader over `source`, on `subject`. Over a resource the subject defaults
 *  to the one the rendering is about and the statements are all of its quads,
 *  whichever graph they sit in, which is what a view reads almost every
 *  time. */
export function about(source: Resource | Quad[], subject?: string): Reader {
  if (Array.isArray(source)) return reader(source, subject ?? '', undefined)
  return reader(source.quads, subject ?? source.subject ?? source.iri, source.iri)
}

function reader(quads: Quad[], iri: string, document: string | undefined): Reader {
  const narrowed = (keep: (q: Quad) => boolean) => reader(quads.filter(keep), iri, document)
  const self: Reader = {
    iri,
    terms: (predicate) => objects(quads, iri, predicate),
    all: (predicate, opts) => byLanguage(self.terms(predicate), opts?.lang).map((t) => t.value),
    one: (predicate, opts) => self.all(predicate, opts)[0],
    node(predicate) {
      const first = self.terms(predicate)[0]
      return reader(quads, first && first.termType !== 'Literal' ? first.value : '', document)
    },
    from: (...graphs) => narrowed((q) => q.graph !== undefined && graphs.includes(q.graph.value)),
    get meta() {
      return self.from(ALEPH.Meta)
    },
    get content() {
      return document === undefined ? narrowed((q) => q.graph === undefined) : self.from(document)
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

/** Whether this resource is stated to be an `ldp:Container`, by the store or
 *  by its body alike: LDP asks for a `Link; rel="type"` header without
 *  requiring it, so the same claim may arrive in either place. */
export function isContainer(resource: Resource): boolean {
  return about(resource, resource.iri).all(rdf.type).includes(ldp.Container)
}

/** Every `rdf:type` stated of the subject the rendering is about, from every
 *  graph: a type the store states and a type the body states are the same
 *  claim made in two places, so neither overrules the other and a resource
 *  with no RDF in its body is typeable all the same. */
export function typesOf(resource: Resource): string[] {
  return [...new Set(about(resource).all(rdf.type))]
}

// --------------------------------------------------------- built-in views
// They read quads as plain data, so they live here.

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
    // Containment arrives from the store or in the body, and both carry it
    // when the server sent it both ways. Hence the dedup: one member, one
    // entry, wherever the statement came from.
    const container = about(resource, resource.iri)
    const items = [...new Set(container.all(ldp.contains))].map((iri) => {
      const child = about(resource, iri)
      const isFolder = child.all(rdf.type).includes(ldp.Container)
      const modified = child.one(dcterms.modified)
      const cls = isFolder ? 'child is-container' : 'child'
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

/** The statements to show for a resource: those about the subject in focus
 *  when the rendering is about one subject, the body's otherwise. */
function statementsOf(resource: Resource): Quad[] {
  const focus = resource.subject ?? resource.iri
  if (focus !== resource.iri) return resource.quads.filter((q) => q.subject.value === focus)
  return resource.quads.filter((q) => q.graph?.value === resource.iri)
}

export const fallbackView: View = {
  id: 'https://aleph.garden/views/fallback',
  when: [],
  async render(resource) {
    const statements = statementsOf(resource)
    if (statements.length > 0) return { html: graphHtml(statements) }
    if (typeof resource.body === 'string' && resource.contentType.startsWith('text/')) {
      return { html: `<pre class="raw">${escapeHtml(resource.body)}</pre>` }
    }
    return {
      html: `<p class="download"><a href="${escapeHtml(resource.iri)}" download>${escapeHtml(resource.iri)}</a> (${escapeHtml(resource.contentType)})</p>`
    }
  }
}

/** The body as it arrived, text or a link to the bytes. Applies nowhere by
 *  default; a rule or a show names it. */
export const sourceView: View = {
  id: 'https://aleph.garden/views/source',
  async render(resource) {
    if (typeof resource.body === 'string')
      return { html: `<pre class="raw">${escapeHtml(resource.body)}</pre>` }
    return {
      html: `<p class="download"><a href="${escapeHtml(resource.iri)}" download>${escapeHtml(resource.iri)}</a> (${escapeHtml(resource.contentType)})</p>`
    }
  }
}

/** A graph taken apart into the things it describes. Every subject named
 *  `iri#fragment` is embedded on its own, so the rules choose a view for it
 *  by its type. Statements about any other subject, blank nodes among them,
 *  have no address to embed and are drawn beneath as a table. When the
 *  rendering is already about one subject, that subject's statements are
 *  drawn instead, which is what an untyped subject falls back to. */
function subjects(id: string, layout: 'grid' | 'list'): View {
  return {
    id,
    when: [{ graph: true }],
    async render(resource, ctx) {
      if ((resource.subject ?? resource.iri) !== resource.iri)
        return { html: graphHtml(statementsOf(resource)) }
      const content = statementsOf(resource)
      const prefix = `${resource.iri}#`
      const embedded = (term: Term) =>
        term.termType === 'NamedNode' && term.value.startsWith(prefix) && term.value !== prefix
      const fragments = [
        ...new Set(content.filter((q) => embedded(q.subject)).map((q) => q.subject.value))
      ].map((subject) => subject.slice(prefix.length))
      const cells = await Promise.all(
        fragments.map((fragment) => ctx.transclude(resource.iri, { fragment }))
      )
      const rest = content.filter((q) => !embedded(q.subject))
      const items = cells.map((cell) => `<li class="subject-item">${cell}</li>`).join('')
      const list = items ? `<ul class="subjects subjects-${layout}">${items}</ul>` : ''
      return { html: list + (rest.length > 0 ? graphHtml(rest) : '') }
    }
  }
}

export const subjectsGridView: View = subjects('https://aleph.garden/views/subjects-grid', 'grid')
export const subjectsListView: View = subjects('https://aleph.garden/views/subjects-list', 'list')
