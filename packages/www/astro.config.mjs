// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import mermaid from 'astro-mermaid'

export default defineConfig({
  site: 'https://aleph.garden',
  integrations: [
    // Before Starlight, so the ```mermaid fences are claimed before
    // Expressive Code sees them.
    mermaid({ theme: 'neutral', autoTheme: true }),
    starlight({
      title: 'Vitrine',
      description: 'A rendering layer for IRIs, part of Aleph Garden. One IRI in, HTML out.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/aleph-garden' }],
      sidebar: [
        {
          label: 'Vitrine',
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
          label: 'Reference',
          items: [
            { label: 'Contracts', link: '/vitrine/docs/reference/contracts/' },
            { label: 'Selection', link: '/vitrine/docs/reference/selection/' },
            { label: 'Rendering and re-render', link: '/vitrine/docs/reference/rendering/' }
          ]
        }
      ]
    })
  ]
})
