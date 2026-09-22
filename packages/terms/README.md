# @aleph-garden/terms

The RDF vocabulary IRIs that more than one Aleph Garden package names, and the
`ns` helper that declares a vocabulary this dictionary does not carry. The
terms are plain strings, so a consumer working in RDF/JS wraps them in its own
`namedNode` and nothing here has to agree with it about term representation.

```ts
import { ns, rdf, schema } from '@aleph-garden/terms'

rdf.type // 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

const ex = ns('https://example.org/ns#', 'width', 'height')
ex.width // 'https://example.org/ns#width'
```

This package exists because `@aleph-garden/vitrine`,
`@aleph-garden/host-core` and `@aleph-garden/vitrine-markdown` need the same
IRIs and must not disagree about them. Installing it directly is fine; they
pull it in either way.

## Status

Version `0.1.1-dev`. The interfaces change between releases without a
deprecation period, so pin an exact version. The repository holds TypeScript;
the published package holds the JavaScript and declaration files compiled from
it at build time.
