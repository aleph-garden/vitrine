// The browser host. Served by a pod under the IRI of whatever resource was
// requested, and by aleph.garden for any IRI; owns session, fetching,
// navigation, and the one region.

import {
  AS,
  containerView,
  createRenderer,
  fallbackView,
  objects,
  type Parser,
  type Quad,
  type Resource,
  type Term,
  type View
} from '@aleph-garden/view'
import { createRuntime, type Runtime, writeHtml } from '@aleph-garden/view/dom'
import { markdownView } from '@aleph-garden/view-markdown'
import { EVENTS, Session as OidcSession } from '@inrupt/solid-client-authn-browser'
import { Parser as N3Parser } from 'n3'
import { addressFor, addressOf } from './address.ts'
import { installChrome } from './chrome.ts'
import { readConfig } from './config.ts'
import { landingView } from './landing.ts'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const LDP_CONTAINER = 'http://www.w3.org/ns/ldp#Container'
const DC_MODIFIED = 'http://purl.org/dc/terms/modified'
const XSD_DATETIME = 'http://www.w3.org/2001/XMLSchema#dateTime'
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string'
const MA_FORMAT = 'http://www.w3.org/ns/ma-ont#format'

// ------------------------------------------------------------- session

/** What the shell needs of fetch; narrower than the global's type. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export type Session = {
  webId: string | undefined
  /** fetch with the Solid-OIDC token attached when logged in. */
  fetch: Fetch
  /** Redirects to the issuer; the page comes back with a session. */
  login(issuer: string): Promise<never>
}

/** Handles the incoming redirect; the issuer is login's argument. */
export async function createSession(): Promise<Session> {
  const session = new OidcSession()
  // A restored session goes through a silent re-login that lands back on the
  // redirectUrl of the login, which is whichever resource the user was on
  // then. The URL wanted now comes back with this event; the app has to put
  // it in the address itself. Emitted inside handleIncomingRedirect, so the
  // address is right once the await below resolves.
  session.events.on(EVENTS.SESSION_RESTORED, (url) => history.replaceState(null, '', url))
  await session.handleIncomingRedirect({ restorePreviousSession: true, url: location.href })
  return {
    webId: session.info.webId,
    fetch: session.fetch,
    async login(issuer) {
      await session.login({
        oidcIssuer: issuer,
        redirectUrl: location.href,
        clientName: 'Aleph Garden'
      })
      return new Promise<never>(() => {})
    }
  }
}

const SOLID_OIDC_ISSUER = 'http://www.w3.org/ns/solid/terms#oidcIssuer'

/** solid:oidcIssuer from the WebID's profile document. */
export async function issuerOf(fetch: Fetch, webId: string): Promise<string> {
  const profile = new URL(webId)
  profile.hash = ''
  const response = await fetch(profile.href, { headers: { accept: 'text/turtle' } })
  if (!response.ok) throw new Error(`${response.status} ${webId}`)
  const graph = parseTurtle(await response.text(), profile.href)
  const issuer = objects(graph, webId, SOLID_OIDC_ISSUER)[0]
  if (!issuer) throw new Error(`no solid:oidcIssuer in ${webId}`)
  return issuer.value
}

// ------------------------------------------------------------ fetching

const ACCEPT = [
  'text/markdown',
  'text/turtle',
  'application/ld+json;q=0.9',
  'application/sparql-results+json;q=0.9',
  '*/*;q=0.5'
].join(', ')

/** GET with an Accept that omits text/html; Resource from body and
 *  headers (Content-Type, Link rel=type, Last-Modified, WAC-Allow).
 *  Rejects with the status on a non-2xx answer. */
export async function fetchResource(fetch: Fetch, iri: string): Promise<Resource> {
  const response = await fetch(iri, { headers: { accept: ACCEPT } })
  if (!response.ok) {
    throw Object.assign(new Error(`${response.status} ${iri}`), { status: response.status })
  }
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  const mediaType = contentType.split(';', 1)[0]!.trim().toLowerCase()
  const textual = mediaType.startsWith('text/') || /[/+]json$|[/+]xml$/.test(mediaType)
  const body = textual ? await response.text() : new Uint8Array(await response.arrayBuffer())

  const meta: Quad[] = [
    { subject: named(iri), predicate: named(MA_FORMAT), object: literal(mediaType) }
  ]
  for (const type of linkRelations(response.headers.get('link'), 'type')) {
    meta.push({ subject: named(iri), predicate: named(RDF_TYPE), object: named(type) })
  }
  const modified = response.headers.get('last-modified')
  if (modified && !Number.isNaN(Date.parse(modified))) {
    meta.push({
      subject: named(iri),
      predicate: named(DC_MODIFIED),
      object: literal(new Date(modified).toISOString(), XSD_DATETIME)
    })
  }
  const container = meta.some(
    (q) => q.predicate.value === RDF_TYPE && q.object.value === LDP_CONTAINER
  )
  if (container && mediaType === 'text/turtle' && typeof body === 'string') {
    meta.push(...parseTurtle(body, iri))
  }

  return { iri, contentType, body, meta, allow: wacAllow(response.headers.get('wac-allow')) }
}

function linkRelations(header: string | null, rel: string): string[] {
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

function wacAllow(header: string | null): Resource['allow'] {
  const m = header && /user="([^"]*)"/.exec(header)
  if (!m) return []
  return m[1]!
    .split(/\s+/)
    .filter((mode): mode is Resource['allow'][number] =>
      ['read', 'write', 'append', 'control'].includes(mode)
    )
}

const named = (value: string): Term => ({ termType: 'NamedNode', value })
const literal = (value: string, datatype = XSD_STRING): Term => ({
  termType: 'Literal',
  value,
  datatype
})

/** Turtle to quads. Registered by this host; the core has no RDF library. */
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

function parseTurtle(text: string, baseIRI: string): Quad[] {
  const parser = new N3Parser({ baseIRI })
  return parser.parse(text).map((q) => {
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

// ---------------------------------------------------------------- boot

/** Reads the host document and the location, opens the session, registers
 *  the bundle's views, filtered and ordered by the document's `views`,
 *  mounts the resource into `root`, installs navigation and the chrome.
 *  A 401 without a session says so in the region; login is the chrome's. */
export async function boot(chrome: Element, root: Element): Promise<void> {
  const config = readConfig(document)
  const session = await createSession()
  const { iri, hint } = addressOf(location.href)
  void applySnippets(session.fetch)

  const bundle: View[] = [
    markdownView({ sparqlEndpoint: config.sparqlEndpoint, webId: session.webId ?? '' }),
    containerView,
    fallbackView,
    landingView
  ]
  const byId = new Map(bundle.map((view) => [view.id, view]))
  const renderer = createRenderer({
    parsers: [turtleParser()],
    views: config.views ? config.views.flatMap((id) => byId.get(id) ?? []) : bundle,
    rules: config.rules
  })
  const runtime = createRuntime(renderer, (target) => fetchResource(session.fetch, target))
  installNavigation(runtime, root)
  installChrome(chrome, session, config.issuer, runtime)

  try {
    await runtime.mount(root, iri, hint)
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 401 && !session.webId) {
      writeHtml(root, '<p class="login-needed">This resource needs a login.</p>')
      return
    }
    const message = e instanceof Error ? e.message : String(e)
    writeHtml(root, `<p class="error">${escapeText(message)}</p>`)
  }
}

// The vault's own CSS snippets, from the pod: Obsidian's appearance.json
// names them, and the shell emits Obsidian's class names and variables.
async function applySnippets(fetch: Fetch): Promise<void> {
  try {
    const base = new URL('/.obsidian/', location.href)
    const appearance = (await (await fetch(new URL('appearance.json', base).href)).json()) as {
      enabledCssSnippets?: string[]
    }
    for (const name of appearance.enabledCssSnippets ?? []) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = new URL(`snippets/${name}.css`, base).href
      document.head.append(link)
    }
  } catch {
    // No snippets, or none readable: the shell's defaults stay.
  }
}

/** as:View events from the runtime and popstate drive the address and
 *  the region: another resource is a `mount`, the same resource with a
 *  different fragment is a `dispatch` and no refetch. */
export function installNavigation(runtime: Runtime, root: Element): void {
  const current = () => runtime.instances().find((i) => i.region === root)

  runtime.listen((event) => {
    if (event.type !== AS.View || typeof event.object !== 'string') return
    const url = typeof event.target === 'string' ? event.target : event.object
    const address = addressFor(url)
    if (current()?.iri === address.iri) {
      history.replaceState(null, '', address.href)
      return
    }
    history.pushState(null, '', address.href)
    void runtime.mount(root, address.iri, address.hint)
  })

  window.addEventListener('popstate', () => {
    const { iri, hint } = addressOf(location.href)
    if (current()?.iri === iri) {
      void runtime.dispatch({ type: AS.View, object: iri, target: location.href })
    } else {
      void runtime.mount(root, iri, hint)
    }
  })
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
