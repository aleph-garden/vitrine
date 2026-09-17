// Obsidian-flavored Markdown as a View.

import type { Context, View } from '@aleph-garden/view'
import { parse as parseYaml } from 'yaml'

export type MarkdownOptions = {
  /** Where `sparql` code blocks are sent: an endpoint IRI the host's
   *  resolve answers, with the query appended as `?query=`. */
  sparqlEndpoint: string
  /** Whose type index names the note containers. */
  webId: string
}

export function markdownView(options: MarkdownOptions): View {
  throw new Error('unimplemented')
}

// ------------------------------------------------------- wikilink index
// Basename to IRI over the containers the WebID's private type index
// registers for schema:NoteDigitalDocument. Built lazily through
// `resolve`, held per WebID for the page lifetime.

export const NOTE_CLASS = 'https://schema.org/NoteDigitalDocument'

export type WikilinkIndex = {
  /** IRI for an Obsidian link target name, or undefined when unresolved. */
  lookup(name: string): string | undefined
}

export function wikilinkIndex(ctx: Context, webId: string): Promise<WikilinkIndex> {
  throw new Error('unimplemented')
}

/** Drops the cached index for the WebID when `iri` is one of its
 *  containers. The view calls this on as:Update. */
export function invalidateWikilinkIndex(webId: string, iri: string): void {
  throw new Error('unimplemented')
}

// --------------------------------------------------------------- parsing
// Exposed for tests; the view calls them itself.

export type Wikilink = {
  name: string
  alias?: string
  heading?: string
  block?: string
  embed: boolean
}

const WIKILINK = /^(!?)\[\[([^\]|#]+)(?:#(\^?)([^\]|]*))?(?:\|([^\]]*))?\]\]$/

export function parseWikilink(source: string): Wikilink | undefined {
  const m = WIKILINK.exec(source)
  if (!m) return undefined
  const [, bang, name, caret, anchor, alias] = m
  const link: Wikilink = { name: name!.trim(), embed: bang === '!' }
  if (anchor) {
    if (caret) link.block = anchor
    else link.heading = anchor
  }
  if (alias !== undefined) link.alias = alias
  return link
}

export type Frontmatter = Record<string, unknown>

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function splitFrontmatter(markdown: string): { frontmatter: Frontmatter; body: string } {
  const m = FRONTMATTER.exec(markdown)
  if (!m) return { frontmatter: {}, body: markdown }
  const body = markdown.slice(m[0].length)
  try {
    const parsed: unknown = parseYaml(m[1]!)
    const frontmatter = parsed && typeof parsed === 'object' ? (parsed as Frontmatter) : {}
    return { frontmatter, body }
  } catch {
    return { frontmatter: {}, body }
  }
}
