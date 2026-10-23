import { fork } from 'node:child_process'
import { join, resolve } from 'node:path'
import { utilityProcess } from 'electron'
import type { DocumentFailure, DocumentJob, DocumentReply } from '../workers/document'

/** Belge okuyan süreç bu kadar boş kalınca kapatılır (belge kütüphaneleri yüzlerce MB tutabilir). */
const IDLE_MS = 30_000
/** Belge okuyan sürecin JavaScript belleği sınırı; aşan belge süreci düşürür, uygulamayı değil */
const MEMORY_MB = 1536

export class DocumentJobError extends Error {
  constructor(
    readonly kind: DocumentFailure,
    /** 'unpacked' hatasında belgenin açılmış boyutu */
    readonly size?: number
  ) {
    super(kind)
  }
}

interface Child {
  send(job: DocumentJob): void
  onMessage(cb: (reply: DocumentReply) => void): void
  onExit(cb: () => void): void
  kill(): void
}

/** Electron'da utilityProcess (paketli uygulamada da çalışır); testlerde ve ölçümlerde Node'un fork'u */
function spawnChild(): Child {
  const execArgv = [`--max-old-space-size=${MEMORY_MB}`]
  if (process.versions.electron) {
    const child = utilityProcess.fork(join(__dirname, 'documentWorker.js'), [], { serviceName: 'Atlas belge okuma', stdio: 'ignore', execArgv })
    return {
      send: (job) => child.postMessage(job),
      onMessage: (cb) => child.on('message', (m: DocumentReply) => cb(m)),
      onExit: (cb) => child.on('exit', () => cb()),
      kill: () => void child.kill()
    }
  }
  // Belge baytları yapılandırılmış kopyayla gider (JSON'a çevrilmez).
  const child = fork(resolve('src/main/workers/document.ts'), [], {
    stdio: 'ignore',
    serialization: 'advanced',
    execArgv,
    env: { ...process.env, ATLAS_WORKER: 'document' }
  })
  return {
    send: (job) => child.send(job),
    onMessage: (cb) => child.on('message', (m) => cb(m as DocumentReply)),
    onExit: (cb) => child.on('exit', () => cb()),
    kill: () => void child.kill()
  }
}

/** Çalışan süreç ve (varsa) o süreçte süren iş */
let child: Child | null = null
let current: { owner: Child; settle(reply: DocumentReply): void } | null = null
let idleTimer: NodeJS.Timeout | undefined
/** İşler sırayla yürür: süreç aynı anda tek belge okur. */
let queue: Promise<unknown> = Promise.resolve()

function ensureChild(): Child {
  if (child) return child
  const c = spawnChild()
  // Cevap ya da çıkış yalnızca o süreçte süren işe aittir: kapatılan eski sürecin çıkışı yeni işi bitirmesin.
  c.onMessage((reply) => {
    if (current?.owner === c) current.settle(reply)
  })
  c.onExit(() => {
    if (child === c) child = null
    if (current?.owner === c) current.settle({ ok: false, error: 'crashed' })
  })
  child = c
  return c
}

function stop(c: Child): void {
  if (child === c) child = null
  c.kill()
}

/**
 * Belgeyi ayrı süreçte okur. Süre dolarsa ya da süreç çökerse (bellek sınırı) hata verir; süreç kapatılır, sonraki
 * belge için yenisi açılır.
 */
export function runDocument<T>(job: DocumentJob, timeoutMs = 60_000): Promise<T> {
  const run = async (): Promise<T> => {
    clearTimeout(idleTimer)
    const c = ensureChild()
    const reply = await new Promise<DocumentReply>((settle) => {
      const timer = setTimeout(() => {
        current = null
        stop(c)
        settle({ ok: false, error: 'timeout' })
      }, timeoutMs)
      current = {
        owner: c,
        settle: (r) => {
          clearTimeout(timer)
          current = null
          settle(r)
        }
      }
      c.send(job)
    })
    idleTimer = setTimeout(() => {
      if (child && !current) stop(child)
    }, IDLE_MS)
    idleTimer.unref?.()
    if (reply.ok) return reply.result as T
    throw new DocumentJobError(reply.error, reply.size)
  }
  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return result
}

/** Uygulama kapanırken: boşta bekleyen süreç kapatılır. */
export function stopDocumentWorker(): void {
  clearTimeout(idleTimer)
  if (child) stop(child)
}
