import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Ajan test seti yalnızca bu ayarla çalışır (npm run eval:ajan). Normal testlere (npm test) ve CI'a girmez:
 * gerçek Ollama modeli ister ve uzun sürer.
 */
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    include: ['eval/ajan/run.eval.ts'],
    testTimeout: 24 * 60 * 60 * 1000,
    hookTimeout: 10 * 60 * 1000,
    fileParallelism: false
  }
})
