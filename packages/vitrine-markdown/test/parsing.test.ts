import { describe, expect, test } from 'bun:test'
import { parseWikilink, splitFrontmatter } from '../src/index.ts'

describe('parseWikilink', () => {
  test('plain name', () => {
    expect(parseWikilink('[[Matrix]]')).toEqual({ name: 'Matrix', embed: false })
  })

  test('alias', () => {
    expect(parseWikilink('[[Matrix|die Matrix]]')).toEqual({
      name: 'Matrix',
      alias: 'die Matrix',
      embed: false
    })
  })

  test('heading', () => {
    expect(parseWikilink('[[Matrix#Definition]]')).toEqual({
      name: 'Matrix',
      heading: 'Definition',
      embed: false
    })
  })

  test('block', () => {
    expect(parseWikilink('[[Matrix#^abc123]]')).toEqual({
      name: 'Matrix',
      block: 'abc123',
      embed: false
    })
  })

  test('embed with alias and heading', () => {
    expect(parseWikilink('![[Matrix#Definition|Def]]')).toEqual({
      name: 'Matrix',
      heading: 'Definition',
      alias: 'Def',
      embed: true
    })
  })

  test('path-qualified names keep the path', () => {
    expect(parseWikilink('[[linear-algebra/Matrix]]')).toEqual({
      name: 'linear-algebra/Matrix',
      embed: false
    })
  })

  test('returns undefined for anything else', () => {
    expect(parseWikilink('[Matrix]')).toBeUndefined()
    expect(parseWikilink('[[]]')).toBeUndefined()
  })
})

describe('splitFrontmatter', () => {
  test('separates a YAML block from the body', () => {
    const { frontmatter, body } = splitFrontmatter(
      '---\ntags: [a, b]\naliases:\n  - M\n---\n# Title\n'
    )
    expect(frontmatter).toEqual({ tags: ['a', 'b'], aliases: ['M'] })
    expect(body).toBe('# Title\n')
  })

  test('a document without frontmatter is all body', () => {
    const { frontmatter, body } = splitFrontmatter('# Title\n---\nnot frontmatter\n')
    expect(frontmatter).toEqual({})
    expect(body).toBe('# Title\n---\nnot frontmatter\n')
  })

  test('invalid YAML yields an empty frontmatter and keeps the body', () => {
    const { frontmatter, body } = splitFrontmatter('---\n: [\n---\nbody')
    expect(frontmatter).toEqual({})
    expect(body).toBe('body')
  })
})
