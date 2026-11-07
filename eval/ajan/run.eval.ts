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

// Uygulama yalnızca Atlas modelleriyle çalışır; test setinde taban modeller de (gemma4:12b gibi) ölçülebilsin diye
// bu kural kapatılır. Uygulamanın kendisi değişmez.
vi.mock('../../src/main/services/catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/services/catalog')>()
  return { ...actual, isAtlasModel: (name: string | null | undefined): name is string => !!name }
})

import { join } from 'node:path'
import { compareRuns, findBaseline, gatePreconditions, loadRun, recordGate } from './compare'
import { categoryScore, optionsFromEnv, runSuite } from './harness'

it('ajan test seti', async () => {
  const options = optionsFromEnv()
  const summary = await runSuite(options)
  // Sürüm kapısı: AJAN_GATE_ONCEKI=1 verilirse sonuç bir önceki üç tekrarlı tam turla karşılaştırılır; belirgin düşüş
  // varsa test düşer (tanımı compare.ts'de). Bir sonuç dosyasının yolu verilirse onunla karşılaştırılır.
  if (options.gatePrevious) {
    const problems: string[] = []
    for (const model of summary.models) {
      const reasons = gatePreconditions(options, summary.results, model.model)
      if (reasons.length > 0) {
        problems.push(...reasons.map((r) => `${model.model}: ${r}`))
        continue
      }
      const auto = options.gatePrevious === '1'
      const file = auto ? findBaseline(join('eval', 'ajan', 'results'), summary.file, model.model) : options.gatePrevious
      const previous = file ? loadRun(file) : null
      if (!previous) {
        if (!auto) throw new Error(`Karşılaştırılacak sonuç dosyası okunamadı: ${file}`)
        console.log(`${model.model}: karşılaştırılacak önceki üç tekrarlı tur yok; bu tur bundan sonrakilerin çizgisi.`)
        continue
      }
      const comparison = compareRuns(previous.results, summary.results, model.model)
      console.log(`${model.model}: ${file} ile ${comparison.tasks} ortak görevde karşılaştırıldı.`)
      if (comparison.tasks === 0) problems.push(`${model.model}: önceki turla ortak görev yok`)
      problems.push(...comparison.problems.map((p) => `${model.model}: ${p}`))
    }
    // Düşen tur sonuç dosyasında işaretlenir: sonraki turlar onunla karşılaştırılmaz.
    if (summary.file.endsWith('.json')) recordGate(summary.file, problems.length > 0 ? 'dustu' : 'gecti')
    expect(problems, 'sürüm kapısı: bir önceki tura göre belirgin düşüş ya da eksik tur').toEqual([])
  }
  // İsteğe bağlı mutlak sınırlar: AJAN_GATE=0.7 verilirse başarı oranı bunun altındaki her model testi düşürür.
  if (options.gate !== null) {
    for (const model of summary.models) expect(model.rate, `${model.model} başarı oranı`).toBeGreaterThanOrEqual(options.gate)
  }
  // Kod görevleri için ayrı kapı: AJAN_GATE_KOD=0.9 verilirse kod görevlerinde bunun altına düşen model testi düşürür.
  if (options.gateCode !== null) {
    for (const model of summary.models) {
      const { ok, total } = categoryScore(summary, model.model, 'kod')
      expect(total > 0 ? ok / total : 0, `${model.model} kod görevleri (${ok}/${total})`).toBeGreaterThanOrEqual(options.gateCode)
    }
  }
})
