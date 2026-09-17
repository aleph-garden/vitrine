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

const renderer = createRenderer({
  parsers: [turtleParser()],
  // each view carries its own `when`; markdown: text/markdown,
  // container: { container: true }, fallback: []. No rules needed.
  views: [markdownView({ sparqlEndpoint, webId }), containerView, fallbackView],
});

const runtime = createRuntime(renderer, (iri) => fetchResource(session.fetch, iri));
installNavigation(runtime, root);

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
//          renderer.parse           → no parser matches, graph stays undefined
//          renderer.select          → no hint, no rules, markdown.when holds → markdownView
//          markdownView.render(resource, ctx, {fragment:"Setup"})
//            ctx.resolve(webId)                        → profile, finds privateTypeIndex
//            ctx.resolve(privateTypeIndex)             → registration for NoteDigitalDocument
//            ctx.resolve("https://pod.toph.so/notes/") → ldp:contains …  (index built)
//            → { html, hydrate }                        heading "Setup" marked is-flashing
//          region.innerHTML = html; handle = hydrate(region, ctx)  // mermaid runs here
//          linkEvents(region, emit)                            // runtime, on every mount
// instance.dependencies = { webId, privateTypeIndex, notes/, … }
```

A wikilink click on `[[bar#Intro]]`:

```ts
// linkEvents saw a click on <a href="https://pod.toph.so/notes/bar.md#Intro"> inside the region
emit({ type: AS.View, object: "https://pod.toph.so/notes/bar.md", target: "…#Intro" });
// installNavigation receives it: another resource than the instance's
history.pushState(…);
await runtime.mount(root, "https://pod.toph.so/notes/bar.md", { fragment: "Intro" });
// mount disposes the instance that held `root`, then renders the new one

// a click on <a href="https://pod.toph.so/notes/bar.md#Usage"> instead:
emit({ type: AS.View, object: "https://pod.toph.so/notes/bar.md", target: "…#Usage" });
// same resource → installNavigation replaces the hash and dispatches
await runtime.dispatch({ type: AS.View, object: "…/bar.md", target: "…#Usage" });
// the instance has no `update` and its hint changed → re-render, no refetch
```

A reload control:

```ts
await runtime.dispatch({ type: AS.Update, object: "https://pod.toph.so/notes/bar.md" });
// bar.md is a dependency of the instance → re-render, same hint
```

Everything a view needs arrives through `resource`, `ctx`, `hint`. The
shell never reaches into a view, and the view never reaches the DOM
outside its region.
