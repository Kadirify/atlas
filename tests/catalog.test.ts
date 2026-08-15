import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../src/main/i18n'
import { catalog, CATALOG, fitOf, isAtlasModel, recommend, tierOf } from '../src/main/services/catalog'
import { describeError } from '../src/main/services/ollama'

// ollama.ts Electron'u içe aktarır; testte gerçek Electron yoktur.
vi.mock('electron', () => ({ app: { getPath: () => '' } }))

afterEach(() => setLanguage('tr'))

describe('tierOf', () => {
  it('donanımı seviyeye çevirir', () => {
    expect(tierOf(8, 0)).toBe('baslangic')
    expect(tierOf(16, 0)).toBe('orta')
    expect(tierOf(8, 6)).toBe('orta')
    expect(tierOf(32, 12)).toBe('iyi')
    expect(tierOf(64, 24)).toBe('guclu')
  })
})

describe('recommend', () => {
  const byId = (id: string) => CATALOG.find((m) => m.id === id)!

  it('12 GB ekran kartında karta sığan en iyi modeli önerir', () => {
    const r = recommend({ ramGb: 32, bestVramGb: 12 })
    expect(r.recommended.id).toBe('atlas-guclu:latest')
    expect(r.recommended.fit).toBe('rahat')
    expect(r.faster && r.faster.sizeGb < r.recommended.sizeGb).toBe(true)
    // Ailenin en güçlüsü önerildiği için daha güçlüsü yoktur.
    expect(r.stronger).toBeNull()
  })

  it('ekran kartı olmayan 8 GB bilgisayarda ailenin en küçüğünü önerir', () => {
    const r = recommend({ ramGb: 8, bestVramGb: 0 })
    expect(r.recommended.id).toBe('atlas-mini:latest')
    expect(r.recommended.fit).toBe('yavas')
  })

  it('ekran kartı olmayan 16 GB bilgisayarda orta model önerir', () => {
    expect(recommend({ ramGb: 16, bestVramGb: 0 }).recommended.id).toBe('atlas-hafif:latest')
  })

  it('24 GB ekran kartında en güçlü modeli önerir ve daha güçlüsü yoktur', () => {
    const r = recommend({ ramGb: 64, bestVramGb: 24 })
    expect(r.recommended.id).toBe('atlas-guclu:latest')
    expect(r.stronger).toBeNull()
  })

  it('çok zayıf bilgisayarda bile bir model döndürür', () => {
    const r = recommend({ ramGb: 4, bestVramGb: 0 })
    expect(r.recommended.id).toBe('atlas-mini:latest')
    expect(r.faster).toBeNull()
  })

  it('sığmayan modeli sığmaz diye işaretler ve kurulu olanı bilir', () => {
    expect(fitOf(byId('atlas-code:latest'), { ramGb: 8, bestVramGb: 0 })).toBe('sigmaz')
    const r = recommend({ ramGb: 32, bestVramGb: 12 }, [
      { name: 'atlas-guclu:latest', sizeGb: 8 },
      { name: 'ozel-model:latest', sizeGb: 0.5 }
    ])
    expect(r.recommended.installed).toBe(true)
    expect(r.all.filter((m) => m.installed)).toHaveLength(1)
    // Atlas ailesinden olmayan kurulu modeller hiçbir listede görünmez.
    expect(r.all.some((m) => m.id === 'ozel-model:latest')).toBe(false)
  })

  it('katalog yalnızca Atlas ailesinden oluşur', () => {
    expect(CATALOG.length).toBeGreaterThan(0)
    expect(CATALOG.every((m) => m.family === 'Atlas' && isAtlasModel(m.id))).toBe(true)
    expect(isAtlasModel('gemma4:e4b')).toBe(false)
    expect(isAtlasModel('atlas:latest')).toBe(false)
    expect(isAtlasModel(null)).toBe(false)
  })
})

describe('dil', () => {
  const refused = Object.assign(new Error('fetch failed'), { cause: new Error('connect ECONNREFUSED 127.0.0.1:11434') })

  it('varsayılan dilde Türkçe ad, açıklama ve hata verir', () => {
    const r = recommend({ ramGb: 8, bestVramGb: 0 }, [{ name: 'ozel-model:latest', sizeGb: 0.5 }])
    expect(r.all.find((m) => m.id === 'atlas-hafif:latest')?.name).toBe('Atlas Light')
    expect(describeError(refused)).toBe('Ollama çalışmıyor. Ayarlar → Modeller bölümünden yeniden başlatın.')
  })

  it('İngilizcede model adlarını ve açıklamalarını İngilizce verir', () => {
    setLanguage('en')
    const r = recommend({ ramGb: 8, bestVramGb: 0 }, [{ name: 'ozel-model:latest', sizeGb: 0.5 }])
    expect(r.all.find((m) => m.id === 'atlas-hafif:latest')?.name).toBe('Atlas Light')
    expect(r.all.find((m) => m.id === 'atlas-hafif:latest')?.description).toMatch(/laptops/)
    // Sıralama ve öneri dile bağlı değildir.
    expect(r.all.map((m) => m.id)).toEqual([...CATALOG].sort((a, b) => a.rank - b.rank).map((m) => m.id))
  })

  it('katalogun iki dili aynı modelleri içerir ve hiçbir metin boş değildir', () => {
    const tr = catalog('tr')
    const en = catalog('en')
    expect(tr).toEqual(CATALOG)
    expect(en.map((m) => m.id)).toEqual(tr.map((m) => m.id))
    for (const m of [...tr, ...en]) {
      expect(typeof m.name).toBe('string')
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.description.length).toBeGreaterThan(0)
    }
  })

  it('İngilizcede hata mesajlarını İngilizce verir', () => {
    setLanguage('en')
    expect(describeError(refused)).toBe("Ollama isn't running. Restart it from Settings → Models.")
  })
})
