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
- the instance bookkeeping a DOM host needs: region, handle, dependencies

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
layout, a graph for Markdown resources.

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
  meta: Quad[];     // statements the server makes about the resource
  allow: Mode[];    // "read" | "write" | "append" | "control"
};

type Quad = {
  subject: Term; predicate: Term; object: Term; graph?: Term;
};
type Term = {
  termType: "NamedNode" | "BlankNode" | "Literal";
  value: string;
  datatype?: string;    // every Literal has one
  language?: string;    // present iff datatype is rdf:langString
  direction?: "ltr" | "rtl";   // RDF 1.2 base direction, with language
};
```

`Quad` and `Term` follow the RDF/JS shape without the prototypes: plain
objects, no methods, no store. A view that wants a store loads them into
one. This is the constraint that keeps a WASM view possible: everything
in `Resource` crosses an ABI boundary as data.

`meta` holds what the server asserts about the resource for every
requester: `rdf:type ldp:Container`, `ldp:contains`, `dcterms:modified`,
the content type as a statement. A browser host derives it from response
headers and, for a container, from the body. A server-side host has it in
hand.

`allow` stays outside `meta` because it is a fact about this request,
never about the resource: the same resource answers a different
`WAC-Allow` to every agent. Putting it in `meta` would let a cached
`Resource` carry one agent's permissions to another.

### Context

```ts
type Context = {
  resolve(iri: string): Promise<Resource>;
  emit(event: Event): void;
  events: AsyncIterable<Event>;
};
```

`resolve` is the only way a view reaches anything beyond the resource it
was handed. The host implements it; a view never fetches.

A SPARQL query is a GET on an endpoint IRI with the query in the query
string, so it goes through `resolve` like everything else. Whether the
host answers that IRI over the network or from a store it holds in
memory is the host's business. A host that keeps one Oxigraph for the
whole page provides SPARQL to every view once, by answering its own
endpoint IRI inside `resolve`.

### Event

An event is an ActivityStreams 2.0 activity as a plain object: the same
shape the pod's notification channels emit, so a server notification
enters the bus without translation.

```ts
type Event = {
  type: string;        // an IRI; AS2 types where one fits
  object?: string;     // the IRI the activity is about
  actor?: string;      // the view instance that emitted it
  target?: string;
  [key: string]: unknown;
};
```

Types in slice 1: `as:Update` (a resource changed), `as:View` (navigate
to a resource), and `aleph:Select` (a view marked a resource; AS2 has no
type for it). A view may emit further types under its own namespace. An
event can be serialized as JSON-LD under the AS2 context with no
transformation.

Events carry meaning, never DOM detail. A view emits `aleph:Select`, not
`click`.

### View

```ts
type View = {
  id: string;          // an IRI
  render(resource: Resource, ctx: Context, hint?: Hint): Promise<Rendered>;
};

type Hint = {
  view?: string;       // a View id
  fragment?: string;   // the fragment of the requested IRI, without "#"
};

type Rendered = {
  html: string;
  hydrate?(root: Element, ctx: Context): Handle | void;
};

type Handle = {
  update?(event: Event): Patch | void;
  dispose?(): void;
};

type Patch = {
  slot?: string;   // a data-slot value inside the view's region
  html: string;    // replaces that slot, or the whole region when absent
};
```

`render` produces a string, so a view needs no DOM to exist. `hydrate` is
where a view attaches behavior after the host has placed the HTML.

A view that wants partial updates marks elements in its own HTML with
`data-slot` and patches by name. The host resolves the slot inside the
instance's region and replaces that element's content.

### Hint

The host sets the hint; a view never does. `view` names how to render,
`fragment` names what within the resource to bring forward: a heading or
block in a note, a subject in an RDF document. Three sources feed it:

- a control in the shell, where the user picks a view for the current
  resource
- a `view` query parameter on the resource URL, so a link can carry a
  choice
- an `as:View` event whose emitter names a view for the target

The fragment comes from the requested IRI. A change of fragment on the
same resource is an `as:View` without a refetch.

A hint naming a view that is not registered is ignored and the rules
decide.

### Parser

```ts
type Parser = {
  contentType: string | RegExp;
  parse(resource: Resource): Promise<Quad[]>;
};
```

Runs before selection so that selection can look at `rdf:type`. Slice 1
ships a Turtle parser. Markdown gets no parser in slice 1: its graph is
`undefined` and selection reaches it by content type. Which annotation
format a note's graph comes from is open (see "Rejected" on MD-LD).

### Selection

```ts
type View = { id: string; when?: Condition[]; render(…) };   // see "View"

type Rule = {
  view: string;         // a View id
  when: Condition[];    // every condition must hold
};

type Condition =
  | { contentType: string | RegExp }
  | { container: boolean }
  | { type: string }
  | { ask: string };
```

A view carries its own `when`, the conditions under which it applies by
default. The registry's rules are the user's overrides, consulted first.
Selection, in order: `hint.view` when that view exists; the first
registry rule whose every condition holds; the first view, in
registration order, whose own `when` holds. An empty `when` holds for
everything, which is how the fallback view is registered last. A
registry with no rules is the common case.

What each condition means:

- `contentType`: the resource's media type, parameters stripped, equals
  the string or matches the regular expression.
- `container`: `true` holds when `meta` contains `<iri> rdf:type
  ldp:Container`; `false` holds when it does not.
- `type`: `graph` contains `<iri> rdf:type <type>`. Never holds when
  `graph` is absent.
- `ask`: a SPARQL ASK query evaluated over `graph` and `meta` together.
  This is the condition a Fresnel lens with an instance domain becomes,
  where the lens applies to resources of a certain shape, whatever their
  class. The core cannot evaluate it, since it has no RDF
  engine; a host registers an evaluator for it the way it registers
  parsers, and a rule that uses `ask` on a host without one never holds.
  Deferred.

Order is explicit and nothing else decides. This replaces SolidOS's
"first pane whose `label()` returns non-null", where registration order
is behavior nobody wrote down.

The rule list is code in slice 1. Its shape is plain data so that it can
become a pod resource the user edits, later.

### Instances

A DOM host keeps, per view instance: its region element, the handle
`hydrate` returned, and the set of IRIs the instance resolved. The core
ships this bookkeeping as a DOM module, so that every browser host runs
the same re-render protocol. The shell in slice 1 has one region and
already uses it; a multi-region layout adds regions and nothing else.

### Re-render

Two paths, and the first needs no code in the view.

**Host-driven.** The host re-renders an instance whenever one of its
inputs changes: a resolved IRI, or the hint. The `Context` given to a
view instance records every IRI that instance resolves; an `as:Update`
naming one of them, or an `as:View` on the same resource with a
different view or fragment, makes the host call `render` again, replace
the region, and call `hydrate` again.

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
  index (below) to `<a class="internal-link" href="<iri>">`, the heading
  or block as the fragment; unresolved ones carry `is-unresolved` and no
  `href`. With `hint.fragment` set, the matching heading or block is
  scrolled to and marked `is-flashing`, as Obsidian does.
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

The emitted DOM uses Obsidian's class names (`markdown-preview-view`,
`internal-link`, `tag`, `callout`, `task-list-item`, `metadata-container`
and so on) and the shell defines Obsidian's CSS custom properties with
defaults. The vault's own `noctalia.css` snippet then applies unchanged.

Engine: markdown-it. Synchronous, one plugin per syntax, and the choice
is local to this view; swapping it touches no contract.

**Wikilink index.** Obsidian resolves `[[Name]]` by basename across the
whole vault, so the view needs a map from basename to IRI. This is the
view's concern, built through `resolve`, and the shell knows nothing of
it.

Where to look comes from the pod, in the Solid way: the WebID's
`solid:privateTypeIndex` lists `solid:TypeRegistration`s, and the ones
whose `solid:forClass` is the note class name their
`solid:instanceContainer`s. The view walks those containers through
`ldp:contains`, recursively, and maps each `.md` basename to its IRI.
No configured roots exist. Slice 1 registers `schema:NoteDigitalDocument`
for the containers that hold notes.

When: on the first render that contains a wikilink, once per page
lifetime, held in the view module's memory. An `as:Update` naming an
indexed container drops it. Frontmatter aliases are deferred, since they
need one request per note.

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

1. The IRI is `location.href` without fragment; a `view` query parameter
   becomes the hint.
2. Session through Solid-OIDC against the pod's own issuer, with dynamic
   client registration. No session and a `401` show a login button and
   nothing else.
3. Fetch the IRI with an `Accept` header that lists the raw types and
   omits `text/html`, so the server returns the representation and never
   the shell. Build `Resource` from body and headers (`Content-Type`,
   `Link rel="type"`, `Last-Modified`, `WAC-Allow`).
4. Run the pipeline into the single region.

The fetch in step 3 is a second request for the same resource. The slot
that serves the shell is a constant document, so it cannot carry the
representation along. The server-side host removes the round trip (see
"Deferred"); a private resource needs the fetch after login either way.

The document the slot serves is one cache entry per resource URL, under
the resource's own headers, so it is kept under a kilobyte: a script
element and an empty root. The bundle is a static asset at a fixed URL,
and the server hands static assets out with a one-day expiry, so a full
page load after the first costs the document and the representation.
Client-side navigation loads neither.

Navigation: the runtime turns a click on a same-origin link inside a
region into an `as:View` event; a view with other link semantics stops
the click in its own `hydrate`. The shell handles `as:View` and nothing
below it: another resource is a fresh mount into the region, the same
resource with a new fragment is a dispatch without a refetch. The
address follows either.

Re-render: the shell uses the core's instance bookkeeping and runs the
protocol above. A reload control emits `as:Update` for the current IRI;
that is the only event source in slice 1.

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
| `@aleph-garden/view` | contracts, renderer, selection, instance bookkeeping |
| `@aleph-garden/view-markdown` | the Markdown view |
| `@aleph-garden/shell` | the browser host |

TypeScript, bun workspaces, `bun test`, vite for the shell bundle. No UI
framework anywhere; a view that wants one uses it inside `hydrate`.

## Acceptance

Unit, in the repository:

- selection honors `hint`, then registry rules, then each view's own
  `when` in order, evaluating each condition as defined above
- the instance bookkeeping re-renders on `as:Update` for a resolved IRI
  and on a hint change, leaves a handle with `update` alone, and applies
  a slot patch to the named element only
- the Markdown view renders fixture notes copied from the vault, one per
  feature above, to the expected DOM
- the wikilink index is built from a fixture type index and two fixture
  containers, and resolves all four link forms

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
- **MD-LD as the note annotation format.** `mdld-parse` ships without a
  license, so nothing here may depend on it. The 28 `{..}` annotations
  in the vault render as the text they are.
- **A store in the API.** SolidOS panes read from a shared rdflib store,
  which binds every pane to rdflib and to the browser. `resolve` is the
  whole surface.
- **Configured index roots.** The type index already says where notes
  live.
- **Implicit selection.** See "Selection".
- **A framework in the core.** It would decide for every view.
- **A model that covers every case up front.** See "Purpose".

## Deferred

Each of these is an addition under the contracts above and changes none
of them:

- **Server-side host.** A CSS representation converter calling the same
  pipeline. It embeds the representation in the document it serves, so
  the shell hydrates without a second request.
- **WASM views.** A WIT world with `resolve` as an async import and
  `render` as an export, transpiled by jco, wrapped by an adapter that
  implements `View`. Interactivity through an event stream in and patches
  out, which is what `Handle.update` already is.
- **A service worker** that answers navigation requests with the cached
  shell and fetches the representation alongside, which removes the
  second request without a server-side host. A second code path with
  its own invalidation, so it waits for a measured need.
- **Server notifications** as an `as:Update` source. The pod already
  serves the notification channels and they speak AS2; this is a
  subscription in the shell.
- **`ask` conditions**, with an evaluator the host registers. The
  Fresnel path.
- **Fresnel view**, selecting by `type` or `ask`, reading lenses through
  `resolve`.
- **A graph for Markdown resources**, once an annotation format with a
  license is chosen. Frontmatter to RDF is the candidate.
- **Bases and `.rq` resources** as query views.
- **Multi-region layout**, where inter-view events start to matter.
- **Rule list as a pod resource.**
- **Aliases in the wikilink index.**
