// Turtle and TriG as quads. A package of its own because it carries a parser
// dependency the core refuses, which is the line that already separates
// @aleph-garden/vitrine-markdown.

import type { Parser, Quad, Term } from '@aleph-garden/vitrine'
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
  return new N3Parser({ baseIRI }).parse(text).map((q) => {
    const quad: Quad = {
      subject: plain(q.subject),
      predicate: plain(q.predicate),
      object: plain(q.object)
    }
    if (q.graph.termType !== 'DefaultGraph') quad.graph = plain(q.graph)
    return quad
  })
}

function plain(term: {
  termType: string
  value: string
  language?: string
  datatype?: { value: string }
}): Term {
  if (term.termType === 'Literal') {
    const out: Term = { termType: 'Literal', value: term.value, datatype: term.datatype?.value }
    if (term.language) out.language = term.language
    return out
  }
  return { termType: term.termType === 'BlankNode' ? 'BlankNode' : 'NamedNode', value: term.value }
}
