import { defineConfig } from 'vite'

// Assets must be addressed from the origin root: the document is served
// under the IRI of whatever resource was requested.
export default defineConfig({
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true }
})
