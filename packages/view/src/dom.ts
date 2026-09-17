// Instance bookkeeping for a DOM host: one region per instance, the handle
// hydrate returned, and the IRIs the instance resolved. Every browser host
// runs the re-render protocol from here.

import type { Context, Event, Hint, Renderer, Resource } from "./index.ts";

export type Instance = {
  id: string;
  iri: string;
  hint: Hint | undefined;
  region: Element;
  /** IRIs this instance resolved during its last render. */
  dependencies: ReadonlySet<string>;
  dispose(): void;
};

export type Runtime = {
  /** Resolves `iri`, renders it into `region`, hydrates. Disposes the
   *  instance that held the region before. Rejects when the resolve
   *  rejects, so the host can act on a 401. */
  mount(region: Element, iri: string, hint?: Hint): Promise<Instance>;
  /** Delivers the event to every instance. A handle with `update` answers
   *  with a patch or nothing; an instance without one is re-rendered when
   *  the event names a dependency (as:Update) or changes its hint on the
   *  same resource (as:View). Navigation to another resource is the
   *  host's: it calls `mount`. */
  dispatch(event: Event): Promise<void>;
  instances(): Instance[];
};

/** Inside a region, a click on a same-origin `<a href>` becomes an as:View
 *  event with the link's IRI as object and its fragment in the hint. The
 *  runtime installs this on every region it mounts; a view that wants
 *  other link semantics stops propagation in its own hydrate. */
export function linkEvents(region: Element, emit: (event: Event) => void): () => void {
  throw new Error("unimplemented");
}

export type Resolve = (iri: string) => Promise<Resource>;

/** `resolve` is the host's; the runtime wraps it per instance to track
 *  dependencies and provides `emit` and `events` on top. */
export function createRuntime(renderer: Renderer, resolve: Resolve): Runtime {
  throw new Error("unimplemented");
}

/** The context a runtime hands one instance: resolve with tracking, emit
 *  into dispatch, events from it. Exposed so a view test can build one. */
export function instanceContext(
  resolve: Resolve,
  emit: (event: Event) => void,
  events: AsyncIterable<Event>,
): { ctx: Context; dependencies: ReadonlySet<string> } {
  throw new Error("unimplemented");
}
