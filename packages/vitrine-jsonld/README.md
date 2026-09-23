# @aleph-garden/vitrine-jsonld

> Before 1.0. Any interface here can change in any release, including the
> ones marked `-dev` patches. Build against it to experiment, depend on an
> exact version, and expect to follow breaking changes by hand.

JSON-LD as quads for [Vitrine](https://www.npmjs.com/package/@aleph-garden/vitrine).
Register `jsonLdParser()` in a registry's `parsers` and a resource served as
`application/ld+json` arrives at its view with `graph` filled.

A package of its own because it carries a parser dependency,
`jsonld-streaming-parser`, that the core refuses. A remote `@context` is
fetched, which is JSON-LD's own contract and the one thing here that touches
the network.

```ts
import { createRenderer } from '@aleph-garden/vitrine'
import { jsonLdParser } from '@aleph-garden/vitrine-jsonld'

const renderer = createRenderer({ views: [], rules: [], parsers: [jsonLdParser()] })
```

## Status

Version `0.1.1-dev`. The interfaces change between releases without a
deprecation period, so pin an exact version. The repository holds TypeScript;
the published package holds the JavaScript and declaration files compiled from
it at build time.
