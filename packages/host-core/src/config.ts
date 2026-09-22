// What one deployment configures, which is what varies within a host. Which
// host this is decides the rest, so the address scheme, what opens in place
// and whether a session exists are no longer keys. The shell reads the keys
// as they are and never expands the document; the context is what makes them
// IRIs when it is read as RDF.

import type { Rule } from '@aleph-garden/vitrine'

export type Config = {
  /** The Solid-OIDC issuer to log in at. Absent: the chrome asks for a WebID
   *  and reads solid:oidcIssuer from the profile. */
  issuer?: string
  /** Where the Markdown view sends `sparql` blocks. Absent: they render as
   *  code. */
  sparqlEndpoint?: string
  /** View ids to register, in that order. Absent: every view the host has. */
  views?: string[]
  /** Override rules, consulted before the views' own `when`; JSON, so `iri`
   *  and `contentType` are strings here. */
  rules?: Rule[]
}

export const HOST_TYPE = 'https://w3id.org/vitrine/ns#Host'

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
