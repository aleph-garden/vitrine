// Instance bookkeeping for a DOM host: one region per instance, the handle
// hydrate returned, and the IRIs the instance resolved. Every browser host
// runs the re-render protocol from here.

import type { Context, Event, Hint, Pipeline, Resource } from "./index.ts";

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
  /** Resolves `iri`, renders it into `region`, hydrates. Rejects when the
   *  resolve rejects, so the host can act on a 401. */
  mount(region: Element, iri: string, hint?: Hint): Promise<Instance>;
  /** Delivers the event to every instance. A handle with `update` answers
   *  with a patch or nothing; an instance without one is re-rendered when
   *  the event names a dependency (as:Update) or changes its hint on the
   *  same resource (as:View). */
  dispatch(event: Event): Promise<void>;
  instances(): Instance[];
};

export type Resolve = (iri: string) => Promise<Resource>;

/** `resolve` is the host's; the runtime wraps it per instance to track
 *  dependencies and provides `emit` and `events` on top. */
export function createRuntime(pipeline: Pipeline, resolve: Resolve): Runtime {
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
