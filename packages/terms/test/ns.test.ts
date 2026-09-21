import { describe, expect, test } from 'bun:test'
import { ldp, ns, rdf, schema } from '../src/index.ts'

describe('ns', () => {
  test('prefixes every name with the base', () => {
    expect(ns('https://example.org/', 'a', 'b')).toEqual({
      a: 'https://example.org/a',
      b: 'https://example.org/b'
    })
  })

  test('freezes the result', () => {
    const vocab = ns('https://example.org/', 'a')
    expect(Object.isFrozen(vocab)).toBe(true)
  })

  test('a namespace with no names is empty', () => {
    expect(ns('https://example.org/')).toEqual({})
  })
})

describe('the dictionary', () => {
  test('carries the terms the packages had declared for themselves', () => {
    expect(rdf.type).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
    expect(ldp.Container).toBe('http://www.w3.org/ns/ldp#Container')
    expect(ldp.contains).toBe('http://www.w3.org/ns/ldp#contains')
    expect(schema.NoteDigitalDocument).toBe('https://schema.org/NoteDigitalDocument')
  })
})
