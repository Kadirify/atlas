import { DatabaseSync } from 'node:sqlite'

/**
 * SQLite işlerini ana süreçten ayrı bir süreçte çalıştırır. node:sqlite eşzamanlıdır ve başlamış bir sorguyu kesmenin
 * yolu yoktur: sonsuz bir `WITH RECURSIVE` ana süreçte bütün uygulamayı dondururdu, bir iş parçacığında da durdurulamazdı
 * (yerel döngüdeyken iş parçacığı sonlandırılamaz). Ayrı süreç ise her an kapatılabilir.
 *
 * Her iş için yeni bir süreç açılır; cevabı alan ana süreç onu kapatır. Paketli uygulamada Electron'un utilityProcess'i,
 * testlerde Node çalıştırır; bu yüzden yalnızca Node'un kendi modüllerini kullanır ve derlenmeden çalışabilir.
 */

/** Dosya başka bir bağlantıda kilitliyse (yarıda kesilmiş bir yazma, başka bir program) bu kadar beklenir. */
const BUSY_TIMEOUT_MS = 5000

export type SqliteValue = string | number | null

export type SqliteJob =
  | { op: 'read'; file: string; sql: string; maxRows: number; maxCellChars: number }
  | { op: 'write'; file: string; sql: string }
  | { op: 'schema'; file: string; maxTables: number }
  | { op: 'definition'; file: string; name: string }

export type SqliteReply = { ok: true; result: unknown } | { ok: false; error: string }

function cell(value: unknown, maxChars: number): SqliteValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return `<${value.length} bayt>`
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
}

function read(job: Extract<SqliteJob, { op: 'read' }>): unknown {
  // Salt okunur bağlantı: sorgu ne olursa olsun dosya değişemez.
  const db = new DatabaseSync(job.file, { readOnly: true, timeout: BUSY_TIMEOUT_MS })
  const started = Date.now()
  try {
    const statement = db.prepare(job.sql)
    const rows: SqliteValue[][] = []
    let columns: string[] = []
    let total = 0
    for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
      if (total === 0) columns = Object.keys(row)
      total++
      if (rows.length < job.maxRows) rows.push(columns.map((c) => cell(row[c], job.maxCellChars)))
      else break
    }
    // Satır dönmediyse sütun adları sorgunun kendisinden alınır (Node'un bu sürümünde varsa).
    if (columns.length === 0) columns = (statement as unknown as { columns?: () => { name: string }[] }).columns?.().map((c) => c.name) ?? []
    return { columns, rows, rowCount: rows.length, truncated: total > rows.length, ms: Date.now() - started }
  } finally {
    db.close()
  }
}

function write(job: Extract<SqliteJob, { op: 'write' }>): unknown {
  const db = new DatabaseSync(job.file, { timeout: BUSY_TIMEOUT_MS })
  const started = Date.now()
  try {
    db.exec('BEGIN')
    try {
      db.exec(job.sql)
      const affected = (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
      db.exec('COMMIT')
      return { columns: [], rows: [], rowCount: 0, truncated: false, affected, ms: Date.now() - started }
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  } finally {
    db.close()
  }
}

function schema(job: Extract<SqliteJob, { op: 'schema' }>): unknown {
  const db = new DatabaseSync(job.file, { readOnly: true, timeout: BUSY_TIMEOUT_MS })
  try {
    const tables = db
      .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string; type: string }[]
    const objects: unknown[] = tables.slice(0, job.maxTables).map((t) => ({
      schema: '',
      name: t.name,
      type: t.type === 'view' ? 'view' : 'table',
      columns: (db.prepare(`PRAGMA table_info("${t.name.replace(/"/g, '""')}")`).all() as { name: string; type: string; notnull: number; pk: number }[]).map(
        (c) => ({ name: c.name, type: c.type || 'ANY', nullable: !c.notnull, key: c.pk > 0 })
      )
    }))
    const triggers = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all() as { name: string; tbl_name: string }[]
    for (const tr of triggers) objects.push({ schema: '', name: tr.name, type: 'trigger', parent: tr.tbl_name, columns: [] })
    return objects
  } finally {
    db.close()
  }
}

function definition(job: Extract<SqliteJob, { op: 'definition' }>): unknown {
  const db = new DatabaseSync(job.file, { readOnly: true, timeout: BUSY_TIMEOUT_MS })
  try {
    const row = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(job.name) as { sql?: string } | undefined
    return row?.sql ?? ''
  } finally {
    db.close()
  }
}

export function runJob(job: SqliteJob): SqliteReply {
  try {
    const result = job.op === 'read' ? read(job) : job.op === 'write' ? write(job) : job.op === 'schema' ? schema(job) : definition(job)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Electron utilityProcess'te process.parentPort, Node'un fork'unda process.send ile konuşulur.
const parentPort = (process as unknown as { parentPort?: { on(e: 'message', cb: (m: { data: unknown }) => void): void; postMessage(m: unknown): void } }).parentPort
if (parentPort) {
  parentPort.on('message', (m) => parentPort.postMessage(runJob(m.data as SqliteJob)))
} else if (process.send) {
  process.on('message', (m) => process.send?.(runJob(m as SqliteJob)))
}
