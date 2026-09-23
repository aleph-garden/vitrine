import { describe, expect, test } from 'bun:test'
import {
  errorHtml,
  mounting,
  placeholderHtml,
  readPlaceholder,
  transclusionKey
} from '../src/transclusion.ts'

describe('transclusionKey', () => {
  test('is the same key whatever order the show was written in', () => {
    expect(transclusionKey('https://pod.example/a.md', { clip: true, fragment: 'Setup' })).toBe(
      transclusionKey('https://pod.example/a.md', { fragment: 'Setup', clip: true })
    )
  })

  test('separates two shows on one IRI', () => {
    const iri = 'https://pod.example/a.md'
    expect(transclusionKey(iri, { fragment: 'Setup' })).not.toBe(
      transclusionKey(iri, { fragment: 'Teardown' })
    )
  })

  test('separates no show from an empty show', () => {
    const iri = 'https://pod.example/a.md'
    expect(transclusionKey(iri)).toBe(transclusionKey(iri, {}))
  })
})

describe('mounting', () => {
  const a = 'https://pod.example/a.md'
  const b = 'https://pod.example/b.md'

  test('mounts a fresh IRI in a short chain by itself', () => {
    expect(mounting([a], b, 3)).toBe('auto')
  })

  test('defers an IRI that is already an ancestor', () => {
    expect(mounting([a, b], a, 3)).toBe('cycle')
  })

  test('defers past the depth, ancestor or not', () => {
    expect(mounting([a, b, `${a}?x`], 'https://pod.example/c.md', 3)).toBe('depth')
  })

  test('reads the cycle before the depth', () => {
    expect(mounting([a, b, `${a}?x`], a, 3)).toBe('cycle')
  })
})

const only = (html: string): Element => {
  const host = document.createElement('div')
  host.innerHTML = html
  return host.firstElementChild!
}

describe('placeholderHtml', () => {
  const a = 'https://pod.example/a.md'

  test('carries the IRI and the show back out', () => {
    const found = readPlaceholder(only(placeholderHtml(a, { fragment: 'Setup', clip: true })))
    expect(found).toEqual({ iri: a, show: { clip: true, fragment: 'Setup' } })
  })

  test('carries an IRI without a show', () => {
    expect(readPlaceholder(only(placeholderHtml(a)))).toEqual({ iri: a })
  })

  test('says why it was deferred', () => {
    expect(readPlaceholder(only(placeholderHtml(a, undefined, 'depth')))).toEqual({
      iri: a,
      deferred: 'depth'
    })
  })

  test('escapes an IRI that would otherwise close the attribute', () => {
    const hostile = 'https://pod.example/"><script>alert(1)</script>'
    const element = only(placeholderHtml(hostile))
    expect(element.querySelector('script')).toBe(null)
    expect(readPlaceholder(element)).toEqual({ iri: hostile })
  })

  test('is nothing on an element that is not a placeholder', () => {
    expect(readPlaceholder(only('<div></div>'))).toBeUndefined()
  })
})

describe('errorHtml', () => {
  test('names the status the resolve rejected with', () => {
    const html = errorHtml(
      'https://pod.example/a.md',
      Object.assign(new Error('401'), { status: 401 })
    )
    expect(html).toContain('401')
    expect(html).toContain('https://pod.example/a.md')
  })

  test('holds an error without a status', () => {
    expect(errorHtml('https://pod.example/a.md', new Error('boom'))).toContain(
      'https://pod.example/a.md'
    )
  })
})
