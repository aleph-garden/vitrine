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

The shell decides what IRI it shows from `location` alone:

- When the path after the origin begins with `https://` or `http://`, that
  path is the IRI: `https://aleph.garden/https://pod.toph.so/notes/a.md`
  shows the note. Readable, copyable, and the browser's own history works.
- Otherwise `location` itself is the IRI, which is the pod case unchanged.

Navigation keeps the scheme it started in: on aleph.garden a link to another
resource pushes `https://aleph.garden/<iri>`, on a pod it pushes the IRI.

Static files win over the fallback: `/docs/…` is served by Pages as the
page it is, since the path names no IRI.

## Configuration

A deployment configures the shell through one JSON document the build
embeds in `index.html`:

```json
{
  "issuer": "https://pod.toph.so/",
  "sparqlEndpoint": "https://sparql.toph.so",
  "rules": [{ "view": "https://w3id.org/aleph/ns/view#Landing", "when": [{ "iri": "https://aleph.garden/" }] }]
}
```

- `issuer`: the Solid-OIDC issuer to log in at. Absent on aleph.garden;
  the shell then asks for a WebID and reads `solid:oidcIssuer` from the
  profile.
- `sparqlEndpoint`: where the Markdown view sends `sparql` blocks. Absent
  means the blocks render as code.
- `rules`: the registry's override rules. The views themselves are the
  bundle's; rules choose among them.

The Nix build takes the document as an argument in place of the single
environment variable slice 1 used. On the pod the fleet supplies it; on
aleph.garden the repository does.

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

By hand:

- `https://aleph.garden/` greets; `https://aleph.garden/https://pod.toph.so/public/`
  lists the container without a session; a private note there asks for a
  WebID, logs in at the pod, and renders
- `https://pod.toph.so/notes/…` behaves as in slice 1
- `https://aleph.garden/docs/view/` is the docs page

## Rejected

- **A viewer mode flag.** The address scheme already tells the two apart
  without one; a flag would be a second source of truth.
- **The landing page as a static file.** Then `/` would be the one path
  the viewer does not render, and the first thing a visitor sees would be
  outside the contract.

## Deferred

- A layout resource as the shell's home, replacing the landing view's
  fixed content with a rendered layout. Waits for slice 2.
- The apex move for `aleph.garden` from alvin to Pages, and removing the
  vhost there. A DNS change, done when the deploy from this repository
  stands.
