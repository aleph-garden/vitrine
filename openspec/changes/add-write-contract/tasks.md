## 1. Core contract

- [ ] 1.1 Add `Activity`, `Outcome`, `Resource.version` and `Context.act` to `packages/vitrine/src/index.ts`, export `AS.Create` and `AS.Delete`; verify with `bun run typecheck`, then fix every context stub the type check reports in the tests
- [ ] 1.2 Write runtime tests first: `act` without a host `act` answers `unsupported`; a successful `as:Update` emits `as:Update` for the object; `as:Create` and `as:Delete` also emit for the collection; a refused activity emits nothing; verify they fail
- [ ] 1.3 Add `act` to `RuntimeOptions` and wrap it in `createRuntime`/`instanceContext` (`dom.ts`); verify the tests from 1.2 pass
- [ ] 1.4 Give the SSR context an `act` that answers `unsupported`; verify with a test in `ssr.test.ts`
- [ ] 1.5 Write a test that two mounted instances of one IRI both render the stored content after a successful update through one of them; verify it passes

## 2. Solid write adapter

- [ ] 2.1 Write tests for `fetchResource` reading `ETag` into `version` and leaving it out without the header; make them pass
- [ ] 2.2 Write tests for `actOver`: the request each activity type produces (method, `Content-Type`, `If-Match`, target IRI), the outcome per status (2xx, 401, 403, 409, 412, 400, 422, 405, 415, 501), `Location` on 201, `version` from the response `ETag`, and rejection on 500 and a network failure; verify they fail
- [ ] 2.3 Implement `actOver(fetchFor)` in `packages/vitrine/src/http.ts`; verify the tests from 2.2 pass
- [ ] 2.4 Wire `actOver` into `boot` with the per-origin fetch the resolve uses; verify with a host-core test that a foreign origin gets the bare fetch and a credentialed one the session fetch
- [ ] 2.5 Write a host-core test that the cache drops the changed IRI before the re-render resolves it; fix the dispatch order in the runtime if it fails

## 3. N3 Patch helper

- [ ] 3.1 Write tests for `n3Patch(iri, before, after)`: a changed literal, no change answering `undefined`, quads outside the document graph ignored, a blank node refused with the quad named; verify they fail
- [ ] 3.2 Implement `n3Patch` in `packages/vitrine-turtle/src/index.ts` with the `n3` Writer; verify the tests pass and that `n3`'s parser reads the produced body back as a `solid:InsertDeletePatch`

## 4. Markdown editing

- [ ] 4.1 Ask Toph how the edit control in the reading view and the editor look, including how a conflict is shown, before writing markup; record the answer in design.md
- [ ] 4.2 Write tests for the editor view: it shows the stored source; saving calls `act` with `as:Update`, `text/markdown`, the body and the opened version as `basedOn`; `conflict`, `denied`, `invalid` and `unsupported` keep the unsaved text and name the reason; unsaved text survives a re-render; verify they fail
- [ ] 4.3 Implement the editor view in `packages/vitrine-markdown` with its text and version in `ctx.state`; verify the tests from 4.2 pass
- [ ] 4.4 Write tests that the reading view links to the editor with `?view=` when `allow` contains `write` and offers no link otherwise; implement the link; verify the tests pass
- [ ] 4.5 Register the editor view in `packages/pod-host` after the reading view; verify with `nix build .#pod-host` and a test that the reading view stays the default for `text/markdown`

## 5. Against a real server

- [ ] 5.1 Add an acceptance test that starts Community Solid Server, saves a Markdown note through `actOver` with `If-Match`, patches a Turtle document with an `n3Patch` body, and answers `conflict` for a stale version; verify it passes
- [ ] 5.2 Save a note on pod.toph.so through the deployed pod host and confirm the stored file holds the edit; record the result in the change

## 6. Documentation

- [ ] 6.1 Describe `act`, `Activity`, `Outcome` and `version` in `docs/reference/contracts.mdx`, move writing from the roadmap's planned list to what stands, and delete `docs/drafts/write.md`; verify with `just check`
