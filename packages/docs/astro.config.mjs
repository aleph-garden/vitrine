// @ts-check
import { fileURLToPath } from 'node:url'
import aleph from '@aleph-garden/starlight-theme'
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import mermaid from 'astro-mermaid'

export default defineConfig({
  site: 'https://aleph.garden',
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
      description: 'A rendering layer for IRIs, part of Aleph Garden. One IRI in, HTML out.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/aleph-garden' }],
      plugins: [aleph({ project: 'vitrine' })],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'Overview', link: '/vitrine/docs/' },
            { label: 'Why this exists', link: '/vitrine/docs/why/' },
            { label: 'Roadmap', link: '/vitrine/docs/roadmap/' }
          ]
        },
        {
          label: 'Run it',
          items: [
            { label: 'Install and build', link: '/vitrine/docs/run/install/' },
            { label: 'Serve it from your pod', link: '/vitrine/docs/run/pod/' },
            { label: 'Put it in a page you have', link: '/vitrine/docs/run/embed/' },
            { label: 'The Markdown view', link: '/vitrine/docs/run/markdown/' }
          ]
        },
        {
          label: 'Author a view',
          items: [
            { label: 'Your first view', link: '/vitrine/docs/author/getting-started/' },
            { label: 'Use RDF', link: '/vitrine/docs/author/use-rdf/' },
            { label: 'Fetch resources', link: '/vitrine/docs/author/fetch-resources/' },
            { label: 'Interaction', link: '/vitrine/docs/author/interaction/' }
          ]
        },
        {
          label: 'Build a browser host',
          items: [
            { label: 'Your first browser host', link: '/vitrine/docs/host/getting-started/' },
            { label: 'Resolving', link: '/vitrine/docs/host/resolving/' },
            { label: 'Navigation and events', link: '/vitrine/docs/host/navigation/' },
            { label: 'Registry and configuration', link: '/vitrine/docs/host/registry/' }
          ]
        },
        {
          label: 'Designed, not built',
          items: [
            { label: 'Writing', link: '/vitrine/docs/design/writes/' },
            { label: 'Sandboxing views', link: '/vitrine/docs/design/sandboxing/' }
          ]
        },
        {
          label: 'Reference',
          items: [
            { label: 'Contracts', link: '/vitrine/docs/reference/contracts/' },
            { label: 'Selection', link: '/vitrine/docs/reference/selection/' },
            { label: 'Rendering and re-render', link: '/vitrine/docs/reference/rendering/' },
            { label: 'Representations', link: '/vitrine/docs/reference/representations/' },
            { label: 'Transclusion', link: '/vitrine/docs/reference/transclusion/' },
            { label: 'Sessions', link: '/vitrine/docs/reference/sessions/' }
          ]
        }
      ]
    })
  ]
})
