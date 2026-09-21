import { describe, expect, test } from 'bun:test'
import { typesOf } from '@aleph-garden/vitrine'
import { jsonLdParser } from '../src/index.ts'

describe('jsonLdParser', () => {
  test('parses JSON-LD into plain quads', async () => {
    const parser = jsonLdParser()
    expect(parser.contentType).toBe('application/ld+json')
    const quads = await parser.parse({
      iri: 'https://pod.example/x.jsonld',
      contentType: 'application/ld+json',
      body: JSON.stringify({
        '@context': { name: 'https://schema.org/name' },
        '@id': '#me',
        '@type': 'https://schema.org/Person',
        name: { '@value': 'Toph', '@language': 'de' }
      }),
      meta: [],
      allow: ['read']
    })
    expect(
      typesOf({
        iri: 'https://pod.example/x.jsonld#me',
        contentType: '',
        body: '',
        meta: [],
        allow: [],
        graph: quads
      })
    ).toEqual(['https://schema.org/Person'])
    const name = quads.find((q) => q.predicate.value === 'https://schema.org/name')!
    expect(name.object).toEqual({
      termType: 'Literal',
      value: 'Toph',
      language: 'de',
      datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'
    })
    expect(Object.getPrototypeOf(name.object)).toBe(Object.prototype)
  })

  test('rejects on a body that is not JSON', async () => {
    expect(
      jsonLdParser().parse({
        iri: 'https://pod.example/x.jsonld',
        contentType: 'application/ld+json',
        body: 'not json',
        meta: [],
        allow: ['read']
      })
    ).rejects.toThrow()
  })
})
