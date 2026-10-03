import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Stamps dist/sw.js with a hash of this build's asset list, so every deploy ships a
// byte-different service worker → browsers install it → it precaches the new
// bundles and prunes the old ones (public/sw.js).
const swBuildId = (): Plugin => ({
  name: 'sw-build-id',
  apply: 'build',
  closeBundle() {
    const dist = new URL('./dist/', import.meta.url)
    const id = createHash('sha256').update(readFileSync(new URL('asset-manifest.json', dist))).digest('hex').slice(0, 12)
    const sw = new URL('sw.js', dist)
    writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', id))
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), swBuildId()],
  // String form = file name inside dist/ (default lives in the .vite/ dot-directory).
  build: { manifest: 'asset-manifest.json' },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
})
