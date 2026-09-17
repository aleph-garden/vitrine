# Skeleton: aleph.garden as the shell

The interfaces the [host design](2026-09-17-aleph-garden-host-design.md)
adds, and one transcript per host that shows them used. Signatures only;
the plan fills in bodies.

## Contract delta (`@aleph-garden/view`)

```ts
export type Condition =
  | { iri: string | RegExp }          // new
  | { contentType: string | RegExp }
  | { container: boolean }
  | { type: string }
  | { ask: string }

// holds(): `iri` holds when resource.iri equals the string, or the RegExp
// tests true against it.
```

The runtime's link rule becomes the one every view uses: an anchor with
a `target` or `download` attribute, or a click with a modifier key, is
the browser's; every other click on an `http` or `https` link is an
`as:View`, whatever the link's origin. The host's address rule decides
the location, so a pod link inside a region on aleph.garden stays in the
shell.

```ts
// packages/view/src/dom.ts, unchanged signature
export function linkEvents(region: Element, emit: (event: Event) => void): () => void
```

The runtime gains the one place view HTML enters the document:

```ts
// packages/view/src/dom.ts
/** Writes view HTML into `target` through the sanitizer. Every mount and
 *  every patch goes through here; views never write the region. Exported
 *  so that a view's own DOM writes in hydrate can use the same allowlist. */
export function writeHtml(target: Element, html: string): void
// Behind it: the one Trusted Types policy, named `aleph`, whose createHTML
// is the sanitizer. Browsers without Trusted Types get the sanitizer alone.
```

`@aleph-garden/view-markdown` loosens one option, since a deployment may
have no endpoint:

```ts
export type MarkdownOptions = {
  sparqlEndpoint?: string   // absent: `sparql` blocks render as code
  webId: string
}
```

## Configuration document

One JSON-LD document per deployment, a `view:Host` node. The build embeds
it into `index.html` as `<script type="application/ld+json">`; the shell
finds it by script type and `@type` and reads the keys as they are.

```ts
// packages/shell/src/config.ts
export type Config = {
  issuer?: string
  sparqlEndpoint?: string
  opens?: 'any' | 'self'     // what the shell opens in place; absent: 'self'
  views?: string[]           // ids to register, in order; absent: all
  rules?: Rule[]             // JSON, so `iri` and `contentType` are strings here
}
export const HOST_TYPE = 'https://w3id.org/aleph/ns/view#Host'
/** The embedded Host node, or {} when the page carries none. */
export function readConfig(doc: Document): Config
```

The two documents that exist:

```jsonc
// packages/www/host.jsonld — aleph.garden; the repository owns it
{
  "@context": "https://w3id.org/aleph/ns/view",
  "@id": "https://aleph.garden/",
  "@type": "Host",
  "opens": "any",
  "views": [
    "https://w3id.org/aleph/ns/view#Landing",
    "https://w3id.org/aleph/ns/view#Fallback"
  ],
  "rules": [
    { "view": "https://w3id.org/aleph/ns/view#Landing",
      "when": [{ "iri": "https://aleph.garden/" }] }
  ]
}

// what the fleet passes for pod.toph.so
{
  "@context": "https://w3id.org/aleph/ns/view",
  "@id": "https://pod.toph.so/",
  "@type": "Host",
  "issuer": "https://pod.toph.so/",
  "sparqlEndpoint": "https://sparql.toph.so"
}
```

`@id` names the host for the RDF reading and nothing else; the shell's
origin comes from `location`, so preview deploys and the dev server work
under any origin. The context document is the vocab repository's; the
shell never fetches it. `Host`, `views`, `rules`, `issuer`, `sparqlEndpoint` and the condition
keys become terms there.

How the build takes it:

```sh
# vite: the path to the document, read by vite.config.ts and injected into
# index.html through transformIndexHtml. Absent: an empty Host node.
ALEPH_HOST=packages/www/host.jsonld vite build
```

```nix
# nix/shell.nix: an attribute set in place of the sparqlEndpoint string.
# Written to a file with builtins.toJSON and passed as ALEPH_HOST; the
# build adds @context and @type; @id is the attrset's to give.
{ host ? { issuer = "https://pod.toph.so/"; sparqlEndpoint = "https://sparql.toph.so"; } }
```

## Address scheme

One value: the resource the shell shows and the location that shows it.
Two constructors, one per direction; the shell's origin is `location.origin`
on every host, so neither takes it.

```ts
// packages/shell/src/address.ts
export type Address = {
  readonly iri: string     // no query, no fragment
  readonly hint?: Hint
  readonly href: string    // the location that shows it, under the shell's origin
}

/** From the address bar: the path after the origin when it begins with
 *  http:// or https://, the location itself otherwise. */
export function addressOf(href: string): Address

/** From a link target (an IRI with optional query and fragment): `url`
 *  itself when it is on the shell's origin, `${origin}/${url}` otherwise. */
export function addressFor(url: string): Address
```

```ts
addressOf('https://pod.toph.so/notes/a.md#Setup')
// { iri: 'https://pod.toph.so/notes/a.md', hint: { fragment: 'Setup' },
//   href: 'https://pod.toph.so/notes/a.md#Setup' }
addressOf('https://aleph.garden/https://pod.toph.so/notes/a.md?view=urn:x')
// { iri: 'https://pod.toph.so/notes/a.md', hint: { view: 'urn:x' }, href: <as given> }
addressOf('https://aleph.garden/')
// { iri: 'https://aleph.garden/', href: 'https://aleph.garden/' }

// at https://pod.toph.so/…
addressFor('https://pod.toph.so/notes/b.md#Intro')
// { iri: 'https://pod.toph.so/notes/b.md', hint: { fragment: 'Intro' },
//   href: 'https://pod.toph.so/notes/b.md#Intro' }
// at https://aleph.garden/…
addressFor('https://pod.toph.so/notes/b.md#Intro')
// { …, href: 'https://aleph.garden/https://pod.toph.so/notes/b.md#Intro' }
addressFor('https://aleph.garden/docs/view/')
// { iri: 'https://aleph.garden/docs/view/', href: 'https://aleph.garden/docs/view/' }
```

`addressOf(addressFor(u).href)` has the same `iri` and `hint` as
`addressFor(u)`.

`addressFor` decides by origin, where the design text says "the scheme
it started in". The two agree everywhere except at `https://aleph.garden/`
itself: that location carries no prefix, so nothing in it says which
scheme it started in, and the landing page's IRI field has to open
`https://pod.toph.so/public/` as `https://aleph.garden/https://pod.toph.so/public/`.
`addressFor` maps a link to another origin on a pod to
`https://pod.toph.so/https://…` as well, and the pod serves the shell for
that path like for any other; whether the pod's shell opens it there or
hands it to the browser is the host document's `opens`, below.

```ts
export function installNavigation(
  runtime: Runtime,
  root: Element,
  host: { opens: 'any' | 'self'; session: Session }
): void
```

An `as:View` whose IRI is on another origin under `'self'` is
`location.assign(url)`, and the browser takes over. Otherwise:
`pushState(a.href)`, `mount(root, a.iri, a.hint)`, and "same resource" is
`a.iri === current.iri`. A rejected mount is handled here the way `boot`
handles the first one: a 401 without `session.webId` writes the
login-needed sentence, anything else the error with a link to the source.

## Session

```ts
// packages/shell/src/main.ts

export type Session = {
  webId: string | undefined
  fetch: Fetch
  /** Redirects to the issuer; the page comes back with a session. */
  login(issuer: string): Promise<never>
}

/** Handles the incoming redirect; the issuer is login's argument now. */
export async function createSession(): Promise<Session>

/** solid:oidcIssuer from the WebID's profile document. */
export async function issuerOf(fetch: Fetch, webId: string): Promise<string>

/** Registers the bundle's views, filtered and ordered by config.views. */
export async function boot(chrome: Element, root: Element): Promise<void>
```

## The landing view

```ts
// packages/shell/src/landing.ts
export const LANDING_VIEW = 'https://w3id.org/aleph/ns/view#Landing'
/** No `when`: reachable through a rule or a hint only. Renders from
 *  nothing and has no hydrate; its docs links carry target="_top". */
export const landingView: View
```

## The shell's chrome

Login, the IRI field, and the origin of what is on show sit outside the
region, on every host.

```html
<!-- packages/shell/index.html -->
<body class="theme-dark">
  <header id="chrome"></header>
  <main id="root"></main>
</body>
```

```ts
// packages/shell/src/chrome.ts
/** Renders into `host`: the origin and IRI of the resource on show (kept
 *  current from the runtime's instances, mirrored into document.title),
 *  the IRI field, which dispatches an as:View through the runtime, and
 *  the login control. Login goes to `issuer` when given, else asks for a
 *  WebID and resolves it through issuerOf. */
export function installChrome(
  host: Element,
  session: Session,
  issuer: string | undefined,
  runtime: Runtime,
  credentialed: (origin: string) => boolean
): void
// `credentialed` says whether the session reaches an origin; the chrome
// marks the resource on show "anonymous here" when it does not.
```

A 401 without a session shows a sentence in the region; the login control
is the chrome's.

## Repository layout

```
packages/www/
  package.json           @aleph-garden/www: astro + starlight, build → dist/
  astro.config.mjs       site https://aleph.garden, docs sidebar as today
  host.jsonld            the aleph.garden Host document
  public/_redirects
  public/_headers
  src/content/docs/docs/view/*.mdx
                         (no src/content/docs/index.mdx: the landing is a view)
.github/workflows/deploy.yml
```

```
# packages/www/public/_redirects — Pages serves the shell for IRI paths
# and the docs for everything else
/https://*  /index.html  200
/http://*   /index.html  200
```

```
# packages/www/public/_headers — the policy on the shell document, and
# on nothing else: Starlight's pages carry inline scripts of their own
/
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https: 'unsafe-inline'; img-src https: data:; font-src 'self' data:; connect-src https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types aleph
/https://*
  Content-Security-Policy: <same>
/http://*
  Content-Security-Policy: <same>
```

`style-src` admits inline styles and the pod's snippets, since KaTeX and
the diagrams style inline. Whether Pages matches `://` in a `_headers`
and `_redirects` path is the first thing the deploy verifies; the
fallback is the SPA mode (no `404.html`) with the policy on `/*`.

One site build, from the workspace root:

```sh
ALEPH_HOST=../www/host.jsonld bun run --cwd packages/shell build   # --cwd moves the process
bun run --cwd packages/www build
cp -R packages/shell/dist/. packages/www/dist/     # index.html + assets/ join docs/ + _astro/
# deploy packages/www/dist to the Pages project aleph-garden
```

The Markdown view's code is in the bundle on both hosts; aleph.garden
does not register it. Splitting it out of that bundle is a build matter
for when the size hurts.

## Transcripts

`https://aleph.garden/`:

```ts
const config = readConfig(document)            // { views: [Landing, Fallback], rules: [landing rule] }
const { iri } = addressOf(location.href)       // "https://aleph.garden/"
const session = await createSession()          // webId undefined
const renderer = createRenderer({
  parsers: [turtleParser()],
  views: [landingView, fallbackView],          // config.views, in that order
  rules: config.rules
})
installChrome(chrome, session, undefined, runtime)
await runtime.mount(root, iri)
// resolve → GET https://aleph.garden/ → the shell document, text/html
// select  → rule { iri: "https://aleph.garden/" } holds → landingView
// render  → greeting, docs links, vocab links; the IRI field is the chrome's
```

The IRI field takes `https://pod.toph.so/public/`:

```ts
runtime.dispatch({ type: AS.View, object: 'https://pod.toph.so/public/' })
// installNavigation: another resource →
const a = addressFor('https://pod.toph.so/public/')
history.pushState(null, '', a.href)   // "https://aleph.garden/https://pod.toph.so/public/"
await runtime.mount(root, a.iri, a.hint)
// → no rule holds, landingView has no `when`, fallbackView holds → statement table
// chrome: "pod.toph.so · https://pod.toph.so/public/"
```

A private note there, no session:

```ts
await runtime.mount(root, 'https://pod.toph.so/notes/a.md')   // rejects, status 401
// region: "This resource needs a login."  chrome: WebID field
const issuer = await issuerOf(session.fetch, 'https://pod.toph.so/profile/card#me')
await session.login(issuer)                                    // redirect; boot runs again
// after: fallbackView shows the note's text in <pre>
```

`https://pod.toph.so/notes/a.md`, as in slice 1:

```ts
const config = readConfig(document)            // { issuer, sparqlEndpoint }, no views: all
const { iri } = addressOf(location.href)       // the location itself
installChrome(chrome, session, config.issuer, runtime)   // login goes straight to the pod
// markdownView renders; a wikilink to /notes/b.md: addressFor(url).href === url
```
