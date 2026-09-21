// Turtle and TriG as quads. A package of its own because it carries a parser
// dependency the core refuses, which is the line that already separates
// @aleph-garden/vitrine-markdown.

import type { Parser, Quad } from '@aleph-garden/vitrine'
import { plainQuads } from '@aleph-garden/vitrine/rdfjs'
import { Parser as N3Parser } from 'n3'

/** Registered in a Registry's `parsers`; fills a resource's `graph`. */
export function turtleParser(): Parser {
  return {
    contentType: 'text/turtle',
    async parse(resource) {
      const text =
        typeof resource.body === 'string' ? resource.body : new TextDecoder().decode(resource.body)
      return parseTurtle(text, resource.iri)
    }
  }
}

/** Turtle to quads against `baseIRI`. Also the `parseMeta` a container's
 *  listing needs when a host fetches one. */
export function parseTurtle(text: string, baseIRI: string): Quad[] {
  return plainQuads(new N3Parser({ baseIRI }).parse(text))
}
