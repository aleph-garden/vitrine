// An HTTP response as a Resource. No session and no RDF library: the fetch
// is an argument and a parser for a container's own body is another, so an
// application that embeds a region reuses this with whatever it already has.

import { dcterms, ldp, ma, rdf, xsd } from '@aleph-garden/terms'
import type { Quad, Resource, Term } from './index.ts'

/** What this needs of fetch; narrower than the global's type. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** Quads from a container's Turtle body, which the caller supplies because
 *  the parser carries a dependency this package refuses. */
export type ParseMeta = (text: string, baseIRI: string) => Quad[]

const ACCEPT = [
  'text/markdown',
  'text/turtle',
  'application/ld+json;q=0.9',
  'application/sparql-results+json;q=0.9',
  '*/*;q=0.5'
].join(', ')

/** GET with an Accept that omits text/html; Resource from body and headers
 *  (Content-Type, Link rel=type, Last-Modified, WAC-Allow). A container's
 *  Turtle body joins `meta` when `parseMeta` is given. Rejects with an error
 *  carrying `status` on a non-2xx answer. */
export async function fetchResource(
  fetch: Fetch,
  iri: string,
  parseMeta?: ParseMeta
): Promise<Resource> {
  const response = await fetch(iri, { headers: { accept: ACCEPT } })
  if (!response.ok) {
    throw Object.assign(new Error(`${response.status} ${iri}`), { status: response.status })
  }
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  const mediaType = contentType.split(';', 1)[0]!.trim().toLowerCase()
  const textual = mediaType.startsWith('text/') || /[/+]json$|[/+]xml$/.test(mediaType)
  const body = textual ? await response.text() : new Uint8Array(await response.arrayBuffer())

  const meta: Quad[] = [
    { subject: named(iri), predicate: named(ma.format), object: literal(mediaType) }
  ]
  for (const type of linkRelations(response.headers.get('link'), 'type')) {
    meta.push({ subject: named(iri), predicate: named(rdf.type), object: named(type) })
  }
  const modified = response.headers.get('last-modified')
  if (modified && !Number.isNaN(Date.parse(modified))) {
    meta.push({
      subject: named(iri),
      predicate: named(dcterms.modified),
      object: literal(new Date(modified).toISOString(), xsd.dateTime)
    })
  }
  const container = meta.some(
    (q) => q.predicate.value === rdf.type && q.object.value === ldp.Container
  )
  if (parseMeta && container && mediaType === 'text/turtle' && typeof body === 'string') {
    meta.push(...parseMeta(body, iri))
  }

  return { iri, contentType, body, meta, allow: wacAllow(response.headers.get('wac-allow')) }
}

export function linkRelations(header: string | null, rel: string): string[] {
  if (!header) return []
  const out: string[] = []
  for (const part of header.split(',')) {
    const m = /^\s*<([^>]+)>\s*;(.*)$/.exec(part)
    if (!m) continue
    const rels = /rel="?([^";]+)"?/.exec(m[2]!)?.[1]?.split(/\s+/) ?? []
    if (rels.includes(rel)) out.push(m[1]!)
  }
  return out
}

export function wacAllow(header: string | null): Resource['allow'] {
  const m = header && /user="([^"]*)"/.exec(header)
  if (!m) return []
  return m[1]!
    .split(/\s+/)
    .filter((mode): mode is Resource['allow'][number] =>
      ['read', 'write', 'append', 'control'].includes(mode)
    )
}

const named = (value: string): Term => ({ termType: 'NamedNode', value })
const literal = (value: string, datatype = xsd.string): Term => ({
  termType: 'Literal',
  value,
  datatype
})
