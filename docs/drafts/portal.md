# The portal element (draft, speculative in parts)

One script tag and one custom element put the rendering layer on any page:

```html
<script type="module" src="https://aleph.garden/portal.js"></script>

<aleph-portal url="https://pod.example/life/wohnen-sailauf.jsonld">
  <a href="https://pod.example/life/wohnen-sailauf.jsonld">Sailauf, 2010–2013</a>
</aleph-portal>
```

The child element is what a reader sees without JavaScript, and what stays
if the resource cannot be reached. Attributes map onto contracts that
already exist: `url` is the IRI, `view` is the hint, `host` names a Host
document whose rules and endpoints this portal should use.

A portal is a host, like the pod's shell and like aleph.garden. It owns
fetching and one region, and it owns no navigation: a link inside a portal
is a link, and the page it leads to is the browser's business.

## The one rule

**A portal never holds a session.** It fetches anonymously, always.

A public resource renders. A resource that answers `401` renders a link
that opens it at the reader's own host, where their session lives. There
is no mode in which a portal logs someone in, and therefore no way for the
embedding page to end up holding a token it should not have.

The alternative, a portal that sometimes carries a session and sometimes
does not, puts the difference between "safe" and "leaks my credentials to
whoever embedded this" into a configuration flag. That is the kind of rule
people get wrong once and then only find out afterwards.

## Whose views apply

A reader's rule list is a preference, so it needs no credentials and can be
a public resource in their pod. It is the same JSON-LD `Host` node the
build embeds into `index.html` today:

```jsonld
{
  "@context": "https://w3id.org/vitrine/ns",
  "@type": "Host",
  "rules": [
    { "view": "…#Timeline", "when": [{ "type": "https://schema.org/Event" }] }
  ]
}
```

With this, the host document stops being a build artefact and becomes a
resource, which is what the first slice deferred.

The portal learns which WebID to read it from by being told, once per site,
through a control in its own corner. Storage partitioning does not hurt
here, since the answer is per site anyway. Making it hold across all sites
needs something browser-level, which is where a small extension comes in
(see "How far this is spun").

**The limit that has to be in the contract:** a portal runs the views of
its own bundle. A reader's rules choose among those; they cannot load a
third party's view code into the embedding page's origin. Otherwise a
portal would be a way for a visitor to run arbitrary JavaScript on someone
else's site, which no site can allow and most content security policies
would block anyway. Views from elsewhere stay bound to an isolated region,
which is the second stage the host design already describes.

## What it costs

Small, because the parts exist. A second bundle entry beside the shell, a
custom element that builds a renderer and a runtime over `fetch`, and a
decision about the shadow root.

Shadow DOM by default is the safer choice: the embedding page's CSS cannot
reach into the view, and the view's CSS cannot escape into the page. It
also means the view's stylesheet has to be adopted into each root, and that
a page cannot restyle what it embeds. An attribute can opt out for someone
who wants the portal to inherit the page's typography.

Two limits worth writing down before someone hits them:

- **CORS.** A portal can only fetch what allows it. Pods do, arbitrary web
  pages do not. Until a server-side host exists that renders and returns
  HTML, the rest stays a link.
- **No session, therefore no private content**, restated from above because
  it is the first thing someone will try.

## What this replaces

The documentation needs live examples, and the plan was a plugin for the
docs site that acts as a host. The portal is that plugin. One element runs
the examples in the docs, the embeds in a blog post, and whatever a
stranger puts on their own page, all through the same library.

## How far this is spun

Three claims here, and they are not equally solid.

**Cheap and useful now.** Anonymous rendering of public resources on any
page: docs examples that execute, a blog post that embeds the file it is
about, a pod owner showing one of their resources on their own site. This
part needs nothing that does not exist, and it is worth building for the
documentation alone.

**Plausible, unproven.** A reader's rule list, read from their pod, picking
among the bundle's views. The mechanism is clear and the work is small. The
question is whether anyone ever sets one up, since it asks a reader to
publish a preference document to change how somebody else's page looks to
them. Cheapest test: use it myself across the docs site and the blog and
see whether the selection ever differs from the default.

**Utopian.** Rendering preferences that follow a person across the web
through an extension, kits of views published by other people, and a portal
as the thing that makes a stranger want a pod. Each step depends on the one
before it and on an ecosystem that does not exist. Worth writing down as
the direction, worth nothing as a plan.

The honest summary: the element is a small piece of work that pays for
itself in the documentation, and everything downstream of it is a bet.
