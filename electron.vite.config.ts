import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // SQLite işleri ayrı süreçte çalışır (services/sqliteRunner); onun dosyası da ana sürecin yanına derlenir.
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts'), sqliteWorker: resolve('src/main/workers/sqlite.ts') }
      }
    }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()]
  }
})
