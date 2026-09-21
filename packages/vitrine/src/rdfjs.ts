// The one boundary between an RDF/JS library and the plain quads everything
// here reads. Terms are taken structurally, so this names no library and a
// parser package brings its own.

import type { Quad, Term } from './index.ts'

export type RdfJsTerm = {
  termType: string
  value: string
  language?: string
  datatype?: { value: string }
}

export type RdfJsQuad = {
  subject: RdfJsTerm
  predicate: RdfJsTerm
  object: RdfJsTerm
  graph: RdfJsTerm
}

/** Library quads as plain ones. The default graph is left off, so a quad
 *  from a document without named graphs reads as a triple. */
export function plainQuads(quads: readonly RdfJsQuad[]): Quad[] {
  return quads.map((q) => {
    const quad: Quad = {
      subject: plainTerm(q.subject),
      predicate: plainTerm(q.predicate),
      object: plainTerm(q.object)
    }
    if (q.graph.termType !== 'DefaultGraph') quad.graph = plainTerm(q.graph)
    return quad
  })
}

export function plainTerm(term: RdfJsTerm): Term {
  if (term.termType === 'Literal') {
    const out: Term = { termType: 'Literal', value: term.value, datatype: term.datatype?.value }
    if (term.language) out.language = term.language
    return out
  }
  return { termType: term.termType === 'BlankNode' ? 'BlankNode' : 'NamedNode', value: term.value }
}
