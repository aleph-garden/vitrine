import { describe, expect, test } from 'bun:test'
import { createRuntime, IRI_ATTR, VIEW_ATTR } from '../src/dom.ts'
import { AS, createRenderer, type Resource, type View } from '../src/index.ts'
import { DEFERRED_ATTR, ERROR_ATTR, TRANSCLUDE_ATTR } from '../src/transclusion.ts'

const resource = (iri: string, body = ''): Resource => ({
  iri,
  contentType: 'text/markdown',
  body,
  meta: [],
  allow: ['read']
})

/** Every entry is a note whose body names the notes it transcludes. */
const notes = (entries: Record<string, string>) => {
  const resolve = async (iri: string) => {
    if (!(iri in entries)) throw Object.assign(new Error('404'), { status: 404 })
    return resource(iri, entries[iri])
  }
  return resolve
}

/** A view that transcludes whatever the body names, and reports what it
 *  rendered and what was already in place when it hydrated. */
const nesting = () => {
  const rendered: string[] = []
  const hydratedWith: Record<string, number> = {}
  const view: View = {
    id: 'urn:nesting',
    when: [{ contentType: 'text/markdown' }],
    render: async (r, ctx) => {
      rendered.push(r.iri)
      const children = (r.body as string) === '' ? [] : (r.body as string).split(',')
      const html = (await Promise.all(children.map((iri) => ctx.transclude(iri)))).join('')
      return {
        html: `<p class="own">${r.iri}</p>${html}`,
        hydrate(root) {
          hydratedWith[r.iri] = root.querySelectorAll('.own').length - 1
        }
      }
    }
  }
  return { view, rendered, hydratedWith }
}

const runtimeFor = (view: View, entries: Record<string, string>, depth?: number) =>
  createRuntime(createRenderer({ parsers: [], views: [view] }), notes(entries), { depth })

const region = () => {
  const el = document.createElement('div')
  document.body.append(el)
  return el
}

describe('transclusion', () => {
  test('mounts a child into its placeholder before the parent hydrates', async () => {
    const { view, rendered, hydratedWith } = nesting()
    const runtime = runtimeFor(view, { a: 'b', b: '' })
    const el = region()
    await runtime.mount(el, 'a')
    expect(rendered).toEqual(['a', 'b'])
    expect(el.querySelector(`[${TRANSCLUDE_ATTR}] .own`)?.textContent).toBe('b')
    expect(hydratedWith.a).toBe(1)
  })

  test('marks the child region with its own view and resource', async () => {
    const { view } = nesting()
    const runtime = runtimeFor(view, { a: 'b', b: '' })
    const el = region()
    await runtime.mount(el, 'a')
    const child = el.querySelector(`[${TRANSCLUDE_ATTR}]`)
    expect(child?.getAttribute(VIEW_ATTR)).toBe('urn:nesting')
    expect(child?.getAttribute(IRI_ATTR)).toBe('b')
  })

  test('gives the child its own instance, with the parent in its chain', async () => {
    const { view } = nesting()
    const runtime = runtimeFor(view, { a: 'b', b: '' })
    await runtime.mount(region(), 'a')
    const [parent, child] = runtime.instances()
    expect(parent!.iri).toBe('a')
    expect(child!.iri).toBe('b')
    expect(child!.chain).toEqual(['a', 'b'])
  })

  test('disposes a child with its parent', async () => {
    const { view } = nesting()
    const runtime = runtimeFor(view, { a: 'b', b: '' })
    const el = region()
    const parent = await runtime.mount(el, 'a')
    expect(runtime.instances()).toHaveLength(2)
    parent.dispose()
    expect(runtime.instances()).toEqual([])
  })

  test('defers an ancestor instead of mounting it again', async () => {
    const { view, rendered } = nesting()
    const runtime = runtimeFor(view, { a: 'b', b: 'a' })
    const el = region()
    await runtime.mount(el, 'a')
    expect(rendered).toEqual(['a', 'b'])
    expect(el.querySelector(`[${DEFERRED_ATTR}="cycle"]`)?.children).toHaveLength(0)
    expect(runtime.instances()).toHaveLength(2)
  })

  test('defers a chain past the depth', async () => {
    const { view, rendered } = nesting()
    const runtime = runtimeFor(view, { a: 'b', b: 'c', c: 'd', d: '' }, 2)
    const el = region()
    await runtime.mount(el, 'a')
    expect(rendered).toEqual(['a', 'b'])
    expect(el.querySelector(`[${DEFERRED_ATTR}="depth"]`)).not.toBeNull()
  })

  test('keeps a child whose key is unchanged when the parent re-renders', async () => {
    const { view, rendered } = nesting()
    const runtime = runtimeFor(view, { a: 'b', b: '' })
    const el = region()
    await runtime.mount(el, 'a')
    await runtime.dispatch({ type: AS.Update, object: 'a' })
    expect(rendered).toEqual(['a', 'b', 'a'])
    expect(el.querySelector(`[${TRANSCLUDE_ATTR}] .own`)?.textContent).toBe('b')
    expect(runtime.instances()).toHaveLength(2)
  })

  test('drops a child whose key vanished and mounts the new one', async () => {
    const { view, rendered } = nesting()
    const entries: Record<string, string> = { a: 'b', b: '', c: '' }
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), async (iri) => {
      if (!(iri in entries)) throw Object.assign(new Error('404'), { status: 404 })
      return resource(iri, entries[iri])
    })
    const el = region()
    await runtime.mount(el, 'a')
    const [, first] = runtime.instances()
    entries.a = 'c'
    await runtime.dispatch({ type: AS.Update, object: 'a' })
    expect(rendered).toEqual(['a', 'b', 'a', 'c'])
    expect(runtime.instances().map((i) => i.iri)).toEqual(['a', 'c'])
    expect(runtime.instances()).not.toContain(first!)
  })

  test('re-renders a child on as:Update and leaves the parent alone', async () => {
    const { view, rendered } = nesting()
    const runtime = runtimeFor(view, { a: 'b', b: '' })
    await runtime.mount(region(), 'a')
    await runtime.dispatch({ type: AS.Update, object: 'b' })
    expect(rendered).toEqual(['a', 'b', 'b'])
  })

  test('a child that cannot be resolved fills its own placeholder', async () => {
    const { view, rendered } = nesting()
    const runtime = runtimeFor(view, { a: 'gone' })
    const el = region()
    await runtime.mount(el, 'a')
    expect(rendered).toEqual(['a'])
    expect(el.querySelector(`[${ERROR_ATTR}]`)?.textContent).toContain('gone')
    expect(runtime.instances().map((i) => i.iri)).toEqual(['a'])
  })
})
