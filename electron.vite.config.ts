import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // SQLite sorguları ve belge okuma ayrı süreçte çalışır (services/sqliteRunner, documentRunner); onların dosyaları da
    // ana sürecin yanına derlenir.
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          sqliteWorker: resolve('src/main/workers/sqlite.ts'),
          documentWorker: resolve('src/main/workers/document.ts')
        }
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
