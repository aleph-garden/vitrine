// A host without a DOM. It answers `transclude` by rendering the child
// there and then, so one finished document comes out, and stops where a
// browser runtime would stop: an ancestor and anything past the depth stay
// placeholders, which a browser expands later.

import type { Resolve } from './dom.ts'
import { type Context, escapeHtml, type Hint, type Renderer } from './index.ts'
import {
  ERROR_ATTR,
  errorHtml,
  mounting,
  placeholderHtml,
  TRANSCLUDE_ATTR,
  TRANSCLUDE_DEPTH
} from './transclusion.ts'

const nothing: AsyncIterable<never> = { async *[Symbol.asyncIterator]() {} }

/** The document at `iri` with everything it transcludes already in it.
 *  Rejects when the document itself cannot be resolved; a child that cannot
 *  fills its own placeholder and leaves the document standing. */
export async function renderInline(
  renderer: Renderer,
  resolve: Resolve,
  iri: string,
  hint?: Hint,
  depth: number = TRANSCLUDE_DEPTH
): Promise<string> {
  const render = async (
    target: string,
    targetHint: Hint | undefined,
    chain: readonly string[]
  ): Promise<string> => {
    const resource = await resolve(target)
    const ctx: Context = {
      resolve: (childIri) => resolve(childIri).then(renderer.parse),
      emit: () => {},
      events: nothing,
      async transclude(childIri, childHint) {
        const how = mounting(chain, childIri, depth)
        if (how !== 'auto') return placeholderHtml(childIri, childHint, how)
        try {
          return await render(childIri, childHint, [...chain, childIri])
        } catch (error) {
          return `<div ${TRANSCLUDE_ATTR}="${escapeHtml(childIri)}" ${ERROR_ATTR}>${errorHtml(childIri, error)}</div>`
        }
      }
    }
    const rendered = await renderer.render(resource, ctx, targetHint)
    return rendered.html
  }
  return render(iri, hint, [iri])
}
