# @aleph-garden/view: design

A rendering pipeline for resources on a Solid pod. One IRI goes in, HTML
comes out, and the piece that decides how is a plain rule table over a
list of views. The first view renders Obsidian-flavored Markdown; the first
host is a browser shell that replaces SolidOS on `pod.toph.so`.

This document fixes the interfaces, the first slice, and the acceptance
test. It lists no tasks.

## Purpose

The Obsidian vault on endurance is the file backend of `pod.toph.so`
(Syncthing keeps `~/pod` and the server's storage directory identical).
Every note is already a pod resource. What is missing is a way to look at
one in a browser that does not hurt. SolidOS renders a `.md` file as a
generic document pane.

The longer goal is Aleph Garden's rendering layer: Fresnel lenses over
RDF, query views, graph views, all selectable per resource. Twenty earlier
attempts at that layer died on a data model meant to cover every case up
front. This design fixes one small contract and lets every case arrive as
a concrete view under it.

## Boundaries

In scope for the library:

- the `Resource` and `Context` contracts
- parsing a body into quads, by content type
- selecting a view, by rule and by user hint
- rendering, hydration, and the re-render protocol

In scope for slice 1:

- the Markdown view
- a container view and a fallback view
- the browser shell, delivered through the pod's own `text/html`
  conversion slot
- the fleet change that puts the shell on `pod.toph.so`

Out of scope, for the library as a whole: navigation, session, editing,
search, layout. Those belong to a host.

Out of slice 1, with the door held open (see "Deferred"): server-side
rendering, WASM views, Fresnel, Bases, server notifications, multi-region
layout.

## The pipeline

```
Resource (raw) ─▶ parse ─▶ select ─▶ render ─▶ Rendered ─▶ hydrate ─▶ Handle
                   │          │
            by contentType   by rule + hint
```

The core has no RDF dependency. Parsers and views bring their own
libraries. The core knows quads only as plain data.

### Resource

```ts
type Resource = {
  iri: string;
  contentType: string;
  body: string | Uint8Array;
  graph?: Quad[];   // filled by a parser when the body carries RDF
  meta: Quad[];     // statements about the resource itself
  allow: Mode[];    // "read" | "write" | "append" | "control"
};

type Quad = {
  subject: Term; predicate: Term; object: Term; graph?: Term;
};
type Term = {
  termType: "NamedNode" | "BlankNode" | "Literal";
  value: string;
  language?: string;
  datatype?: string;
};
```

`Quad` and `Term` follow the RDF/JS shape without the prototypes: plain
objects, no methods, no store. A view that wants a store loads them into
one. This is the constraint that keeps a WASM view possible: everything
in `Resource` crosses an ABI boundary as data.

`meta` holds what the server says about the resource: `rdf:type
ldp:Container`, `ldp:contains`, `dcterms:modified`, the content type as a
statement. A browser host derives it from response headers and, for a
container, from the body. A server-side host has it in hand.

### Context

```ts
type Context = {
  resolve(iri: string): Promise<Resource>;
  emit(event: Event): void;
  events: AsyncIterable<Event>;
};

type Event = {
  type: string;        // "navigate" | "changed" | "select" | view-defined
  iri?: string;
  source?: string;     // id of the emitting view instance
  data?: unknown;
};
```

`resolve` is the only way a view reaches anything beyond the resource it
was handed. The host implements it; a view never fetches. A SPARQL query
is a GET on an endpoint IRI with the query in the query string, so it
goes through `resolve` like everything else.

Events carry meaning, never DOM detail. A view emits `select`, not
`click`.

### View

```ts
type View = {
  id: string;
  render(resource: Resource, ctx: Context, hint?: Hint): Promise<Rendered>;
};

type Hint = { view?: string };

type Rendered = {
  html: string;
  hydrate?(root: Element, ctx: Context): Handle | void;
};

type Handle = {
  update?(event: Event): Patch | void;
  dispose?(): void;
};

type Patch = { html: string };   // replaces the view's region
```

`render` produces a string, so a view needs no DOM to exist. `hydrate` is
where a view attaches behavior after the host has placed the HTML.

### Parser

```ts
type Parser = {
  contentType: string | RegExp;
  parse(resource: Resource): Promise<Quad[]>;
};
```

Runs before selection so that selection can look at `rdf:type`. Slice 1
ships an MD-LD parser (Markdown with `{..}` annotations, the format the
vault notes use) and a Turtle parser.

### Selection

```ts
type Rule = {
  view: string;
  contentType?: string | RegExp;
  container?: boolean;
  rdfType?: string;
};
```

Rules are an ordered list. The first rule whose every stated condition
holds selects its view. `hint.view` overrides the rules when that view
exists. A rule stating nothing matches everything, which is how the
fallback view is registered last.

Order is explicit and nothing else decides. This replaces SolidOS's
"first pane whose `label()` returns non-null", where registration order
is behavior nobody wrote down.

The rule list is code in slice 1. Its shape is plain data so that it can
become a pod resource the user edits, later.

### Re-render

Two paths, and the first needs no code in the view.

**Dependency tracking.** The `Context` given to a view instance records
every IRI that instance resolves. When a `changed` event names one of
them, the host calls `render` again, replaces the region, and calls
`hydrate` again.

**Self-managed.** A `Handle` with `update` receives every event and
answers with a `Patch` or with nothing. The host does not re-render such
an instance on its own; the instance decides.

A view instance is on one path or the other, decided by whether its
handle has `update`. There is no mixed case.

Every event source feeds the same path: a click in another view, a
manual reload, and later a server notification all arrive as events.

## Views in slice 1

### Markdown

Obsidian-flavored Markdown as the vault uses it, measured over 619
notes: wikilinks (321), frontmatter (343 files), tags, math, `sparql`
blocks, `mermaid` blocks, embeds, one callout, no Dataview.

Rendered:

- Frontmatter as a properties block at the top. `tags`, `aliases`,
  `cssclasses` get their Obsidian meaning; `cssclasses` land on the
  view's root element.
- Wikilinks in all four forms: `[[Name]]`, `[[Name|Alias]]`,
  `[[Name#Heading]]`, `[[Name#^block]]`. Resolved through the wikilink
  index (below) to `<a class="internal-link" href="<iri>">`; unresolved
  ones carry `is-unresolved` and no `href`.
- Embeds `![[…]]`: a `.md` target is resolved and rendered inline, with a
  depth limit and a cycle guard; an image target becomes `<img>`; anything
  else becomes a link.
- Tags as `.tag` elements.
- Task list items as checkboxes, read-only. Tasks-plugin decorations (due
  dates, priorities) render as the text they are.
- Callouts `> [!type]` as `.callout` with the type on a data attribute.
- Math through KaTeX, in `render`.
- Mermaid in `hydrate`, since the renderer needs a DOM. `render` emits
  `<pre class="mermaid">`.
- `sparql` code blocks are executed through `resolve` against an
  endpoint IRI the view is configured with, and the result table is
  rendered. Slice 1 supports SELECT; other forms render the raw result.
- MD-LD `{..}` annotations become the same `◈` markers the VitePress
  plugin uses, with the produced triples on hover.

The emitted DOM uses Obsidian's class names (`markdown-preview-view`,
`internal-link`, `tag`, `callout`, `task-list-item`, `metadata-container`
and so on) and the shell defines Obsidian's CSS custom properties with
defaults. The vault's own `noctalia.css` snippet then applies unchanged.

Engine: markdown-it. The MD-LD parser and the VitePress plugin are built
on it, so one engine carries both the graph and the HTML.

### Container

Lists `ldp:contains` from `meta`: name, whether it is a container, and
`dcterms:modified` where the server states it. Names only in slice 1; a
title from each child's frontmatter would cost one request per child.

### Fallback

Registered last, matching everything:

- RDF (`graph` present): statements grouped by subject, terms linked
  where they are IRIs.
- other `text/*`: the body in `<pre>`.
- anything else: a download link. Images are excluded from the
  conversion slot on the server and reach the browser natively.

## The browser shell

A single HTML page with one bundle. The pod's conversion slot serves it
under the IRI of whatever resource was requested, including on a `401`
(verified against `pod.toph.so` today: a private container answers 401
with the SolidOS document as body). So the page loads at the resource's
own URL, and the address bar is the resource.

Boot:

1. The IRI is `location.href` without fragment.
2. Session through Solid-OIDC against the pod's own issuer, with dynamic
   client registration. No session and a `401` show a login button and
   nothing else.
3. Fetch the IRI with an `Accept` header that lists the raw types and
   omits `text/html`, so the server returns the representation and never
   the shell. Build `Resource` from body and headers (`Content-Type`,
   `Link rel="type"`, `Last-Modified`, `WAC-Allow`).
4. Run the pipeline into the single region.

Navigation: the shell intercepts clicks on same-origin links, pushes
history, emits `navigate`, and renders the target. Views do not handle
link clicks.

Wikilink index: built on first need by walking a configured list of
containers through `resolve` (`ldp:contains`, recursively), mapping each
`.md` basename to its IRI. Default roots are `/notes/` and `/weltbild/`.
Kept in memory and in `sessionStorage`; a `changed` event on an indexed
container drops it. Frontmatter aliases are deferred, since they need one
request per note.

Re-render: the shell wraps `Context` with dependency tracking and runs
the protocol above. A reload control emits `changed` for the current
IRI; that is the only event source in slice 1.

## Delivery on pod.toph.so

The server binds `DefaultUiConverter` to a `ConstantConverter` whose
`filePath` names a document in a host volume that a systemd unit stages
from the Nix store. The change:

- a package that builds the shell into a directory of static files
- the staging unit copies that directory instead of the mashlib tarball
- `filePath` names the shell's document

The household pod keeps SolidOS. It mounts the same asset volume today,
so it gets a volume of its own, staged from mashlib as before.

The excluded media ranges (`image/*`, `application/pdf`) stay excluded.

## Repository

`~/code/aleph-garden/view`, one workspace, three packages, so that a
view's dependencies never reach the core:

| Package | Holds |
|---|---|
| `@aleph-garden/view` | contracts, pipeline, selection, tracking context |
| `@aleph-garden/view-markdown` | the Markdown view and the MD-LD parser |
| `@aleph-garden/shell` | the browser host |

TypeScript, bun workspaces, `bun test`, vite for the shell bundle. No UI
framework anywhere; a view that wants one uses it inside `hydrate`.

## Acceptance

Unit, in the repository:

- selection picks by order, honors `hint`, falls through to the last
  rule
- the tracking context re-renders on `changed` for a resolved IRI and
  leaves a handle with `update` alone
- the Markdown view renders fixture notes copied from the vault, one per
  feature above, to the expected DOM
- the MD-LD parser yields the same quads for a fixture as
  `obsidian-pod-sparql` indexes for it

Against `pod.toph.so`, by hand, after deployment:

- a private note opens at its own URL, asks for login once, and renders
  with resolved wikilinks, properties, math, and a diagram
- a wikilink click changes the address and the content without a page
  load
- `/notes/` lists its children; a `.ttl` resource shows a statement
  table; `/public/` renders without a session
- the household pod still shows SolidOS

## Rejected

- **Reusing Obsidian's renderer.** Closed source; the `obsidian` package
  is type definitions. The Render API plugin exposes the live app over
  HTTP, which ties the pod's view to a desktop machine being awake.
- **Perlite, Quartz, the Digital Garden plugin.** Each is a second reader
  of the same bytes with its own access model, beside a pod whose
  contents are 99.96 % private and whose one enforcement point is WAC.
- **A store in the API.** SolidOS panes read from a shared rdflib store,
  which binds every pane to rdflib and to the browser. `resolve` is the
  whole surface.
- **Implicit selection.** See "Selection".
- **A framework in the core.** It would decide for every view.
- **A model that covers every case up front.** See "Purpose".

## Deferred

Each of these is an addition under the contracts above and changes none
of them:

- **Server-side host.** A CSS representation converter calling the same
  pipeline; `Rendered.html` is all it needs.
- **WASM views.** A WIT world with `resolve` as an async import and
  `render` as an export, transpiled by jco, wrapped by an adapter that
  implements `View`. Interactivity through an event stream in and patches
  out, which is what `Handle.update` already is.
- **Server notifications** as a `changed` source. The pod already serves
  the notification channels; this is a subscription in the shell.
- **Fresnel view**, selecting by `rdfType`, reading lenses through
  `resolve`.
- **Bases and `.rq` resources** as query views.
- **Multi-region layout**, where inter-view events start to matter.
- **Rule list as a pod resource.**
- **Aliases in the wikilink index.**
