import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: {}, app: { getPath: () => tmpdir() } }))

import { runCommand } from '../src/main/services/code'

describe.runIf(process.platform === 'win32')('runCommand (Windows)', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'atlas-komut-'))
    // Proje klasöründeki aynı adlı bir dosya PATH'teki programın yerine çalışmamalı.
    await writeFile(join(dir, 'git.bat'), '@echo SAHTE GIT')
  })
  // Arka planda başlatılan ping birkaç saniye klasörü tutabilir; temizlik başarısız olursa önemsenmez.
  afterAll(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch(() => {}))
  const run = (command: string, signal = new AbortController().signal) => runCommand(dir, command, signal)

  it('tırnakla başlayan komutu bozmadan çalıştırır', async () => {
    const out = await run(`"${process.execPath}" -e "console.log('tirnak tamam')"`)
    expect(out.output).toContain('tirnak tamam')
    expect(out.code).toBe(0)
  })

  it('proje klasöründeki sahte git.bat çalışmaz', async () => {
    expect((await run('git --version')).output).not.toContain('SAHTE')
  })

  it('arka planda süreç bırakan komut sohbeti kilitlemez', async () => {
    const started = Date.now()
    const out = await run('start /b ping -n 6 127.0.0.1 >nul & echo bitti')
    expect(out.output).toContain('bitti')
    expect(Date.now() - started).toBeLessThan(4000)
  }, 15_000)

  it('durdurulmuş cevapta komut başlamaz, çalışırken durdurulunca hemen biter', async () => {
    const stopped = new AbortController()
    stopped.abort()
    let started = Date.now()
    expect((await run('ping -n 4 127.0.0.1', stopped.signal)).code).toBeNull()
    expect(Date.now() - started).toBeLessThan(500)

    const later = new AbortController()
    started = Date.now()
    setTimeout(() => later.abort(), 300)
    await run('ping -n 10 127.0.0.1', later.signal)
    expect(Date.now() - started).toBeLessThan(3500)
  }, 15_000)
})
