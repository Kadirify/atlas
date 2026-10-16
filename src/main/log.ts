import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Hata bildirimine eklenebilecek kayıt dosyası. Sohbet içeriği, dosya içeriği, komut ya da sorgu metni yazılmaz;
 * yalnızca hatalar, çökmeler, donmalar ve Ollama'nın durumu. Electron'a bağlı değildir: testlerde ve ölçümlerde
 * `initLog` çağrılmazsa hiçbir şey yazmaz.
 */

const FILE = 'atlas.log'
/** Dosya bu boyutu aşınca atlas.1.log olur; en fazla KEEP eski dosya tutulur. */
const MAX_BYTES = 1024 * 1024
const KEEP = 3
/** Tek bir kaydın en fazla uzunluğu (yığın izi dahil) */
const MAX_ENTRY = 8000
/** Aynı kayıt bu süre içinde tekrar ederse yazılmaz, yalnızca sayılır. */
const REPEAT_WINDOW_MS = 60_000

export type LogLevel = 'info' | 'warn' | 'error'

let folder: string | null = null
let size = 0
let echo = false
let last = { key: '', at: 0, repeats: 0, level: 'info' as LogLevel }

export function initLog(dir: string, options: { echo?: boolean } = {}): void {
  echo = !!options.echo
  try {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, FILE)
    size = existsSync(file) ? statSync(file).size : 0
    folder = dir
  } catch {
    folder = null
  }
}

/** Kayıt klasörü; kayıt açılamadıysa null */
export function logFolder(): string | null {
  return folder
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function stamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/** Hatayı (nedenleriyle birlikte) ya da başka bir ayrıntıyı tek metne çevirir. */
export function describe(detail: unknown, depth = 0): string {
  if (detail === undefined || detail === null) return ''
  if (detail instanceof Error) {
    const head = `${detail.name}: ${detail.message}`
    const stack = detail.stack?.startsWith(head) ? detail.stack.slice(head.length) : detail.stack ? `\n${detail.stack}` : ''
    const code = (detail as { code?: unknown }).code
    const cause = (detail as { cause?: unknown }).cause
    return (
      head +
      (code !== undefined ? ` [${String(code)}]` : '') +
      stack +
      (cause !== undefined && depth < 3 ? `\nCaused by: ${describe(cause, depth + 1)}` : '')
    )
  }
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

function rotate(dir: string): void {
  rmSync(join(dir, `atlas.${KEEP}.log`), { force: true })
  for (let i = KEEP - 1; i >= 1; i--) {
    const from = join(dir, `atlas.${i}.log`)
    if (existsSync(from)) renameSync(from, join(dir, `atlas.${i + 1}.log`))
  }
  renameSync(join(dir, FILE), join(dir, 'atlas.1.log'))
  size = 0
}

function write(level: LogLevel, text: string): void {
  const line = `${stamp()} ${level.toUpperCase().padEnd(5)} ${text.replace(/\r?\n/g, '\n    ')}\n`
  if (echo) (level === 'info' ? console.log : level === 'warn' ? console.warn : console.error)(line.trimEnd())
  if (!folder) return
  try {
    const bytes = Buffer.byteLength(line)
    if (size > 0 && size + bytes > MAX_BYTES) rotate(folder)
    appendFileSync(join(folder, FILE), line, 'utf8')
    size += bytes
  } catch {
    // Kayıt yazılamıyorsa (disk dolu, izin yok) uygulama bundan etkilenmemeli.
  }
}

/** Bir kayıt yazar. Hiçbir zaman hata fırlatmaz; çökme anında da güvenle çağrılabilir (eşzamanlı yazar). */
export function log(level: LogLevel, message: string, detail?: unknown): void {
  if (!folder && !echo) return
  let text = message
  const extra = describe(detail)
  if (extra) text += `: ${extra}`
  if (text.length > MAX_ENTRY) text = `${text.slice(0, MAX_ENTRY)}…`
  const key = `${level} ${text}`
  const now = Date.now()
  if (key === last.key && now - last.at < REPEAT_WINDOW_MS) {
    last.repeats++
    return
  }
  if (last.repeats > 0) write(last.level, `(previous entry repeated ${last.repeats} more times)`)
  last = { key, at: now, repeats: 0, level }
  write(level, text)
}

/** Sayılıp yazılmamış tekrarları yazar (kapanışta). */
export function flushLog(): void {
  if (last.repeats > 0) write(last.level, `(previous entry repeated ${last.repeats} more times)`)
  last = { key: '', at: 0, repeats: 0, level: 'info' }
}

/** Son `days` gündeki hata ve uyarı sayısı (tanılama bilgisi için; kayıtların metni verilmez) */
export function logSummary(days = 7, now = new Date()): { errors: number; warnings: number } {
  const result = { errors: 0, warnings: 0 }
  if (!folder) return result
  const since = stamp(new Date(now.getTime() - days * 86_400_000))
  for (const name of [FILE, ...Array.from({ length: KEEP }, (_, i) => `atlas.${i + 1}.log`)]) {
    let content: string
    try {
      content = readFileSync(join(folder, name), 'utf8')
    } catch {
      continue
    }
    for (const line of content.split('\n')) {
      const m = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}) (ERROR|WARN) /.exec(line)
      if (!m || m[1] < since) continue
      if (m[2] === 'ERROR') result.errors++
      else result.warnings++
    }
  }
  return result
}

/**
 * Ana sürecin donmalarını kaydeder: her saniye çalışması gereken bir zamanlayıcı geç kalırsa o süre boyunca uygulama
 * (bütün pencereler) cevap vermemiştir. `lastSuspend` bilgisayarın en son uykuya geçtiği an; uykuda geçen süre donma
 * sayılmaz.
 */
export function watchEventLoop(lastSuspend: () => number, thresholdMs = 2000): () => void {
  const INTERVAL = 1000
  let previous = Date.now()
  const timer = setInterval(() => {
    const now = Date.now()
    const lag = now - previous - INTERVAL
    const since = previous
    previous = now
    // Saat elle ya da eşitlemeyle ileri alındıysa da zaman atlar; birkaç dakikalık "donma" gerçek değildir.
    if (lag < thresholdMs || lag > 10 * 60_000 || lastSuspend() >= since) return
    log('warn', `Main process was unresponsive for ${(lag / 1000).toFixed(1)} s`)
  }, INTERVAL)
  timer.unref()
  return () => clearInterval(timer)
}
