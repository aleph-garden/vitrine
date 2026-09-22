import { afterEach, describe, expect, test } from 'bun:test'
import { HOST_TYPE, readConfig } from '../src/config.ts'

const embed = (json: string): void => {
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.textContent = json
  document.head.append(script)
}

afterEach(() => {
  for (const script of document.head.querySelectorAll('script')) script.remove()
})

describe('readConfig', () => {
  test('reads the keys of the Host node', () => {
    embed(
      JSON.stringify({
        '@context': 'https://w3id.org/vitrine/ns',
        '@id': 'https://pod.toph.so/',
        '@type': 'Host',
        issuer: 'https://pod.toph.so/',
        sparqlEndpoint: 'https://sparql.toph.so'
      })
    )
    expect(readConfig(document)).toEqual({
      issuer: 'https://pod.toph.so/',
      sparqlEndpoint: 'https://sparql.toph.so'
    })
  })

  test('reads views and rules, and takes the type as a full IRI too', () => {
    embed(
      JSON.stringify({
        '@type': HOST_TYPE,
        views: ['https://w3id.org/vitrine/ns#Landing'],
        rules: [
          {
            view: 'https://w3id.org/vitrine/ns#Landing',
            when: [{ iri: 'https://aleph.garden/' }]
          }
        ]
      })
    )
    expect(readConfig(document)).toEqual({
      views: ['https://w3id.org/vitrine/ns#Landing'],
      rules: [
        { view: 'https://w3id.org/vitrine/ns#Landing', when: [{ iri: 'https://aleph.garden/' }] }
      ]
    })
  })

  test('ignores keys that the host itself decides', () => {
    embed(JSON.stringify({ '@type': 'Host', opens: 'any', session: false, base: '/-/' }))
    expect(readConfig(document)).toEqual({})
  })

  test('skips a node of another type and takes the first Host', () => {
    embed(JSON.stringify({ '@type': 'WebSite', issuer: 'https://wrong.example/' }))
    embed(JSON.stringify({ '@type': 'Host', issuer: 'https://first.example/' }))
    embed(JSON.stringify({ '@type': 'Host', issuer: 'https://second.example/' }))
    expect(readConfig(document)).toEqual({ issuer: 'https://first.example/' })
  })

  test('is empty when the page carries no Host node', () => {
    expect(readConfig(document)).toEqual({})
  })

  test('is empty when the JSON does not parse', () => {
    embed('{ "@type": "Host", ')
    expect(readConfig(document)).toEqual({})
  })
})
