import { fork } from 'node:child_process'
import { join, resolve } from 'node:path'
import { utilityProcess } from 'electron'
import type { SqliteJob, SqliteReply } from '../workers/sqlite'

/** SQLite işini ayrı süreçte çalıştıran tarafın gördüğü süreç */
export interface SqliteChild {
  send(job: SqliteJob): void
  onMessage(cb: (reply: SqliteReply) => void): void
  onExit(cb: (code: number | null) => void): void
  kill(): void
  pid?: number
}

export type SqliteFailure = 'stopped' | 'timeout' | 'crashed' | 'failed'

export class SqliteJobError extends Error {
  constructor(
    readonly kind: SqliteFailure,
    message: string
  ) {
    super(message)
  }
}

/** Electron'da utilityProcess (paketli uygulamada da çalışır); testlerde ve ölçümlerde Node'un fork'u */
export function defaultSqliteSpawn(): SqliteChild {
  if (process.versions.electron) {
    const child = utilityProcess.fork(join(__dirname, 'sqliteWorker.js'), [], { serviceName: 'Atlas SQLite', stdio: 'ignore' })
    return {
      send: (job) => child.postMessage(job),
      onMessage: (cb) => child.on('message', (m: SqliteReply) => cb(m)),
      onExit: (cb) => child.on('exit', (code) => cb(code)),
      kill: () => void child.kill(),
      get pid() {
        return child.pid
      }
    }
  }
  const child = fork(resolve('src/main/workers/sqlite.ts'), [], { stdio: 'ignore' })
  return {
    send: (job) => child.send(job),
    onMessage: (cb) => child.on('message', (m) => cb(m as SqliteReply)),
    onExit: (cb) => child.on('exit', (code) => cb(code)),
    kill: () => void child.kill(),
    pid: child.pid
  }
}

let spawn: () => SqliteChild = defaultSqliteSpawn

/** Testler için: süreç yerine başka bir çalıştırıcı */
export function setSqliteSpawn(fn: (() => SqliteChild) | null): void {
  spawn = fn ?? defaultSqliteSpawn
}

/**
 * İşi ayrı bir süreçte çalıştırır. Durdurulunca ya da süre dolunca süreç hemen kapatılır; sorgu SQLite'ın içinde
 * dönüyor olsa bile. Yazma yarıda kalırsa SQLite'ın günlüğü sayesinde dosya işlemden önceki hâline döner.
 */
export function runSqlite<T>(job: SqliteJob, options: { signal?: AbortSignal; timeoutMs: number }): Promise<T> {
  const { signal, timeoutMs } = options
  if (signal?.aborted) return Promise.reject(new SqliteJobError('stopped', 'stopped'))
  return new Promise<T>((resolvePromise, reject) => {
    const child = spawn()
    let settled = false
    const finish = (settle: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      child.kill()
      settle()
    }
    const onAbort = (): void => finish(() => reject(new SqliteJobError('stopped', 'stopped')))
    const timer = setTimeout(() => finish(() => reject(new SqliteJobError('timeout', 'timeout'))), timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    child.onMessage((reply) =>
      finish(() => (reply.ok ? resolvePromise(reply.result as T) : reject(new SqliteJobError('failed', reply.error))))
    )
    child.onExit((code) => finish(() => reject(new SqliteJobError('crashed', `SQLite process exited (${code})`))))
    child.send(job)
  })
}
