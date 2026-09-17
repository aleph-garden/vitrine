// What one deployment configures: a JSON-LD Host node the build embeds into
// index.html. The shell reads the keys as they are and never expands the
// document; the context is what makes them IRIs when it is read as RDF.

import type { Rule } from '@aleph-garden/view'

export type Config = {
  issuer?: string
  sparqlEndpoint?: string
  /** What the shell opens in place: `any` every IRI, `self` the resources of
   *  its own origin, with every other link handed to the browser. Absent:
   *  `self`. */
  opens?: 'any' | 'self'
  /** View ids to register, in that order. Absent: every view of the bundle. */
  views?: string[]
  /** The registry's override rules; JSON, so `iri` and `contentType` are
   *  strings here. */
  rules?: Rule[]
}

export const HOST_TYPE = 'https://w3id.org/aleph/ns/view#Host'

/** The node a `<script type="application/ld+json">` carries, as far as the
 *  shell reads it. */
type HostNode = Config & { '@type'?: unknown }

/** The embedded Host node, or {} when the page carries none. */
export function readConfig(doc: Document): Config {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const node = hostNode(script.textContent ?? '')
    if (!node) continue
    const config: Config = {}
    if (node.issuer !== undefined) config.issuer = node.issuer
    if (node.sparqlEndpoint !== undefined) config.sparqlEndpoint = node.sparqlEndpoint
    if (node.opens === 'any' || node.opens === 'self') config.opens = node.opens
    if (node.views !== undefined) config.views = node.views
    if (node.rules !== undefined) config.rules = node.rules
    return config
  }
  return {}
}

/** The parsed node when it is a Host, by the term or by the full IRI. */
function hostNode(text: string): HostNode | undefined {
  let node: HostNode
  try {
    node = JSON.parse(text) as HostNode
  } catch {
    return undefined
  }
  if (typeof node !== 'object' || node === null) return undefined
  return node['@type'] === 'Host' || node['@type'] === HOST_TYPE ? node : undefined
}
