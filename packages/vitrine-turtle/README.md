# @aleph-garden/vitrine-turtle

Turtle and TriG as quads for [Vitrine](https://www.npmjs.com/package/@aleph-garden/vitrine).
Register `turtleParser()` in a registry's `parsers` and a resource served as
`text/turtle` arrives at its view with `graph` filled.

A package of its own because it carries a parser dependency, `n3`, that the
core refuses. A host that never opens Turtle never loads it.

```ts
import { createRenderer } from '@aleph-garden/vitrine'
import { turtleParser } from '@aleph-garden/vitrine-turtle'

const renderer = createRenderer({ views: [], rules: [], parsers: [turtleParser()] })
```

## Status

Version `0.1.0-dev`. The interfaces change between releases without a
deprecation period, so pin an exact version. The repository holds TypeScript;
the published package holds the JavaScript and declaration files compiled from
it at build time.
