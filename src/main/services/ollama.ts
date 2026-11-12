import { execFile, spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import type {
  BenchmarkResult,
  DownloadProgress,
  InstalledModel,
  OllamaStatus,
  PullProgress
} from '@shared/types'
import { L } from '../i18n'

const BASE = 'http://127.0.0.1:11434'
/**
 * Bağlam uzunluğu. Ollama bu değer değişince modeli bellekten atıp yeniden
 * yüklediği için bütün isteklerde aynı değer kullanılır.
 */
const NUM_CTX = 8192
/** Tek cevabın en fazla uzunluğu; model durmayı bilmezse sonsuza kadar yazmasın. */
const MAX_REPLY_TOKENS = 3072
const WINDOWS_INSTALLER_URL = 'https://ollama.com/download/OllamaSetup.exe'

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** base64 kodlu resimler; sadece resim anlayan modellerde */
  images?: string[]
  /** Asistanın istediği araç çağrıları */
  tool_calls?: { function: ToolCall }[]
  /** role 'tool' ise sonucu hangi aracın ürettiği */
  tool_name?: string
}

export interface ChatStats {
  tokens: number | null
  durationMs: number | null
  /** Cevap uzunluk sınırına takılıp yarıda kesildiyse true */
  truncated: boolean
  /** Model cevap yerine araç kullanmak istediyse */
  toolCalls?: ToolCall[]
}

export class OllamaError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Teknik hataları kullanıcının anlayacağı Türkçe mesaja çevirir. */
export function describeError(err: unknown): string {
  if (err instanceof OllamaError) return err.message
  const msg = err instanceof Error ? err.message : String(err)
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : ''
  if (/ECONNREFUSED|fetch failed|ECONNRESET/i.test(msg + cause)) {
    return L().main.ollama.notRunning
  }
  return msg
}

function translateApiError(text: string, model?: string): string {
  if (/not found/i.test(text) && model) return L().main.ollama.modelNotInstalled(model)
  if (/requires more system memory|out of memory/i.test(text)) {
    return L().main.ollama.outOfMemory
  }
  return text
}

async function readError(res: Response, model?: string): Promise<OllamaError> {
  let text = L().main.ollama.httpError(res.status)
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) text = body.error
  } catch {
    // Gövde JSON değilse durum kodu yeterli.
  }
  return new OllamaError(translateApiError(text, model))
}

/** Satır satır JSON akışını okur. */
async function* ndjson(res: Response): AsyncGenerator<Record<string, unknown>> {
  if (!res.body) return
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) yield JSON.parse(line)
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer)
}

/**
 * Düşünme adımını kapatarak dener (daha hızlı cevap). Model bu ayarı
 * tanımıyorsa aynı isteği ayarsız tekrarlar.
 */
async function postNoThink(path: string, body: Record<string, unknown>, signal?: AbortSignal, think = false): Promise<Response> {
  const post = (payload: Record<string, unknown>): Promise<Response> =>
    fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    })
  const res = await post({ ...body, think })
  if (res.status === 400) {
    const text = await res.text()
    if (/think/i.test(text)) return post(body)
    let message = text
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text
    } catch {
      // Düz metin hata.
    }
    throw new OllamaError(translateApiError(message, body.model as string))
  }
  return res
}

// --- Kurulum ve durum ---

function findExecutable(): Promise<string | null> {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    const candidate = local ? join(local, 'Programs', 'Ollama', 'ollama.exe') : null
    if (candidate && existsSync(candidate)) return Promise.resolve(candidate)
  }
  const finder = process.platform === 'win32' ? 'where' : 'which'
  return new Promise((resolve) => {
    execFile(finder, ['ollama'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      const first = stdout?.split('\n')[0]?.trim()
      resolve(!err && first ? first : null)
    })
  })
}

async function runningVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/version`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return null
    return ((await res.json()) as { version?: string }).version ?? null
  } catch {
    return null
  }
}

export async function status(): Promise<OllamaStatus> {
  const version = await runningVersion()
  if (version) return { installed: true, running: true, version }
  return { installed: (await findExecutable()) !== null, running: false, version: null }
}

async function waitUntilRunning(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await runningVersion()) return true
    await sleep(500)
  }
  return false
}

export async function start(): Promise<OllamaStatus> {
  if (await runningVersion()) return status()
  const exe = await findExecutable()
  if (!exe) return { installed: false, running: false, version: null }
  const child = spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', () => {})
  child.unref()
  await waitUntilRunning(20_000)
  return status()
}

/** Resmi kurulum dosyasını indirir ve sessiz modda çalıştırır (şimdilik sadece Windows). */
export async function install(onProgress: (p: DownloadProgress) => void): Promise<OllamaStatus> {
  if (process.platform !== 'win32') {
    throw new OllamaError(L().main.ollama.autoInstallWindowsOnly)
  }
  const dir = join(app.getPath('temp'), 'atlas-setup')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'OllamaSetup.exe')

  const res = await fetch(WINDOWS_INSTALLER_URL)
  if (!res.ok || !res.body) throw new OllamaError(L().main.ollama.installerDownloadFailed(res.status))
  const total = Number(res.headers.get('content-length') ?? 0)
  let done = 0
  let lastEmit = 0
  const body = Readable.fromWeb(res.body as never)
  body.on('data', (chunk: Buffer) => {
    done += chunk.length
    const now = Date.now()
    if (now - lastEmit > 200) {
      lastEmit = now
      onProgress({ completedBytes: done, totalBytes: total, percent: total ? (done / total) * 100 : 0 })
    }
  })
  await pipeline(body, createWriteStream(file))
  onProgress({ completedBytes: done, totalBytes: total || done, percent: 100 })

  await new Promise<void>((resolve, reject) => {
    const child = spawn(file, ['/SILENT', '/NORESTART'], { windowsHide: true })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new OllamaError(L().main.ollama.installFailed(code)))
    )
  })
  await rm(file, { force: true })

  if (!(await waitUntilRunning(15_000))) await start()
  return status()
}

// --- Modeller ---

/** Ollama'nın o an bellekte tuttuğu modeller (ad, boyut, ekran kartındaki payı). */
export async function listLoaded(): Promise<{ name: string; sizeGb: number; gpuPercent: number }[]> {
  try {
    const res = await fetch(`${BASE}/api/ps`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = (await res.json()) as { models?: { name: string; size?: number; size_vram?: number }[] }
    return (data.models ?? []).map((m) => {
      const size = m.size ?? 0
      return {
        name: m.name,
        sizeGb: Math.round((size / 1e9) * 10) / 10,
        gpuPercent: size > 0 ? Math.round(((m.size_vram ?? 0) / size) * 100) : 0
      }
    })
  } catch {
    return []
  }
}

/** Modeli bellekten boşaltır. Model silinmez; sonraki istekte yeniden yüklenir. */
export async function unloadModel(name: string): Promise<void> {
  await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, keep_alive: 0 }),
    signal: AbortSignal.timeout(10000)
  }).catch(() => undefined)
}

export async function listInstalled(): Promise<InstalledModel[]> {
  const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw await readError(res)
  const body = (await res.json()) as { models?: { name: string; size: number; modified_at: string }[] }
  return (body.models ?? []).map((m) => ({
    name: m.name,
    sizeGb: Math.round((m.size / 1e9) * 100) / 100,
    modifiedAt: m.modified_at
  }))
}

/**
 * Metinleri vektöre çevirir. İşlemcide çalıştırılır: gömme modeli küçüktür ve
 * ekran kartı belleğini sohbet modeliyle paylaşıp onu bellekten attırmasın.
 */
export async function embed(model: string, inputs: string[]): Promise<Float32Array[]> {
  const res = await fetch(`${BASE}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: inputs, options: { num_gpu: 0 } }),
    signal: AbortSignal.timeout(60_000)
  })
  if (!res.ok) throw await readError(res, model)
  const body = (await res.json()) as { embeddings?: number[][] }
  if (!body.embeddings || body.embeddings.length !== inputs.length) {
    throw new OllamaError(L().main.ollama.embeddingUnexpected)
  }
  return body.embeddings.map((v) => Float32Array.from(v))
}

/**
 * Var olan bir modelin üzerine sistem talimatı ve ayarlar ekleyerek yeni bir model oluşturur.
 * Yeni model temel modelin dosyalarını paylaşır; diskte ek yer kaplamaz.
 */
export async function createModel(
  name: string,
  from: string,
  system: string,
  parameters: Record<string, number>
): Promise<void> {
  const res = await fetch(`${BASE}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, from, system, parameters, stream: false })
  })
  if (!res.ok) throw await readError(res, from)
  const body = (await res.json()) as { status?: string; error?: string }
  if (body.error) throw new OllamaError(translateApiError(body.error, from))
  visionCache.delete(name)
  toolsCache.delete(name)
}

const visionCache = new Map<string, boolean>()
const toolsCache = new Map<string, boolean>()

/** Model araç (fonksiyon) çağırabiliyor mu. */
export async function supportsTools(model: string): Promise<boolean> {
  const cached = toolsCache.get(model)
  if (cached !== undefined) return cached
  await supportsVision(model)
  return toolsCache.get(model) ?? false
}

/** Model resim anlayabiliyor mu (Ollama'nın bildirdiği yeteneklere göre). */
export async function supportsVision(model: string): Promise<boolean> {
  const cached = visionCache.get(model)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(`${BASE}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return false
    const body = (await res.json()) as { capabilities?: string[] }
    const vision = body.capabilities?.includes('vision') ?? false
    visionCache.set(model, vision)
    toolsCache.set(model, body.capabilities?.includes('tools') ?? false)
    return vision
  } catch {
    return false
  }
}

const pulls = new Map<string, AbortController>()

/**
 * Modeli indirir. İptal edilirse inen kısım Ollama'da kalır;
 * aynı model yeniden istenince kaldığı yerden devam eder.
 */
export async function pull(
  model: string,
  onProgress: (p: PullProgress) => void,
  expectedBytes = 0
): Promise<void> {
  if (pulls.has(model)) throw new OllamaError(L().main.ollama.alreadyPulling)
  const controller = new AbortController()
  pulls.set(model, controller)
  try {
    const res = await fetch(`${BASE}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal: controller.signal
    })
    if (!res.ok) throw await readError(res, model)

    const layers = new Map<string, { total: number; completed: number }>()
    let lastEmit = 0
    let lastBytes = 0
    let lastTime = Date.now()
    let speed = 0

    for await (const line of ndjson(res)) {
      if (typeof line.error === 'string') throw new OllamaError(translateApiError(line.error, model))
      if (typeof line.digest === 'string' && typeof line.total === 'number') {
        layers.set(line.digest, { total: line.total, completed: Number(line.completed ?? 0) })
      }
      const now = Date.now()
      const finished = line.status === 'success'
      if (now - lastEmit < 250 && !finished) continue

      let total = 0
      let completed = 0
      for (const l of layers.values()) {
        total += l.total
        completed += l.completed
      }
      // Ollama katmanları sırayla bildirir; beklenen boyut bilinirse yüzde geri sıçramaz.
      total = Math.max(total, expectedBytes)
      const elapsed = (now - lastTime) / 1000
      if (elapsed >= 1) {
        const instant = Math.max(0, completed - lastBytes) / elapsed
        speed = speed === 0 ? instant : speed * 0.6 + instant * 0.4
        lastBytes = completed
        lastTime = now
      }
      lastEmit = now
      onProgress({
        model,
        status: String(line.status ?? ''),
        completedBytes: completed,
        totalBytes: total,
        percent: finished ? 100 : total ? Math.min(99.9, (completed / total) * 100) : 0,
        bytesPerSec: speed
      })
    }
  } finally {
    pulls.delete(model)
  }
}

export function cancelPull(model: string): void {
  pulls.get(model)?.abort()
}

export async function remove(model: string): Promise<void> {
  const res = await fetch(`${BASE}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model })
  })
  if (!res.ok) throw await readError(res, model)
}

/**
 * Modelin hızını ölçer. Sistem talimatı verilirse modelin içine gömülü olanın yerine geçer:
 * model başka bir dildeki talimatla kurulmuş olsa da deneme cevabı geçerli dilde gelir.
 */
export async function benchmark(model: string, system?: string): Promise<BenchmarkResult> {
  const res = await postNoThink('/api/generate', {
    model,
    ...(system ? { system } : {}),
    prompt: L().main.ollama.benchmarkPrompt,
    stream: false,
    options: { num_predict: 96, num_ctx: NUM_CTX }
  })
  if (!res.ok) throw await readError(res, model)
  const body = (await res.json()) as {
    response?: string
    eval_count?: number
    eval_duration?: number
    load_duration?: number
  }
  const seconds = (body.eval_duration ?? 0) / 1e9
  return {
    model,
    tokensPerSec: seconds > 0 ? Math.round(((body.eval_count ?? 0) / seconds) * 10) / 10 : 0,
    loadMs: Math.round((body.load_duration ?? 0) / 1e6),
    sample: (body.response ?? '').trim()
  }
}

// --- Sohbet ---

export interface ChatOptions {
  model: string
  messages: OllamaMessage[]
  signal?: AbortSignal
  temperature?: number
  /** Modelin kullanabileceği araçların tanımı */
  tools?: unknown[]
  /** Model cevap vermeden önce düşünsün mü (daha yavaş ama daha planlı) */
  think?: boolean
  /** Düşünme açıkken modelin düşüncesinin parçaları */
  onThinking?: (delta: string) => void
  /** Modelin aynı anda gördüğü bağlam (token); verilmezse varsayılan */
  numCtx?: number
}

/** Cevabı parça parça verir; bittiğinde istatistikleri döndürür. */
export async function* chatStream(opts: ChatOptions): AsyncGenerator<string, ChatStats> {
  const res = await postNoThink(
    '/api/chat',
    {
      model: opts.model,
      messages: opts.messages,
      stream: true,
      ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
      options: {
        num_ctx: opts.numCtx ?? NUM_CTX,
        temperature: opts.temperature ?? 0.7,
        // Aynı ifadeyi tekrar etmeyi zorlaştırır; küçük modellerde döngüyü azaltır.
        repeat_penalty: 1.15,
        repeat_last_n: 256,
        // Düşünme de bu sınıra sayılır; düşünürken cevaba yer kalsın diye sınır büyütülür.
        num_predict: opts.think ? MAX_REPLY_TOKENS * 3 : MAX_REPLY_TOKENS
      }
    },
    opts.signal,
    opts.think === true
  )
  if (!res.ok) throw await readError(res, opts.model)

  let stats: ChatStats = { tokens: null, durationMs: null, truncated: false }
  const toolCalls: ToolCall[] = []
  for await (const line of ndjson(res)) {
    if (typeof line.error === 'string') throw new OllamaError(translateApiError(line.error, opts.model))
    const message = line.message as { content?: string; thinking?: string; tool_calls?: { function?: ToolCall }[] } | undefined
    if (message?.thinking) opts.onThinking?.(message.thinking)
    for (const call of message?.tool_calls ?? []) {
      if (call.function?.name) toolCalls.push({ name: call.function.name, arguments: call.function.arguments ?? {} })
    }
    const delta = message?.content
    if (delta) yield delta
    if (line.done) {
      stats = {
        tokens: typeof line.eval_count === 'number' ? line.eval_count : null,
        // Yalnızca yazma süresi: model yükleme ve istem okuma süresi hızı yanıltmasın.
        durationMs: typeof line.eval_duration === 'number' ? Math.round(line.eval_duration / 1e6) : null,
        truncated: line.done_reason === 'length',
        toolCalls
      }
    }
  }
  return stats
}

/**
 * Akış gerektirmeyen kısa işler (başlık üretme gibi) için.
 * format verilirse cevap o JSON şemasına uymak zorundadır.
 */
export async function chatOnce(
  opts: ChatOptions & { numPredict?: number; format?: Record<string, unknown> }
): Promise<string> {
  const res = await postNoThink(
    '/api/chat',
    {
      model: opts.model,
      messages: opts.messages,
      stream: false,
      ...(opts.format ? { format: opts.format } : {}),
      options: {
        num_ctx: NUM_CTX,
        temperature: opts.temperature ?? 0.3,
        num_predict: opts.numPredict ?? 64
      }
    },
    opts.signal
  )
  if (!res.ok) throw await readError(res, opts.model)
  const body = (await res.json()) as { message?: { content?: string } }
  return (body.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}
