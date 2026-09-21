import { describe, expect, test } from 'bun:test'
import { createResolveCache } from '../src/cache.ts'
import type { Resource } from '../src/index.ts'

const resource = (iri: string): Resource => ({
  iri,
  contentType: 'text/markdown',
  body: '',
  meta: [],
  allow: ['read']
})

const counting = () => {
  const calls: string[] = []
  return {
    calls,
    resolve: async (iri: string) => {
      calls.push(iri)
      if (iri.includes('gone')) throw Object.assign(new Error('404'), { status: 404 })
      return resource(iri)
    }
  }
}

describe('createResolveCache', () => {
  const a = 'https://pod.example/a.md'

  test('answers a second resolve without asking the host again', async () => {
    const host = counting()
    const cache = createResolveCache(host.resolve)
    await cache.resolve(a)
    await cache.resolve(a)
    expect(host.calls).toEqual([a])
  })

  test('answers a fragment of an IRI from the whole resource', async () => {
    const host = counting()
    const cache = createResolveCache(host.resolve)
    await cache.resolve(a)
    const part = await cache.resolve(`${a}#Setup`)
    expect(host.calls).toEqual([a])
    expect(part.iri).toBe(a)
  })

  test('asks once when two resolves overlap', async () => {
    const host = counting()
    const cache = createResolveCache(host.resolve)
    await Promise.all([cache.resolve(a), cache.resolve(`${a}#Setup`)])
    expect(host.calls).toEqual([a])
  })

  test('asks again after the entry was invalidated, fragment or not', async () => {
    const host = counting()
    const cache = createResolveCache(host.resolve)
    await cache.resolve(a)
    cache.invalidate(`${a}#Setup`)
    await cache.resolve(a)
    expect(host.calls).toEqual([a, a])
  })

  test('keeps nothing from a resolve that rejected', async () => {
    const host = counting()
    const cache = createResolveCache(host.resolve)
    const gone = 'https://pod.example/gone.md'
    await expect(cache.resolve(gone)).rejects.toMatchObject({ status: 404 })
    await expect(cache.resolve(gone)).rejects.toMatchObject({ status: 404 })
    expect(host.calls).toEqual([gone, gone])
  })
})
