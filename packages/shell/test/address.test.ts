import { describe, expect, test } from 'bun:test'
import { addressFor, addressOf } from '../src/address.ts'

// test-setup registers the window at https://pod.example/, so that origin is
// the shell's here, and https://other.example is a foreign one.

describe('addressOf', () => {
  test('takes the location itself as the IRI', () => {
    expect(addressOf('https://pod.toph.so/notes/a.md#Setup')).toEqual({
      iri: 'https://pod.toph.so/notes/a.md',
      hint: { fragment: 'Setup' },
      href: 'https://pod.toph.so/notes/a.md#Setup'
    })
  })

  test('takes a path that begins with a scheme as the IRI', () => {
    const href = 'https://aleph.garden/https://pod.toph.so/notes/a.md?view=urn:x'
    expect(addressOf(href)).toEqual({
      iri: 'https://pod.toph.so/notes/a.md',
      hint: { view: 'urn:x' },
      href
    })
  })

  test('a location with neither query nor fragment carries no hint', () => {
    expect(addressOf('https://aleph.garden/')).toEqual({
      iri: 'https://aleph.garden/',
      href: 'https://aleph.garden/'
    })
  })
})

describe('addressFor', () => {
  test('an IRI on the shell origin is its own location', () => {
    expect(addressFor('https://pod.example/notes/b.md#Intro')).toEqual({
      iri: 'https://pod.example/notes/b.md',
      hint: { fragment: 'Intro' },
      href: 'https://pod.example/notes/b.md#Intro'
    })
  })

  test('an IRI from another origin goes behind the shell origin', () => {
    expect(addressFor('https://pod.toph.so/notes/b.md#Intro')).toEqual({
      iri: 'https://pod.toph.so/notes/b.md',
      hint: { fragment: 'Intro' },
      href: 'https://pod.example/https://pod.toph.so/notes/b.md#Intro'
    })
  })

  test('the location it builds reads back as the same resource and hint', () => {
    for (const url of [
      'https://pod.example/notes/b.md#Intro',
      'https://pod.example/docs/view/',
      'https://pod.toph.so/notes/b.md#Intro',
      'https://pod.toph.so/notes/b.md?view=urn:x',
      'https://pod.toph.so/public/'
    ]) {
      const address = addressFor(url)
      const back = addressOf(address.href)
      expect(back.iri).toBe(address.iri)
      expect(back.hint).toEqual(address.hint)
    }
  })
})
