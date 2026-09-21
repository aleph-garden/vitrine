// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import mermaid from 'astro-mermaid'

export default defineConfig({
  site: 'https://aleph.garden',
  redirects: {
    '/docs/view/contracts': '/docs/view/reference/contracts/',
    '/docs/view/selection': '/docs/view/reference/selection/',
    '/docs/view/rendering': '/docs/view/reference/rendering/'
  },
  integrations: [
    // Before Starlight, so the ```mermaid fences are claimed before
    // Expressive Code sees them.
    mermaid({ theme: 'neutral', autoTheme: true }),
    starlight({
      title: 'Aleph Garden',
      description: 'Your data as RDF in a store you own, rendered through views you choose.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/aleph-garden' }],
      sidebar: [
        {
          label: 'view',
          items: [{ label: 'Overview', link: '/docs/view/' }]
        },
        {
          label: 'Author a view',
          items: [
            { label: 'Your first view', link: '/docs/view/author/getting-started/' },
            { label: 'Use RDF', link: '/docs/view/author/use-rdf/' },
            { label: 'Fetch resources', link: '/docs/view/author/fetch-resources/' },
            { label: 'Interaction', link: '/docs/view/author/interaction/' }
          ]
        },
        {
          label: 'Create a host',
          items: [
            { label: 'Your first host', link: '/docs/view/host/getting-started/' },
            { label: 'Resolving', link: '/docs/view/host/resolving/' },
            { label: 'Navigation and events', link: '/docs/view/host/navigation/' },
            { label: 'Registry and configuration', link: '/docs/view/host/registry/' }
          ]
        },
        {
          label: 'Reference',
          items: [
            { label: 'Contracts', link: '/docs/view/reference/contracts/' },
            { label: 'Selection', link: '/docs/view/reference/selection/' },
            { label: 'Rendering and re-render', link: '/docs/view/reference/rendering/' }
          ]
        }
      ]
    })
  ]
})
