import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultSqliteSpawn, runSqlite, setSqliteSpawn, SqliteJobError } from '../src/main/services/sqliteRunner'

/** Hiç bitmeyen sorgu: SQLite'ın içinde döner, tek satır bile döndürmez. */
const ENDLESS = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c'

let dir: string
let file: string
let pids: number[]

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const waitUntil = async (check: () => boolean, ms = 3000): Promise<boolean> => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return check()
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sqlite-'))
  file = join(dir, 'ornek.db')
  const seed = new DatabaseSync(file)
  seed.exec(`CREATE TABLE personel (id INTEGER PRIMARY KEY, ad TEXT NOT NULL);
             INSERT INTO personel (ad) VALUES ('Ayşe'), ('Mehmet'), ('Zeynep');`)
  seed.close()
  pids = []
  setSqliteSpawn(() => {
    const child = defaultSqliteSpawn()
    if (child.pid) pids.push(child.pid)
    return child
  })
})

afterEach(() => {
  setSqliteSpawn(null)
  rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

describe('SQLite ayrı süreçte', () => {
  it('okur ve süreci kapatır', async () => {
    const result = await runSqlite<{ columns: string[]; rows: unknown[][] }>(
      { op: 'read', file, sql: 'SELECT ad FROM personel ORDER BY id', maxRows: 10, maxCellChars: 400 },
      { timeoutMs: 10_000 }
    )
    expect(result.columns).toEqual(['ad'])
    expect(result.rows).toEqual([['Ayşe'], ['Mehmet'], ['Zeynep']])
    expect(await waitUntil(() => pids.every((p) => !alive(p)))).toBe(true)
  })

  it('SQLite hatasını iletir', async () => {
    await expect(runSqlite({ op: 'read', file, sql: 'SELECT * FROM yok', maxRows: 10, maxCellChars: 400 }, { timeoutMs: 10_000 })).rejects.toThrow(
      /no such table: yok/
    )
  })

  it('bitmeyen sorgu Durdur ile bir saniye içinde kesilir, uygulama donmaz', async () => {
    const controller = new AbortController()
    let ticks = 0
    const ticker = setInterval(() => ticks++, 20)
    const started = Date.now()
    const job = runSqlite({ op: 'read', file, sql: ENDLESS, maxRows: 10, maxCellChars: 400 }, { signal: controller.signal, timeoutMs: 30_000 })
    setTimeout(() => controller.abort(), 600)
    const error = await job.catch((e: unknown) => e)
    clearInterval(ticker)
    expect(error).toBeInstanceOf(SqliteJobError)
    expect((error as SqliteJobError).kind).toBe('stopped')
    expect(Date.now() - started).toBeLessThan(1600)
    // Sorgu çalışırken ana süreç boş kaldı: zamanlayıcı aksamadan döndü.
    expect(ticks).toBeGreaterThan(15)
    // Sorguyu çalıştıran süreç gerçekten kapandı.
    expect(pids).toHaveLength(1)
    expect(await waitUntil(() => !alive(pids[0]))).toBe(true)
  })

  it('bitmeyen sorgu süre dolunca kesilir', async () => {
    const error = await runSqlite({ op: 'read', file, sql: ENDLESS, maxRows: 10, maxCellChars: 400 }, { timeoutMs: 800 }).catch((e: unknown) => e)
    expect((error as SqliteJobError).kind).toBe('timeout')
    expect(await waitUntil(() => !alive(pids[0]))).toBe(true)
  })

  it('yarıda kesilen yazma dosyayı değiştirmez', async () => {
    const controller = new AbortController()
    const sql = `INSERT INTO personel (ad) WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT 'kopya ' || x FROM c`
    const job = runSqlite({ op: 'write', file, sql }, { signal: controller.signal, timeoutMs: 30_000 })
    setTimeout(() => controller.abort(), 600)
    await expect(job).rejects.toBeInstanceOf(SqliteJobError)
    expect(await waitUntil(() => !alive(pids[0]))).toBe(true)
    const db = new DatabaseSync(file)
    expect((db.prepare('SELECT count(*) AS n FROM personel').get() as { n: number }).n).toBe(3)
    db.close()
  })

  it('durdurulmuş bir cevapta süreç hiç açılmaz', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runSqlite({ op: 'read', file, sql: 'SELECT 1', maxRows: 1, maxCellChars: 400 }, { signal: controller.signal, timeoutMs: 1000 })).rejects.toMatchObject({
      kind: 'stopped'
    })
    expect(pids).toHaveLength(0)
  })
})
