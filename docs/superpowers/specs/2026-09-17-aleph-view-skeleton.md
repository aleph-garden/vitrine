# Skeleton: how the shell drives the pipeline

The signatures live in the packages (`packages/*/src`). This is the one
transcript that shows them used end to end, for a private note opened at
`https://pod.toph.so/notes/foo.md#Setup` with no session yet.

```ts
// shell/src/main.ts — boot(root)

const iri = "https://pod.toph.so/notes/foo.md";
const hint = { fragment: "Setup" };                     // from location.hash

const session = await createSession("https://pod.toph.so/");
// session.webId === undefined

const pipeline = createPipeline({
  parsers: [turtleParser()],
  views: [markdownView({ sparqlEndpoint, webId }), containerView, fallbackView],
  rules: [
    { view: markdown.id,  when: [{ contentType: "text/markdown" }] },
    { view: containerView.id, when: [{ container: true }] },
    { view: fallbackView.id,  when: [] },
  ],
});

const runtime = createRuntime(pipeline, (iri) => fetchResource(session.fetch, iri));

try {
  await runtime.mount(root, iri, hint);
} catch (e) {
  if (e.status === 401 && !session.webId) showLogin(root, session);  // login() redirects
  else throw e;
}
```

After the redirect the same boot runs with `session.webId` set:

```ts
await runtime.mount(root, iri, hint);
// runtime: resolve(iri)            → fetchResource → Resource{contentType:"text/markdown"}
//          pipeline.parse           → no parser matches, graph stays undefined
//          pipeline.select          → rule 1 holds → markdownView
//          markdownView.render(resource, ctx, {fragment:"Setup"})
//            ctx.resolve(webId)                        → profile, finds privateTypeIndex
//            ctx.resolve(privateTypeIndex)             → registration for NoteDigitalDocument
//            ctx.resolve("https://pod.toph.so/notes/") → ldp:contains …  (index built)
//            → { html, hydrate }                        heading "Setup" marked is-flashing
//          region.innerHTML = html; handle = hydrate(region, ctx)  // mermaid runs here
// instance.dependencies = { webId, privateTypeIndex, notes/, … }
```

A wikilink click on `[[bar#Intro]]`:

```ts
// installNavigation intercepted <a class="internal-link" href="https://pod.toph.so/notes/bar.md#Intro">
history.pushState(…);
await runtime.dispatch({ type: AS.View, object: "https://pod.toph.so/notes/bar.md", target: "…#Intro" });
// the instance has no `update` and the object differs from its iri
// → runtime.mount(root, "https://pod.toph.so/notes/bar.md", { fragment: "Intro" })
//   after disposing the old instance
```

A reload control:

```ts
await runtime.dispatch({ type: AS.Update, object: "https://pod.toph.so/notes/bar.md" });
// bar.md is a dependency of the instance → re-render, same hint
```

Everything a view needs arrives through `resource`, `ctx`, `hint`. The
shell never reaches into a view, and the view never reaches the DOM
outside its region.
