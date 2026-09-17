import { describe, expect, test } from 'bun:test'
import { createRuntime, instanceContext, linkEvents } from '../src/dom.ts'
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
    const { ctx, dependencies } = instanceContext(resolve, () => {}, (async function* () {})())
    await ctx.resolve('a')
    await ctx.resolve('b')
    await ctx.resolve('a')
    expect([...dependencies]).toEqual(['a', 'b'])
  })

  test('records an IRI whose resolve rejected', async () => {
    const { resolve } = store({})
    const { ctx, dependencies } = instanceContext(resolve, () => {}, (async function* () {})())
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

  test('leaves a foreign-origin link alone', () => {
    const el = region()
    el.innerHTML = `<a id="l" href="https://elsewhere.example/x">x</a>`
    const events: Event[] = []
    linkEvents(el, (e) => events.push(e))
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
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
      render: async (r, ctx) => ({
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
