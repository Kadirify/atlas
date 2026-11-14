import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateInfo } from '../src/shared/types'
import { startUpdateWatch } from '../src/main/updateWatch'

const info = (latestVersion: string | null, hasUpdate = true): UpdateInfo => ({
  currentVersion: '0.2.0',
  latestVersion,
  hasUpdate,
  url: 'https://github.com/Kadirify/atlas/releases',
  modelsUpdated: false,
  notes: '',
  installable: hasUpdate,
  sizeMb: 120
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('startUpdateWatch', () => {
  it('açılıştan sonra ve günde bir kez bakar; aynı sürüm için bir kez haber verir', async () => {
    const check = vi.fn().mockResolvedValueOnce(info('0.3.0')).mockResolvedValueOnce(info('0.3.0')).mockResolvedValueOnce(info('0.4.0'))
    const notify = vi.fn()
    const stop = startUpdateWatch({ enabled: () => true, check, notify, firstCheckMs: 1000, intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(999)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].latestVersion).toBe('0.3.0')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(check).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify.mock.calls[1][0].latestVersion).toBe('0.4.0')
    stop()
    await vi.advanceTimersByTimeAsync(50_000)
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('ayar kapalıyken internete hiç çıkmaz; güncel sürümde ve hata olunca sessiz kalır', async () => {
    const check = vi.fn().mockResolvedValue(info('0.2.0', false))
    const notify = vi.fn()
    let enabled = false
    const stop = startUpdateWatch({ enabled: () => enabled, check, notify, firstCheckMs: 10, intervalMs: 100 })
    await vi.advanceTimersByTimeAsync(500)
    expect(check).not.toHaveBeenCalled()
    enabled = true
    await vi.advanceTimersByTimeAsync(100)
    expect(check).toHaveBeenCalledTimes(1)
    check.mockRejectedValueOnce(new Error('bağlantı yok'))
    await vi.advanceTimersByTimeAsync(100)
    expect(check).toHaveBeenCalledTimes(2)
    expect(notify).not.toHaveBeenCalled()
    stop()
  })
})
