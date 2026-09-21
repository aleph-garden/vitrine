import { documentNote, hostDocument } from '@aleph-garden/host-core/vite'
import { defineConfig } from 'vite'

// Assets must be addressed from the origin root: the document is served
// under a location the host does not choose.
export default defineConfig({
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [hostDocument(), documentNote()]
})
