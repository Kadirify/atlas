import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

import bundled from '../resources/atlas-models.json'
import { atlasRecipe, catalog, recipesVersion, recommend, setAtlasModels } from '../src/main/services/catalog'
import { checkUpdates, compareVersions, isValidRecipes, loadSavedRecipes } from '../src/main/services/updates'

function respond(release: unknown, recipes: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('api.github.com') ? release : recipes
      return { ok: body !== null, status: body === null ? 404 : 200, json: async () => body }
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  setAtlasModels(bundled)
})

describe('compareVersions', () => {
  it('sürümleri sayı sayı karşılaştırır', () => {
    expect(compareVersions('v0.2.0', '0.1.9')).toBeGreaterThan(0)
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0)
    expect(compareVersions('0.1.0', 'v0.1.0')).toBe(0)
    expect(compareVersions('0.1', '0.1.1')).toBeLessThan(0)
  })
})

describe('Atlas ailesi', () => {
  it('her dilde katalogda yer alır ve tarifi bulunur', () => {
    const ids = bundled.models.map((m) => m.id)
    for (const lang of ['tr', 'en'] as const) {
      const all = catalog(lang)
      for (const id of ids) expect(all.find((m) => m.id === id)?.base).toBeTruthy()
    }
    expect(catalog('en').find((m) => m.id === 'atlas-hafif:latest')?.name).toBe('Atlas Light')
    expect(atlasRecipe('atlas-code:latest')?.base).toBe('kadirify/atlas-code')
    expect(atlasRecipe('qwen3.5:4b')).toBeNull()
  })

  it('işe özel model listede görünür ama genel öneri olmaz', () => {
    const r = recommend({ ramGb: 64, bestVramGb: 12 })
    expect(r.all.some((m) => m.id === 'atlas-code:latest')).toBe(true)
    for (const m of [r.recommended, r.faster, r.stronger]) expect(m?.specialty).toBeUndefined()
  })
})

describe('isValidRecipes', () => {
  it('uygulamayla gelen dosyayı kabul eder, bozuk olanı reddeder', () => {
    expect(isValidRecipes(bundled)).toBe(true)
    expect(isValidRecipes(null)).toBe(false)
    expect(isValidRecipes({ version: 2, models: [] })).toBe(false)
    expect(isValidRecipes({ version: 2, models: [{ ...bundled.models[0], id: 'baska-model:latest' }] })).toBe(false)
    expect(isValidRecipes({ version: 2, models: [{ ...bundled.models[0], base: '' }] })).toBe(false)
  })
})

describe('checkUpdates', () => {
  it('yeni sürümü ve yeni tarifleri bildirir, tarifleri kaydeder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-upd-'))
    try {
      const newer = { ...bundled, version: bundled.version + 1 }
      respond({ tag_name: 'v9.0.0', html_url: 'https://github.com/kadirify/atlas/releases/tag/v9.0.0' }, newer)
      const info = await checkUpdates('0.1.0', recipesVersion(), dir)
      expect(info.hasUpdate).toBe(true)
      expect(info.latestVersion).toBe('9.0.0')
      expect(info.url).toContain('/releases/tag/v9.0.0')
      expect(info.modelsUpdated).toBe(true)
      expect(recipesVersion()).toBe(newer.version)
      expect(JSON.parse(readFileSync(join(dir, 'atlas-models.json'), 'utf8')).version).toBe(newer.version)

      // Kaydedilen tarifler sonraki açılışta yüklenir.
      setAtlasModels(bundled)
      loadSavedRecipes(dir, bundled.version)
      expect(recipesVersion()).toBe(newer.version)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('henüz yayın yoksa güncelleme yok der', async () => {
    respond(null, null)
    const info = await checkUpdates('0.1.0', recipesVersion(), tmpdir())
    expect(info).toMatchObject({ hasUpdate: false, latestVersion: null, modelsUpdated: false })
    expect(info.url).toBe('https://github.com/kadirify/atlas/releases')
  })

  it('yabancı bir indirme adresini kabul etmez, bozuk tarifi yok sayar', async () => {
    respond({ tag_name: 'v9.0.0', html_url: 'https://example.com/kotu' }, { version: 99, models: 'bozuk' })
    const info = await checkUpdates('0.1.0', recipesVersion(), tmpdir())
    expect(info.url).toBe('https://github.com/kadirify/atlas/releases')
    expect(info.modelsUpdated).toBe(false)
  })

  it('bağlantı yoksa anlaşılır hata verir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ağ yok'))))
    await expect(checkUpdates('0.1.0', 1, tmpdir())).rejects.toThrow('Güncellemeler denetlenemedi')
  })
})
