import type { UpdateInfo } from '@shared/types'
import { log } from './log'

/** Açılıştan sonra ilk denetime kadar beklenen süre: açılışı yavaşlatmasın, Ollama başlarken ağı meşgul etmesin. */
const FIRST_CHECK_MS = 60_000
/** Atlas günlerce açık kalabilir; günde bir kez yeniden bakılır. */
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000

export interface UpdateWatchOptions {
  /** Denetim yapılsın mı (ayar kapalıysa ya da kurulum bitmediyse false) */
  enabled(): boolean
  check(): Promise<UpdateInfo>
  /** Yeni bir sürüm bulundu; aynı sürüm için bir kez çağrılır */
  notify(info: UpdateInfo & { latestVersion: string }): void
  firstCheckMs?: number
  intervalMs?: number
}

/**
 * Yeni sürümü kendiliğinden denetler: açılıştan kısa süre sonra ve sonra günde bir kez. Ayar kapalıysa internete
 * hiç çıkmaz. Bağlantı yoksa ya da GitHub cevap vermezse sessizce bir sonraki denetimi bekler. Durdurmak için dönen
 * işlevi çağır.
 */
export function startUpdateWatch(options: UpdateWatchOptions): () => void {
  let notified: string | null = null
  let running = false
  const run = async (): Promise<void> => {
    if (running || !options.enabled()) return
    running = true
    try {
      const info = await options.check()
      if (info.hasUpdate && info.latestVersion && info.latestVersion !== notified) {
        notified = info.latestVersion
        options.notify({ ...info, latestVersion: info.latestVersion })
      }
    } catch (err) {
      log('info', 'Automatic update check failed', err instanceof Error ? err.message : String(err))
    } finally {
      running = false
    }
  }
  const first = setTimeout(() => void run(), options.firstCheckMs ?? FIRST_CHECK_MS)
  const every = setInterval(() => void run(), options.intervalMs ?? CHECK_EVERY_MS)
  return () => {
    clearTimeout(first)
    clearInterval(every)
  }
}
