import { describe, expect, test } from 'bun:test'
import {
  createRuntime,
  IRI_ATTR,
  instanceContext,
  linkEvents,
  VIEW_ATTR,
  writeHtml
} from '../src/dom.ts'
import { AS, createRenderer, type Event, type Resource, type View } from '../src/index.ts'

const resource = (iri: string, body = ''): Resource => ({
  iri,
  contentType: 'text/markdown',
  body,
  meta: [],
  allow: ['read']
})

const store = (entries: Record<string, string>) => {
  const calls: string[] = []
  const resolve = async (iri: string) => {
    calls.push(iri)
    if (!(iri in entries)) throw Object.assign(new Error('404'), { status: 404 })
    return resource(iri, entries[iri])
  }
  return { resolve, calls }
}

const region = () => {
  const el = document.createElement('div')
  document.body.append(el)
  return el
}

describe('instanceContext', () => {
  test('records every IRI resolved through it', async () => {
    const { resolve } = store({ a: '', b: '' })
    const { ctx, dependencies } = instanceContext(
      resolve,
      () => {},
      (async function* () {})(),
      async () => ''
    )
    await ctx.resolve('a')
    await ctx.resolve('b')
    await ctx.resolve('a')
    expect([...dependencies]).toEqual(['a', 'b'])
  })

  test('records an IRI whose resolve rejected', async () => {
    const { resolve } = store({})
    const { ctx, dependencies } = instanceContext(
      resolve,
      () => {},
      (async function* () {})(),
      async () => ''
    )
    await expect(ctx.resolve('missing')).rejects.toThrow()
    expect(dependencies.has('missing')).toBe(true)
  })
})

describe('linkEvents', () => {
  test('turns a same-origin link click into as:View with fragment', () => {
    const el = region()
    el.innerHTML = `<a id="l" href="${location.origin}/notes/b.md#Intro">b</a>`
    const events: Event[] = []
    linkEvents(el, (e) => events.push(e))
    const a = el.querySelector('#l')!
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(events).toEqual([
      {
        type: AS.View,
        object: `${location.origin}/notes/b.md`,
        target: `${location.origin}/notes/b.md#Intro`
      }
    ])
  })

  test('turns a foreign-origin link into as:View', () => {
    const el = region()
    el.innerHTML = `<a id="l" href="https://elsewhere.example/x#Intro">x</a>`
    const events: Event[] = []
    linkEvents(el, (e) => events.push(e))
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    el.querySelector('#l')!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(events).toEqual([
      {
        type: AS.View,
        object: 'https://elsewhere.example/x',
        target: 'https://elsewhere.example/x#Intro'
      }
    ])
  })

  test('leaves a mailto link to the browser', () => {
    const el = region()
    el.innerHTML = `<a id="l" href="mailto:x@example.com">x</a>`
    const events: Event[] = []
    linkEvents(el, (e) => events.push(e))
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    el.querySelector('#l')!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    expect(events).toEqual([])
  })

  test('leaves a link with target to the browser', () => {
    const el = region()
    el.innerHTML = `<a id="l" href="/docs/" target="_top">d</a>`
    const events: Event[] = []
    linkEvents(el, (e) => events.push(e))
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    el.querySelector('#l')!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    expect(events).toEqual([])
  })

  test('leaves a download link to the browser', () => {
    const el = region()
    el.innerHTML = `<a id="l" href="/x" download>x</a>`
    const events: Event[] = []
    linkEvents(el, (e) => events.push(e))
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    el.querySelector('#l')!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    expect(events).toEqual([])
  })

  test('leaves a modified click to the browser', () => {
    const el = region()
    el.innerHTML = `<a id="l" href="${location.origin}/x">x</a>`
    const events: Event[] = []
    linkEvents(el, (e) => events.push(e))
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    el.querySelector('#l')!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    expect(events).toEqual([])
  })

  test('the returned function removes the listener', () => {
    const el = region()
    el.innerHTML = `<a id="l" href="${location.origin}/x">x</a>`
    const events: Event[] = []
    const off = linkEvents(el, (e) => events.push(e))
    off()
    el.querySelector('#l')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    )
    expect(events).toEqual([])
  })
})

describe('writeHtml under Trusted Types', () => {
  // A fresh module instance (cache-busting query), so this test's stub of
  // `globalThis.trustedTypes` is in place before that module's own `aleph`
  // policy resolves. The shared instance other tests use may have already
  // resolved its policy against a run with no Trusted Types, and that
  // resolution never runs twice.
  test('creates the aleph policy and lets DOMPurify create its own', async () => {
    const original = (globalThis as { trustedTypes?: unknown }).trustedTypes
    const names: string[] = []
    ;(globalThis as { trustedTypes?: unknown }).trustedTypes = {
      createPolicy(name: string, rules: { createHTML?: (html: string) => string }) {
        names.push(name)
        return { createHTML: (html: string) => rules.createHTML?.(html) ?? html }
      }
    }
    try {
      const fresh: { writeHtml: typeof writeHtml } = await import(
        `../src/dom.ts?trusted-types-test=${Date.now()}`
      )
      const el = region()
      fresh.writeHtml(el, '<b>ok</b>')
      expect(names).toContain('aleph')
      // DOMPurify creates `dompurify` lazily on its first sanitize call; assert
      // it when it happens, but nothing here forbids it either way.
      if (names.length > 1) expect(names).toContain('dompurify')
      expect(el.innerHTML).toContain('<b>ok</b>')
    } finally {
      ;(globalThis as { trustedTypes?: unknown }).trustedTypes = original
    }
  })
})

describe('writeHtml', () => {
  test('drops a script element and keeps the markup around it', () => {
    const el = region()
    writeHtml(el, '<p>a</p><script>x()</script>')
    expect(el.innerHTML).toContain('<p>a</p>')
    expect(el.querySelector('script')).toBeNull()
  })

  test('drops an event handler attribute', () => {
    const el = region()
    writeHtml(el, '<img src=x onerror="x()">')
    const img = el.querySelector('img')!
    expect(img.hasAttribute('onerror')).toBe(false)
  })

  test('keeps data-slot, the patch protocol', () => {
    const el = region()
    writeHtml(el, '<p data-slot="n">1</p>')
    expect(el.querySelector('[data-slot="n"]')!.textContent).toBe('1')
  })

  test('keeps target on an anchor', () => {
    const el = region()
    writeHtml(el, '<a href="/docs/" target="_top">d</a>')
    expect(el.querySelector('a')!.getAttribute('target')).toBe('_top')
  })

  test('keeps SVG, which the diagrams emit', () => {
    const el = region()
    writeHtml(el, '<svg><circle r="1"/></svg>')
    const svg = el.querySelector('svg')!
    expect(svg).not.toBeNull()
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(el.querySelector('circle')).not.toBeNull()
  })

  // happy-dom parses `<math>` into the XHTML namespace instead of the MathML
  // one, and the sanitizer drops an element whose namespace contradicts its
  // tag name. The MathML profile is only observable in a browser.
  test.skip('keeps MathML, which the formulas emit', () => {
    const el = region()
    writeHtml(el, '<math><mi>x</mi></math>')
    expect(el.querySelector('mi')).not.toBeNull()
  })

  // Same happy-dom namespace defect as the test above: the sanitizer rejects
  // the whole `<math>` root before ADD_TAGS ever gets to decide about
  // `semantics`/`annotation`. Only observable in a browser.
  test.skip('keeps the semantics and annotation wrappers KaTeX emits', () => {
    const el = region()
    writeHtml(
      el,
      '<math><semantics><mi>x</mi><annotation encoding="application/x-tex">x</annotation></semantics></math>'
    )
    expect(el.querySelector('semantics')).not.toBeNull()
    expect(el.querySelector('annotation')).not.toBeNull()
  })
})

describe('createRuntime', () => {
  const counting = () => {
    let renders = 0
    const view: View = {
      id: 'urn:v',
      when: [{ contentType: 'text/markdown' }],
      render: async (r, ctx, hint) => {
        renders += 1
        if (r.body) await ctx.resolve(r.body as string) // body names a dependency
        return { html: `<p data-slot="n">${renders}</p><i>${hint?.fragment ?? ''}</i>` }
      }
    }
    return { view, renders: () => renders }
  }

  test('mount resolves, renders into the region, and reports dependencies', async () => {
    const { view } = counting()
    const { resolve, calls } = store({ a: 'dep', dep: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const el = region()
    const instance = await runtime.mount(el, 'a')
    expect(el.innerHTML).toContain('<p data-slot="n">1</p>')
    expect(instance.iri).toBe('a')
    expect([...instance.dependencies]).toEqual(['dep'])
    expect(calls).toEqual(['a', 'dep'])
    expect(runtime.instances()).toHaveLength(1)
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
    const view: View = {
      id: 'urn:g',
      when: [{ contentType: 'text/markdown' }],
      render: async (r, ctx) => {
        if (!r.body) return { html: '' }
        const other = await ctx.resolve(r.body as string)
        return { html: `<p>${other.graph?.length ?? 'none'}</p>` }
      }
    }
    const { resolve } = store({ a: 'dep', dep: '' })
    const runtime = createRuntime(createRenderer({ parsers: [parser], views: [view] }), resolve)
    const el = region()
    await runtime.mount(el, 'a')
    expect(el.innerHTML).toBe('<p>1</p>')
  })

  test('mount writes the rendered HTML through the sanitizer', async () => {
    const view: View = {
      id: 'urn:s',
      when: [{ contentType: 'text/markdown' }],
      render: async () => ({ html: '<b>ok</b><script>bad()</script>' })
    }
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const el = region()
    await runtime.mount(el, 'a')
    expect(el.innerHTML).toContain('<b>ok</b>')
    expect(el.querySelector('script')).toBeNull()
  })

  test('mount marks the region with the view it chose and the resource', async () => {
    const { view } = counting()
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const el = region()
    await runtime.mount(el, 'a')
    expect(el.getAttribute(VIEW_ATTR)).toBe('urn:v')
    expect(el.getAttribute(IRI_ATTR)).toBe('a')
  })

  test('a re-render under another view hint moves the view mark', async () => {
    const { view } = counting()
    const other: View = { id: 'urn:other', render: async () => ({ html: '<p>other</p>' }) }
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view, other] }), resolve)
    const el = region()
    await runtime.mount(el, 'a')
    await runtime.dispatch({ type: AS.View, object: 'a', view: 'urn:other' })
    expect(el.getAttribute(VIEW_ATTR)).toBe('urn:other')
  })

  test('a failed mount leaves no mark from the instance it replaced', async () => {
    const { view } = counting()
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const el = region()
    await runtime.mount(el, 'a')
    await expect(runtime.mount(el, 'missing')).rejects.toMatchObject({ status: 404 })
    expect(el.hasAttribute(VIEW_ATTR)).toBe(false)
    expect(el.hasAttribute(IRI_ATTR)).toBe(false)
  })

  test('mount rejects with the resolve error so the host can act on it', async () => {
    const { view } = counting()
    const { resolve } = store({})
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    await expect(runtime.mount(region(), 'missing')).rejects.toMatchObject({ status: 404 })
  })

  test('mount into an occupied region disposes the instance that held it', async () => {
    const { view } = counting()
    const { resolve } = store({ a: '', b: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const el = region()
    const first = await runtime.mount(el, 'a')
    const second = await runtime.mount(el, 'b')
    expect(runtime.instances()).toEqual([second])
    expect(first.id).not.toBe(second.id)
  })

  test('as:Update on a dependency re-renders an instance without update', async () => {
    const { view, renders } = counting()
    const { resolve } = store({ a: 'dep', dep: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const el = region()
    await runtime.mount(el, 'a')
    await runtime.dispatch({ type: AS.Update, object: 'dep' })
    expect(renders()).toBe(2)
    expect(el.innerHTML).toContain('>2</p>')
    await runtime.dispatch({ type: AS.Update, object: 'unrelated' })
    expect(renders()).toBe(2)
  })

  test("as:Update on the instance's own IRI re-renders it", async () => {
    const { view, renders } = counting()
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    await runtime.mount(region(), 'a')
    await runtime.dispatch({ type: AS.Update, object: 'a' })
    expect(renders()).toBe(2)
  })

  test('as:View on the same IRI with a new fragment re-renders with that hint', async () => {
    const { view, renders } = counting()
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const el = region()
    await runtime.mount(el, 'a', { fragment: 'x' })
    await runtime.dispatch({ type: AS.View, object: 'a', target: 'a#y' })
    expect(renders()).toBe(2)
    expect(el.innerHTML).toContain('<i>y</i>')
    await runtime.dispatch({ type: AS.View, object: 'a', target: 'a#y' })
    expect(renders()).toBe(2)
  })

  test('as:View on another IRI does nothing to the instance', async () => {
    const { view, renders } = counting()
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    await runtime.mount(region(), 'a')
    await runtime.dispatch({ type: AS.View, object: 'b' })
    expect(renders()).toBe(1)
  })

  test('a handle with update receives events and its patch lands in the slot', async () => {
    let renders = 0
    const seen: Event[] = []
    const view: View = {
      id: 'urn:u',
      when: [{ contentType: 'text/markdown' }],
      render: async () => {
        renders += 1
        return {
          html: `<b data-slot="count">0</b><s>keep</s>`,
          hydrate: () => ({
            update: (e) => {
              seen.push(e)
              return e.type === AS.Update ? { slot: 'count', html: '1' } : undefined
            }
          })
        }
      }
    }
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const el = region()
    await runtime.mount(el, 'a')
    await runtime.dispatch({ type: AS.Update, object: 'a' })
    expect(renders).toBe(1)
    expect(seen).toHaveLength(1)
    expect(el.querySelector('[data-slot="count"]')!.innerHTML).toBe('1')
    expect(el.querySelector('s')!.textContent).toBe('keep')
  })

  test('a patch without slot replaces the whole region', async () => {
    const view: View = {
      id: 'urn:w',
      when: [{ contentType: 'text/markdown' }],
      render: async () => ({
        html: `<b>old</b>`,
        hydrate: () => ({ update: () => ({ html: '<i>new</i>' }) })
      })
    }
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const el = region()
    await runtime.mount(el, 'a')
    await runtime.dispatch({ type: AS.Update, object: 'anything' })
    expect(el.innerHTML).toBe('<i>new</i>')
  })

  test("emit from a view's context reaches every instance through dispatch", async () => {
    const received: Event[] = []
    const emitter: View = {
      id: 'urn:e',
      when: [{ contentType: 'text/markdown' }],
      render: async (r) => ({
        html: '',
        hydrate: (_root, c) => {
          if (r.iri === 'a') c.emit({ type: 'urn:ping', object: 'a' })
          return { update: (e) => void received.push(e) }
        }
      })
    }
    const { resolve } = store({ a: '', b: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [emitter] }), resolve)
    await runtime.mount(region(), 'b')
    await runtime.mount(region(), 'a')
    await new Promise((r) => setTimeout(r, 0))
    expect(received.filter((e) => e.type === 'urn:ping')).toHaveLength(2)
  })

  test("dispose removes the instance and calls the handle's dispose", async () => {
    let disposed = 0
    const view: View = {
      id: 'urn:d',
      when: [{ contentType: 'text/markdown' }],
      render: async () => ({
        html: '',
        hydrate: () => ({
          dispose: () => {
            disposed += 1
          }
        })
      })
    }
    const { resolve } = store({ a: '' })
    const runtime = createRuntime(createRenderer({ parsers: [], views: [view] }), resolve)
    const instance = await runtime.mount(region(), 'a')
    instance.dispose()
    expect(disposed).toBe(1)
    expect(runtime.instances()).toEqual([])
  })
})

describe('listen', () => {
  test('a host listener sees every event, including ones emitted by views', async () => {
    const view: View = {
      id: 'urn:l',
      when: [{ contentType: 'text/markdown' }],
      render: async () => ({ html: '', hydrate: (_r, ctx) => void ctx.emit({ type: 'urn:hello' }) })
    }
    const runtime = createRuntime(
      createRenderer({ parsers: [], views: [view] }),
      store({ a: '' }).resolve
    )
    const seen: Event[] = []
    const off = runtime.listen((e) => void seen.push(e))
    await runtime.mount(region(), 'a')
    await new Promise((r) => setTimeout(r, 0))
    await runtime.dispatch({ type: AS.Update, object: 'x' })
    expect(seen.map((e) => e.type)).toEqual(['urn:hello', AS.Update])
    off()
    await runtime.dispatch({ type: AS.Update, object: 'y' })
    expect(seen).toHaveLength(2)
  })
})
