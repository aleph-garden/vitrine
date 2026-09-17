// The browser host. Served by the pod under the IRI of whatever resource
// was requested; owns session, fetching, navigation, and the one region.

import type { Parser, Resource } from "@aleph-garden/view";

// ------------------------------------------------------------- session

export type Session = {
  webId: string | undefined;
  /** fetch with the Solid-OIDC token attached when logged in. */
  fetch: typeof fetch;
  /** Redirects to the issuer; the page comes back with a session. */
  login(): Promise<never>;
};

export function createSession(issuer: string): Promise<Session> {
  throw new Error("unimplemented");
}

// ------------------------------------------------------------ fetching

/** GET with an Accept that omits text/html; Resource from body and
 *  headers (Content-Type, Link rel=type, Last-Modified, WAC-Allow).
 *  Rejects with the status on a non-2xx answer. */
export function fetchResource(fetch: typeof globalThis.fetch, iri: string): Promise<Resource> {
  throw new Error("unimplemented");
}

/** Turtle to quads. Registered by this host; the core has no RDF library. */
export function turtleParser(): Parser {
  throw new Error("unimplemented");
}

// ---------------------------------------------------------------- boot

/** Reads location, opens the session, mounts the resource into `root`,
 *  installs navigation. Shows the login control instead on a 401 without
 *  a session. */
export function boot(root: Element): Promise<void> {
  throw new Error("unimplemented");
}

/** Same-origin link clicks and popstate become as:View events; the
 *  address follows. A fragment change on the same resource emits without
 *  a refetch. */
export function installNavigation(root: Element, navigate: (iri: string) => Promise<void>): void {
  throw new Error("unimplemented");
}
