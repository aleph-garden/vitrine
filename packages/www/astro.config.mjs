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
      title: 'Aleph Garden',
      description: 'Your data as RDF in a store you own, rendered through views you choose.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/aleph-garden' }],
      sidebar: [
        {
          label: 'view',
          items: [
            { label: 'Overview', link: '/docs/view/' },
            { label: 'Contracts', link: '/docs/view/contracts/' },
            { label: 'Selection', link: '/docs/view/selection/' },
            { label: 'Rendering and re-render', link: '/docs/view/rendering/' },
            { label: 'Write a view', link: '/docs/view/guides/write-a-view/' },
            { label: 'Build a host', link: '/docs/view/guides/build-a-host/' }
          ]
        }
      ]
    })
  ]
})
