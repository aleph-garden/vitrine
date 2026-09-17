import { describe, expect, test } from 'bun:test'
import { type Context, createRenderer, fallbackView, type Resource } from '@aleph-garden/view'
import { LANDING_VIEW, landingView } from '../src/landing.ts'

const noop: Context = {
  resolve: () => Promise.reject(new Error('no resolve')),
  emit: () => {},
  events: (async function* () {})()
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
    const rendered = await landingView.render(resource('https://pod.example/'), noop)
    expect(rendered.html).toContain('<h1>Aleph Garden</h1>')
    expect(rendered.html).toContain('href="/docs/view/" target="_top"')
    expect(rendered.hydrate).toBeUndefined()
  })

  test('applies through a rule and nowhere else', () => {
    const renderer = createRenderer({
      parsers: [],
      views: [landingView, fallbackView],
      rules: [{ view: LANDING_VIEW, when: [{ iri: 'https://pod.example/' }] }]
    })
    expect(landingView.when).toBeUndefined()
    expect(renderer.select(resource('https://pod.example/'))?.id).toBe(LANDING_VIEW)
    expect(renderer.select(resource('https://pod.example/other'))?.id).toBe(fallbackView.id)
  })
})
