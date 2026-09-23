// The `state` a context carries, over a plain map. Kept out of the package's
// exports: the runtime and the server renderer are its only callers, and a
// view test builds its context through `instanceContext` from ./dom.ts, which
// supplies one. A test helper that needs its own map may be the reason to
// export this later.

import type { Context } from './index.ts'

/** A `state` over `values`. `changed` runs after every `set`; the runtime
 *  passes "re-render this instance" here. */
export function stateIn(
  values: Map<string, unknown>,
  changed: () => void = () => {}
): Context['state'] {
  return ((key: string, initial?: unknown) => ({
    get: () => (values.has(key) ? values.get(key) : initial),
    set(value: unknown) {
      values.set(key, value)
      changed()
    }
  })) as Context['state']
}
