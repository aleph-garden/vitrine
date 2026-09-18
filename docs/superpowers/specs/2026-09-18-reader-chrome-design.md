# The shell as a reader, round one: frame and switcher

The shell replaces Obsidian for reading and moving through the vault.
This round gives it Obsidian's two habits that cost the least and carry
the most: a chrome that stays out of the way, and a quick switcher.
Sidebars, backlinks and search wait for the layout resource and the
storage's services (see "Deferred").

It builds on the [host design](2026-09-17-aleph-garden-host-design.md)
and changes no host document key. One contract in `view-markdown` grows
by a method.

## The frame

The chrome becomes a frame around the region: the region is inset by a
fixed margin, and each corner of the viewport holds a slot. Only the top
left is filled in this round; the other three exist as empty elements
so that the layout is the frame's from the start and a later layout
resource fills them without moving anything.

```html
<body class="theme-dark">
  <div id="chrome" class="frame">
    <div class="corner top-left">…</div>
    <div class="corner top-right"></div>
    <div class="corner bottom-left"></div>
    <div class="corner bottom-right"></div>
  </div>
  <main id="root"></main>
</body>
```

The top left, closed, shows two things and nothing else:

- the Aleph Garden icon, a button
- the host name of the resource on show, beside it, with a dot that
  says whether the session reaches that origin: accent color when it
  does, muted when the visitor is anonymous there, absent on a host
  without a session

These stay visible because they are security state, the way a browser
keeps the lock and the domain in view. Everything else is behind the
icon.

The icon opens a panel below it, and `Escape` or a second click closes
it. The panel holds what the bar held until now, in this order: the full
IRI on show, the IRI field ("Open an IRI"), the switcher's entry ("Open a
note", present when a switcher exists), and the session control: the
WebID when logged in, the login button when the host names an issuer,
the WebID form otherwise, nothing on a host without a session.

The frame and the panel use Obsidian's custom properties the way the
region does, so the vault's own snippet themes them and a host without
one gets the shell's defaults.

## The icon

An SVG of the letter aleph on a round ground, in the shell's own
`public/` so that both hosts serve it, and the document's favicon by a
`<link rel="icon">` in `index.html`. The pod hands static assets out
beside the bundle already.

## The quick switcher

`Ctrl+O` (`Cmd+O` on a Mac) and the panel's entry open a prompt over the
region: one text field, a list of up to twenty matches below it, the
first selected. Typing filters, the arrow keys move the selection,
`Enter` opens the selected note through an `as:View` on the runtime,
`Escape` closes. A match is a note name from the wikilink index whose
characters contain the typed ones in order; matches with the typed
characters closer together and nearer the start rank first. No library.

The index is the Markdown view's. Its contract grows by one method:

```ts
export type WikilinkIndex = {
  lookup(name: string): string | undefined
  /** Every name the index resolves, in no particular order. */
  names(): string[]
}
```

The shell builds a context for it with the runtime's `instanceContext`
over its own resolve and asks `wikilinkIndex(ctx, webId)` once, when the
switcher first opens. The index needs a WebID with a type index, so the
switcher exists when the session has a WebID and the Markdown view is
registered, and is absent otherwise; aleph.garden today has neither.

## Acceptance

Unit:

- the closed frame shows the icon and the host name, the dot follows the
  credentialed predicate, and nothing else of the chrome is in the DOM
  until the icon is clicked
- the panel opens and closes on click and on `Escape`, and carries the
  IRI field, the session control, and the switcher entry only when a
  switcher exists
- the switcher filters `names()` by subsequence, ranks a tighter match
  first, moves the selection with the arrow keys, and dispatches an
  `as:View` with the selected IRI on `Enter`
- `names()` returns every name the fixture index resolves

By hand, on `pod.toph.so`:

- a note opens with the icon and `pod.toph.so` at the top left and
  nothing else over the content; the vault's snippet colors the frame
- `Ctrl+O`, three letters of a note's name, `Enter`: the note is open,
  the address follows
- on aleph.garden the frame shows without a dot and without the switcher

## Rejected

- **Hiding the host name when the chrome is closed.** Then a page could
  pass for its content's origin, which the host design set out to
  prevent.
- **A fuzzy-search library.** A subsequence match over a few thousand
  names is a loop.
- **Filling all four corners now.** Nothing has a claim on them yet; an
  empty slot costs one element.

## Deferred

- The corners as regions of a layout resource, and sidebars in them:
  the file tree (the container view, recursive), properties, backlinks.
  Backlinks need an index of incoming links, which is the wikilink index
  turned around or a service of the storage.
- Full-text search as a view over a search service the storage
  description announces (see the ideas note).
- A command palette behind the same prompt, once there are commands.
