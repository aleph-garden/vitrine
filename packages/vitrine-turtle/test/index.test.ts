import { describe, expect, test } from 'bun:test'
import { typesOf } from '@aleph-garden/vitrine'
import { turtleParser } from '../src/index.ts'

describe('turtleParser', () => {
  test('parses Turtle into plain quads', async () => {
    const parser = turtleParser()
    expect(parser.contentType).toBe('text/turtle')
    const quads = await parser.parse({
      iri: 'https://pod.example/x.ttl',
      contentType: 'text/turtle',
      body: '<#me> a <https://schema.org/Person> ; <https://schema.org/name> "Toph"@de .',
      meta: [],
      allow: ['read']
    })
    expect(
      typesOf({
        iri: 'https://pod.example/x.ttl#me',
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
})
