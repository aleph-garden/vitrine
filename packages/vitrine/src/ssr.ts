// A host without a DOM. It answers `transclude` by rendering the child
// there and then, so one finished document comes out, and stops where a
// browser runtime would stop: an ancestor and anything past the depth stay
// placeholders, which a browser expands later.

import type { Resolve } from './dom.ts'
import { type Context, escapeHtml, type Renderer, type Show } from './index.ts'
import { stateIn } from './state.ts'
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
  show?: Show,
  depth: number = TRANSCLUDE_DEPTH
): Promise<string> {
  const render = async (
    target: string,
    targetShow: Show | undefined,
    chain: readonly string[]
  ): Promise<string> => {
    const resource = await resolve(target)
    const ctx: Context = {
      resolve: (childIri) => resolve(childIri).then(renderer.parse),
      emit: () => {},
      events: nothing,
      inner: () => Promise.reject(new Error('inner is answered only while a view is drawn')),
      // Rendered once and never again, so state holds its initial values and
      // a set has nothing to re-render.
      state: stateIn(new Map()),
      async transclude(childIri, childShow) {
        const how = mounting(chain, childIri, depth)
        if (how !== 'auto') return placeholderHtml(childIri, childShow, how)
        try {
          return await render(childIri, childShow, [...chain, childIri])
        } catch (error) {
          return `<div ${TRANSCLUDE_ATTR}="${escapeHtml(childIri)}" ${ERROR_ATTR}>${errorHtml(childIri, error)}</div>`
        }
      }
    }
    const rendered = await renderer.render(resource, ctx, targetShow)
    return rendered.html
  }
  return render(iri, show, [iri])
}
