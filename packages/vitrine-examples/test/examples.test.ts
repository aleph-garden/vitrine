import { describe, expect, test } from 'bun:test'
import { ALEPH, createRenderer } from '@aleph-garden/vitrine'
import { createRuntime, instanceContext } from '@aleph-garden/vitrine/dom'
import {
  checklistView,
  exampleResolve,
  exampleResources,
  personCardView,
  plainTextView
} from '../src/index.ts'

const ctxFor = () => {
  const { ctx, dependencies } = instanceContext(
    exampleResolve,
    () => {},
    (async function* () {})(),
    async () => ''
  )
  return { ctx, dependencies }
}

describe('personCardView', () => {
  test('renders the name from the graph', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/ada')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).toContain('Ada Lovelace')
  })

  test('resolves the employer and shows its name', async () => {
    const { ctx, dependencies } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/ada')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).toContain('Analytical Engine Office')
    expect([...dependencies]).toContain('https://example.org/orgs/aeo')
  })

  test('does not build a link out of a scheme it cannot vouch for', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/tricked')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a href')
    expect(html).toContain('Mallory')
  })

  test('renders without an employer', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/grace')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).toContain('Grace Hopper')
    expect(html).not.toContain('undefined')
  })

  test('escapes a name that carries markup', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/injection')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('personCardView, the fuller card', () => {
  test('renders the portrait with the name as its alt text', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/ada')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).toContain('<img class="portrait" src="/fixtures/ada.svg" alt="Ada Lovelace"')
  })

  test('leaves the portrait out when the resource carries no image', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/grace')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).not.toContain('<img')
  })

  test('shows both years, with the full dates machine-readable', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/ada')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).toContain('<time datetime="1815-12-10">1815</time>')
    expect(html).toContain('<time datetime="1852-11-27">1852</time>')
  })

  test('a person still alive gets a birth year and no range', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/injection')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).toContain('born <time datetime="1980-02-29">1980</time>')
    expect(html).not.toContain('–')
  })

  test('no dates at all leaves the line out', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/people/nodates')
    const { html } = await personCardView.render(resource, ctx)
    expect(html).not.toContain('class="lifespan"')
  })
})

describe('checklistView', () => {
  test('renders one item per task line', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/notes/packing.txt')
    const { html } = await checklistView.render(resource, ctx)
    expect([...html.matchAll(/class="task/g)]).toHaveLength(3)
  })

  test('counts the done items into a slot', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/notes/packing.txt')
    const { html } = await checklistView.render(resource, ctx)
    expect(html).toContain('data-slot="count"')
    expect(html).toContain('1 of 3')
  })

  test('a click emits aleph:Select for the item', async () => {
    const emitted: unknown[] = []
    const { ctx } = instanceContext(
      exampleResolve,
      (e) => emitted.push(e),
      (async function* () {})(),
      async () => ''
    )
    const resource = await exampleResolve('https://example.org/notes/packing.txt')
    const { html, hydrate } = await checklistView.render(resource, ctx)
    const root = document.createElement('div')
    root.innerHTML = html
    hydrate?.(root, ctx)
    root.querySelector<HTMLElement>('.task input')?.click()
    expect(emitted).toEqual([
      {
        type: ALEPH.Select,
        object: 'https://example.org/notes/packing.txt#0',
        target: 'https://example.org/notes/packing.txt'
      }
    ])
  })

  test('its handle patches the count slot instead of re-rendering', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/notes/packing.txt')
    const { html, hydrate } = await checklistView.render(resource, ctx)
    const root = document.createElement('div')
    root.innerHTML = html
    const handle = hydrate?.(root, ctx)
    root.querySelector<HTMLElement>('.task input')?.click()
    const patch = handle?.update?.({
      type: ALEPH.Select,
      object: 'https://example.org/notes/packing.txt#0'
    })
    expect(patch).toEqual({ slot: 'count', html: '2 of 3' })
  })
})

describe('selection over the examples', () => {
  test('a person resource picks the card, a text resource the checklist', async () => {
    const renderer = createRenderer({
      parsers: [],
      views: [personCardView, checklistView]
    })
    const person = await exampleResolve('https://example.org/people/ada')
    const list = await exampleResolve('https://example.org/notes/packing.txt')
    expect(renderer.select(person)?.id).toBe(personCardView.id)
    expect(renderer.select(list)?.id).toBe(checklistView.id)
  })

  test('every example resource resolves', async () => {
    for (const iri of Object.keys(exampleResources)) {
      expect((await exampleResolve(iri)).iri).toBe(iri)
    }
  })
})

// The documentation is a host: renderer, runtime, a fixture resolve and one
// region. This is the same wiring the LiveView component does in the page.
describe('the docs host', () => {
  test('mounts a resource into a region and hydration answers a click', async () => {
    const renderer = createRenderer({ parsers: [], views: [personCardView, checklistView] })
    const runtime = createRuntime(renderer, exampleResolve)
    const region = document.createElement('div')
    document.body.append(region)

    await runtime.mount(region, 'https://example.org/notes/packing.txt')
    expect(region.querySelectorAll('.task')).toHaveLength(3)
    expect(region.querySelector('[data-slot="count"]')?.textContent).toBe('1 of 3')

    region.querySelector<HTMLElement>('.task input')?.click()
    await Bun.sleep(1)
    expect(region.querySelector('[data-slot="count"]')?.textContent).toBe('2 of 3')
  })

  test('the portrait and the dates survive the sanitiser', async () => {
    const renderer = createRenderer({ parsers: [], views: [personCardView, checklistView] })
    const runtime = createRuntime(renderer, exampleResolve)
    const region = document.createElement('div')
    document.body.append(region)

    await runtime.mount(region, 'https://example.org/people/ada')
    const portrait = region.querySelector('img.portrait')
    expect(portrait?.getAttribute('src')).toBe('/fixtures/ada.svg')
    expect(portrait?.getAttribute('alt')).toBe('Ada Lovelace')
    expect(region.querySelector('time')?.getAttribute('datetime')).toBe('1815-12-10')
  })

  test('a mount of an unknown IRI rejects, so the host can say so', async () => {
    const renderer = createRenderer({ parsers: [], views: [personCardView, checklistView] })
    const runtime = createRuntime(renderer, exampleResolve)
    const region = document.createElement('div')
    await expect(runtime.mount(region, 'https://example.org/nope')).rejects.toThrow('404')
  })
})

describe('plainTextView', () => {
  test('puts the body in a pre element, escaped', async () => {
    const { ctx } = ctxFor()
    const resource = await exampleResolve('https://example.org/notes/packing.txt')
    const { html } = await plainTextView.render(resource, ctx)
    expect(html).toStartWith('<pre class="plain">')
    expect(html).toContain('- [x] charger')
  })

  test('a hint reaches it although the checklist claims the same type', async () => {
    const renderer = createRenderer({
      parsers: [],
      views: [checklistView, plainTextView]
    })
    const resource = await exampleResolve('https://example.org/notes/packing.txt')
    expect(renderer.select(resource)?.id).toBe(checklistView.id)
    expect(renderer.select(resource, { view: plainTextView.id })?.id).toBe(plainTextView.id)
  })
})
