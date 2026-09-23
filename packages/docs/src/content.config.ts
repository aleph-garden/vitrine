import { defineCollection } from 'astro:content'
import { docsSchema } from '@astrojs/starlight/schema'
import { glob } from 'astro/loaders'

// The documents live at the repository root, so they are found next to the
// code they describe rather than inside an Astro package.
const DOCS = '../../docs'

// Only the published tree. An allowlist rather than an exclusion, so a new
// directory beside these cannot reach the site by being added.
const PUBLISHED = ['[^_]*.mdx', '{run,author,host,reference,design}/**/[^_]*.mdx']

export const collections = {
  docs: defineCollection({
    loader: glob({ base: DOCS, pattern: PUBLISHED }),
    schema: docsSchema()
  })
}
