import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

const EMPTY_HOST = '{"@context":"https://w3id.org/aleph/ns/view","@type":"Host"}'

/** Embeds the deployment's Host document into index.html. ALEPH_HOST names
 *  the file, relative to the process cwd; without it the shell gets an empty
 *  Host node and reads every key as absent. */
function hostDocument(): Plugin {
  return {
    name: 'aleph-host',
    transformIndexHtml() {
      const path = process.env.ALEPH_HOST
      return [
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          children: path ? readFileSync(path, 'utf8') : EMPTY_HOST,
          injectTo: 'head'
        }
      ]
    }
  }
}

// Assets must be addressed from the origin root: the document is served
// under the IRI of whatever resource was requested.
export default defineConfig({
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [hostDocument()]
})
