# Transcluding resources (draft, nothing of this is built yet)

A view names an IRI in its output and gets back rendered content. It never
learns what was behind the IRI: a note, a spreadsheet, a photo, a container
listing, a page on some other origin. The rule table picks the view for the
child by content type, and the calling view branches on nothing.

This is what a desktop does when it opens a file with the handler the MIME
type names, and what compound documents did when a spreadsheet sat inside a
presentation sat inside a mail. Here it runs over IRIs, so the child can
live on another machine, and the stack can go as deep as the guards allow.
None of it needs RDF. A content type is enough to dispatch, and a host that
serves plain files gets the same behaviour as one that serves a graph.

## The case

Today a view that wants to show another resource has one way out: resolve
it and render it itself.

```ts
// what the Markdown view does for ![[Setup]] today
const child = await ctx.resolve(target)
const html = renderMarkdown(child)          // the parent renders the child
```

Three things follow from that, and all three are the reason for this page.

The parent picks the child's view. A Markdown note embedding a `.ttl`
resource gets whatever the Markdown view can do with Turtle, which is
nothing. The rule table decided the parent's view and has no say over the
child.

A change to the child rebuilds the parent. The child's IRI is a dependency
of the parent instance, so an `as:Update` on the embedded note re-renders
the whole embedding note, scroll position and all.

Every view carrying embeds carries the same guards. The Markdown view has a
depth limit and a cycle guard of its own, and the next view that embeds
anything will write them again.

## What it looks like

One call on the context, and the view puts the string it gets back into its
own output.

```ts
type Context = {
  resolve(iri: string): Promise<Resource>
  transclude(iri: string, hint?: Hint): Promise<string>   // new
  emit(event: Event): void
  events: AsyncIterable<Event>
}
```

A dashboard view, whole:

```ts
export const dashboardView: View = {
  id: 'https://example.org/views#Dashboard',
  when: [{ type: 'https://example.org/ns#Dashboard' }],

  async render (resource, ctx) {
    const panels = objects(resource.graph ?? [], resource.iri, PANEL)
    const html = await Promise.all(panels.map((p) => ctx.transclude(p.value)))
    return { html: `<div class="dashboard">${html.join('')}</div>` }
  }
}
```

Each panel is rendered by whatever view the rule table picks for it: a note
by the Markdown view, a container by the container view, a query result by
a table view. The dashboard view knows none of them and holds no branch on
content type.

`resolve` hands out data, `transclude` hands out an instance. Two calls, so
a resource never has to know which of the two it currently is.

## A view that does its own work

The dashboard composes and nothing else. The more common case is a view
with real work of its own, which still has no business rendering what it
points at.

A result view for a SPARQL query owns the query, the ranking, the order,
the score column, the paging and the empty state. What a hit looks like is
the hit's own affair.

```ts
export const resultsView: View = {
  id: 'https://example.org/views#Results',
  when: [{ contentType: 'application/sparql-results+json' }],

  async render (resource, ctx) {
    const hits = rank(JSON.parse(resource.body as string))    // its own work
    const rows = await Promise.all(hits.map(async (hit) => `
      <li class="hit">
        <span class="score">${hit.score.toFixed(2)}</span>
        ${await ctx.transclude(hit.iri)}
      </li>`))
    return { html: `<ol class="results">${rows.join('')}</ol>` }
  }
}
```

A note among the hits renders as a note, a photo as an image, a container
as a listing, and a resource whose type this view has never heard of
renders as whatever the rule table has for it. The alternative is a branch
per content type inside the view, which is the rule table written a second
time, in a worse place.

The Markdown view is the same shape and the reason this page exists. It
parses the note, resolves wikilinks, lays out frontmatter and runs `sparql`
blocks, all of which is its work. An embedded `.ttl` resource is not, and
today it has no way to say so.

Each hit is a child instance, so an edit to one note while the results are
on screen refreshes that row alone, and a click inside a hit is an
`as:View` from the hit.

## What the runtime does with it

`transclude` returns a placeholder element as a string. The view is not told
whether it is a placeholder or the finished child, so a server-side host can
answer the same call with the child's HTML inline.

```html
<div data-aleph-transclude="https://pod.example/notes/Setup.md"></div>
```

After the parent's HTML is in the document and before the parent's
`hydrate` runs, the runtime walks the region and mounts a child instance
into every placeholder. A child is an instance like any other: own region,
own handle, own dependencies, own events.

An `as:Update` on the child's IRI re-renders the child alone. The parent
does not move.

**Keyed by `(iri, hint)`.** When the parent re-renders, its placeholders are
matched against its existing children. A key that is still there keeps its
instance, and the runtime moves that child's region into the new
placeholder without calling anything on the child. A key that vanished is
disposed, a new key is mounted. Without this, a parent that repaints would
throw away every child below it.

**Cycle and depth are the runtime's.** Each instance carries the chain of
ancestor IRIs. A transclusion of an IRI already in the chain, or one past
the depth limit, is answered with a marker element and no mount. Views
carry no guard.

## Bringing in a part

An embed of a heading shows that section alone; navigating to the same
heading shows the whole note, scrolled.

```ts
await ctx.transclude(note, { fragment: 'Setup', clip: true })
```

`clip` is what separates the two. A view that does not understand `clip`
ignores it and renders the whole resource.

For the Markdown view that means `![[Note]]` becomes a transclusion,
`![[Note#Setup]]` becomes one with `clip`, and its own embed recursion,
depth limit and cycle guard are deleted.

## What a host owes

Nothing beyond what it already does, when it uses the DOM runtime: the
placeholder walk, the keyed match and the guards live there.

One addition pays for itself immediately. A cache in front of `resolve`,
keyed by the IRI without its fragment, makes ten block transclusions of one
note a single fetch. It belongs to the host, so a server-side host that
already holds a store needs none.

## What this opens

- A layout is a resource that names other resources, and the shell's home
  becomes a layout instead of a fixed landing view.
- A tab strip or a split pane is a container of IRIs, with no layout code
  that knows what is inside a pane.
- An external page is a resource a host can fetch, so the rule table
  decides how a foreign document is shown.
- Compound documents: a spreadsheet region inside a note inside a mail,
  each one rendered by the view its content type selects, each one
  addressable and updatable on its own.

## What it costs

- A second mounting path in the runtime, with the keyed match as its
  fiddliest part.
- A placeholder the view must pass through untouched. A view that rewrites
  its own HTML string after calling `transclude` can break the mount.
- Every child is a live instance, so a page of a hundred transclusions is a
  hundred instances. Lazy mounting on visibility is the answer, and it
  waits for a page where it matters.
