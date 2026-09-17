# aleph.garden as the shell: design

The shell that a pod hands out as the `text/html` representation of every
resource is the same shell that `https://aleph.garden` serves for any IRI.
One bundle; a deployment differs only in the registry it is configured
with. This document fixes that configuration surface, the address scheme,
the landing page as a view, and the repository move that follows.

It sits between [slice 1](2026-09-17-aleph-view-design.md), whose contracts
it leaves untouched except for one added condition, and
[slice 2](2026-09-17-transclusion-design.md), which it precedes because it
fixes the build layout.

## Purpose

Aleph Garden is a viewer over IRIs. Serving the viewer from a pod is one
host; serving it from a domain of its own, where anyone opens any IRI and
logs in with whatever Solid-OIDC issuer their WebID names, is the same
host with a different registry. `https://aleph.garden/` is itself an IRI,
and the page that greets a visitor there is a view that applies to it.

## Contract delta

One condition joins the list:

```ts
type Condition =
  | { iri: string | RegExp }   // new: the resource's IRI, whatever its content
  | { contentType: string | RegExp }
  | { container: boolean }
  | { type: string }
  | { ask: string }
```

`iri` holds when the resource's IRI equals the string or matches the
regular expression. It is the condition a person uses to pin a view to one
resource in their own rule list; the landing page is its first use.

## Address scheme

The shell decides what IRI it shows from `location` alone, and what
location shows an IRI from its own origin:

- When the path after the origin begins with `https://` or `http://`, that
  path is the IRI: `https://aleph.garden/https://pod.toph.so/notes/a.md`
  shows the note. Readable, copyable, and the browser's own history works.
- Otherwise `location` itself is the IRI, which is the pod case unchanged.

Navigation: a link to a resource on the shell's own origin pushes the IRI
as it is, a link to one on another origin pushes `<origin>/<iri>`. On a pod
that is the IRI for every link the pod's own resources carry; on
aleph.garden it is the prefixed form for everything the site does not
serve itself, the landing page's IRI field included.

A view marks a link the browser should follow with a `target` attribute;
the runtime turns every other click on an `http` or `https` link into an
`as:View`, whatever its origin, and the address rule above decides the
location. That is one rule for every view and needs no code in the view.

Static files win over the fallback: `/docs/…` is served by Pages as the
page it is, since the path names no IRI.

## Configuration

A deployment configures the shell through one document the build embeds
in `index.html`: a JSON-LD node of type `view:Host` under the view
vocabulary's context, in a `<script type="application/ld+json">` element.
The shell finds it by script type and `@type`, reads the keys as they
are, and never expands it; the context is what makes the keys IRIs when
the document is read as RDF, and the same document can later live on a
pod as the rule list slice 1 deferred.

```json
{
  "@context": "https://w3id.org/aleph/ns/view",
  "@type": "Host",
  "views": [
    "https://w3id.org/aleph/ns/view#Landing",
    "https://w3id.org/aleph/ns/view#Fallback"
  ],
  "rules": [
    { "view": "https://w3id.org/aleph/ns/view#Landing", "when": [{ "iri": "https://aleph.garden/" }] }
  ]
}
```

That is aleph.garden's document. The pod's names an issuer and an
endpoint and leaves `views` out:

```json
{
  "@context": "https://w3id.org/aleph/ns/view",
  "@type": "Host",
  "issuer": "https://pod.toph.so/",
  "sparqlEndpoint": "https://sparql.toph.so"
}
```

- `issuer`: the Solid-OIDC issuer to log in at. Absent on aleph.garden;
  the shell then asks for a WebID and reads `solid:oidcIssuer` from the
  profile.
- `sparqlEndpoint`: where the Markdown view sends `sparql` blocks. Absent
  means the blocks render as code.
- `views`: the ids of the bundle's views to register, in that order.
  Absent means every view the bundle has. A hint naming a view that is
  not registered is ignored, as slice 1 fixes, so a deployment that
  leaves a view out has no path to it.
- `rules`: the registry's override rules. The views themselves are the
  bundle's; `views` and `rules` choose among them.

The Nix build takes the document as an argument in place of the single
environment variable slice 1 used. On the pod the fleet supplies it; on
aleph.garden the repository does.

## Foreign content

On aleph.garden, what fills the region comes from whatever origin the IRI
names. Views are trusted code: a visitor trusts the bundle's, their own,
or those of a party they chose, and a view from anywhere else never runs.
Trust covers intent and never bugs, and the renderers a view leans on
have had injection bugs before (KaTeX and mermaid both carry XSS
advisories). So the resource is the adversary, and a view is the path it
takes: a string until the view turns it into HTML, and a bug in the view
is what turns it into script.

Isolation comes in two stages, and the browser provides both.

**In the document, on every host.** Hardening inside the origin:

- One chokepoint. The runtime is the only code that writes a view's
  HTML into the document, on mount and on every patch, and it writes
  through a sanitizer with an allowlist that admits what the views emit:
  the Obsidian class names, `data-slot`, SVG for diagrams, MathML for
  formulas. A view emits a string and never touches the region itself,
  which the contract already says.
- A Content Security Policy on the shell document: scripts from the
  bundle's origin only, no inline script, no `object`, no `base`. A
  string that slipped past the sanitizer still runs nothing.
- Trusted Types where the browser has them: the policy names the
  sanitizer as the one producer of `TrustedHTML`, so that a DOM sink
  anywhere in the bundle, a dependency's included, refuses a plain string.

A policy narrows what a bug can do; it is no boundary. The origin is the
one boundary the browser has, and aleph.garden's origin holds the
session.

**Across an origin, on aleph.garden, before any view beyond the fallback
view is registered there.** The region becomes a sandboxed iframe with an
opaque origin: the view's code, `render` and `hydrate`, runs inside it
without cookies, storage, or the session; the shell outside holds the
session and the chrome and answers `resolve` over a message channel, which
also lets it decide which IRIs a view may reach with the visitor's
credentials. A bug in a renderer then yields script in an origin that
owns nothing. This is the pattern user content is served under elsewhere
(GitHub and Google each render it from a domain of its own), and the
contracts were shaped for the crossing: `render` returns a string, events
go in, patches come out, and `resolve` is the one call back.

aleph.garden starts with the landing view and the fallback view under the
first stage. The fallback view escapes everything and has no `hydrate`,
so the first stage covers it. The Markdown view joins when the second
stage stands.

The pod stays at the first stage: the content there is the owner's and
shares the origin anyway.

The page also has to say whose content it shows. The chrome names the
origin of the resource on show, outside the region and on every host,
and the document title carries the IRI. A visitor at
`https://aleph.garden/https://bank.example/` reads that the content is
bank.example's and the frame around it is Aleph Garden's, the way a
translation proxy or a reader mode does it. Login lives in the chrome
alone, and credentials are only ever typed at the issuer, so nothing a
resource renders can ask for them in the shell's name.

## The landing view

`view:Landing` applies through the rule above and renders from nothing:
the greeting, what Aleph Garden is in a paragraph, links to the docs and
the vocabularies, and a field to open an IRI. It reads no body, since
Pages answers `GET https://aleph.garden/` with the shell document itself.

Login is not the landing view's. Session belongs to the host, so the login
control and the IRI field of the running shell sit in the shell's own
chrome outside the region, on every host.

## Repository move

The site is a build artifact of the shell, so it lives with it:
`aleph-garden/www` becomes `packages/www` in this repository (the Starlight
docs under `/docs/`), and one workflow here builds shell and docs into one
`dist` and deploys it to the Pages project. The `www` repository is
archived once the first deploy from here succeeds.

The fleet keeps building the pod's shell from this repository's flake, with
its own configuration document.

## Acceptance

Unit:

- the `iri` condition holds for an equal string and a matching pattern
- the address scheme yields the IRI for both forms and round-trips through
  navigation on each host
- the landing view renders under the rule and nowhere else
- a document naming `views` registers those and no other; one without
  registers every view of the bundle

By hand:

- `https://aleph.garden/` greets; `https://aleph.garden/https://pod.toph.so/public/`
  shows the container's statements through the fallback view without a
  session, with `pod.toph.so` named in the chrome; a private note there
  asks for a WebID, logs in at the pod, and shows its text
- `https://pod.toph.so/notes/…` behaves as in slice 1
- `https://aleph.garden/docs/view/` is the docs page

## Rejected

- **A viewer mode flag.** The address scheme already tells the two apart
  without one; a flag would be a second source of truth.
- **The landing page as a static file.** Then `/` would be the one path
  the viewer does not render, and the first thing a visitor sees would be
  outside the contract.
- **Inert views as the only boundary.** Registering just views without
  `hydrate` is a convention standing in for isolation; it blocks every
  view that does anything and guards nothing once one is let in. It is
  the fallback view's property, and the reason stage one suffices for it,
  never the design.
- **An Electron or WebEngine application.** Regions inside one window are
  the browser shell with the multi-region layout of slice 2: one document,
  one runtime, no bridge. Packaging and a tray icon are all such an
  application would add. Regions on the desktop are a layer-shell matter,
  which is the Quickshell host under "Deferred".
- **A separate render domain instead of the sandboxed iframe.** The same
  boundary at the cost of a second deployment and DNS; the iframe's
  opaque origin gives it in one document.

## Deferred

- The sandboxed region, stage two above: a second document for the
  iframe, the message channel for `resolve` and events, a height
  protocol. Precondition for any view beyond the fallback view on
  aleph.garden.
- The Content Security Policy on the pod: whether the conversion slot's
  answer can carry the header, or the reverse proxy sets it.
- A view from a party the user chose, and where that trust is recorded.
- A layout resource as the shell's home, replacing the landing view's
  fixed content with a rendered layout. Waits for slice 2.
- A guided tour as the landing: a layout resource that grows region by
  region, each a transclusion, and shows what the shell does. Waits for
  slice 2 and the layout resource above.
- A view for `text/html` that shows the page in a sandboxed iframe of its
  own, for a link into the web at large. Without a session and subject to
  the page's framing policy, which is what a visitor expects there.
- A bridge for the bus across document boundaries: the runtime's
  `listen` and `dispatch` over a message channel, so that a region in a
  document of its own takes part in the same events and the same
  `resolve`. Two transports, one module: postMessage for the sandboxed
  region (stage two above), QWebChannel for the Quickshell host below.
- A Quickshell host, sketched: a QML module `AlephHost` reads a layout
  resource from the pod (JSON-LD with a fixed frame, since QML reads JSON
  and no Turtle), spawns one layer-shell surface per entry, each a
  WebEngineView running the shell with a host document of its own, and
  writes position and size back, debounced. Surfaces talk to the host
  over the bridge above (QWebChannel). A hidden control surface runs the
  shell with `views: []` and holds the one Solid-OIDC session; every
  WebEngineView shares the profile, so every region is logged in, and the
  host does its own pod reads and writes (layout, inbox) through that
  surface's bridge, which grows `resolve`, `put` and `subscribe` for it.
  The host itself never holds a token: DPoP in QML would mean crypto
  without WebCrypto. A headless alternative is a sidecar with client
  credentials from agenix. The pod's notification channel, subscribed
  from the control surface, is the `as:Update` source. Example: stickers
  on the screen, one surface per emoji that arrives in the Solid inbox.
  Needs Quickshell built with QtWebEngine; to be checked in nixpkgs first.
- A long-lived session in the browser shell: a client identifier document
  at `https://aleph.garden/clientid.jsonld` in place of dynamic client
  registration, so the client is one stable identity whose consent the
  issuer remembers, and `offline_access` at login, so the library refreshes
  the access token from a refresh token without a visit to the issuer.
  DPoP proofs are per request and automatic; what expires is the access
  token, and this is what makes that invisible.
- The apex move for `aleph.garden` from alvin to Pages, and removing the
  vhost there. A DNS change, done when the deploy from this repository
  stands.
