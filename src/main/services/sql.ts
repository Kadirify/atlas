import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { safeStorage } from 'electron'
import { classifySql } from '@shared/sql'
import { SQL_ENGINES, type SqlObjectType, type SqlApproval, type SqlConnection, type SqlConnectionInput, type SqlEngine, type SqlResult, type SqlTable, type SqlValue, type ToolStep } from '@shared/types'
import type { Db } from '../db'
import { L } from '../i18n'
import type { ToolCall } from './ollama'

/** Arayüze en çok bu kadar satır gönderilir */
const MAX_UI_ROWS = 500
/** Modele en çok bu kadar satır ve karakter verilir; fazlası bağlamı doldurur */
const MAX_MODEL_ROWS = 50
const MAX_MODEL_CHARS = 6000
const MAX_CELL_CHARS = 400
const MAX_SCHEMA_TABLES = 300
/** Sistem talimatına eklenen şema özeti en çok bu kadar yer tutar */
const MAX_PROMPT_SCHEMA_CHARS = 4000
const SCHEMA_CACHE_MS = 60_000

export class SqlError extends Error {}

const DEFAULT_PORT: Record<SqlEngine, number> = { mssql: 1433, postgres: 5432, mysql: 3306, sqlite: 0 }
/** Modele söylenen tür adı; sorguları bu türün söz dizimiyle yazar */
const ENGINE_NAME: Record<SqlEngine, string> = {
  mssql: 'Microsoft SQL Server (T-SQL)',
  postgres: 'PostgreSQL',
  mysql: 'MySQL / MariaDB',
  sqlite: 'SQLite'
}

export interface SqlEvents {
  approval(a: SqlApproval): void
  /** Atlas'ın çalıştırdığı sorgunun sonucu; veritabanı paneli bunu gösterir */
  result(e: { conversationId: string; sql: string; result: SqlResult }): void
}

interface StoredConnection extends SqlConnection {
  /** safeStorage ile şifrelenmiş parola (base64); parola yoksa boş */
  secret: string
}

interface Driver {
  schema(): Promise<SqlTable[]>
  /** Nesnenin kaynak kodu (görünüm, yordam, işlev, tetikleyici, iş) */
  definition(object: { schema: string; name: string; type: SqlObjectType }): Promise<string>
  /** Okuma: veritabanında hiçbir şey değiştiremeyecek biçimde çalışır */
  read(sql: string, maxRows: number): Promise<SqlResult>
  /** Yazma: tek bir işlem (transaction) içinde çalışır; hata olursa geri alınır */
  write(sql: string): Promise<SqlResult>
  close(): Promise<void>
}

function cell(value: unknown): SqlValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().replace('T', ' ').replace(/\.000Z$/, '').replace(/Z$/, '')
  if (value instanceof Uint8Array) return `<${value.length} bayt>`
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text
}

// ---------- SQLite ----------

function sqliteDriver(file: string): Driver {
  if (!existsSync(file)) throw new SqlError(L().tools.sql.errors.noFile(file))
  const open = (readOnly: boolean): DatabaseSync => new DatabaseSync(file, { readOnly })
  return {
    async schema() {
      const db = open(true)
      try {
        const tables = db
          .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
          .all() as { name: string; type: string }[]
        return tables.slice(0, MAX_SCHEMA_TABLES).map((t) => ({
          schema: '',
          name: t.name,
          type: (t.type === 'view' ? 'view' : 'table') as SqlObjectType,
          columns: (db.prepare(`PRAGMA table_info("${t.name.replace(/"/g, '""')}")`).all() as { name: string; type: string; notnull: number; pk: number }[]).map(
            (c) => ({ name: c.name, type: c.type || 'ANY', nullable: !c.notnull, key: c.pk > 0 })
          )
        }))
          .concat(
            (db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all() as { name: string; tbl_name: string }[]).map((tr) => ({
              schema: '',
              name: tr.name,
              type: 'trigger' as const,
              parent: tr.tbl_name,
              columns: []
            }))
          )
      } finally {
        db.close()
      }
    },
    async definition(object) {
      const db = open(true)
      try {
        const row = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(object.name) as { sql?: string } | undefined
        return row?.sql ?? ''
      } finally {
        db.close()
      }
    },
    async read(sql, maxRows) {
      // Salt okunur bağlantı: sorgu ne olursa olsun dosya değişemez.
      const db = open(true)
      const started = Date.now()
      try {
        const statement = db.prepare(sql)
        const rows: SqlValue[][] = []
        let columns: string[] = []
        let total = 0
        for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
          if (total === 0) columns = Object.keys(row)
          total++
          if (rows.length < maxRows) rows.push(columns.map((c) => cell(row[c])))
          else break
        }
        if (columns.length === 0) columns = (statement as unknown as { columns?: () => { name: string }[] }).columns?.().map((c) => c.name) ?? []
        return { columns, rows, rowCount: rows.length, truncated: total > rows.length, ms: Date.now() - started }
      } finally {
        db.close()
      }
    },
    async write(sql) {
      const db = open(false)
      const started = Date.now()
      try {
        db.exec('BEGIN')
        try {
          db.exec(sql)
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
    },
    async close() {}
  }
}

// ---------- SQL Server ----------

async function mssqlDriver(c: StoredConnection, password: string): Promise<Driver> {
  const mssql = (await import('mssql')).default
  const pool = new mssql.ConnectionPool({
    server: c.host,
    port: c.port || 1433,
    database: c.database || undefined,
    user: c.user,
    password,
    options: { encrypt: c.encrypt, trustServerCertificate: c.trustCert, appName: 'Atlas' },
    connectionTimeout: 8000,
    requestTimeout: 30000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 15000 }
  })
  await pool.connect()

  return {
    async schema() {
      const columns = await pool.request().query(`
        SELECT c.TABLE_SCHEMA AS s, c.TABLE_NAME AS t, t.TABLE_TYPE AS tt, c.COLUMN_NAME AS col, c.DATA_TYPE AS dt,
               c.CHARACTER_MAXIMUM_LENGTH AS len, c.IS_NULLABLE AS nul,
               CASE WHEN k.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS pk
        FROM INFORMATION_SCHEMA.COLUMNS c
        JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
        LEFT JOIN (
          SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND ku.TABLE_SCHEMA = tc.TABLE_SCHEMA
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        ) k ON k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME AND k.COLUMN_NAME = c.COLUMN_NAME
        ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION`)
      const tables = new Map<string, SqlTable>()
      for (const r of columns.recordset as { s: string; t: string; tt: string; col: string; dt: string; len: number | null; nul: string; pk: number }[]) {
        const key = `${r.s}.${r.t}`
        let table = tables.get(key)
        if (!table) {
          if (tables.size >= MAX_SCHEMA_TABLES) continue
          table = { schema: r.s, name: r.t, type: r.tt === 'VIEW' ? 'view' : 'table', columns: [] }
          tables.set(key, table)
        }
        table.columns.push({ name: r.col, type: r.len && r.len > 0 ? `${r.dt}(${r.len})` : r.len === -1 ? `${r.dt}(max)` : r.dt, nullable: r.nul === 'YES', key: r.pk === 1 })
      }
      const objects: SqlTable[] = [...tables.values()]
      // Yordamlar ve işlevler, parametreleriyle
      const routines = await pool.request().query(`
        SELECT SCHEMA_NAME(o.schema_id) AS s, o.name AS n, o.type AS t, p.name AS p, TYPE_NAME(p.user_type_id) AS dt, p.is_output AS o
        FROM sys.objects o LEFT JOIN sys.parameters p ON p.object_id = o.object_id AND p.parameter_id > 0
        WHERE o.type IN ('P', 'FN', 'IF', 'TF') AND o.is_ms_shipped = 0
        ORDER BY s, n, p.parameter_id`)
      const byName = new Map<string, SqlTable>()
      for (const r of routines.recordset as { s: string; n: string; t: string; p: string | null; dt: string | null; o: boolean }[]) {
        const key = `${r.s}.${r.n}`
        let routine = byName.get(key)
        if (!routine) {
          routine = { schema: r.s, name: r.n, type: r.t.trim() === 'P' ? 'procedure' : 'function', columns: [] }
          byName.set(key, routine)
          objects.push(routine)
        }
        if (r.p) routine.columns.push({ name: r.p, type: `${r.dt ?? ''}${r.o ? ' OUTPUT' : ''}`, nullable: true, key: false })
      }
      // Tetikleyiciler (tablo ve veritabanı düzeyinde)
      const triggers = await pool.request().query(`
        SELECT ISNULL(OBJECT_SCHEMA_NAME(t.parent_id), '') AS s, t.name AS n, OBJECT_NAME(t.parent_id) AS parent, t.is_disabled AS kapali
        FROM sys.triggers t WHERE t.is_ms_shipped = 0 ORDER BY s, n`)
      for (const r of triggers.recordset as { s: string; n: string; parent: string | null; kapali: boolean }[]) {
        objects.push({ schema: r.s, name: r.n, type: 'trigger', parent: r.parent ? `${r.s}.${r.parent}` : undefined, columns: [] })
      }
      // SQL Agent işleri: yalnızca okuma izni varsa (izin yoksa sessizce atlanır)
      try {
        const jobs = await pool.request().query(`SELECT j.name AS n, j.enabled AS e FROM msdb.dbo.sysjobs j ORDER BY j.name`)
        for (const r of jobs.recordset as { n: string; e: number }[]) objects.push({ schema: '', name: r.n, type: 'job', columns: [] })
      } catch {
        // msdb'ye erişim yok.
      }
      return objects
    },
    async definition(object) {
      if (object.type === 'job') {
        const steps = await pool.request().input('ad', mssql.NVarChar, object.name).query(`
          SELECT j.description AS d, j.enabled AS e, s.step_id AS no, s.step_name AS ad, s.database_name AS db, s.command AS komut
          FROM msdb.dbo.sysjobs j LEFT JOIN msdb.dbo.sysjobsteps s ON s.job_id = j.job_id WHERE j.name = @ad ORDER BY s.step_id`)
        const schedules = await pool.request().input('ad', mssql.NVarChar, object.name).query(`
          SELECT sc.name AS ad, sc.freq_type AS tur, sc.freq_interval AS aralik, sc.freq_subday_type AS altTur, sc.freq_subday_interval AS altAralik,
                 sc.active_start_time AS baslangic, sc.enabled AS e
          FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobschedules js ON js.job_id = j.job_id JOIN msdb.dbo.sysschedules sc ON sc.schedule_id = js.schedule_id
          WHERE j.name = @ad`)
        const first = steps.recordset[0] as { d?: string; e?: number } | undefined
        const lines = [`-- SQL Agent işi: ${object.name}${first?.e === 0 ? ' (kapalı)' : ''}`, first?.d ? `-- ${first.d}` : '']
        for (const sc of schedules.recordset as { ad: string; tur: number; aralik: number; altTur: number; altAralik: number; baslangic: number; e: number }[]) {
          lines.push(`-- Zamanlama: ${sc.ad} (freq_type=${sc.tur}, freq_interval=${sc.aralik}, subday_type=${sc.altTur}, subday_interval=${sc.altAralik}, başlangıç=${String(sc.baslangic).padStart(6, '0')})`)
        }
        for (const st of steps.recordset as { no: number | null; ad: string | null; db: string | null; komut: string | null }[]) {
          if (st.no !== null) lines.push('', `-- Adım ${st.no}: ${st.ad ?? ''} (${st.db ?? ''})`, st.komut ?? '')
        }
        return lines.filter((l, i) => l !== '' || i > 1).join('\n')
      }
      // Veritabanı düzeyindeki tetikleyicinin şeması yoktur; adıyla bulunur.
      const result = await pool
        .request()
        .input('ad', mssql.NVarChar, object.schema ? `${object.schema}.${object.name}` : object.name)
        .input('kisa', mssql.NVarChar, object.name)
        .query(`SELECT COALESCE(OBJECT_DEFINITION(OBJECT_ID(@ad)), (SELECT m.definition FROM sys.sql_modules m JOIN sys.triggers t ON t.object_id = m.object_id WHERE t.name = @kisa AND t.parent_class = 0)) AS kod`)
      return (result.recordset[0] as { kod: string | null } | undefined)?.kod ?? ''
    },
    async read(sql, maxRows) {
      // Okuma her zaman geri alınan bir işlem içinde çalışır: sorgu bir şey değiştirmeye kalksa bile kalıcı olmaz.
      const transaction = new mssql.Transaction(pool)
      await transaction.begin()
      const started = Date.now()
      try {
        const request = new mssql.Request(transaction)
        request.stream = true
        const rows: SqlValue[][] = []
        let columns: string[] = []
        let truncated = false
        await new Promise<void>((resolve, reject) => {
          request.on('recordset', (meta: Record<string, unknown>) => {
            if (columns.length === 0) columns = Object.keys(meta)
          })
          request.on('row', (row: Record<string, unknown>) => {
            if (rows.length < maxRows) rows.push(columns.map((name) => cell(row[name])))
            else if (!truncated) {
              truncated = true
              request.cancel()
            }
          })
          request.on('error', (e: Error) => (truncated ? resolve() : reject(e)))
          request.on('done', () => resolve())
          request.query(sql)
        })
        return { columns, rows, rowCount: rows.length, truncated, ms: Date.now() - started }
      } finally {
        await transaction.rollback().catch(() => undefined)
      }
    },
    async write(sql) {
      const transaction = new mssql.Transaction(pool)
      await transaction.begin()
      const started = Date.now()
      try {
        const result = await new mssql.Request(transaction).query(sql)
        await transaction.commit()
        const affected = (result.rowsAffected ?? []).reduce((sum: number, n: number) => sum + n, 0)
        return { columns: [], rows: [], rowCount: 0, truncated: false, affected, ms: Date.now() - started }
      } catch (e) {
        await transaction.rollback().catch(() => undefined)
        throw e
      }
    },
    async close() {
      await pool.close().catch(() => undefined)
    }
  }
}

// ---------- PostgreSQL ----------

async function postgresDriver(c: StoredConnection, password: string): Promise<Driver> {
  const { Client } = (await import('pg')).default
  const client = new Client({
    host: c.host,
    port: c.port || 5432,
    database: c.database || undefined,
    user: c.user,
    password,
    ssl: c.encrypt ? { rejectUnauthorized: !c.trustCert } : false,
    connectionTimeoutMillis: 8000,
    statement_timeout: 30000,
    application_name: 'Atlas'
  })
  await client.connect()

  return {
    async schema() {
      const result = await client.query(`
        SELECT c.table_schema AS s, c.table_name AS t, t.table_type AS tt, c.column_name AS col, c.data_type AS dt,
               c.character_maximum_length AS len, c.is_nullable AS nul,
               EXISTS (
                 SELECT 1 FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage ku ON ku.constraint_name = tc.constraint_name AND ku.table_schema = tc.table_schema
                 WHERE tc.constraint_type = 'PRIMARY KEY' AND ku.table_schema = c.table_schema AND ku.table_name = c.table_name AND ku.column_name = c.column_name
               ) AS pk
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position`)
      const objects = groupColumns(result.rows as ColumnRow[], 'public')
      const routines = await client.query(`
        SELECT r.routine_schema AS s, r.routine_name AS n, r.routine_type AS t FROM information_schema.routines r
        WHERE r.routine_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2`)
      for (const r of routines.rows as { s: string; n: string; t: string }[]) {
        objects.push({ schema: r.s === 'public' ? '' : r.s, name: r.n, type: r.t === 'PROCEDURE' ? 'procedure' : 'function', columns: [] })
      }
      const triggers = await client.query(`SELECT DISTINCT trigger_schema AS s, trigger_name AS n, event_object_table AS parent FROM information_schema.triggers ORDER BY 1, 2`)
      for (const r of triggers.rows as { s: string; n: string; parent: string }[]) {
        objects.push({ schema: r.s === 'public' ? '' : r.s, name: r.n, type: 'trigger', parent: r.parent, columns: [] })
      }
      return objects
    },
    async definition(object) {
      const schema = object.schema || 'public'
      if (object.type === 'view') {
        const r = await client.query('SELECT pg_get_viewdef(to_regclass($1), true) AS kod', [`"${schema}"."${object.name}"`])
        return r.rows[0]?.kod ?? ''
      }
      if (object.type === 'trigger') {
        const r = await client.query('SELECT pg_get_triggerdef(t.oid, true) AS kod FROM pg_trigger t JOIN pg_namespace ns ON ns.oid = (SELECT relnamespace FROM pg_class WHERE oid = t.tgrelid) WHERE t.tgname = $1 AND ns.nspname = $2', [object.name, schema])
        return r.rows.map((x: { kod: string }) => x.kod).join('\n')
      }
      const r = await client.query('SELECT pg_get_functiondef(p.oid) AS kod FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE p.proname = $1 AND ns.nspname = $2', [object.name, schema])
      return r.rows.map((x: { kod: string }) => x.kod).join('\n\n')
    },
    async read(sql, maxRows) {
      // Salt okunur işlem: PostgreSQL bu işlemin içinde hiçbir yazmaya izin vermez. İmleç, büyük sonuçların
      // tamamının belleğe alınmasını önler.
      const started = Date.now()
      await client.query('BEGIN TRANSACTION READ ONLY')
      try {
        await client.query(`DECLARE atlas_cursor NO SCROLL CURSOR FOR ${sql.replace(/;\s*$/, '')}`)
        const result = await client.query({ text: `FETCH ${maxRows + 1} FROM atlas_cursor`, rowMode: 'array' })
        const all = result.rows as unknown[][]
        return {
          columns: result.fields.map((f) => f.name),
          rows: all.slice(0, maxRows).map((row) => row.map(cell)),
          rowCount: Math.min(all.length, maxRows),
          truncated: all.length > maxRows,
          ms: Date.now() - started
        }
      } finally {
        await client.query('ROLLBACK').catch(() => undefined)
      }
    },
    async write(sql) {
      const started = Date.now()
      await client.query('BEGIN')
      try {
        const result = await client.query(sql)
        await client.query('COMMIT')
        const list = Array.isArray(result) ? result : [result]
        const affected = list.reduce((sum: number, r: { rowCount: number | null }) => sum + (r.rowCount ?? 0), 0)
        return { columns: [], rows: [], rowCount: 0, truncated: false, affected, ms: Date.now() - started }
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw e
      }
    },
    async close() {
      await client.end().catch(() => undefined)
    }
  }
}

// ---------- MySQL / MariaDB ----------

async function mysqlDriver(c: StoredConnection, password: string): Promise<Driver> {
  const mysql = await import('mysql2/promise')
  const connect = (): Promise<import('mysql2/promise').Connection> =>
    mysql.createConnection({
      host: c.host,
      port: c.port || 3306,
      database: c.database || undefined,
      user: c.user,
      password,
      ssl: c.encrypt ? { rejectUnauthorized: !c.trustCert } : undefined,
      connectTimeout: 8000,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      multipleStatements: false
    })
  let connection = await connect()

  return {
    async schema() {
      const [rows] = await connection.query(`
        SELECT c.TABLE_SCHEMA AS s, c.TABLE_NAME AS t, t.TABLE_TYPE AS tt, c.COLUMN_NAME AS col, c.COLUMN_TYPE AS dt,
               NULL AS len, c.IS_NULLABLE AS nul, (c.COLUMN_KEY = 'PRI') AS pk
        FROM information_schema.COLUMNS c
        JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
        WHERE c.TABLE_SCHEMA ${c.database ? '= DATABASE()' : "NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')"}
        ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION`)
      // Tek veritabanına bağlıyken şema adı gösterilmez.
      const objects = groupColumns(rows as ColumnRow[], c.database || '')
      const where = c.database ? '= DATABASE()' : "NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')"
      const [routines] = await connection.query(`SELECT ROUTINE_SCHEMA AS s, ROUTINE_NAME AS n, ROUTINE_TYPE AS t FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA ${where} ORDER BY 1, 2`)
      for (const r of routines as { s: string; n: string; t: string }[]) {
        objects.push({ schema: r.s === c.database ? '' : r.s, name: r.n, type: r.t === 'PROCEDURE' ? 'procedure' : 'function', columns: [] })
      }
      const [triggers] = await connection.query(`SELECT TRIGGER_SCHEMA AS s, TRIGGER_NAME AS n, EVENT_OBJECT_TABLE AS parent FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA ${where} ORDER BY 1, 2`)
      for (const r of triggers as { s: string; n: string; parent: string }[]) {
        objects.push({ schema: r.s === c.database ? '' : r.s, name: r.n, type: 'trigger', parent: r.parent, columns: [] })
      }
      const [events] = await connection.query(`SELECT EVENT_SCHEMA AS s, EVENT_NAME AS n FROM information_schema.EVENTS WHERE EVENT_SCHEMA ${where} ORDER BY 1, 2`).catch(() => [[]])
      for (const r of events as { s: string; n: string }[]) objects.push({ schema: r.s === c.database ? '' : r.s, name: r.n, type: 'job', columns: [] })
      return objects
    },
    async definition(object) {
      const quote = (x: string): string => '`' + x.replace(/`/g, '``') + '`'
      const name = (object.schema ? `${quote(object.schema)}.` : '') + quote(object.name)
      const statement =
        object.type === 'view' ? `SHOW CREATE VIEW ${name}` : object.type === 'trigger' ? `SHOW CREATE TRIGGER ${name}` : object.type === 'job' ? `SHOW CREATE EVENT ${name}`
        : object.type === 'procedure' ? `SHOW CREATE PROCEDURE ${name}` : object.type === 'function' ? `SHOW CREATE FUNCTION ${name}` : `SHOW CREATE TABLE ${name}`
      const [result] = await connection.query(statement)
      const row = (result as Record<string, unknown>[])[0] ?? {}
      const key = Object.keys(row).find((k) => /^(Create|SQL Original Statement)/i.test(k) && k !== 'Create View' ? true : /^Create /i.test(k))
      return String((key && row[key]) ?? row['Create View'] ?? row['SQL Original Statement'] ?? '')
    },
    async read(sql, maxRows) {
      // Salt okunur işlem: MySQL bu işlemin içinde yazmayı reddeder. Sonuç akış olarak okunur; sınır aşılınca
      // bağlantı kesilir, böylece büyük tablolar belleğe alınmaz.
      const started = Date.now()
      await connection.query('START TRANSACTION READ ONLY')
      const raw = (connection as unknown as { connection: import('mysql2').Connection }).connection
      const rows: SqlValue[][] = []
      let columns: string[] = []
      let truncated = false
      try {
        await new Promise<void>((resolve, reject) => {
          const query = raw.query({ sql, rowsAsArray: true })
          query.on('fields', (fields: { name: string }[]) => {
            if (columns.length === 0) columns = fields.map((f) => f.name)
          })
          query.on('result', (row: unknown) => {
            if (!Array.isArray(row)) return
            if (rows.length < maxRows) rows.push(row.map(cell))
            else if (!truncated) {
              truncated = true
              raw.destroy()
              resolve()
            }
          })
          query.on('error', (e: Error) => (truncated ? resolve() : reject(e)))
          query.on('end', () => resolve())
        })
        return { columns, rows, rowCount: rows.length, truncated, ms: Date.now() - started }
      } finally {
        if (truncated) connection = await connect()
        else await connection.query('ROLLBACK').catch(() => undefined)
      }
    },
    async write(sql) {
      const started = Date.now()
      await connection.beginTransaction()
      try {
        const [result] = await connection.query(sql)
        await connection.commit()
        const affected = (result as { affectedRows?: number }).affectedRows ?? 0
        return { columns: [], rows: [], rowCount: 0, truncated: false, affected, ms: Date.now() - started }
      } catch (e) {
        await connection.rollback().catch(() => undefined)
        throw e
      }
    },
    async close() {
      await connection.end().catch(() => undefined)
    }
  }
}

interface ColumnRow {
  s: string
  t: string
  tt: string
  col: string
  dt: string
  len: number | null
  nul: string
  pk: unknown
}

/** information_schema satırlarını tablo listesine çevirir. `plainSchema` adındaki şema gösterilmez (varsayılan şema). */
function groupColumns(rows: ColumnRow[], plainSchema: string): SqlTable[] {
  const tables = new Map<string, SqlTable>()
  for (const r of rows) {
    const key = `${r.s}.${r.t}`
    let table = tables.get(key)
    if (!table) {
      if (tables.size >= MAX_SCHEMA_TABLES) continue
      table = { schema: r.s === plainSchema ? '' : r.s, name: r.t, type: /VIEW/i.test(r.tt) ? 'view' : 'table', columns: [] }
      tables.set(key, table)
    }
    table.columns.push({
      name: r.col,
      type: r.len && r.len > 0 ? `${r.dt}(${r.len})` : r.dt,
      nullable: String(r.nul).toUpperCase() === 'YES',
      key: r.pk === true || r.pk === 1 || r.pk === '1'
    })
  }
  return [...tables.values()]
}

// ---------- Servis ----------

const STORE_KEY = 'sqlConnections'

export class SqlService {
  private pending = new Map<string, (approved: boolean) => void>()

  constructor(
    private db: Db,
    private events: SqlEvents
  ) {}

  private load(): StoredConnection[] {
    try {
      const list = JSON.parse(this.db.getInternal(STORE_KEY) ?? '[]')
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }

  private store(list: StoredConnection[]): void {
    this.db.setInternal(STORE_KEY, JSON.stringify(list))
  }

  private toPublic(c: StoredConnection): SqlConnection {
    const { secret, ...rest } = c
    return { ...rest, hasPassword: secret !== '' }
  }

  list(): SqlConnection[] {
    return this.load().map((c) => this.toPublic(c))
  }

  get(id: string | null | undefined): SqlConnection | null {
    const found = id ? this.load().find((c) => c.id === id) : null
    return found ? this.toPublic(found) : null
  }

  /** Bağlantıyı ekler ya da günceller. Parola boş bırakılırsa eski parola korunur. */
  save(input: SqlConnectionInput, id?: string): SqlConnection {
    const t = L().tools.sql.errors
    const name = String(input.name ?? '').trim().slice(0, 60)
    if (!name) throw new SqlError(t.noName)
    const engine: SqlEngine = SQL_ENGINES.includes(input.engine) ? input.engine : 'mssql'
    const server = engine !== 'sqlite'
    const list = this.load()
    const old = id ? list.find((c) => c.id === id) : undefined
    let secret = old?.secret ?? ''
    if (input.password) {
      // Parola Windows'un güvenli deposuyla şifrelenir; düz metin olarak hiçbir yere yazılmaz.
      if (!safeStorage.isEncryptionAvailable()) throw new SqlError(t.noSafeStorage)
      secret = safeStorage.encryptString(String(input.password)).toString('base64')
    }
    const next: StoredConnection = {
      id: old?.id ?? randomUUID(),
      name,
      engine,
      host: server ? String(input.host ?? '').trim() : '',
      port: server ? Number(input.port) || DEFAULT_PORT[engine] : 0,
      database: server ? String(input.database ?? '').trim() : '',
      user: server ? String(input.user ?? '').trim() : '',
      // SQL Server bağlantıları her zaman şifrelidir; diğerlerinde kullanıcı seçer (yerel sunucularda genelde kapalıdır).
      encrypt: engine === 'mssql' ? true : server ? input.encrypt === true : false,
      trustCert: server ? input.trustCert !== false : false,
      file: engine === 'sqlite' ? String(input.file ?? '').trim() : '',
      hasPassword: secret !== '',
      secret: server ? secret : ''
    }
    if (server && (!next.host || !next.user)) throw new SqlError(t.missingServer)
    if (engine === 'sqlite' && !next.file) throw new SqlError(t.missingFile)
    this.store(old ? list.map((c) => (c.id === old.id ? next : c)) : [...list, next])
    return this.toPublic(next)
  }

  remove(id: string): void {
    this.schemaCache.delete(id)
    this.store(this.load().filter((c) => c.id !== id))
  }

  private async open(id: string): Promise<{ driver: Driver; connection: StoredConnection }> {
    const connection = this.load().find((c) => c.id === id)
    if (!connection) throw new SqlError(L().tools.sql.errors.notFound)
    if (connection.engine === 'sqlite') return { driver: sqliteDriver(connection.file), connection }
    const password = connection.secret ? safeStorage.decryptString(Buffer.from(connection.secret, 'base64')) : ''
    try {
      const driver =
        connection.engine === 'postgres'
          ? await postgresDriver(connection, password)
          : connection.engine === 'mysql'
            ? await mysqlDriver(connection, password)
            : await mssqlDriver(connection, password)
      return { driver, connection }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      // Bağlantı reddi başka yerde "Ollama çalışmıyor" diye yorumlanır; burada sunucunun kendisi kapalıdır.
      const refused = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|Could not connect|Failed to connect/i.test(raw)
      throw new SqlError(refused ? L().tools.sql.errors.unreachable(connection.host, connection.port) : L().tools.sql.errors.connect(raw))
    }
  }

  private async withDriver<T>(id: string, work: (driver: Driver, connection: StoredConnection) => Promise<T>): Promise<T> {
    const { driver, connection } = await this.open(id)
    try {
      return await work(driver, connection)
    } catch (e) {
      if (e instanceof SqlError) throw e
      throw new SqlError(e instanceof Error ? e.message : String(e))
    } finally {
      await driver.close()
    }
  }

  /** Bağlantıyı dener; tablo sayısını döndürür. */
  async test(id: string): Promise<number> {
    return (await this.schema(id)).length
  }

  schema(id: string): Promise<SqlTable[]> {
    return this.withDriver(id, (driver) => driver.schema())
  }

  /** Görünüm, yordam, işlev, tetikleyici ya da işin kaynak kodu (en çok 60 bin karakter) */
  definition(id: string, object: { schema: string; name: string; type: SqlObjectType }): Promise<string> {
    return this.withDriver(id, async (driver) => (await driver.definition(object)).slice(0, 60_000))
  }

  /** Kullanıcının panelden çalıştırdığı sorgu: yalnızca okuma kabul edilir. */
  async runRead(id: string, sql: string): Promise<SqlResult> {
    const verdict = classifySql(sql)
    if (verdict.kind !== 'read') throw new SqlError(L().tools.sql.errors.panelReadOnly)
    return this.withDriver(id, (driver) => driver.read(sql, MAX_UI_ROWS))
  }

  respond(approvalId: string, approved: boolean): void {
    this.pending.get(approvalId)?.(approved)
    this.pending.delete(approvalId)
  }

  private ask(approval: SqlApproval, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      const finish = (approved: boolean): void => {
        signal.removeEventListener('abort', onAbort)
        this.pending.delete(approval.id)
        resolve(approved)
      }
      const onAbort = (): void => finish(false)
      if (signal.aborted) return finish(false)
      signal.addEventListener('abort', onAbort)
      this.pending.set(approval.id, finish)
      this.events.approval(approval)
    })
  }

  toolDefs(): unknown[] {
    const d = L().tools.sql.defs
    const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]): unknown => ({
      type: 'function',
      function: { name, description, parameters: { type: 'object', properties, required } }
    })
    return [
      tool('sql_schema', d.schema, { table: { type: 'string', description: d.schemaTableArg } }, []),
      tool('sql_query', d.query, { sql: { type: 'string', description: d.querySqlArg } }, ['sql'])
    ]
  }

  /** Sistem talimatına eklenen bölüm: modelin veritabanını nasıl kullanacağı ve neyi yapamayacağı. */
  async promptBlock(connection: SqlConnection): Promise<string> {
    const p = L().tools.sql.prompt
    // Gerçek tablo ve sütun adları talimata eklenir; model ad uydurmaz. Büyük veritabanlarında liste kısaltılır.
    let schema = ''
    try {
      const lines: string[] = []
      let size = 0
      const tables = await this.cachedSchema(connection.id)
      const objects = tables.filter((x) => x.type !== 'table' && x.type !== 'view')
      for (const table of tables.filter((x) => x.type === 'table' || x.type === 'view')) {
        const line = `- ${fullName(table)}: ${table.columns.map((c) => `${c.name} ${c.type}`).join(', ')}`
        if (size + line.length > MAX_PROMPT_SCHEMA_CHARS) {
          lines.push(p.schemaMore(tables.length - lines.length))
          break
        }
        lines.push(line)
        size += line.length
      }
      if (lines.length > 0) schema = `${p.schemaTitle}\n${lines.join('\n')}`
      // Programlanabilir nesneler yalnızca adlarıyla listelenir; kodları sql_schema ile okunur.
      if (objects.length > 0) {
        const kinds = L().tools.sql.result.kinds
        const groups = (['procedure', 'function', 'trigger', 'job'] as const)
          .map((type) => [type, objects.filter((o) => o.type === type).map((o) => fullName(o))] as const)
          .filter(([, names]) => names.length > 0)
          .map(([type, names]) => `- ${kinds[type]}: ${names.join(', ')}`)
        schema += `\n${p.objectsTitle}\n${groups.join('\n').slice(0, 2500)}`
      }
    } catch {
      // Şema okunamadıysa model sql_schema aracıyla dener; hata o zaman sohbette görünür.
    }
    return [p.intro(connection.name, ENGINE_NAME[connection.engine]), schema, p.schemaFirst, p.objectsHint, p.readFree, p.writeApproval, p.forbidden, p.limit]
      .filter(Boolean)
      .join('\n')
  }

  private schemaCache = new Map<string, { at: number; tables: SqlTable[] }>()

  private async cachedSchema(id: string): Promise<SqlTable[]> {
    const hit = this.schemaCache.get(id)
    if (hit && Date.now() - hit.at < SCHEMA_CACHE_MS) return hit.tables
    const tables = await this.schema(id)
    this.schemaCache.set(id, { at: Date.now(), tables })
    return tables
  }

  isSqlTool(name: string): boolean {
    return name === 'sql_schema' || name === 'sql_query'
  }

  /** Modelin istediği veritabanı aracını çalıştırır. Hatalar modele metin olarak döner; sohbet kesilmez. */
  async execute(conversationId: string, connectionId: string, call: ToolCall, signal: AbortSignal): Promise<{ step: ToolStep; result: string }> {
    const id = randomUUID()
    const t = L().tools.sql
    const done = (label: string, result: string, status: ToolStep['status'] = 'ok'): { step: ToolStep; result: string } => ({
      step: { id, tool: call.name, label, status },
      result
    })
    const args = call.arguments ?? {}
    try {
      if (call.name === 'sql_schema') {
        const tables = await this.schema(connectionId)
        const wanted = String(args.table ?? '').trim().toLowerCase().replace(/[[\]"`]/g, '')
        if (wanted) {
          const table = tables.find((x) => x.name.toLowerCase() === wanted || `${x.schema}.${x.name}`.toLowerCase() === wanted)
          if (!table) return done(t.steps.schemaTable(wanted), t.result.noTable(wanted), 'error')
          const lines = table.columns.map((c) => `- ${c.name}: ${c.type}${c.key ? ` (${t.result.key})` : ''}${c.nullable ? '' : ` ${t.result.notNull}`}`)
          // Görünüm, yordam, işlev, tetikleyici ve işlerde kaynak kodu da verilir.
          let code = ''
          if (table.type !== 'table') code = await this.definition(connectionId, table).catch(() => '')
          const head = `${fullName(table)} (${t.result.kinds[table.type]})${table.parent ? `, ${t.result.parent(table.parent)}` : ''}`
          return done(
            t.steps.schemaTable(table.name),
            [head, lines.join('\n'), code ? `${t.result.code}\n${code.slice(0, MAX_MODEL_CHARS)}` : ''].filter(Boolean).join('\n')
          )
        }
        const lines = tables.map((x) =>
          x.type === 'table' || x.type === 'view'
            ? `- ${fullName(x)}${x.type === 'view' ? ` (${t.result.view})` : ''}: ${x.columns.map((c) => c.name).join(', ')}`
            : `- ${fullName(x)} (${t.result.kinds[x.type]}${x.parent ? `, ${t.result.parent(x.parent)}` : ''})${x.columns.length ? `: ${x.columns.map((c) => c.name).join(', ')}` : ''}`
        )
        return done(t.steps.schema(tables.length), (lines.join('\n') || t.result.noTables).slice(0, MAX_MODEL_CHARS * 2))
      }

      if (call.name === 'sql_query') {
        const sql = String(args.sql ?? '').trim()
        if (!sql) return done(t.steps.query(''), t.result.emptySql, 'error')
        const verdict = classifySql(sql)
        const short = sql.replace(/\s+/g, ' ').slice(0, 80)

        if (verdict.kind === 'forbidden') {
          // Silme ve yok etme: Atlas çalıştırmaz, kullanıcıya kendisinin yapması gerektiğini söyler.
          return done(t.steps.forbidden(verdict.keywords.join(', ')), t.result.forbidden(verdict.keywords.join(', ')), 'denied')
        }

        if (verdict.kind === 'write') {
          const connection = this.get(connectionId)
          const approved = await this.ask({ id, conversationId, connectionName: connection?.name ?? '', sql, keywords: verdict.keywords }, signal)
          if (!approved) return done(t.steps.denied(short), t.result.denied, 'denied')
          const result = await this.withDriver(connectionId, (driver) => driver.write(sql))
          this.schemaCache.delete(connectionId)
          this.events.result({ conversationId, sql, result })
          return done(t.steps.wrote(result.affected ?? 0), t.result.wrote(result.affected ?? 0))
        }

        const result = await this.withDriver(connectionId, (driver) => driver.read(sql, MAX_UI_ROWS))
        this.events.result({ conversationId, sql, result })
        return done(t.steps.read(result.rowCount, result.truncated), formatForModel(result, t.result.more))
      }
      return done(call.name, t.result.unknownTool(call.name), 'error')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return done(t.steps.failed, t.result.failed(message), 'error')
    }
  }
}

function fullName(table: SqlTable): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name
}

/** Sonucu modele verilecek kısa bir tabloya çevirir. */
export function formatForModel(result: SqlResult, more: (shown: number, total: number, truncated: boolean) => string): string {
  if (result.columns.length === 0) return '(0)'
  const lines = [result.columns.join(' | ')]
  let shown = 0
  let size = lines[0].length
  for (const row of result.rows.slice(0, MAX_MODEL_ROWS)) {
    const line = row.map((v) => (v === null ? 'NULL' : String(v).replace(/\s+/g, ' ').slice(0, 120))).join(' | ')
    if (size + line.length > MAX_MODEL_CHARS) break
    lines.push(line)
    size += line.length
    shown++
  }
  if (shown < result.rowCount || result.truncated) lines.push(more(shown, result.rowCount, result.truncated))
  return lines.join('\n')
}

let instance: SqlService | null = null
export function initSql(db: Db, events: SqlEvents): SqlService {
  instance = new SqlService(db, events)
  return instance
}
export function sqlService(): SqlService {
  if (!instance) throw new Error('sql servisi başlatılmadı')
  return instance
}
