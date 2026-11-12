import { dictFor } from '@shared/i18n'
import { L } from '../i18n'
import { findLoopStart } from './loop'
import { chatStream, type ChatOptions, type ChatStats } from './ollama'

/** Tekrar döngüsü kontrolü her bu kadar yeni karakterde bir yapılır. */
const LOOP_CHECK_EVERY = 120

/** Model tekrar döngüsüne girdiğinde gösterilen not, geçerli dilde. */
export function loopNotice(): string {
  return L().main.generate.loopNotice
}

/** Cevap uzunluk sınırına takıldığında gösterilen not, geçerli dilde. */
export function lengthNotice(): string {
  return L().main.generate.lengthNotice
}

/** Eski sabitler: her zaman Türkçedir. Yeni kodda loopNotice() ve lengthNotice() kullanılır. */
export const LOOP_NOTICE = dictFor('tr').main.generate.loopNotice
export const LENGTH_NOTICE = dictFor('tr').main.generate.lengthNotice

export interface GuardedResult {
  text: string
  stats: ChatStats
  /** Model tekrar döngüsüne girdiği için akış kesildiyse true; text tekrar eden kısım atılmış halidir. */
  looped: boolean
}

/**
 * Cevabı akıtır ve tekrar döngüsüne karşı korur.
 * Hata olursa ya da iptal edilirse o ana kadar gelen metin hataya iliştirilir.
 */
export async function streamGuarded(
  opts: ChatOptions,
  controller: AbortController,
  onDelta: (delta: string) => void
): Promise<GuardedResult> {
  let text = ''
  let checkedAt = 0
  const stream = chatStream({ ...opts, signal: controller.signal })
  try {
    let result = await stream.next()
    while (!result.done) {
      text += result.value
      onDelta(result.value)

      if (text.length - checkedAt >= LOOP_CHECK_EVERY) {
        checkedAt = text.length
        const cut = findLoopStart(text)
        if (cut !== null) {
          controller.abort()
          void stream.return({ tokens: null, durationMs: null, truncated: true }).catch(() => {})
          return {
            text: text.slice(0, cut).trimEnd(),
            stats: { tokens: null, durationMs: null, truncated: true },
            looped: true
          }
        }
      }
      result = await stream.next()
    }
    return { text, stats: result.value, looped: false }
  } catch (err) {
    throw new PartialError(err, text)
  }
}

/** Akış yarıda kesildiğinde o ana kadar gelen metni taşır. */
export class PartialError extends Error {
  constructor(
    public readonly original: unknown,
    public readonly partial: string
  ) {
    super(original instanceof Error ? original.message : String(original))
  }
}
