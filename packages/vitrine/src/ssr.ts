// A host without a DOM. It answers `transclude` by rendering the child
// there and then, so one finished document comes out, and stops where a
// browser runtime would stop: an ancestor and anything past the depth stay
// placeholders, which a browser expands later.

import type { Resolve } from './dom.ts'
import { type Context, escapeHtml, RENDER_DEPTH, type Renderer, type Show } from './index.ts'
import { stateIn } from './state.ts'
import {
  ERROR_ATTR,
  errorHtml,
  mounting,
  placeholderHtml,
  TRANSCLUDE_ATTR,
  TRANSCLUDE_DEPTH,
  thingOf
} from './transclusion.ts'

const nothing: AsyncIterable<never> = { async *[Symbol.asyncIterator]() {} }

/** The document at `iri` with everything it transcludes already in it.
 *  Rejects when the document itself cannot be resolved; a child that cannot
 *  fills its own placeholder and leaves the document standing. `depth` bounds
 *  nested transclusion and `renderDepth` nested `ctx.render` calls. */
export async function renderInline(
  renderer: Renderer,
  resolve: Resolve,
  iri: string,
  show?: Show,
  depth: number = TRANSCLUDE_DEPTH,
  renderDepth: number = RENDER_DEPTH
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
      about: () => {
        throw new Error('about is answered only while a view is drawn')
      },
      render: () => Promise.reject(new Error('render is answered only while a view is drawn')),
      // Rendered once and never again, so state holds its initial values and
      // a set has nothing to re-render.
      state: stateIn(new Map()),
      async transclude(childIri, childShow) {
        const thing = thingOf(childIri, childShow)
        const how = mounting(chain, thing, depth)
        if (how !== 'auto') return placeholderHtml(childIri, childShow, how)
        try {
          return await render(childIri, childShow, [...chain, thing])
        } catch (error) {
          return `<div ${TRANSCLUDE_ATTR}="${escapeHtml(childIri)}" ${ERROR_ATTR}>${errorHtml(childIri, error)}</div>`
        }
      }
    }
    const rendered = await renderer.render(resource, ctx, targetShow, renderDepth)
    return rendered.html
  }
  return render(iri, show, [thingOf(iri, show)])
}
