// Obsidian-flavored Markdown as a View.

import {
  AS,
  type Context,
  escapeHtml,
  type Hint,
  isContainer,
  objects,
  type Rendered,
  type Resource,
  type View
} from '@aleph-garden/vitrine'
import { katex } from '@mdit/plugin-katex'
import MarkdownIt, {
  type MarkdownIt as Md,
  type StateCore,
  type StateInline,
  type Token
} from 'markdown-it'
import { parse as parseYaml } from 'yaml'

export type MarkdownOptions = {
  /** Where `sparql` code blocks are sent: an endpoint IRI the host's
   *  resolve answers, with the query appended as `?query=`. Absent: a
   *  `sparql` block renders as a code block. */
  sparqlEndpoint?: string
  /** Whose type index names the note containers. */
  webId: string
}

export const MARKDOWN_VIEW = 'https://w3id.org/aleph/ns/view#Markdown'

const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif)$/i
const EMBED_DEPTH = 3

/** What one render carries through markdown-it's env. */
type Env = {
  index: WikilinkIndex
  /** Rendered HTML per embed token. */
  embeds: Map<Token, string>
  /** Rendered HTML per sparql fence. */
  sparql: Map<Token, string>
  fragment: string | undefined
}

export function markdownView(options: MarkdownOptions): View {
  const md = createMarkdownIt()

  const renderNote = async (
    resource: Resource,
    ctx: Context,
    fragment: string | undefined,
    chain: string[]
  ): Promise<{ html: string; hasMermaid: boolean }> => {
    const source =
      typeof resource.body === 'string' ? resource.body : new TextDecoder().decode(resource.body)
    const { frontmatter, body } = splitFrontmatter(source)
    const index = await wikilinkIndex(ctx, options.webId)
    const env: Env = { index, embeds: new Map(), sparql: new Map(), fragment }
    const tokens = md.parse(body, env)

    for (const token of walk(tokens)) {
      if (token.type === 'wikilink' && linkOf(token).embed) {
        env.embeds.set(token, await renderEmbed(linkOf(token), resource, ctx, chain))
      } else if (
        token.type === 'fence' &&
        token.info.trim() === 'sparql' &&
        options.sparqlEndpoint !== undefined
      ) {
        env.sparql.set(token, await runSparql(token.content, ctx, options.sparqlEndpoint))
      }
    }

    const classes = ['markdown-preview-view', 'markdown-rendered', ...cssClasses(frontmatter)]
    const html = `<div class="${classes.map(escapeHtml).join(' ')}">${propertiesHtml(frontmatter)}${md.renderer.render(tokens, md.options, env)}</div>`
    const hasMermaid = tokens.some((t: Token) => t.type === 'fence' && t.info.trim() === 'mermaid')
    return { html, hasMermaid }
  }

  const renderEmbed = async (
    link: Wikilink,
    from: Resource,
    ctx: Context,
    chain: string[]
  ): Promise<string> => {
    const target = (await wikilinkIndex(ctx, options.webId)).lookup(link.name)
    if (!target) return unresolvedHtml(link)
    if (IMAGE.test(target)) {
      return `<img src="${escapeHtml(href(target))}" alt="${escapeHtml(link.alias ?? link.name)}">`
    }
    if (!/\.md$/i.test(target)) return linkHtml(link, target)
    const next = [...chain, from.iri]
    if (next.includes(target) || next.length > EMBED_DEPTH) return unresolvedHtml(link)
    try {
      const embedded = await ctx.resolve(target)
      const { html } = await renderNote(embedded, ctx, undefined, next)
      return `<div class="markdown-embed" data-embed="${escapeHtml(href(target))}">${html}</div>`
    } catch {
      return unresolvedHtml(link)
    }
  }

  return {
    id: MARKDOWN_VIEW,
    when: [{ contentType: 'text/markdown' }],
    async render(resource, ctx, hint?: Hint): Promise<Rendered> {
      const { html, hasMermaid } = await renderNote(resource, ctx, hint?.fragment, [])
      return {
        html,
        hydrate(root, hydrateCtx) {
          void watchContainers(hydrateCtx, options.webId)
          if (hasMermaid) void drawMermaid(root)
          if (hint?.fragment) root.querySelector('.is-flashing')?.scrollIntoView?.()
        }
      }
    }
  }
}

async function watchContainers(ctx: Context, webId: string): Promise<void> {
  for await (const event of ctx.events) {
    if (event.type === AS.Update && typeof event.object === 'string') {
      invalidateWikilinkIndex(webId, event.object)
    }
  }
}

async function drawMermaid(root: Element): Promise<void> {
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false })
  await mermaid.run({ nodes: root.querySelectorAll('pre.mermaid') })
}

// ------------------------------------------------------------ markdown-it

function createMarkdownIt(): Md {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false })
  md.use(katex, { allowInlineWithSpace: true })
  md.inline.ruler.before('link', 'wikilink', wikilinkRule)
  md.inline.ruler.after('wikilink', 'tag', tagRule)
  md.core.ruler.push('obsidian', obsidianCore)

  md.renderer.rules.wikilink = (tokens, idx, _options, env) => {
    const token = tokens[idx]!
    const link = linkOf(token)
    const e = env as Env
    if (link.embed) return e.embeds.get(token) ?? unresolvedHtml(link)
    const target = e.index.lookup(link.name)
    return target ? linkHtml(link, target) : unresolvedHtml(link)
  }

  md.renderer.rules.tag = (tokens, idx) => {
    const tag: string = tokens[idx]!.content
    return `<a class="tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</a>`
  }

  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    const info = token.info.trim()
    if (info === 'mermaid') return `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`
    if (info === 'sparql') {
      const results = (env as Env).sparql.get(token)
      if (results !== undefined) return results
    }
    return fence(tokens, idx, options, env, self)
  }

  return md
}

function linkOf(token: Token): Wikilink {
  return (token.meta as { link: Wikilink }).link
}

// [[Name]], [[Name|Alias]], [[Name#Heading]], [[Name#^block]], ![[…]]
function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  let pos = state.pos
  const embed = src.charCodeAt(pos) === 0x21 /* ! */
  if (embed) pos += 1
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false
  const end = src.indexOf(']]', pos + 2)
  if (end < 0 || end + 2 > state.posMax) return false
  const link = parseWikilink(src.slice(state.pos, end + 2))
  if (!link) return false
  if (!silent) {
    const token = state.push('wikilink', '', 0)
    token.meta = { link }
    token.content = src.slice(state.pos, end + 2)
  }
  state.pos = end + 2
  return true
}

// #tag or #nested/tag, after start of text or whitespace, never "# heading".
function tagRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const pos = state.pos
  if (src.charCodeAt(pos) !== 0x23 /* # */) return false
  const before = pos === 0 ? ' ' : src[pos - 1]!
  if (!/\s|[([]/.test(before)) return false
  const m = /^#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/u.exec(src.slice(pos, state.posMax))
  if (!m) return false
  if (!silent) {
    const token = state.push('tag', '', 0)
    token.content = m[1]!
  }
  state.pos += m[0].length
  return true
}

// Headings get their text as id (Obsidian's anchor), task items a checkbox,
// callout blockquotes become divs with a title.
function obsidianCore(state: StateCore): void {
  const tokens = state.tokens
  const env = state.env as Env
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!

    if (token.type === 'heading_open') {
      const text =
        tokens[i + 1]?.children
          ?.map((c) => c.content)
          .join('')
          .trim() ?? ''
      token.attrSet('id', text)
      if (env.fragment !== undefined && text === env.fragment)
        token.attrJoin('class', 'is-flashing')
    }

    if (token.type === 'list_item_open') {
      const inline = tokens[i + 2]
      if (tokens[i + 1]?.type === 'paragraph_open' && inline?.type === 'inline') {
        const m = /^\[([ xX])\]\s+/.exec(inline.content)
        const first = inline.children?.[0]
        if (m && first?.type === 'text') {
          const checked = m[1] !== ' '
          token.attrJoin('class', checked ? 'task-list-item is-checked' : 'task-list-item')
          first.content = first.content.slice(m[0].length)
          const box = new state.Token('html_inline', '', 0)
          box.content = `<input type="checkbox" disabled${checked ? ' checked' : ''}> `
          inline.children!.unshift(box)
        }
      }
    }

    if (token.type === 'blockquote_open') {
      const inline = tokens[i + 2]
      if (tokens[i + 1]?.type === 'paragraph_open' && inline?.type === 'inline') {
        const m = /^\[!([\w-]+)\]([+-]?)(?:[ \t]+([^\n]*))?(?:\n|$)/.exec(inline.content)
        if (m) {
          const kind = m[1]!.toLowerCase()
          token.tag = 'div'
          token.attrSet('class', 'callout')
          token.attrSet('data-callout', kind)
          if (m[2]) token.attrSet('data-callout-fold', m[2])
          const title = m[3]?.trim() || kind.charAt(0).toUpperCase() + kind.slice(1)
          const titleToken = new state.Token('html_block', '', 0)
          titleToken.content = `<div class="callout-title"><div class="callout-title-inner">${escapeHtml(title)}</div></div>\n`
          const rest = inline.content.slice(m[0].length)
          dropPrefix(inline.children ?? [], m[0].length)
          inline.content = rest
          const close = findClose(tokens, i + 1, 'paragraph_open', 'paragraph_close')
          if (!rest.trim() && close !== undefined) tokens.splice(i + 1, close - i)
          tokens.splice(i + 1, 0, titleToken)
          const end = findClose(tokens, i, 'blockquote_open', 'blockquote_close')
          if (end !== undefined) tokens[end]!.tag = 'div'
        }
      }
    }
  }
}

// Removes the first `count` source characters from a run of inline children.
function dropPrefix(children: Token[], count: number): void {
  let remaining = count
  while (children.length && remaining > 0) {
    const c = children[0]!
    const len = c.type === 'softbreak' || c.type === 'hardbreak' ? 1 : c.content.length
    if (len <= remaining) {
      children.shift()
      remaining -= len
    } else {
      c.content = c.content.slice(remaining)
      remaining = 0
    }
  }
}

function findClose(tokens: Token[], from: number, open: string, close: string): number | undefined {
  let depth = 0
  for (let j = from; j < tokens.length; j++) {
    if (tokens[j]!.type === open) depth += 1
    if (tokens[j]!.type === close) {
      depth -= 1
      if (depth === 0) return j
    }
  }
  return undefined
}

function* walk(tokens: Token[]): Generator<Token> {
  for (const t of tokens) {
    yield t
    if (t.children) yield* walk(t.children)
  }
}

// ------------------------------------------------------------- rendering

function href(iri: string, anchor?: string): string {
  const base = new URL(iri).href
  return anchor === undefined ? base : `${base}#${anchor}`
}

function linkHtml(link: Wikilink, target: string): string {
  const anchor = link.block !== undefined ? `^${link.block}` : link.heading
  const text = link.alias ?? (link.heading ? `${link.name} > ${link.heading}` : link.name)
  return `<a class="internal-link" href="${escapeHtml(href(target, anchor))}">${escapeHtml(text)}</a>`
}

function unresolvedHtml(link: Wikilink): string {
  return `<a class="internal-link is-unresolved">${escapeHtml(link.alias ?? link.name)}</a>`
}

function cssClasses(frontmatter: Frontmatter): string[] {
  return list(frontmatter.cssclasses ?? frontmatter.cssclass)
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean)
  return []
}

function propertiesHtml(frontmatter: Frontmatter): string {
  const entries = Object.entries(frontmatter)
  if (entries.length === 0) return ''
  const rows = entries.map(([key, value]) => {
    const rendered =
      key === 'tags'
        ? list(value)
            .map((t) => `<a class="tag" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</a>`)
            .join(' ')
        : escapeHtml(Array.isArray(value) ? value.map(String).join(', ') : String(value ?? ''))
    return `<div class="metadata-property" data-property-key="${escapeHtml(key)}"><span class="metadata-property-key">${escapeHtml(key)}</span><span class="metadata-property-value">${rendered}</span></div>`
  })
  return `<div class="metadata-container">${rows.join('')}</div>`
}

async function runSparql(query: string, ctx: Context, endpoint: string): Promise<string> {
  const iri = `${endpoint}?query=${encodeURIComponent(query.trim())}`
  try {
    const result = await ctx.resolve(iri)
    const text =
      typeof result.body === 'string' ? result.body : new TextDecoder().decode(result.body)
    const json = JSON.parse(text) as {
      head?: { vars?: string[] }
      results?: { bindings?: Record<string, { type: string; value: string }>[] }
    }
    if (!json.results?.bindings || !json.head?.vars) {
      return `<pre class="sparql-results">${escapeHtml(text)}</pre>\n`
    }
    const vars = json.head.vars
    const head = vars.map((v) => `<th>${escapeHtml(v)}</th>`).join('')
    const rows = json.results.bindings
      .map((b) => `<tr>${vars.map((v) => `<td>${cellHtml(b[v])}</td>`).join('')}</tr>`)
      .join('')
    return `<table class="sparql-results"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>\n`
  } catch (e) {
    return `<pre class="sparql-error">${escapeHtml(e instanceof Error ? e.message : String(e))}</pre>\n`
  }
}

function cellHtml(binding: { type: string; value: string } | undefined): string {
  if (!binding) return ''
  if (binding.type === 'uri') {
    return `<a href="${escapeHtml(binding.value)}">${escapeHtml(binding.value)}</a>`
  }
  return escapeHtml(binding.value)
}

// ------------------------------------------------------- wikilink index
// Basename to IRI over the containers the WebID's private type index
// registers for schema:NoteDigitalDocument. Built lazily through
// `resolve`, held per WebID for the page lifetime.

export const NOTE_CLASS = 'https://schema.org/NoteDigitalDocument'

const SOLID = 'http://www.w3.org/ns/solid/terms#'
const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'

export type WikilinkIndex = {
  /** IRI for an Obsidian link target name, or undefined when unresolved. */
  lookup(name: string): string | undefined
}

type CachedIndex = { index: Promise<WikilinkIndex>; containers: Set<string> }
const cache = new Map<string, CachedIndex>()

export function wikilinkIndex(ctx: Context, webId: string): Promise<WikilinkIndex> {
  const cached = cache.get(webId)
  if (cached) return cached.index
  const containers = new Set<string>()
  const entry: CachedIndex = { index: buildIndex(ctx, webId, containers), containers }
  cache.set(webId, entry)
  return entry.index
}

/** Drops the cached index for the WebID when `iri` is one of its
 *  containers. The view calls this on as:Update. */
export function invalidateWikilinkIndex(webId: string, iri: string): void {
  const cached = cache.get(webId)
  if (cached?.containers.has(iri)) cache.delete(webId)
}

async function buildIndex(
  ctx: Context,
  webId: string,
  containers: Set<string>
): Promise<WikilinkIndex> {
  const byPath = new Map<string, string>()
  const byBase = new Map<string, string>()

  const add = (root: string, iri: string) => {
    const rel = decodeURIComponent(iri.slice(root.length))
    const base = rel.split('/').pop()!
    for (const [map, key] of [
      [byPath, rel],
      [byBase, base]
    ] as const) {
      for (const k of [key.replace(/\.md$/i, ''), key]) {
        if (!map.has(k.toLowerCase())) map.set(k.toLowerCase(), iri)
      }
    }
  }

  const walkContainer = async (root: string, iri: string): Promise<void> => {
    containers.add(iri)
    let container: Resource
    try {
      container = await ctx.resolve(iri)
    } catch {
      return
    }
    for (const child of objects(container.meta, iri, LDP_CONTAINS)) {
      const childIsContainer =
        child.value.endsWith('/') || isContainer({ ...container, iri: child.value })
      if (childIsContainer) await walkContainer(root, child.value)
      else add(root, child.value)
    }
  }

  try {
    const profile = await ctx.resolve(webId.split('#')[0]!)
    for (const typeIndex of objects(profile.graph ?? [], webId, `${SOLID}privateTypeIndex`)) {
      const registry = await ctx.resolve(typeIndex.value)
      const graph = registry.graph ?? []
      const registrations = graph
        .filter((q) => q.predicate.value === `${SOLID}forClass` && q.object.value === NOTE_CLASS)
        .map((q) => q.subject.value)
      for (const registration of registrations) {
        for (const root of objects(graph, registration, `${SOLID}instanceContainer`)) {
          await walkContainer(root.value, root.value)
        }
      }
    }
  } catch {
    // A profile or type index that cannot be read leaves the index empty;
    // links then render unresolved and the note itself still shows.
  }

  return {
    lookup(name) {
      const key = name.trim().toLowerCase()
      return byPath.get(key) ?? byBase.get(key) ?? byBase.get(key.split('/').pop()!)
    }
  }
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
