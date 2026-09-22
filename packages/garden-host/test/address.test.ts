import { describe, expect, test } from 'bun:test'
import { gardenAddress, PREFIX } from '../src/address.ts'

// test-setup registers the window at https://pod.example/, so that origin
// stands in for aleph.garden's here.

describe('gardenAddress.of', () => {
  test('takes the path behind the reserved segment as the IRI', () => {
    const href = `https://aleph.garden${PREFIX}https://other.example/notes/a.md?view=urn:x`
    expect(gardenAddress.of(href)).toEqual({
      iri: 'https://other.example/notes/a.md',
      hint: { view: 'urn:x' },
      href
    })
  })

  test('takes a location without the segment as its own IRI', () => {
    expect(gardenAddress.of('https://aleph.garden/')).toEqual({
      iri: 'https://aleph.garden/',
      href: 'https://aleph.garden/'
    })
  })

  test('carries an IRI whose scheme is neither http nor https', () => {
    expect(gardenAddress.of(`https://aleph.garden${PREFIX}urn:uuid:1234`).iri).toBe('urn:uuid:1234')
    expect(gardenAddress.of(`https://aleph.garden${PREFIX}did:web:example.org`).iri).toBe(
      'did:web:example.org'
    )
  })

  test('a static path names no IRI of its own beyond the location', () => {
    expect(gardenAddress.of('https://aleph.garden/docs/view/').iri).toBe(
      'https://aleph.garden/docs/view/'
    )
  })
})

describe('gardenAddress.for', () => {
  test('puts an IRI from another origin behind the reserved segment', () => {
    expect(gardenAddress.for('https://other.example/notes/b.md#Intro')).toEqual({
      iri: 'https://other.example/notes/b.md',
      hint: { fragment: 'Intro' },
      href: `https://pod.example${PREFIX}https://other.example/notes/b.md#Intro`
    })
  })

  test('an IRI on the host origin is its own location', () => {
    expect(gardenAddress.for('https://pod.example/notes/b.md#Intro')).toEqual({
      iri: 'https://pod.example/notes/b.md',
      hint: { fragment: 'Intro' },
      href: 'https://pod.example/notes/b.md#Intro'
    })
  })

  test('a location already behind the segment resolves to the resource it names', () => {
    const href = `https://pod.example${PREFIX}https://other.example/notes/b.md`
    expect(gardenAddress.for(href).iri).toBe('https://other.example/notes/b.md')
  })

  test('the location it builds reads back as the same resource and hint', () => {
    for (const url of [
      'https://pod.example/notes/b.md#Intro',
      'https://pod.example/docs/view/',
      'https://other.example/notes/b.md#Intro',
      'https://other.example/notes/b.md?view=urn:x',
      'https://other.example/public/',
      'https://other.example'
    ]) {
      const address = gardenAddress.for(url)
      expect(gardenAddress.of(address.href)).toEqual(address)
    }
  })
})
