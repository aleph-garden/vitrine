# Vitrine

Vitrine turns an address into HTML. Give it the IRI of a resource and you
get something you can read: a note as a note, a person as a card, a
directory as a list. What draws each one is a small function, and you can
replace it with your own. Vitrine reads and never writes, so editing and
permissions stay with the tools you already use for them.

Which function runs is decided by a table of rules over the content type,
the `rdf:type`, or the IRI itself. What the library hands that function is
the body, the content type, what the server says about the resource, and
quads when the body carries RDF. It knows no server, no protocol and no RDF
library of its own: a host fetches, Vitrine renders.

Vitrine is one component of [Aleph Garden](https://aleph.garden).

The hosts that exist speak Solid. A Community Solid Server can hand the
browser shell out as the `text/html` representation of every resource it
serves, and the same bundle also reads an IRI from its own address. A
deployment differs only in the host document the build embeds.

Status: the pipeline, the Markdown view, the browser shell and the
aleph.garden host stand. Transclusion, a server-side host and WASM views are
specified and unbuilt. **Nothing is published:** the package names below are
internal to this repository, nothing is on npm, and there is no release to
depend on. Clone and build.

## What it allows

- **Open a resource at its own URL.** `https://pod.toph.so/notes/Matrix.md`
  renders the note, and so does
  `https://aleph.garden/-/https://pod.toph.so/notes/Matrix.md` from the other
  host. The address bar stays the resource, and the browser's history works.
- **Read a note the way Obsidian shows it.** The Markdown view resolves
  wikilinks across the vault, renders embeds, math, diagrams and `sparql`
  blocks, and emits Obsidian's class names so the vault's own CSS applies.
  It is one view under the contract, and a replaceable one.
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
`@aleph-garden/vitrine/dom` ships the instance bookkeeping so every browser
host runs the same protocol, and it is the only code that writes a view's
HTML into the document: through a sanitizer with an allowlist, under Trusted
Types where the browser has them. The resource is untrusted input, and the
renderers a view leans on have had injection bugs before.

One deployment differs from another in a JSON-LD `Host` node the build
embeds into the shell's `index.html`: where to log in, where `sparql` blocks
go, whether the shell holds a session, which IRIs it opens in place, and
which views and rules it registers. Which host this is decides the rest:
what opens in place, whether a session exists, and how a location names a
resource are properties of the host package, not keys in that document.

## Packages

| Package | Holds | Knows about |
|---|---|---|
| `@aleph-garden/terms` | the IRIs more than one package names, and `ns` | nothing |
| `@aleph-garden/vitrine` | contracts, renderer, selection, the DOM runtime, `about` | IRIs and quads |
| `@aleph-garden/vitrine` (`/http`) | an HTTP response as a `Resource` | HTTP, LDP and WAC headers |
| `@aleph-garden/vitrine-turtle` | a `Parser` over Turtle and TriG | Turtle |
| `@aleph-garden/vitrine-markdown` | the Markdown view | Obsidian, a Solid type index |
| `@aleph-garden/host-core` | session, credentialed origins, chrome, the region's failure states | Solid-OIDC |
| `@aleph-garden/pod-host` | the host a pod hands out | its own origin, the vault's snippets |
| `@aleph-garden/garden-host` | the host at aleph.garden | any IRI, no session |
| `packages/www` | aleph.garden: the docs site the garden host is deployed with | |

An application that embeds a region needs neither host package: a renderer,
a `Resolve`, and `runtime.mount` are the whole surface.

View ids and the event types the library defines live under
`https://w3id.org/aleph/ns/view#`.

## Development

```sh
bun install
bun test
bun run check                      # biome, typecheck, tests
bun run --cwd packages/pod-host dev  # vite dev; ALEPH_HOST names a host document
bun run build:site                   # the garden host and the docs into one dist
nix build .#pod-host                 # the bundle a pod serves
```

`nix/pod-host.nix` takes the host document as an argument, so the fleet builds
the pod's bundle from this flake with its own configuration.

## Licence

MIT. See [LICENSE](LICENSE).

## Documentation

The contracts in full are at
[aleph.garden/vitrine/docs/](https://aleph.garden/vitrine/docs/), and the design
documents behind them are in `docs/superpowers/specs/`.
