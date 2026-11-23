## Context

See proposal.md for the motivation. The read path this design extends:

- `Context` (core `index.ts`) offers `resolve`, `about`, `emit`, `events`,
  `transclude`, `render` and `state`. `Resource` already has `allow`, filled
  from `WAC-Allow` by `fetchResource` in `http.ts`, and unused so far.
- `createRuntime(renderer, resolve, options)` in `dom.ts` builds one context per
  instance through `instanceContext`. The runtime re-renders an instance on an
  `as:Update` whose `object` it resolved.
- `boot` in host-core builds the resolve from `fetchResource`, picking
  `session.fetch` or the bare fetch per origin through `credentialed`, wraps it
  in `createResolveCache`, and invalidates a cache entry on every `as:Update`
  it hears through `runtime.listen`.
- `ssr.ts` builds a context for server-side rendering without a runtime.

## Goals / Non-Goals

**Goals:**

- One write path from a view to a Solid server and back into the rendered
  page, with every layer replaceable the way the read path is.
- The core learns no protocol words: no LDP, no HTTP status, no RDF patch
  format.

**Non-Goals:**

- Batching several activities into one atomic change.
- Optimistic rendering: a view shows the stored state only after the host
  confirmed it.

## Decisions

### The host supplies `act`; the runtime adds the refresh

`RuntimeOptions` gains `act?: (activity) => Promise<Outcome>`. The runtime
hands each instance a wrapped `act` that calls the host's and, on `ok: true`,
emits `as:Update` for the changed IRI, plus one for the target collection
after `as:Create` and for the containing collection after `as:Delete`.
Without `act` in the options, the wrapper answers `unsupported`.

Alternative: each host emits the update itself, as `write.md` sketched. That
puts the same three lines into every host and lets one forget them; the
runtime is the one place every host passes through.

The existing `runtime.listen` handler in `boot` already invalidates the cache
on `as:Update`, so the cache requirement of `solid-write-adapter` needs no new
code there, as long as the listener runs before the re-render resolves again
(see Risks).

### The Solid adapter is exported from the core HTTP module

`@aleph-garden/vitrine/http` gains `actOver(fetchFor)`, where `fetchFor(iri)`
answers the fetch to use for that IRI. It maps activities to requests and
responses to outcomes as `solid-write-adapter` specifies, and knows nothing of
sessions. `boot` passes the same per-origin choice it already makes for reads.

Alternative: a module in host-core. Rejected because an application that
embeds a region without host-core reuses `fetchResource` today and should
reuse writing the same way.

`fetchResource` reads `ETag` into `version`. A container listing gets its
version the same way, which `as:Create` does not use but costs nothing.

### N3 Patch from two quad sets, in vitrine-turtle

`@aleph-garden/vitrine-turtle` exports `n3Patch(iri, before, after)`, which
answers `{ contentType: 'text/n3', body }`, or `undefined` when nothing
changed, and throws naming the first quad with a blank node. It filters both
sets to the graph named by `iri`, takes the two differences by term equality,
and serialises terms with the `n3` Writer the package already depends on.

Alternative: the core builds patches. Rejected because the core refuses an RDF
library and N3 Patch is a protocol format. Alternative: SPARQL Update.
Rejected because N3 Patch is the format the Solid protocol requires servers
to support, and CSS does.

### The Markdown editor is its own view

`@aleph-garden/vitrine-markdown` exports a second view,
`https://aleph.garden/views/markdown-source`, with
`when: [{ contentType: 'text/markdown' }]` and registered after the reading
view so the reading view stays the default. It keeps two values in
`ctx.state`: the text being edited and the version it was opened with. Both
survive a re-render, so unsaved text outlasts an `as:Update` from another
region, and the next save answers `conflict` because its `basedOn` is stale. On a
successful save it sets the version from the outcome and clears the edited
text, so the next render shows the stored source.

The reading view links to the same address with `?view=` naming the editor,
the selection mechanism that already exists, and renders that link only when
`allow` contains `write`.

Alternative: an edit mode inside the reading view. Rejected by the decision
in `write.md` that editing is a view: it keeps the reading view free of form
state, and a host's rules can swap in another editor.

### Server-side rendering answers `unsupported`

The context `ssr.ts` builds gets an `act` that resolves
`{ ok: false, reason: 'unsupported' }`. A page rendered on the server has no
session to write with.

## Risks / Trade-offs

- [Adding `act` to `Context` breaks code that builds a `Context` by hand] →
  `instanceContext` and the SSR context are the only builders in the
  repository; tests that stub a context gain the member. The packages are
  pre-1.0 `-dev` releases, and the release notes name the change.
- [The cache listener and the re-render both react to one `as:Update`; if the
  re-render resolves first, it gets the cached, stale resource] → a test in
  host-core asserts the order, and the runtime dispatches listeners before it
  schedules re-renders.
- [A weak ETag (`W/"…"`) never matches `If-Match` under strong comparison, so
  every save would answer `conflict`] → the acceptance test runs against CSS,
  which issues strong ETags for documents; a weak one is passed through
  unchanged, and the failure would show there.
- [A cross-origin response hides `ETag` unless the server exposes it through
  CORS, so the resource has no version and writes become last write wins] →
  the pod host is same-origin with the pod, and CSS exposes `ETag`; the
  `view-writing` spec already documents last write wins without a version.
- [N3 Patch fails with 409 when a deleted statement is no longer there] →
  mapped to `conflict`, which is the true state: the document moved on.

## Migration Plan

Additive for views and hosts; no data migration. The packages take the next
`-dev` version, and the fleet's pod host picks it up with its next `vitrine`
input bump. Rollback is the previous input revision.

## Open Questions

- How the edit control and the editor look: placement of the control in the
  reading view, the editor's layout, how a conflict is shown. Toph decides
  these before the view's markup is written; the behaviour in
  `markdown-editing` does not depend on them.
