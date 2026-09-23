import { describe, expect, test } from 'bun:test'
import { createRuntime, instanceContext, VIEW_ATTR } from '../src/dom.ts'
import { contentType, frameView, name, viewName, viewSwitch } from '../src/frame.ts'
import {
  AS,
  type Context,
  createRenderer,
  type Event,
  type Resource,
  type View,
  wrap
} from '../src/index.ts'
import { menu } from '../src/menu.ts'

const note = (iri: string, body = 'hello'): Resource => ({
  iri,
  contentType: 'text/markdown; charset=utf-8',
  body,
  meta: [],
  allow: ['read']
})

const markdown = [{ contentType: 'text/markdown' }]

/** A view that draws its id and the body, so a test reads which one ran. */
const plain = (id: string, when = markdown): View => ({
  id,
  when,
  async render(resource) {
    return { html: `<p data-view="${id}">${String(resource.body)}</p>` }
  }
})

/** A wrapper that puts its id around whatever would have been drawn. */
const around = (id: string, when = markdown): View => ({
  id,
  when,
  async render(_resource, ctx) {
    const inner = await ctx.inner()
    return wrap(inner, (body) => `<section data-wrapper="${id}">${body}</section>`)
  }
})

const context = (events: Event[] = []): Context =>
  instanceContext(
    async (iri) => note(iri),
    (e) => void events.push(e),
    (async function* () {})(),
    async () => ''
  ).ctx

const region = () => {
  const el = document.createElement('div')
  document.body.append(el)
  return el
}

describe('ctx.inner', () => {
  test('selects past the wrapper that asks, so it never draws itself', async () => {
    const renderer = createRenderer({ parsers: [], views: [around('w'), plain('p')] })
    const { html } = await renderer.render(note('https://pod.example/a.md'), context())
    expect(html).toContain('data-wrapper="w"')
    expect(html).toContain('data-view="p"')
  })

  test('draws the inner view a wrapper names', async () => {
    const naming: View = {
      id: 'w',
      when: markdown,
      async render(_resource, ctx) {
        return wrap(await ctx.inner({ view: 'q' }), (body) => `<section>${body}</section>`)
      }
    }
    const renderer = createRenderer({ parsers: [], views: [naming, plain('p'), plain('q', [])] })
    const { html } = await renderer.render(note('https://pod.example/a.md'), context())
    expect(html).toContain('data-view="q"')
    expect(html).not.toContain('data-view="p"')
  })

  test('reads show.inner when the wrapper names nothing', async () => {
    const renderer = createRenderer({
      parsers: [],
      views: [around('w'), plain('p'), plain('q', [])]
    })
    const { html } = await renderer.render(note('https://pod.example/a.md'), context(), {
      view: 'w',
      inner: { view: 'q' }
    })
    expect(html).toContain('data-view="q"')
  })

  test('nests wrappers, each drawing the one below it', async () => {
    const renderer = createRenderer({
      parsers: [],
      views: [around('selector'), around('inspector'), plain('card')]
    })
    const { html } = await renderer.render(note('https://pod.example/a.md'), context())
    const document = new DOMParser().parseFromString(html, 'text/html')
    const card = document.querySelector(
      '[data-wrapper="selector"] [data-wrapper="inspector"] [data-view="card"]'
    )
    expect(card).not.toBeNull()
  })

  test('rejects when no view is left below the wrapper', async () => {
    const renderer = createRenderer({ parsers: [], views: [around('w')] })
    await expect(renderer.render(note('https://pod.example/a.md'), context())).rejects.toThrow(
      'no view applies'
    )
  })

  test('lets a wrapper resolve and react to the content itself', async () => {
    const counting: View = {
      id: 'count',
      when: markdown,
      async render(resource, ctx) {
        const other = await ctx.resolve('https://pod.example/other.md')
        const words = String(resource.body).split(/\s+/).length
        return wrap(
          await ctx.inner(),
          (body) =>
            `<aside data-words="${words}" data-other="${String(other.body)}">${body}</aside>`
        )
      }
    }
    const renderer = createRenderer({ parsers: [], views: [counting, plain('p')] })
    const { html } = await renderer.render(
      note('https://pod.example/a.md', 'one two three'),
      context()
    )
    expect(html).toContain('data-words="3"')
    expect(html).toContain('data-other="hello"')
    expect(html).toContain('data-view="p"')
  })
})

describe('wrap', () => {
  test('lands a patch the inner view answers without a slot on the body', async () => {
    const ticking: View = {
      id: 'tick',
      when: markdown,
      async render() {
        return {
          html: '<p>0</p>',
          hydrate: () => ({
            update: (event) => (event.type === 'tick' ? { html: '<p>1</p>' } : undefined)
          })
        }
      }
    }
    const renderer = createRenderer({
      parsers: [],
      rules: [{ view: 'frame', when: markdown }],
      views: [frameView('frame', { 'top-start': name }), ticking]
    })
    const runtime = createRuntime(renderer, async (iri) => note(iri))
    const root = region()
    await runtime.mount(root, 'https://pod.example/a.md')
    await runtime.dispatch({ type: 'tick' })
    expect(root.querySelector('[data-corner="top-start"]')?.textContent).toBe('a.md')
    expect(root.querySelector('.aleph-frame [data-slot] p')?.textContent).toBe('1')
  })
})

describe('frameView', () => {
  test('fills only the corners it names and the fields that answer', async () => {
    const renderer = createRenderer({
      parsers: [],
      rules: [{ view: 'frame', when: markdown }],
      views: [frameView('frame', { 'top-start': name, 'bottom-end': () => undefined }), plain('p')]
    })
    const { html } = await renderer.render(note('https://pod.example/notes/a.md'), context())
    const document = new DOMParser().parseFromString(html, 'text/html')
    const frame = document.querySelector('.aleph-frame')
    expect(
      [...document.querySelectorAll('[data-corner]')].map((c) => c.getAttribute('data-corner'))
    ).toEqual(['top-start'])
    expect(frame?.hasAttribute('data-top')).toBe(true)
    expect(frame?.hasAttribute('data-bottom')).toBe(false)
    expect(document.querySelector('.aleph-frame-name')?.getAttribute('title')).toBe(
      'https://pod.example/notes/a.md'
    )
  })

  test('names the content type without parameters and the inner view by its last segment', async () => {
    const renderer = createRenderer({
      parsers: [],
      rules: [{ view: 'frame', when: markdown }],
      views: [
        frameView('frame', { 'bottom-start': contentType, 'top-end': viewName }),
        plain('https://example.org/views#Card')
      ]
    })
    const { html } = await renderer.render(note('https://pod.example/a.md'), context())
    expect(html).toContain('data-corner="bottom-start">text/markdown<')
    expect(html).toContain('data-corner="top-end">Card<')
  })

  test('keeps the frame while viewSwitch changes the view inside it', async () => {
    const switcher = viewSwitch([
      ['p', 'Paragraph'],
      ['q', 'Quote']
    ])
    const renderer = createRenderer({
      parsers: [],
      rules: [{ view: 'frame', when: markdown }],
      views: [frameView('frame', { 'top-end': switcher }), plain('p'), plain('q', [])]
    })
    const runtime = createRuntime(renderer, async (iri) => note(iri))
    const root = region()
    await runtime.mount(root, 'https://pod.example/a.md')
    expect(root.querySelector('[data-view]')?.getAttribute('data-view')).toBe('p')
    expect(root.querySelector('.aleph-menu-button')?.textContent).toContain('Paragraph')
    // The sanitizer keeps what opens the list.
    expect(root.querySelector('.aleph-menu')?.hasAttribute('popover')).toBe(true)
    expect(root.querySelector('.aleph-menu-button')?.getAttribute('popovertarget')).toBe(
      root.querySelector('.aleph-menu')?.id
    )

    const quote = [...root.querySelectorAll<HTMLElement>('.aleph-menu-entry')].find((e) =>
      e.textContent?.includes('Quote')
    )
    quote?.click()
    await new Promise((r) => setTimeout(r, 0))

    expect(root.getAttribute(VIEW_ATTR)).toBe('frame')
    expect(root.querySelector('.aleph-frame')).not.toBeNull()
    expect(root.querySelector('[data-view]')?.getAttribute('data-view')).toBe('q')
    expect(root.querySelector('.aleph-menu-button')?.textContent).toContain('Quote')
  })
})

describe('menu', () => {
  test('emits the picked entry’s event', () => {
    const events: Event[] = []
    const ctx = context(events)
    const field = menu('View', [
      { label: 'One', event: { type: AS.View, object: 'a', view: 'one' }, checked: true },
      { label: 'Two', event: { type: AS.View, object: 'a', view: 'two' }, note: 'text/plain' }
    ])
    const corner = region()
    corner.innerHTML = field.html
    field.hydrate?.(corner, ctx)
    expect(corner.querySelector('[aria-checked="true"]')?.textContent).toContain('One')
    expect(corner.querySelector('.aleph-menu-note')?.textContent).toBe('text/plain')
    corner.querySelectorAll<HTMLElement>('.aleph-menu-entry')[1]?.click()
    expect(events).toEqual([{ type: AS.View, object: 'a', view: 'two' }])
  })
})
