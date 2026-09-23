import { describe, expect, test } from 'bun:test'
import { createRenderer, type Resource, type View } from '../src/index.ts'
import { renderInline } from '../src/ssr.ts'
import { DEFERRED_ATTR, ERROR_ATTR, TRANSCLUDE_ATTR } from '../src/transclusion.ts'

const notes = (entries: Record<string, string>) => async (iri: string) => {
  if (!(iri in entries)) throw Object.assign(new Error('404'), { status: 404 })
  return {
    iri,
    contentType: 'text/markdown',
    body: entries[iri]!,
    quads: [],
    allow: ['read']
  } satisfies Resource
}

/** Renders its own IRI and transcludes whatever its body names. */
const nesting: View = {
  id: 'urn:nesting',
  when: [{ contentType: 'text/markdown' }],
  render: async (r, ctx) => {
    const children = (r.body as string) === '' ? [] : (r.body as string).split(',')
    const html = (await Promise.all(children.map((iri) => ctx.transclude(iri)))).join('')
    return { html: `<p class="own">${r.iri}</p>${html}` }
  }
}

const renderer = createRenderer({ parsers: [], views: [nesting] })

describe('renderInline', () => {
  test('brings the child into the document instead of a placeholder', async () => {
    const html = await renderInline(renderer, notes({ a: 'b', b: '' }), 'a')
    expect(html).toContain('<p class="own">a</p>')
    expect(html).toContain('<p class="own">b</p>')
    expect(html).not.toContain(TRANSCLUDE_ATTR)
  })

  test('leaves an ancestor as the placeholder a browser would expand', async () => {
    const html = await renderInline(renderer, notes({ a: 'b', b: 'a' }), 'a')
    expect(html).toContain(`${DEFERRED_ATTR}="cycle"`)
    expect(html.match(/class="own"/g)).toHaveLength(2)
  })

  test('stops at the depth it was given', async () => {
    const html = await renderInline(renderer, notes({ a: 'b', b: 'c', c: '' }), 'a', undefined, 2)
    expect(html).toContain(`${DEFERRED_ATTR}="depth"`)
    expect(html).not.toContain('<p class="own">c</p>')
  })

  test('puts a child that cannot be resolved in its own placeholder', async () => {
    const html = await renderInline(renderer, notes({ a: 'gone' }), 'a')
    expect(html).toContain(ERROR_ATTR)
    expect(html).toContain('gone')
    expect(html).toContain('<p class="own">a</p>')
  })

  test('ctx.resolve answers the resource parsed, with its graph', async () => {
    const parser = {
      contentType: 'text/markdown',
      parse: async (r: Resource) => [
        {
          subject: { termType: 'NamedNode' as const, value: r.iri },
          predicate: { termType: 'NamedNode' as const, value: 'urn:p' },
          object: { termType: 'Literal' as const, value: r.body as string }
        }
      ]
    }
    const counting: View = {
      id: 'urn:g',
      when: [{ contentType: 'text/markdown' }],
      render: async (r, ctx) => {
        const other = await ctx.resolve(r.body as string)
        return { html: `<p>${other.quads.length}</p>` }
      }
    }
    const parsing = createRenderer({ parsers: [parser], views: [counting] })
    expect(await renderInline(parsing, notes({ a: 'b', b: '' }), 'a')).toBe('<p>1</p>')
  })

  test('rejects when the document itself cannot be resolved', async () => {
    await expect(renderInline(renderer, notes({}), 'a')).rejects.toMatchObject({ status: 404 })
  })
})
