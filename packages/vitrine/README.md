# @aleph-garden/vitrine

> Before 1.0. Any interface here can change in any release, including the
> ones marked `-dev` patches. Build against it to experiment, depend on an
> exact version, and expect to follow breaking changes by hand.

Vitrine turns an address into HTML. Give it the IRI of a resource and you get
something you can read: a note as a note, a person as a card, a directory as a
list. What draws each one is a small function you can replace with your own.
Vitrine reads and never writes, so editing and permissions stay with the tools
you already use for them.

A table of rules over the content type, the `rdf:type` or the IRI itself
decides which function runs. That function receives the body, the content type,
what the server says about the resource, and quads when the body carries RDF.
The package knows no server, no protocol and no RDF library of its own: a host
fetches, Vitrine renders.

## Entry points

| Specifier | What it holds |
| --- | --- |
| `@aleph-garden/vitrine` | The renderer, the registry, the resource and view types |
| `@aleph-garden/vitrine/dom` | Mounting rendered output into a live document |
| `@aleph-garden/vitrine/ssr` | Rendering to a string outside a browser |
| `@aleph-garden/vitrine/http` | Reading an HTTP response into a resource |
| `@aleph-garden/vitrine/cache` | A resolver cache for transclusion |
| `@aleph-garden/vitrine/rdfjs` | Converting RDF/JS quads to the plain quads used here |

Vitrine is one component of [Aleph Garden](https://aleph.garden).

## Status

Version `0.3.2-dev`. The interfaces change between releases without a
deprecation period, so pin an exact version. The repository holds TypeScript;
the published package holds the JavaScript and declaration files compiled from
it at build time.
