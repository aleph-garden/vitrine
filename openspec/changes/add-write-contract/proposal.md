## Why

Vitrine reads and never writes, so a pod rendered through it can be looked at
and not edited: a note, a person, or a SHACL-validated record has to be changed
with some other tool and then reloaded. The pod host is meant to become the
place where resources are both shown and changed, and `docs/drafts/write.md`
already settled how writing fits the contract. This change turns that draft
into specified behaviour and builds the first path through it end to end.

## What Changes

- The view context gains `act(activity)`. A view hands the host an
  ActivityStreams activity (`as:Update`, `as:Create`, `as:Delete`) carrying a
  media type and a body, and receives an `Outcome`: success with the resource's
  IRI and new version, or a failure reason out of `denied`, `conflict`,
  `invalid` and `unsupported`.
- `Resource` gains an opaque `version` that the host issues. An activity names
  the version it was made against in `basedOn`; the core never reads or
  compares it.
- A host that carried out a change emits `as:Update` for the IRI, which the
  runtime already re-renders on, so every open instance of that resource
  refreshes.
- `@aleph-garden/vitrine/http` gains a Solid write adapter that maps activities
  to HTTP: `as:Update` with `text/n3` to `PATCH`, with any other body to `PUT`,
  `as:Create` to `POST` on the target container, `as:Delete` to `DELETE`. The
  version travels as `If-Match`, and the status code becomes the failure
  reason. `fetchResource` fills `version` from the `ETag` header.
- `@aleph-garden/host-core` wires the adapter into the runtime with the same
  credentialed fetch it reads with, and invalidates the resolve cache on
  success.
- `@aleph-garden/vitrine-turtle` gains a helper that turns two sets of quads,
  before and after an edit, into an N3 Patch body (`text/n3`), so a view over
  RDF data writes back without knowing the protocol.
- `@aleph-garden/vitrine-markdown` gains an edit view: the note's source in a
  text field, saved as `text/markdown` through `ctx.act`, offered only when the
  resource's `allow` contains `write`.
- The contract reference documentation describes `act`, `Activity`, `Outcome`
  and `version`.

Out of scope, each a later change: a form generated from a SHACL shape, an
announcement of the media types a host accepts, offline queueing, undo, and
`act` during server-side rendering, which answers `unsupported`.

## Capabilities

### New Capabilities

- `view-writing`: the core contract for writes: `ctx.act`, `Activity`,
  `Outcome`, `Resource.version`, and the re-render after a successful write.
- `solid-write-adapter`: how a Solid host carries out an activity over HTTP,
  issues versions from ETags, and maps responses to outcomes.
- `rdf-patch`: turning a before and after set of quads into an N3 Patch body a
  view hands to `ctx.act`.
- `markdown-editing`: editing a Markdown note's source in the browser and
  saving it through `ctx.act`.

### Modified Capabilities

None. The project has no specifications yet.

## Impact

- `packages/vitrine`: the `Context`, `Resource` and runtime options types;
  `createRuntime` and `instanceContext` in `dom.ts`; `fetchResource` in
  `http.ts`; the SSR context in `ssr.ts`. Adding `act` to `Context` is an
  additive change for views and a breaking one for code that builds a
  `Context` by hand, such as tests and third-party runtimes.
- `packages/host-core`: `boot.ts` passes the adapter to the runtime.
- `packages/vitrine-turtle`: a new export; it reuses the existing `n3`
  dependency.
- `packages/vitrine-markdown`: a new view and its registration in the pod
  host.
- `docs/reference/contracts.mdx`, `docs/roadmap.mdx`; `docs/drafts/write.md`
  is superseded by the specification.
- No new runtime dependencies. The pod at pod.toph.so needs no change: CSS
  already serves ETags and accepts `PUT`, `PATCH` with N3 Patch, `POST` and
  `DELETE`.
