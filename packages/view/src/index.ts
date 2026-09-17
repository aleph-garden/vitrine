// Contracts and the pipeline. No RDF library, no DOM: quads are plain data,
// and everything that touches elements lives in ./dom.ts.

// ---------------------------------------------------------------- data

export type Mode = "read" | "write" | "append" | "control";

export type Term = {
  termType: "NamedNode" | "BlankNode" | "Literal";
  value: string;
  datatype?: string;
  language?: string;
  direction?: "ltr" | "rtl";
};

export type Quad = {
  subject: Term;
  predicate: Term;
  object: Term;
  graph?: Term;
};

export type Resource = {
  iri: string;
  contentType: string;
  body: string | Uint8Array;
  graph?: Quad[];
  meta: Quad[];
  allow: Mode[];
};

// ActivityStreams 2.0 activity as a plain object.
export type Event = {
  type: string;
  object?: string;
  actor?: string;
  target?: string;
  [key: string]: unknown;
};

export const AS = {
  Update: "https://www.w3.org/ns/activitystreams#Update",
  View: "https://www.w3.org/ns/activitystreams#View",
} as const;

export const ALEPH = {
  Select: "https://aleph.garden/ns/view#Select",
} as const;

// ------------------------------------------------------------- context

export type Context = {
  resolve(iri: string): Promise<Resource>;
  emit(event: Event): void;
  events: AsyncIterable<Event>;
};

// ---------------------------------------------------------------- view

export type Hint = {
  view?: string;
  fragment?: string;
};

export type Patch = {
  slot?: string;
  html: string;
};

export type Handle = {
  update?(event: Event): Patch | void;
  dispose?(): void;
};

export type Rendered = {
  html: string;
  hydrate?(root: Element, ctx: Context): Handle | void;
};

export type View = {
  id: string;
  render(resource: Resource, ctx: Context, hint?: Hint): Promise<Rendered>;
};

// -------------------------------------------------------------- parser

export type Parser = {
  contentType: string | RegExp;
  parse(resource: Resource): Promise<Quad[]>;
};

// ----------------------------------------------------------- selection

export type Condition =
  | { contentType: string | RegExp }
  | { container: boolean }
  | { type: string }
  | { ask: string };

export type Rule = {
  view: string;
  when: Condition[];
};

// ------------------------------------------------------------ pipeline

export type Registry = {
  parsers: Parser[];
  views: View[];
  rules: Rule[];
};

export type Pipeline = {
  /** Fills `graph` through the first parser whose contentType matches. */
  parse(resource: Resource): Promise<Resource>;
  /** The view the hint or the first holding rule names; undefined when none. */
  select(resource: Resource, hint?: Hint): View | undefined;
  /** parse, select, render. Rejects when no view applies. */
  render(resource: Resource, ctx: Context, hint?: Hint): Promise<Rendered>;
};

export function createPipeline(registry: Registry): Pipeline {
  throw new Error("unimplemented");
}

/** Every condition holds for the resource. `ask` never holds here. */
export function holds(condition: Condition, resource: Resource): boolean {
  throw new Error("unimplemented");
}

// ---------------------------------------------------------- quad helpers
// Plain scans over quad arrays, so that views and conditions read `meta`
// and `graph` without an RDF library.

export function objects(quads: Quad[], subject: string, predicate: string): Term[] {
  throw new Error("unimplemented");
}

export function isContainer(resource: Resource): boolean {
  throw new Error("unimplemented");
}

export function typesOf(resource: Resource): string[] {
  throw new Error("unimplemented");
}

// --------------------------------------------------------- built-in views
// Both read `meta` and `graph` as plain quads, so they live here.

export const containerView: View = {
  id: "https://aleph.garden/ns/view#Container",
  render(resource, ctx, hint) {
    throw new Error("unimplemented");
  },
};

export const fallbackView: View = {
  id: "https://aleph.garden/ns/view#Fallback",
  render(resource, ctx, hint) {
    throw new Error("unimplemented");
  },
};
