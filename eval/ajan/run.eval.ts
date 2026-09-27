import { rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'

// Servisler pencere olmadan çalışır: Electron'dan kullanılan birkaç şey yerine sahteleri konur.
vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'home' ? homedir() : tmpdir()), isPackaged: false },
  shell: { trashItem: (path: string) => rm(path, { recursive: true, force: true }) },
  safeStorage: { isEncryptionAvailable: () => false },
  clipboard: {}
}))

import { optionsFromEnv, runSuite } from './harness'

it('ajan test seti', async () => {
  const options = optionsFromEnv()
  const summary = await runSuite(options)
  // Sürüm kapısı: AJAN_GATE=0.7 verilirse başarı oranı bunun altındaki her model testi düşürür.
  if (options.gate !== null) {
    for (const model of summary.models) expect(model.rate, `${model.model} başarı oranı`).toBeGreaterThanOrEqual(options.gate)
  }
})
