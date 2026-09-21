// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import mermaid from 'astro-mermaid'

export default defineConfig({
  site: 'https://aleph.garden',
  // Everything lived under /docs/view/ before the component had a name,
  // and the reference pages sat one level higher than they do now.
  redirects: {
    '/docs/view': '/vitrine/docs/',
    '/docs/view/author/getting-started': '/vitrine/docs/author/getting-started/',
    '/docs/view/author/use-rdf': '/vitrine/docs/author/use-rdf/',
    '/docs/view/author/fetch-resources': '/vitrine/docs/author/fetch-resources/',
    '/docs/view/author/interaction': '/vitrine/docs/author/interaction/',
    '/docs/view/author/transclude': '/vitrine/docs/author/transclude/',
    '/docs/view/host/getting-started': '/vitrine/docs/host/getting-started/',
    '/docs/view/host/resolving': '/vitrine/docs/host/resolving/',
    '/docs/view/host/navigation': '/vitrine/docs/host/navigation/',
    '/docs/view/host/registry': '/vitrine/docs/host/registry/',
    '/docs/view/reference/contracts': '/vitrine/docs/reference/contracts/',
    '/docs/view/reference/selection': '/vitrine/docs/reference/selection/',
    '/docs/view/reference/rendering': '/vitrine/docs/reference/rendering/',
    '/docs/view/contracts': '/vitrine/docs/reference/contracts/',
    '/vitrine/docs/contracts': '/vitrine/docs/reference/contracts/',
    '/docs/view/selection': '/vitrine/docs/reference/selection/',
    '/vitrine/docs/selection': '/vitrine/docs/reference/selection/',
    '/docs/view/rendering': '/vitrine/docs/reference/rendering/',
    '/vitrine/docs/rendering': '/vitrine/docs/reference/rendering/'
  },
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
          items: [{ label: 'Overview', link: '/vitrine/docs/' }]
        },
        {
          label: 'Author a view',
          items: [
            { label: 'Your first view', link: '/vitrine/docs/author/getting-started/' },
            { label: 'Use RDF', link: '/vitrine/docs/author/use-rdf/' },
            { label: 'Fetch resources', link: '/vitrine/docs/author/fetch-resources/' },
            { label: 'Interaction', link: '/vitrine/docs/author/interaction/' },
            {
              label: 'Transclude resources',
              link: '/vitrine/docs/author/transclude/',
              badge: { text: 'planned', variant: 'caution' }
            }
          ]
        },
        {
          label: 'Create a host',
          items: [
            { label: 'Your first host', link: '/vitrine/docs/host/getting-started/' },
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
