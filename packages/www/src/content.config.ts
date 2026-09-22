import { docsSchema } from '@astrojs/starlight/schema'
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

// The documents live at the repository root, so they are found next to the
// code they describe rather than inside an Astro package.
const DOCS = '../../docs'

// Only the published tree. An allowlist rather than an exclusion, so a new
// directory beside these cannot reach the site by being added.
const PUBLISHED = ['[^_]*.mdx', '{run,author,host,reference}/**/[^_]*.mdx']

// The deployment answers `/vitrine/docs/*` and the sources are flat, so the
// path segment is put on the entry id. Expressing it as Astro's `base`
// instead would prefix every absolute link the documents already carry.
const MOUNT = 'vitrine/docs'

export const collections = {
  docs: defineCollection({
    loader: glob({
      base: DOCS,
      pattern: PUBLISHED,
      generateId: ({ entry }) => {
        const path = entry.replace(/\.mdx$/, '').replace(/(^|\/)index$/, '')
        return path ? `${MOUNT}/${path}` : MOUNT
      }
    }),
    schema: docsSchema()
  })
}
