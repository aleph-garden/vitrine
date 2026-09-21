// One resolve per resource, however many transclusions name it. The host
// owns the cache and decides when an entry goes; the runtime knows nothing
// about it.

import type { Resolve } from './dom.ts'

export type ResolveCache = {
  resolve: Resolve
  /** Drops the entry for `iri` without its fragment. */
  invalidate(iri: string): void
}

/** One entry per IRI without its fragment, so ten block transclusions of one
 *  note are one fetch and a fragment answers the whole resource. Overlapping
 *  resolves share the one in flight. Nothing is revalidated: an entry stands
 *  until `invalidate`, which is what an as:Update on the IRI calls for. A
 *  resolve that rejected is not kept. */
export function createResolveCache(resolve: Resolve): ResolveCache {
  const entries = new Map<string, ReturnType<Resolve>>()
  return {
    resolve(iri) {
      const key = withoutFragment(iri)
      const held = entries.get(key)
      if (held) return held
      const answer = resolve(key)
      entries.set(key, answer)
      answer.catch(() => entries.delete(key))
      return answer
    },
    invalidate(iri) {
      entries.delete(withoutFragment(iri))
    }
  }
}

function withoutFragment(iri: string): string {
  const hash = iri.indexOf('#')
  return hash === -1 ? iri : iri.slice(0, hash)
}
