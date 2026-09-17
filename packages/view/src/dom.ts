// Instance bookkeeping for a DOM host: one region per instance, the handle
// hydrate returned, and the IRIs the instance resolved. Every browser host
// runs the re-render protocol from here.

import {
  AS,
  type Context,
  type Event,
  type Handle,
  type Hint,
  type Renderer,
  type Resource
} from './index.ts'

export type Instance = {
  id: string
  iri: string
  hint: Hint | undefined
  region: Element
  /** IRIs this instance resolved during its last render. */
  dependencies: ReadonlySet<string>
  dispose(): void
}

export type Runtime = {
  /** Resolves `iri`, renders it into `region`, hydrates. Disposes the
   *  instance that held the region before. Rejects when the resolve
   *  rejects, so the host can act on a 401. */
  mount(region: Element, iri: string, hint?: Hint): Promise<Instance>
  /** Delivers the event to every instance. A handle with `update` answers
   *  with a patch or nothing; an instance without one is re-rendered when
   *  the event names a dependency (as:Update) or changes its hint on the
   *  same resource (as:View). Navigation to another resource is the
   *  host's: it calls `mount`. */
  dispatch(event: Event): Promise<void>
  instances(): Instance[]
  /** A host listener sees every event before the instances do. */
  listen(listener: (event: Event) => void): () => void
}

/** Inside a region, a click on a same-origin `<a href>` becomes an as:View
 *  event with the link's IRI as object and its fragment in the hint. The
 *  runtime installs this on every region it mounts; a view that wants
 *  other link semantics stops propagation in its own hydrate. */
export function linkEvents(region: Element, emit: (event: Event) => void): () => void {
  const onClick = (e: globalThis.Event) => {
    const anchor = (e.target as Element | null)?.closest?.('a[href]')
    if (!anchor || !region.contains(anchor)) return
    const url = new URL(anchor.getAttribute('href')!, region.ownerDocument.baseURI)
    if (url.origin !== location.origin) return
    e.preventDefault()
    const target = url.href
    url.hash = ''
    emit({ type: AS.View, object: url.href, target })
  }
  region.addEventListener('click', onClick)
  return () => region.removeEventListener('click', onClick)
}

export type Resolve = (iri: string) => Promise<Resource>

/** `resolve` is the host's; the runtime wraps it per instance to track
 *  dependencies and provides `emit` and `events` on top. */
export function createRuntime(renderer: Renderer, resolve: Resolve): Runtime {
  type Live = Instance & {
    ctx: Context
    handle: Handle | void
    off: () => void
    deps: Set<string>
    push: (e: Event) => void
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
        if (slot) slot.innerHTML = patch.html
        continue
      }
      if (event.type === AS.Update && event.object !== undefined) {
        if (event.object === inst.iri || inst.deps.has(event.object))
          await rerender(inst, inst.hint)
      } else if (event.type === AS.View && event.object === inst.iri) {
        const hint = hintFrom(event, inst.hint)
        if (hint.fragment !== inst.hint?.fragment || hint.view !== inst.hint?.view)
          await rerender(inst, hint)
      }
    }
  }

  const rerender = async (inst: Live, hint: Hint | undefined): Promise<void> => {
    inst.handle?.dispose?.()
    inst.off()
    inst.deps.clear()
    inst.hint = hint
    const resource = await resolve(inst.iri)
    const rendered = await renderer.render(resource, inst.ctx, hint)
    inst.region.innerHTML = rendered.html
    inst.off = linkEvents(inst.region, inst.ctx.emit)
    inst.handle = rendered.hydrate?.(inst.region, inst.ctx)
  }

  const mount = async (region: Element, iri: string, hint?: Hint): Promise<Instance> => {
    for (const inst of [...live.values()]) if (inst.region === region) inst.dispose()
    const id = `instance-${++counter}`
    const queue = eventQueue()
    // Deferred so an emit inside hydrate reaches the emitter’s own handle too.
    const { ctx, dependencies } = instanceContext(
      resolve,
      (e) => queueMicrotask(() => void dispatch(e)),
      queue.iterable
    )
    const inst = {
      id,
      iri,
      hint,
      region,
      dependencies,
      deps: dependencies as Set<string>,
      ctx,
      handle: undefined as Handle | void,
      off: () => {},
      push: queue.push,
      dispose() {
        inst.handle?.dispose?.()
        inst.off()
        queue.close()
        live.delete(id)
      }
    } satisfies Live
    const resource = await resolve(iri)
    const rendered = await renderer.render(resource, ctx, hint)
    region.innerHTML = rendered.html
    live.set(id, inst)
    inst.off = linkEvents(region, ctx.emit)
    inst.handle = rendered.hydrate?.(region, ctx)
    return inst
  }

  return {
    mount,
    dispatch,
    instances: () => [...live.values()],
    listen(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

function hintFrom(event: Event, previous: Hint | undefined): Hint {
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
  events: AsyncIterable<Event>
): { ctx: Context; dependencies: ReadonlySet<string> } {
  const dependencies = new Set<string>()
  const ctx: Context = {
    resolve(iri) {
      dependencies.add(iri)
      return resolve(iri)
    },
    emit,
    events
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
