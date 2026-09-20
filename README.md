# view

A rendering layer for IRIs. One IRI goes in, HTML comes out, and the piece
that decides how is a plain rule table over a list of views.

What the library sees of a resource is its body, its content type, what the
server says about it, and quads when the body carries RDF. The core knows no
server, no protocol and no RDF library: a host fetches, the library renders.
RDF is where the rule table earns its keep, since a condition can select a
view by the resource's `rdf:type`.

The hosts that exist speak Solid. A Community Solid Server hands the browser
shell out as the `text/html` representation of every resource it serves, and
`https://aleph.garden/` serves the same bundle for any IRI written after the
origin. A deployment differs only in the host document the build embeds.

Status: the pipeline, the Markdown view, the browser shell and the
aleph.garden host stand. Transclusion, a server-side host and WASM views are
specified and unbuilt.

## What it allows

- **Open a resource at its own URL.** `https://pod.toph.so/notes/Matrix.md`
  renders the note, and so does
  `https://aleph.garden/https://pod.toph.so/notes/Matrix.md` from the other
  host. The address bar stays the resource, and the browser's history works.
- **Read a note the way Obsidian shows it.** Frontmatter as a properties
  block, wikilinks in all four forms resolved by basename across the vault,
  embeds inline, tags, task checkboxes, callouts, KaTeX math, mermaid
  diagrams, and `sparql` blocks executed against the endpoint the host
  names. The vault's own CSS snippets apply unchanged, since the view emits
  Obsidian's class names.
- **Look at everything else.** An LDP container lists its children, an RDF
  document becomes a statement table grouped by subject, other text is shown
  raw, and a binary is offered for download.
- **Choose the view per resource.** `?view=<view IRI>` on the URL picks one;
  a rule in the host document pins one to a pattern of IRIs, a content type,
  a container, or an `rdf:type`.
- **Log in once, where the host keeps a session.** The shell uses Solid-OIDC
  against the issuer the host document names, or against the one the
  visitor's WebID names. A private resource asks for a login and renders
  after it.
- **Add a view without touching the core.** A view is an object with an id,
  the conditions under which it applies, and `render`. Its dependencies stay
  in its own package.

## How it works

```
Resource ──▶ parse ──▶ select ──▶ view.render ──▶ html + hydrate?
   raw          by         by hint,
   body     content type   rules, view.when
```

The core carries no RDF library and no DOM. Parsers and views bring their
own; everything that touches elements lives in one DOM module a browser host
uses.

### What crosses the boundary

```ts
type Resource = {
  iri: string
  contentType: string
  body: string | Uint8Array
  graph?: Quad[]    // filled by a parser when the body carries RDF
  meta: Quad[]      // what the server says about the resource
  allow: Mode[]     // what this requester may do
}
```

Quads follow the RDF/JS shape as plain objects, without prototypes and
without a store. A view that wants a store loads them into one. `meta` is
where a host puts response headers it has turned into statements, which is
how a listing view learns about containment without the core knowing LDP.
`allow` sits outside `meta` because it is a fact about the request, so a
cached `Resource` can never carry one agent's permissions to another.

### How a view reaches further

```ts
type Context = {
  resolve(iri: string): Promise<Resource>
  emit(event: Event): void
  events: AsyncIterable<Event>
}
```

`resolve` is the whole surface. A view never fetches, and a SPARQL query is
a GET on an endpoint IRI, so it goes the same way. An `Event` is an
ActivityStreams 2.0 activity as a plain object, which is the shape a Solid
notification channel already emits.

### Which view renders

`hint.view` when that view is registered, then the host document's rules in
order, then each view's own `when` in registration order. A condition is one
of `iri`, `contentType`, `container` or `type`, and every condition of a
rule must hold. A fifth, `ask`, carries a SPARQL ASK over the resource's
graph and waits for a host that registers an evaluator for it; until then it
never holds. An empty `when` holds for everything, which is how the
fallback view is registered last. Order is explicit and nothing else
decides.

### When it renders again

Two paths, and the first needs no code in the view. The runtime records
every IRI an instance resolved: an `as:Update` naming one of them, or a hint
change on the same resource, re-renders that instance. A view that returned
a `Handle` with `update` takes the other path and answers events itself with
a patch for one `data-slot` element.

### What a host owns

Fetching, session, navigation, the address, the chrome, and the regions.
`@aleph-garden/view/dom` ships the instance bookkeeping so every browser
host runs the same protocol, and it is the only code that writes a view's
HTML into the document: through a sanitizer with an allowlist, under Trusted
Types where the browser has them. The resource is untrusted input, and the
renderers a view leans on have had injection bugs before.

### What a deployment configures

One JSON-LD node the build embeds into `index.html`:

```json
{
  "@context": "https://w3id.org/aleph/ns/view",
  "@type": "Host",
  "issuer": "https://pod.toph.so/",
  "sparqlEndpoint": "https://sparql.toph.so"
}
```

`issuer` says where to log in, `sparqlEndpoint` where `sparql` blocks go,
`session: false` makes every fetch anonymous and drops the login control,
`opens` says whether the shell opens every IRI in place or only its own
origin's, and `views` and `rules` choose among the bundle's views. Each key
is optional.

## Packages

| Package | Holds | Knows about |
|---|---|---|
| `@aleph-garden/view` | contracts, renderer, selection, the DOM runtime | IRIs and quads |
| `@aleph-garden/view-markdown` | the Markdown view | Obsidian, a Solid type index |
| `@aleph-garden/shell` | the browser host | Solid-OIDC, WAC, LDP, Turtle |
| `packages/www` | aleph.garden: the docs site the shell is deployed with | |

View ids and the event types the library defines live under
`https://w3id.org/aleph/ns/view#`.

## Development

```sh
bun install
bun test
bun run check                      # biome, typecheck, tests
bun run --cwd packages/shell dev   # vite dev; ALEPH_HOST names a host document
bun run build:site                 # shell and docs into one dist
nix build .#shell                  # the bundle a pod serves
```

`nix/shell.nix` takes the host document as an argument, so the fleet builds
the pod's bundle from this flake with its own configuration.

## Documentation

The contracts in full are at
[aleph.garden/docs/view/](https://aleph.garden/docs/view/), and the design
documents behind them are in `docs/superpowers/specs/`.
