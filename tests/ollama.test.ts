import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

import { isUnreachable } from '../src/main/services/ollama'

describe('isUnreachable', () => {
  it('Ollama kapalıyken gelen bağlantı hatalarını tanır', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { code: 'ECONNREFUSED' })
    expect(isUnreachable(new TypeError('fetch failed', { cause: refused }))).toBe(true)
    expect(isUnreachable({ original: new TypeError('fetch failed') })).toBe(true)
  })

  it('model ya da istek hatalarını bağlantı hatası saymaz', () => {
    expect(isUnreachable(new Error('model "x" not found'))).toBe(false)
    expect(isUnreachable(new Error('llama runner process has terminated: exit status 0xc0000409'))).toBe(false)
    expect(isUnreachable(null)).toBe(false)
  })
})

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { downloadInstaller, translateApiError } from '../src/main/services/ollama'
import { L, setLanguage } from '../src/main/i18n'

describe('Ollama kurulum dosyasını indirme', () => {
  afterEach(() => vi.unstubAllGlobals())

  const withDir = async (run: (file: string) => Promise<void>): Promise<void> => {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-kurulum-'))
    try {
      await run(join(dir, 'OllamaSetup.exe'))
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }

  it('tam inen dosyayı yazar ve ilerlemeyi bildirir', async () => {
    setLanguage('tr')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('0123456789', { status: 200, headers: { 'content-length': '10' } })))
    await withDir(async (file) => {
      const progress: number[] = []
      await downloadInstaller('https://example.com/kurulum.exe', file, (p) => progress.push(p.percent))
      expect(await readFile(file, 'utf8')).toBe('0123456789')
      expect(progress.at(-1)).toBe(100)
    })
  })

  it('internet yokken, sunucu hata verince ve dosya yarım inince ne olduğunu söyler', async () => {
    setLanguage('tr')
    const t = L().main.ollama
    await withDir(async (file) => {
      vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))
      await expect(downloadInstaller('https://example.com/kurulum.exe', file, () => {})).rejects.toThrow(t.installerUnreachable)

      vi.stubGlobal('fetch', vi.fn(async () => new Response('yok', { status: 404 })))
      await expect(downloadInstaller('https://example.com/kurulum.exe', file, () => {})).rejects.toThrow(t.installerDownloadFailed(404))

      vi.stubGlobal('fetch', vi.fn(async () => new Response('0123', { status: 200, headers: { 'content-length': '10' } })))
      await expect(downloadInstaller('https://example.com/kurulum.exe', file, () => {})).rejects.toThrow(t.installerIncomplete)
    })
  })

  it('veri gelmeyi keserse süresiz beklemez', async () => {
    setLanguage('tr')
    // Bağlantı kurulur, ilk parça gelir, sonra hiç veri gelmez; istek kesilince akış hata verir.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('01'))
            init?.signal?.addEventListener('abort', () => controller.error(new Error('kesildi')))
          }
        })
        return new Response(body, { status: 200, headers: { 'content-length': '1000' } })
      })
    )
    await withDir(async (file) => {
      const started = Date.now()
      await expect(downloadInstaller('https://example.com/kurulum.exe', file, () => {}, 150)).rejects.toThrow(L().main.ollama.installerUnreachable)
      expect(Date.now() - started).toBeLessThan(5000)
    })
  })
})

describe('Ollama hata iletileri', () => {
  it('eski Ollama sürümünün teknik hatası anlaşılır iletiye çevrilir', () => {
    setLanguage('tr')
    expect(translateApiError('pull model manifest: 412: The model you are attempting to pull requires a newer version of Ollama.')).toContain('daha yeni bir sürümü')
    expect(translateApiError('error loading model: unknown model architecture: gemma4')).toContain('daha yeni bir sürümü')
    expect(translateApiError('model "x" not found', 'x')).toContain('kurulu değil')
    expect(translateApiError('başka bir hata')).toBe('başka bir hata')
  })
})
