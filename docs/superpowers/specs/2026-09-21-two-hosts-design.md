# Two hosts and the layers below them: design

A pod and `aleph.garden` are two applications over one rendering runtime.
This document splits them, names the layers underneath, and fixes two
additions that every view depends on: a term dictionary and a reader over
quads.

It amends [the host design](2026-09-17-aleph-garden-host-design.md), whose
"Address scheme" and "Configuration" sections it replaces. The view
contracts of [slice 1](2026-09-17-aleph-view-design.md) stand, with one
additive change to `Registry` deferred to the query slice.

## Purpose

The host design claimed one bundle configured two ways. What that claim
protects is that a view runs unchanged on either host, and that property
belongs to the view contract, which already lives in its own package.
Below that claim sit behaviours that answer to one host and are inert on
the other: the address scheme, the navigation policy, the login flow, the
landing view, the vault's CSS snippets, and the origin set a session may
carry credentials to. Each arrived as a runtime branch and a configuration
key.

A second reader has no host at all. Someone embedding a region in an
existing application wants a renderer and a way to hand it a resource,
with no session, no chrome, and no Solid. The layering has to let them
stop before any of it.

## Boundaries

In scope:

- the package layout and what each package may depend on
- the term dictionary and the reader over quads
- `aleph.garden`'s address scheme, as a property of its host
- what remains configurable within one host

Out of scope, and named where they belong:

- the query seam. `{ ask: … }` stands in the condition union and holds for
  nothing; an engine behind it makes view selection asynchronous, which
  breaks the renderer contract. Its own slice.
- a declaration on a view of the predicates it reads. That is the Fresnel
  lens, and it needs the query slice to have a reader for it.
- the sandboxed region. Deferred by the host design and unchanged here,
  except that it is now `aleph.garden`'s alone.

## Packages

```
terms            IRIs and the ns helper                 no dependencies
vitrine          contracts, runtime, built-in views,    dompurify
                 writeHtml and the sanitizer
vitrine/http     an HTTP response as a Resource         no dependencies
vitrine-turtle   a Parser over Turtle and TriG          n3
                 ──── the embedding case ends here ────
host-core        session, credentialed origins,         Solid OIDC client
                 chrome, the region's failure states
pod-host         location is the IRI, own-origin        host-core
                 navigation, issuer login, snippets
garden-host      the prefixed address scheme, any-IRI   host-core
                 navigation, WebID login, landing
```

Dependencies point downward only. One condition makes the line falsifiable
and is worth a test rather than a resolution: the Solid OIDC client is a
dependency of `host-core` and of nothing above it. An embedding that
reaches into `host-core` means the line is in the wrong place.

One rule decides between a subpath export and a package of its own: a piece
with no dependency of its own is a subpath, and a piece that carries one is
a package. `vitrine/http` reads headers and needs nothing, so it ships with
the core; `vitrine-turtle` carries a parser, which is the line that already
separates `vitrine-markdown`.

### The embedding case

A region in an application that holds its own data, with no host:

```ts
const runtime = createRuntime(
  createRenderer({ views: [containerView, fallbackView], parsers: [turtleParser()] }),
  (iri) => fetchResource(fetch, iri)
)
await runtime.mount(element, 'https://example.org/thing')
```

`Resolve` is the whole integration surface. An application whose graph is
already in memory returns a `Resource` from it and fetches nothing. The
sanitizer applies either way, since every write into a region goes through
the runtime.

This is the case the layout serves, and it is why `fetchResource` and the
Turtle parser leave the host. Neither reaches for a session: the fetch is
an argument, so both work against whatever fetch the caller holds.

The view design already decided this, twice, and the layout is what makes
those decisions reachable from outside a host. It rejected a store in the
API, because "SolidOS panes read from a shared rdflib store, which binds
every pane to rdflib and to the browser. `resolve` is the whole surface."
And it rejected a framework in the core, because "it would decide for every
view." `terms` and `about` carry no dependency for the same reason.

## Terms

`@aleph-garden/terms` holds the IRIs that more than one package needs. Four
of them are currently declared in three packages each, which is the
concrete reason the package exists.

```ts
export function ns<const K extends string>(base: string, ...names: K[]): Vocab<K>

export const rdf = ns('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'type', 'value')
export const schema = ns('https://schema.org/', 'Person', 'name', 'author', …)
```

Terms are named individually, so a typo fails to compile and an editor
completes them. `ns` is how a package declares a vocabulary the dictionary
does not carry.

The exported values are strings. A consumer that works in RDF/JS wraps
them in its own `namedNode`, so the dictionary stays usable from packages
that disagree about term representation.

Vocabularies stay separate objects. Merging them into one flat record
collides wherever two vocabularies share a local name, and `rdfs.label`
beside `schema.name` reads well enough without it.

## The reader

Reading a value out of a graph currently spells out the optional graph,
the subject, the predicate IRI, and the step from a term list to a string.
Four concerns for one value, and a chain through a second subject repeats
all four.

`about` collapses them, in `vitrine` beside the existing quad helpers,
over plain arrays and with no dependency:

```ts
export type Reader = {
  readonly iri: string
  terms(predicate: string): Term[]
  all(predicate: string, opts?: { lang?: string }): string[]
  one(predicate: string, opts?: { lang?: string }): string | undefined
  node(predicate: string): Reader
}

export function about(source: Resource | Quad[], subject?: string): Reader
```

- The subject defaults to the resource's own IRI, and the graph to its
  `graph` when it has one.
- `node` returns a reader on the first object. An absent object, or a
  literal, yields a reader that finds nothing, so a chain reads through to
  the end without a check at every step.
- `lang` prefers literals carrying that tag and falls back to untagged
  ones.
- `terms` is the way out when a datatype or a language tag matters.

`typesOf` and `isContainer` are expressible through it, which leaves one
scan path in the package instead of two.

## The address scheme

`aleph.garden` shows any IRI, and the location that shows one carries a
reserved first segment:

```
https://aleph.garden/-/https://pod.toph.so/notes/a.md
```

A pod has no such scheme. Its location is the resource, which is the whole
of its address handling, and it hands a link to another origin to the
browser. The prefixed form was never reachable there, because a host that
opens only its own origin never builds one.

The reserved segment replaces the previous rule, under which a path
beginning with a scheme was the IRI. Two things follow:

- The routing that decides between the shell and a static file tests one
  segment. A path naming no IRI is a plain 404, and a page added to the
  site later cannot collide with the viewer.
- The scheme of the IRI stops being part of the rule. A `urn:`, `did:` or
  `tag:` subject is addressable without an allowlist, which the previous
  form could not do.

The IRI stays in the path unencoded, so that a reader can read it and copy
it out. Percent-encoding it as a single segment would also work
under this rule; accepting both would give one location two spellings.

## Configuration

The host document keeps the keys that vary within one host and loses the
ones that told the hosts apart. `opens` and `session` describe which host
this is, so the host decides them. What remains:

- `issuer` and `sparqlEndpoint`, on the pod
- `views` and `rules`, on both

A host document that is read as RDF is unaffected: the keys that remain
keep their meaning under the view vocabulary's context.

## Acceptance

Unit:

- `about` reads a value, a list, a language-tagged value, and a chain
  through an absent object without raising
- `ns` yields the base concatenated with each name, and the result is
  frozen
- the garden address scheme round-trips an IRI through navigation, and a
  path without the reserved segment is the location's own IRI
- the pod host resolves its location to the resource and produces no
  prefixed form for any link
- a host document naming `views` registers those and no others

By hand:

- `https://aleph.garden/-/https://pod.toph.so/public/` lists the container,
  with `pod.toph.so` named in the chrome
- `https://aleph.garden/nothing-here` is a 404 from the static site
- `https://pod.toph.so/notes/…` behaves as before, and a link to another
  origin leaves the page
- the embedding case above renders a container into an element in a page
  that depends on neither host package

## Rejected

- **One host with a configurable base.** A key naming the reserved segment
  works and leaves the eight host-specific behaviours as runtime branches
  that read as configuration. The segment is a property of the host that
  opens any IRI, and that host is now a package.
- **A vocabulary as a type parameter on `View`.** A type parameter is
  erased, so it cannot report at runtime what a view uses, which was the
  reason to want it. Heterogeneous views in one registry also collapse the
  parameter at every collection site. A field on the view reports it, and
  it belongs with the query slice that would read it.
- **Generated accessors from shapes.** They give typed access to a graph
  at the cost of a code generation step and a shape per type. `about`
  reaches the same readability with neither. A view may import such a
  library on its own, since the contract asks it for a string and nothing
  else.
- **`rdflib.js` as the Turtle parser.** Heavier than `n3` for the same
  quads.
- **Copying the session and fetch policy into both hosts.** The origins a
  token may reach and the sanitizer are the two places a mistake is
  expensive. One copy, in `host-core` and in `vitrine`.

## Deferred

The query seam. `{ ask: … }` needs an engine, an engine makes `select`
asynchronous, and the federation the project is aimed at is the same seam.
Whether a view declares the predicates it reads is decided there, with the
Fresnel lens as the shape to measure it against.
