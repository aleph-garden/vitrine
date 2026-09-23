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
  quads: [],
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

  test('answers the view that drew, as render does for the outermost', async () => {
    let seen: string | undefined
    const reporting: View = {
      id: 'w',
      when: markdown,
      async render(_resource, ctx) {
        const inner = await ctx.inner()
        seen = inner.view.id
        return wrap(inner, (body) => body)
      }
    }
    const renderer = createRenderer({ parsers: [], views: [reporting, plain('p')] })
    const drawn = await renderer.render(note('https://pod.example/a.md'), context())
    expect(drawn.view.id).toBe('w')
    expect(seen).toBe('p')
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

describe('ctx.state', () => {
  /** A view counting clicks on its button in state, drawn as the count. */
  const counter = (id: string, when = markdown): View => ({
    id,
    when,
    async render(_resource, ctx) {
      const count = ctx.state('count', 0)
      return {
        html: `<button data-count="${id}">${count.get()}</button>`,
        hydrate(root) {
          const button = root.querySelector<HTMLButtonElement>(`[data-count="${id}"]`)
          const click = () => count.set(count.get() + 1)
          button?.addEventListener('click', click)
          return { dispose: () => button?.removeEventListener('click', click) }
        }
      }
    }
  })

  const settle = () => new Promise((r) => setTimeout(r, 0))

  test('re-renders the instance on set and keeps the value through later re-renders', async () => {
    const renderer = createRenderer({ parsers: [], views: [counter('c')] })
    const runtime = createRuntime(renderer, async (iri) => note(iri))
    const root = region()
    await runtime.mount(root, 'https://pod.example/a.md')
    root.querySelector<HTMLElement>('[data-count="c"]')?.click()
    await settle()
    expect(root.querySelector('[data-count="c"]')?.textContent).toBe('1')
    await runtime.dispatch({ type: AS.Update, object: 'https://pod.example/a.md' })
    expect(root.querySelector('[data-count="c"]')?.textContent).toBe('1')
  })

  test('starts over when the region is mounted again', async () => {
    const renderer = createRenderer({ parsers: [], views: [counter('c')] })
    const runtime = createRuntime(renderer, async (iri) => note(iri))
    const root = region()
    await runtime.mount(root, 'https://pod.example/a.md')
    root.querySelector<HTMLElement>('[data-count="c"]')?.click()
    await settle()
    await runtime.mount(root, 'https://pod.example/a.md')
    expect(root.querySelector('[data-count="c"]')?.textContent).toBe('0')
  })

  test('scopes keys to the view, so a wrapper and the view inside keep their own', async () => {
    const counting: View = {
      id: 'outer',
      when: markdown,
      async render(_resource, ctx) {
        const count = ctx.state('count', 0)
        return wrap(
          await ctx.inner(),
          (body) => `<button data-count="outer">${count.get()}</button>${body}`,
          (root) => {
            const button = root.querySelector<HTMLButtonElement>('[data-count="outer"]')
            const click = () => count.set(count.get() + 10)
            button?.addEventListener('click', click)
            return { dispose: () => button?.removeEventListener('click', click) }
          }
        )
      }
    }
    const renderer = createRenderer({ parsers: [], views: [counting, counter('inner')] })
    const runtime = createRuntime(renderer, async (iri) => note(iri))
    const root = region()
    await runtime.mount(root, 'https://pod.example/a.md')
    root.querySelector<HTMLElement>('[data-count="outer"]')?.click()
    await settle()
    root.querySelector<HTMLElement>('[data-count="inner"]')?.click()
    await settle()
    expect(root.querySelector('[data-count="outer"]')?.textContent).toBe('10')
    expect(root.querySelector('[data-count="inner"]')?.textContent).toBe('1')
  })

  test('answers undefined for a key never set and no initial given', async () => {
    let read: string | undefined = 'unset'
    const reading: View = {
      id: 'r',
      when: markdown,
      async render(_resource, ctx) {
        read = ctx.state('view').get()
        return { html: '' }
      }
    }
    const renderer = createRenderer({ parsers: [], views: [reading] })
    await renderer.render(note('https://pod.example/a.md'), context())
    expect(read).toBeUndefined()
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

  test('keeps the choice through a re-render and tells no one else', async () => {
    const renderer = createRenderer({
      parsers: [],
      rules: [{ view: 'frame', when: markdown }],
      views: [
        frameView('frame', {
          'top-end': viewSwitch([
            ['p', 'Paragraph'],
            ['q', 'Quote']
          ])
        }),
        plain('p'),
        plain('q', [])
      ]
    })
    const runtime = createRuntime(renderer, async (iri) => note(iri))
    const heard: Event[] = []
    runtime.listen((e) => heard.push(e))
    const first = region()
    const second = region()
    await runtime.mount(first, 'https://pod.example/a.md')
    await runtime.mount(second, 'https://pod.example/a.md')

    const quote = [...first.querySelectorAll<HTMLElement>('.aleph-menu-entry')].find((e) =>
      e.textContent?.includes('Quote')
    )
    quote?.click()
    await new Promise((r) => setTimeout(r, 0))
    await runtime.dispatch({ type: AS.Update, object: 'https://pod.example/a.md' })

    expect(first.querySelector('[data-view]')?.getAttribute('data-view')).toBe('q')
    expect(second.querySelector('[data-view]')?.getAttribute('data-view')).toBe('p')
    expect(heard.filter((e) => e.type === AS.View)).toEqual([])
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
