// JSON-LD as quads. A package of its own for the reason
// @aleph-garden/vitrine-turtle is one: it carries a parser dependency the
// core refuses.

import type { Parser, Quad } from '@aleph-garden/vitrine'
import type { RdfJsQuad } from '@aleph-garden/vitrine/rdfjs'
import { plainQuads } from '@aleph-garden/vitrine/rdfjs'

/** Registered in a Registry's `parsers`; fills a resource's `graph`. */
export function jsonLdParser(): Parser {
  return {
    contentType: 'application/ld+json',
    async parse(resource) {
      const text =
        typeof resource.body === 'string' ? resource.body : new TextDecoder().decode(resource.body)
      return parseJsonLd(text, resource.iri)
    }
  }
}

/** JSON-LD to quads against `baseIRI`. The parser is a chunk of its own, the
 *  way mermaid is in @aleph-garden/vitrine-markdown: it outweighs the rest of
 *  a host bundle and a visit that opens no JSON-LD never pays for it. A
 *  remote `@context` is fetched, which is JSON-LD's own contract and the one
 *  thing in this package that touches the network. */
export async function parseJsonLd(text: string, baseIRI: string): Promise<Quad[]> {
  const { JsonLdParser } = await import('jsonld-streaming-parser')
  const parser = new JsonLdParser({ baseIRI })
  const quads: RdfJsQuad[] = []
  return new Promise((resolve, reject) => {
    parser.on('data', (quad: RdfJsQuad) => quads.push(quad))
    parser.on('error', reject)
    parser.on('end', () => resolve(plainQuads(quads)))
    parser.write(text)
    parser.end()
  })
}
