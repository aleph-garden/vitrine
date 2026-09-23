// @ts-check
import { fileURLToPath } from 'node:url'
import aleph from '@aleph-garden/starlight-theme'
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import mermaid from 'astro-mermaid'

export default defineConfig({
  site: 'https://aleph.garden',
  // The Worker answers /vitrine/docs/* and nothing outside it, so every file
  // the site emits, scripts, styles and the search index included, has to
  // live under that prefix. The output directory repeats it because the
  // Worker maps a URL path to the same path under dist/.
  base: '/vitrine/docs',
  outDir: './dist/vitrine/docs',
  // The documents live at the repository root and are addressed by the site
  // rather than the other way round, so they name components through an
  // alias instead of a path that counts levels out of the content tree.
  vite: {
    resolve: {
      alias: {
        '@components': fileURLToPath(new URL('./src/components', import.meta.url))
      }
    }
  },
  integrations: [
    // Before Starlight, so the ```mermaid fences are claimed before
    // Expressive Code sees them.
    mermaid({ theme: 'neutral', autoTheme: true }),
    starlight({
      title: 'Vitrine',
      // The domain's own icon. Starlight puts `base` in front of a path, and the
      // icon is served by the root site rather than from under this prefix.
      favicon: 'https://aleph.garden/favicon.svg',
      description: 'A rendering layer for IRIs, part of Aleph Garden. One IRI in, HTML out.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/aleph-garden' }],
      // Starlight appends the entry's path, which is relative to this package and
      // climbs out of it to the repository's docs/; the URL resolves the `..`.
      editLink: { baseUrl: 'https://github.com/aleph-garden/vitrine/edit/main/packages/docs/' },
      plugins: [aleph({ project: 'vitrine' })],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'Why this exists', link: '/why/' },
            { label: 'Roadmap', link: '/roadmap/' }
          ]
        },
        {
          label: 'Run it',
          items: [
            { label: 'Install and build', link: '/run/install/' },
            { label: 'Serve it from your pod', link: '/run/pod/' },
            { label: 'Put it in a page you have', link: '/run/embed/' },
            { label: 'The Markdown view', link: '/run/markdown/' }
          ]
        },
        {
          label: 'Author a view',
          items: [
            { label: 'Your first view', link: '/author/getting-started/' },
            { label: 'Use RDF', link: '/author/use-rdf/' },
            { label: 'Fetch resources', link: '/author/fetch-resources/' },
            { label: 'Interaction', link: '/author/interaction/' }
          ]
        },
        {
          label: 'Build a browser host',
          items: [
            { label: 'Your first browser host', link: '/host/getting-started/' },
            { label: 'Resolving', link: '/host/resolving/' },
            { label: 'Navigation and events', link: '/host/navigation/' },
            { label: 'Registry and configuration', link: '/host/registry/' }
          ]
        },
        {
          label: 'Designed, not built',
          items: [
            { label: 'Writing', link: '/design/writes/' },
            { label: 'Sandboxing views', link: '/design/sandboxing/' }
          ]
        },
        {
          label: 'Reference',
          items: [
            { label: 'Contracts', link: '/reference/contracts/' },
            { label: 'Selection', link: '/reference/selection/' },
            { label: 'Rendering and re-render', link: '/reference/rendering/' },
            { label: 'Representations', link: '/reference/representations/' },
            { label: 'Transclusion', link: '/reference/transclusion/' },
            { label: 'Sessions', link: '/reference/sessions/' }
          ]
        }
      ]
    })
  ]
})
