import { describe, expect, test } from 'bun:test'
import { type Context, createRenderer, fallbackView, type Resource } from '@aleph-garden/vitrine'
import { LANDING_VIEW, landingView } from '../src/landing.ts'

const landing = landingView('https://pod.example')

const noop: Context = {
  resolve: () => Promise.reject(new Error('no resolve')),
  emit: () => {},
  events: (async function* () {})(),
  transclude: async () => ''
}

const resource = (iri: string): Resource => ({
  iri,
  contentType: 'text/html',
  body: '',
  meta: [],
  allow: ['read']
})

describe('landingView', () => {
  test('renders the greeting from nothing', async () => {
    const rendered = await landing.render(resource('https://pod.example/'), noop)
    expect(rendered.html).toContain('<h1>Aleph Garden</h1>')
    expect(rendered.html).toContain('href="/vitrine/docs/" target="_top"')
    expect(rendered.hydrate).toBeUndefined()
  })

  test("applies to the host's own IRI and nowhere else", () => {
    const renderer = createRenderer({ parsers: [], views: [landing, fallbackView] })
    expect(renderer.select(resource('https://pod.example/'))?.id).toBe(LANDING_VIEW)
    expect(renderer.select(resource('https://pod.example/other'))?.id).toBe(fallbackView.id)
    expect(renderer.select(resource('https://other.example/'))?.id).toBe(fallbackView.id)
  })

  test('takes its IRI from the origin it is built with, so a preview greets too', () => {
    const preview = landingView('https://deadbeef.pages.dev')
    const renderer = createRenderer({ parsers: [], views: [preview, fallbackView] })
    expect(renderer.select(resource('https://deadbeef.pages.dev/'))?.id).toBe(LANDING_VIEW)
  })
})
