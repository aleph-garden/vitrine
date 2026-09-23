// Instance bookkeeping for a DOM host: one region per instance, the handle
// hydrate returned, and the IRIs the instance resolved. Every browser host
// runs the re-render protocol from here.

import DOMPurify, { type Config } from 'dompurify'
import {
  AS,
  type Context,
  type Event,
  type Handle,
  type Renderer,
  type Resource,
  type Show
} from './index.ts'
import {
  ERROR_ATTR,
  errorHtml,
  mounting,
  placeholderHtml,
  readPlaceholder,
  TRANSCLUDE_ATTR,
  TRANSCLUDE_DEPTH,
  transclusionKey
} from './transclusion.ts'

export type Instance = {
  id: string
  iri: string
  show: Show | undefined
  region: Element
  /** The IRIs this instance hangs under, outermost first, its own last. */
  readonly chain: readonly string[]
  /** IRIs this instance resolved during its last render. */
  dependencies: ReadonlySet<string>
  dispose(): void
}

export type Runtime = {
  /** Resolves `iri`, renders it into `region`, hydrates. Disposes the
   *  instance that held the region before. Rejects when the resolve
   *  rejects, so the host can act on a 401. */
  mount(region: Element, iri: string, show?: Show): Promise<Instance>
  /** Delivers the event to every instance. A handle with `update` answers
   *  with a patch or nothing; an instance without one is re-rendered when
   *  the event names a dependency (as:Update) or changes its show on the
   *  same resource (as:View). Navigation to another resource is the
   *  host's: it calls `mount`. */
  dispatch(event: Event): Promise<void>
  instances(): Instance[]
  /** A host listener sees every event before the instances do. */
  listen(listener: (event: Event) => void): () => void
}

/** Set by the runtime on every region it holds: the id of the view that drew
 *  it, and the IRI of the resource. A stylesheet scopes a view's rules with
 *  `@scope ([data-aleph-view="<view id>"]) to ([data-aleph-view])`, which
 *  keeps them out of a transcluded child. A region whose mount failed
 *  carries neither. */
export const VIEW_ATTR = 'data-aleph-view'
export const IRI_ATTR = 'data-aleph-iri'

/** Inside a region, a click on an `<a href>` whose URL is `http:` or
 *  `https:` becomes an as:View event, whatever its origin, with the link's
 *  IRI as object and its fragment in the show. The runtime installs this on
 *  every region it mounts. A view marks a link the browser should follow
 *  with `target` or `download`, a click carrying a modifier key or a
 *  non-primary button belongs to the browser too, and so does a link with
 *  any other protocol (`mailto:`, `tel:`, …). */
export function linkEvents(region: Element, emit: (event: Event) => void): () => void {
  const onClick = (event: globalThis.Event) => {
    const e = event as MouseEvent
    const anchor = (e.target as Element | null)?.closest?.('a[href]')
    if (!anchor || !region.contains(anchor)) return
    if (anchor.hasAttribute('target') || anchor.hasAttribute('download')) return
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button > 0) return
    const url = new URL(anchor.getAttribute('href')!, region.ownerDocument.baseURI)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    e.preventDefault()
    const target = url.href
    url.hash = ''
    emit({ type: AS.View, object: url.href, target })
  }
  region.addEventListener('click', onClick)
  return () => region.removeEventListener('click', onClick)
}

// The allowlist view HTML passes through: the profiles the views emit, plus
// the two attributes DOMPurify strips although a view needs them (the
// landing view's docs links carry `target`, the fallback view's offer of a
// binary carries `download`), plus the two MathML wrapper elements the
// `mathMl` profile itself excludes (KaTeX emits a formula's TeX source inside
// `<semantics><annotation>`, and without them the sanitizer strips the
// wrappers and leaves the TeX as visible text). `data-*` is allowed by
// DOMPurify's default and must stay allowed, since `data-slot` is the patch
// protocol.
//
// `aleph` is the one policy that produces the TrustedHTML the document
// receives; its `createHTML` is this sanitizer. DOMPurify creates its own
// `dompurify` policy to label the string it parses internally, and that parse
// result is sanitized before any of it leaves `createHTML`. Both names sit in
// the CSP's `trusted-types` directive.
const ALLOWLIST = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  ADD_ATTR: ['target', 'download'],
  ADD_TAGS: ['semantics', 'annotation']
} satisfies Config

// The slice of the Trusted Types API the runtime uses. `createHTML` answers a
// TrustedHTML, which the innerHTML sink takes in place of a string; typing it
// as a string keeps the assignment in writeHtml cast-free.
type HtmlPolicy = { createHTML(html: string): string }
type TrustedTypes = { createPolicy(name: string, rules: HtmlPolicy): HtmlPolicy }

let policy: HtmlPolicy | undefined
let policyResolved = false

/** The one `aleph` policy, created on the first write. On a page whose
 *  `require-trusted-types-for 'script'` CSP omits the policy name,
 *  `createPolicy` fails and the write then fails too. On a page without
 *  Trusted Types the write uses the sanitized string directly. */
function trustedPolicy(): HtmlPolicy | undefined {
  if (policyResolved) return policy
  policyResolved = true
  const api = (globalThis as { trustedTypes?: TrustedTypes }).trustedTypes
  if (!api?.createPolicy) return undefined
  try {
    policy = api.createPolicy('aleph', {
      createHTML: (html) => DOMPurify.sanitize(html, ALLOWLIST)
    })
  } catch {
    policy = undefined
  }
  return policy
}

/** Writes view HTML into `target` through the sanitizer. Every mount and
 *  every patch goes through here; views never write the region. Exported
 *  so that a view's own DOM writes in hydrate can use the same allowlist. */
export function writeHtml(target: Element, html: string): void {
  const active = trustedPolicy()
  target.innerHTML = active ? active.createHTML(html) : DOMPurify.sanitize(html, ALLOWLIST)
}

export type Resolve = (iri: string) => Promise<Resource>

export type RuntimeOptions = {
  /** How deep the runtime mounts children on its own; past it a placeholder
   *  is deferred. Default TRANSCLUDE_DEPTH. */
  depth?: number
}

/** `resolve` is the host's; the runtime wraps it per instance to track
 *  dependencies and provides `emit` and `events` on top. */
export function createRuntime(
  renderer: Renderer,
  resolve: Resolve,
  options: RuntimeOptions = {}
): Runtime {
  const limit = options.depth ?? TRANSCLUDE_DEPTH
  type Live = Instance & {
    ctx: Context
    handle: Handle | void
    off: () => void
    deps: Set<string>
    push: (e: Event) => void
    children: Set<Live>
  }
  const live = new Map<string, Live>()
  const listeners = new Set<(event: Event) => void>()
  let counter = 0

  const dispatch = async (event: Event): Promise<void> => {
    for (const listener of [...listeners]) listener(event)
    for (const inst of [...live.values()]) {
      inst.push(event)
      if (inst.handle?.update) {
        const patch = inst.handle.update(event)
        if (!patch) continue
        const slot =
          patch.slot === undefined
            ? inst.region
            : inst.region.querySelector(`[data-slot="${patch.slot}"]`)
        if (slot) writeHtml(slot, patch.html)
        continue
      }
      if (event.type === AS.Update && event.object !== undefined) {
        if (event.object === inst.iri || inst.deps.has(event.object))
          await rerender(inst, inst.show)
      } else if (event.type === AS.View && event.object === inst.iri) {
        const show = showFrom(event, inst.show)
        if (show.fragment !== inst.show?.fragment || show.view !== inst.show?.view)
          await rerender(inst, show)
      }
    }
  }

  const rerender = async (inst: Live, show: Show | undefined): Promise<void> => {
    inst.handle?.dispose?.()
    inst.off()
    inst.deps.clear()
    inst.show = show
    const { view, rendered } = await draw(await resolve(inst.iri), inst.ctx, show)
    const held = new Map([...inst.children].map((child) => [keyOf(child), child]))
    inst.children.clear()
    paint(inst.region, view, inst.iri, rendered.html)
    await mountChildren(inst, held)
    for (const child of held.values()) child.dispose()
    inst.off = linkEvents(inst.region, inst.ctx.emit)
    inst.handle = rendered.hydrate?.(inst.region, inst.ctx)
  }

  const keyOf = (inst: Live) => transclusionKey(inst.iri, inst.show)

  /** `renderer.render`, with the view it selected kept for the region's
   *  mark. The two must select the same way. */
  const draw = async (resource: Resource, ctx: Context, show: Show | undefined) => {
    const parsed = await renderer.parse(resource)
    const view = renderer.select(parsed, show)
    if (!view) throw new Error(`no view applies to ${resource.iri} (${resource.contentType})`)
    return { view: view.id, rendered: await view.render(parsed, ctx, show) }
  }

  const paint = (region: Element, view: string, iri: string, html: string) => {
    writeHtml(region, html)
    region.setAttribute(VIEW_ATTR, view)
    region.setAttribute(IRI_ATTR, iri)
  }

  /** Every placeholder the instance's own HTML carries becomes a child
   *  instance, before the instance hydrates, so a parent that reads its
   *  children in hydrate finds them. A child that cannot be resolved fills
   *  its own placeholder and leaves the parent standing.
   *
   *  `held` are the children of the render this one replaces. A key that is
   *  still there keeps its instance: its region takes the placeholder's
   *  place and nothing on the child is called. Without that, one change in a
   *  parent would cascade into every child below it. */
  const mountChildren = async (parent: Live, held?: Map<string, Live>): Promise<void> => {
    for (const element of parent.region.querySelectorAll(`[${TRANSCLUDE_ATTR}]`)) {
      const found = readPlaceholder(element)
      if (!found || found.deferred) continue
      const key = transclusionKey(found.iri, found.show)
      const kept = held?.get(key)
      if (kept) {
        held?.delete(key)
        element.replaceWith(kept.region)
        parent.children.add(kept)
        continue
      }
      try {
        parent.children.add(await mount(element, found.iri, found.show, parent))
      } catch (error) {
        element.setAttribute(ERROR_ATTR, '')
        writeHtml(element, errorHtml(found.iri, error))
      }
    }
  }

  const mount = async (region: Element, iri: string, show?: Show, parent?: Live): Promise<Live> => {
    for (const inst of [...live.values()]) if (inst.region === region) inst.dispose()
    const id = `instance-${++counter}`
    const queue = eventQueue()
    const chain = [...(parent?.chain ?? []), iri]
    // Deferred so an emit inside hydrate reaches the emitter’s own handle too.
    const { ctx, dependencies } = instanceContext(
      (target) => resolve(target).then(renderer.parse),
      (e) => queueMicrotask(() => void dispatch(e)),
      queue.iterable,
      async (childIri, childShow) => {
        const how = mounting(chain, childIri, limit)
        return placeholderHtml(childIri, childShow, how === 'auto' ? undefined : how)
      }
    )
    const inst = {
      id,
      iri,
      show,
      region,
      chain,
      dependencies,
      deps: dependencies as Set<string>,
      ctx,
      handle: undefined as Handle | void,
      off: () => {},
      push: queue.push,
      children: new Set<Live>(),
      dispose() {
        for (const child of [...inst.children]) child.dispose()
        inst.children.clear()
        parent?.children.delete(inst)
        inst.handle?.dispose?.()
        inst.off()
        queue.close()
        live.delete(id)
      }
    } satisfies Live
    const { view, rendered } = await resolve(iri)
      .then((resource) => draw(resource, ctx, show))
      .catch((error: unknown) => {
        region.removeAttribute(VIEW_ATTR)
        region.removeAttribute(IRI_ATTR)
        throw error
      })
    paint(region, view, iri, rendered.html)
    live.set(id, inst)
    await mountChildren(inst)
    inst.off = linkEvents(region, ctx.emit)
    inst.handle = rendered.hydrate?.(region, ctx)
    return inst
  }

  return {
    mount: (region, iri, show) => mount(region, iri, show),
    dispatch,
    instances: () => [...live.values()],
    listen(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

function showFrom(event: Event, previous: Show | undefined): Show {
  const target = typeof event.target === 'string' ? event.target : undefined
  const hash = target?.split('#')[1]
  const view = typeof event.view === 'string' ? event.view : previous?.view
  return { view, fragment: hash === undefined ? previous?.fragment : decodeURIComponent(hash) }
}

/** The context a runtime hands one instance: resolve with tracking, emit
 *  into dispatch, events from it. Exposed so a view test can build one. */
export function instanceContext(
  resolve: Resolve,
  emit: (event: Event) => void,
  events: AsyncIterable<Event>,
  transclude: (iri: string, show?: Show) => Promise<string>
): { ctx: Context; dependencies: ReadonlySet<string> } {
  const dependencies = new Set<string>()
  const ctx: Context = {
    resolve(iri) {
      dependencies.add(iri)
      return resolve(iri)
    },
    emit,
    events,
    transclude
  }
  return { ctx, dependencies }
}

function eventQueue() {
  const buffer: Event[] = []
  let wake: (() => void) | undefined
  let closed = false
  const push = (e: Event) => {
    buffer.push(e)
    wake?.()
  }
  const close = () => {
    closed = true
    wake?.()
  }
  const iterable: AsyncIterable<Event> = {
    async *[Symbol.asyncIterator]() {
      while (!closed) {
        if (buffer.length) yield buffer.shift()!
        else await new Promise<void>((r) => (wake = r))
      }
    }
  }
  return { push, close, iterable }
}
