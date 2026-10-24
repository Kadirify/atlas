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

import { translateApiError } from '../src/main/services/ollama'
import { setLanguage } from '../src/main/i18n'

describe('Ollama hata iletileri', () => {
  it('eski Ollama sürümünün teknik hatası anlaşılır iletiye çevrilir', () => {
    setLanguage('tr')
    expect(translateApiError('pull model manifest: 412: The model you are attempting to pull requires a newer version of Ollama.')).toContain('daha yeni bir sürümü')
    expect(translateApiError('error loading model: unknown model architecture: gemma4')).toContain('daha yeni bir sürümü')
    expect(translateApiError('model "x" not found', 'x')).toContain('kurulu değil')
    expect(translateApiError('başka bir hata')).toBe('başka bir hata')
  })
})
