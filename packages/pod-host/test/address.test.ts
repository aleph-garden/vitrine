import { describe, expect, test } from 'bun:test'
import { podAddress } from '../src/address.ts'

// test-setup registers the window at https://pod.example/, so that origin is
// the host's here, and https://other.example is a foreign one.

describe('podAddress.of', () => {
  test('takes the location itself as the IRI', () => {
    expect(podAddress.of('https://pod.toph.so/notes/a.md#Setup')).toEqual({
      iri: 'https://pod.toph.so/notes/a.md',
      hint: { fragment: 'Setup' },
      href: 'https://pod.toph.so/notes/a.md#Setup'
    })
  })

  test('reads the view parameter as a hint', () => {
    expect(podAddress.of('https://pod.example/a.md?view=urn:x')).toEqual({
      iri: 'https://pod.example/a.md',
      hint: { view: 'urn:x' },
      href: 'https://pod.example/a.md?view=urn:x'
    })
  })

  test('a location with neither query nor fragment carries no hint', () => {
    expect(podAddress.of('https://pod.example/')).toEqual({
      iri: 'https://pod.example/',
      href: 'https://pod.example/'
    })
  })

  test('a path that begins with a scheme is no longer special', () => {
    expect(podAddress.of('https://pod.example/https://other.example/x').iri).toBe(
      'https://pod.example/https://other.example/x'
    )
  })
})

describe('podAddress.for', () => {
  test('an IRI on the host origin is its own location', () => {
    expect(podAddress.for('https://pod.example/notes/b.md#Intro')).toEqual({
      iri: 'https://pod.example/notes/b.md',
      hint: { fragment: 'Intro' },
      href: 'https://pod.example/notes/b.md#Intro'
    })
  })

  test('an IRI from another origin is declined, so the browser takes it', () => {
    expect(podAddress.for('https://other.example/x')).toBeUndefined()
  })

  test('the location it builds reads back as the same resource and hint', () => {
    for (const url of [
      'https://pod.example/notes/b.md#Intro',
      'https://pod.example/docs/view/',
      'https://pod.example/notes/b.md?view=urn:x',
      'https://pod.example'
    ]) {
      const address = podAddress.for(url)!
      expect(podAddress.of(address.href)).toEqual(address)
    }
  })
})
