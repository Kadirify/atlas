import { randomUUID } from 'node:crypto'
import type { AppRun, JobChunk, JobDone, JobError } from '@shared/types'
import { L } from '../i18n'
import { lengthNotice, loopNotice, PartialError, streamGuarded } from './generate'
import { describeError, type OllamaMessage } from './ollama'

export interface JobEvents {
  chunk(c: JobChunk): void
  done(d: JobDone): void
  error(e: JobError): void
}

export interface JobOptions {
  model: string
  messages: OllamaMessage[]
  temperature?: number
  /** İş başarıyla bitince çağrılır; mini uygulama çalıştırmalarında sonucu kaydeder. */
  onFinish?: (text: string) => AppRun | null
}

/** Sohbet dışındaki üretim işlerini (mini uygulama, prompt geliştirme) yürütür. */
export class JobService {
  private active = new Map<string, AbortController>()

  constructor(private events: JobEvents) {}

  start(options: JobOptions): string {
    const jobId = randomUUID()
    void this.run(jobId, options)
    return jobId
  }

  stop(jobId: string): void {
    this.active.get(jobId)?.abort()
  }

  stopAll(): void {
    for (const c of this.active.values()) c.abort()
  }

  private async run(jobId: string, options: JobOptions): Promise<void> {
    const controller = new AbortController()
    this.active.set(jobId, controller)
    try {
      const result = await streamGuarded(
        { model: options.model, messages: options.messages, temperature: options.temperature },
        controller,
        (delta) => this.events.chunk({ jobId, delta })
      )
      this.active.delete(jobId)
      const text = result.text.trim()
      if (!text) throw new Error(L().main.generate.emptyReply)
      const notice = result.looped ? loopNotice() : result.stats.truncated ? lengthNotice() : null
      this.events.done({ jobId, text, notice, run: options.onFinish?.(text) ?? null })
    } catch (err) {
      this.active.delete(jobId)
      const partial = err instanceof PartialError ? err.partial.trim() : ''
      const cause = err instanceof PartialError ? err.original : err
      if (controller.signal.aborted) {
        // Kullanıcı durdurdu: yazılan kısım ekranda kalır, geçmişe kaydedilmez.
        this.events.done({ jobId, text: partial, notice: null, run: null })
        return
      }
      this.events.error({ jobId, error: describeError(cause) })
    }
  }
}
