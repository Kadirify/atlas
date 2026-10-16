import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describe as describeDetail, flushLog, initLog, log, logSummary, watchEventLoop } from '../src/main/log'

let dir: string
const read = (name = 'atlas.log'): string => readFileSync(join(dir, name), 'utf8')

beforeEach(() => {
  flushLog()
  dir = mkdtempSync(join(tmpdir(), 'atlas-log-'))
  initLog(dir)
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('kayıt dosyası', () => {
  it('düzeyi ve zamanıyla yazar, çok satırlı ayrıntıyı girintiler', () => {
    log('info', 'Atlas started')
    log('error', 'Uncaught exception', new Error('boom'))
    const text = read()
    expect(text).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} INFO  Atlas started\n/)
    expect(text).toContain('ERROR Uncaught exception: Error: boom\n    ')
    // Yığın izinin satırları girintili; yeni kayıt satır başında tarihle başlar.
    expect(text.split('\n').filter((l) => /^\d{4}-/.test(l))).toHaveLength(2)
  })

  it('hatanın nedenini ve kodunu da yazar', () => {
    const err = new Error('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { code: 'ECONNREFUSED' }) })
    const text = describeDetail(err)
    expect(text).toContain('Error: fetch failed')
    expect(text).toContain('Caused by: Error: connect ECONNREFUSED 127.0.0.1:11434 [ECONNREFUSED]')
  })

  it('aynı kaydı art arda yazmaz, kaç kez tekrarlandığını yazar', () => {
    for (let i = 0; i < 5; i++) log('warn', 'models:loaded failed', 'fetch failed')
    log('info', 'Ollama is running')
    const lines = read().trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('(previous entry repeated 4 more times)')
    expect(lines[2]).toContain('Ollama is running')
  })

  it('dosya büyüyünce eskisini kenara alır, en fazla üç eski dosya tutar', () => {
    const big = 'x'.repeat(7000)
    for (let i = 0; i < 700; i++) log('info', `${i} ${big}`)
    expect(existsSync(join(dir, 'atlas.1.log'))).toBe(true)
    expect(existsSync(join(dir, 'atlas.3.log'))).toBe(true)
    expect(existsSync(join(dir, 'atlas.4.log'))).toBe(false)
    for (const name of ['atlas.log', 'atlas.1.log', 'atlas.2.log', 'atlas.3.log']) {
      expect(readFileSync(join(dir, name)).length).toBeLessThanOrEqual(1024 * 1024)
    }
    // En yeni kayıt geçerli dosyada.
    expect(read()).toContain('699 x')
  })

  it('özet yalnızca son yedi günün hata ve uyarılarını sayar, metinlerini vermez', () => {
    writeFileSync(
      join(dir, 'atlas.1.log'),
      ['2026-11-01 10:00:00.000 ERROR old', '2026-11-10 10:00:00.000 ERROR a', '2026-11-12 09:00:00.000 WARN  b', '    at stack line ERROR'].join('\n')
    )
    writeFileSync(join(dir, 'atlas.log'), '2026-11-13 08:00:00.000 WARN  c\n2026-11-13 08:00:01.000 INFO  d\n')
    expect(logSummary(7, new Date(2026, 10, 13, 12))).toEqual({ errors: 1, warnings: 2 })
  })

  it('ana sürecin donmasını kaydeder, uykuda geçen süreyi saymaz', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 13, 12) })
    let suspended = 0
    const stop = watchEventLoop(() => suspended)
    vi.advanceTimersByTime(3000)
    // Zamanlayıcı 4 saniye geç kaldı: donma
    vi.setSystemTime(Date.now() + 4000)
    vi.advanceTimersByTime(1000)
    // Bilgisayar uykuya geçti, 2 dakika sonra uyandı: donma değil
    suspended = Date.now() + 10
    vi.setSystemTime(Date.now() + 120_000)
    vi.advanceTimersByTime(1000)
    stop()
    const lines = read().trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('WARN  Main process was unresponsive for 4.0 s')
  })
})
