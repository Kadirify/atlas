/**
 * SQL güvenlik kuralları. Atlas'ın bir veritabanında neyi kendiliğinden, neyi onayla yapabileceği ve neyi hiç
 * yapamayacağı burada belirlenir. Kural bilerek katıdır: emin olunamayan her şey "onay ister" sayılır.
 *
 * - read: yalnızca okur (SELECT). Onaysız çalışır; ayrıca veritabanında geri alınan bir işlem içinde çalıştırılır.
 * - write: veriyi ya da yapıyı değiştirir (INSERT, UPDATE, CREATE, ALTER, EXEC ...). Kullanıcı onayı ister.
 * - forbidden: siler ya da yok eder (DELETE, DROP, TRUNCATE). Atlas bunu çalıştırmaz; kullanıcı kendisi yapar.
 */
export type SqlKind = 'read' | 'write' | 'forbidden'

export interface SqlVerdict {
  kind: SqlKind
  /** Kararı belirleyen anahtar kelimeler (büyük harf): "DELETE", "UPDATE" ... */
  keywords: string[]
  /** Yorumlar ve metin sabitleri çıkarıldıktan sonra kalan ifade sayısı */
  statements: number
}

/** Atlas'ın hiçbir koşulda çalıştırmadığı işlemler */
const FORBIDDEN = new Set(['DELETE', 'DROP', 'TRUNCATE'])

/** Veriyi, yapıyı ya da sunucuyu değiştirebilen işlemler: onay ister */
const WRITE = new Set([
  'INSERT', 'UPDATE', 'MERGE', 'UPSERT', 'REPLACE', 'INTO', 'CREATE', 'ALTER', 'RENAME', 'EXEC', 'EXECUTE', 'CALL', 'DO',
  'GRANT', 'REVOKE', 'DENY', 'BACKUP', 'RESTORE', 'SHUTDOWN', 'KILL', 'DBCC', 'BULK', 'OPENROWSET', 'OPENQUERY',
  'OPENDATASOURCE', 'USE', 'SET', 'DECLARE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVE', 'LOCK', 'ATTACH', 'DETACH', 'VACUUM',
  'REINDEX', 'ANALYZE', 'PRAGMA', 'COPY', 'LOAD', 'HANDLER', 'RECONFIGURE', 'WAITFOR', 'XP_CMDSHELL', 'SP_EXECUTESQL',
  'COMMENT', 'REFRESH', 'CLUSTER', 'NOTIFY', 'LISTEN', 'UNLISTEN', 'PREPARE', 'DEALLOCATE', 'IMPORT', 'EXPORT'
])

/** Bir okuma sorgusunun başlayabileceği kelimeler */
const READ_START = new Set(['SELECT', 'WITH'])

/**
 * Yorumları, metin sabitlerini ve tırnaklı adları çıkarır; geriye yalnızca anahtar kelimelerin aranacağı iskelet kalır.
 * Böylece "SELECT 'DROP TABLE x'" bir silme sayılmaz, ama yorumun içine gizlenmiş bir ifade de atlanmaz
 * (yorum zaten çalışmaz).
 */
export function stripSql(sql: string): string {
  let out = ''
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++
      out += ' '
    } else if (c === '#') {
      // MySQL satır yorumu; SQL Server'da geçici tablo adı (#tmp) olabilir, o yüzden yalnızca satır başında yorum sayılır.
      const lineStart = out.trimEnd().length === 0 || /\n\s*$/.test(out)
      if (lineStart) {
        while (i < n && sql[i] !== '\n') i++
        out += ' '
      } else {
        out += c
        i++
      }
    } else if (c === '/' && next === '*') {
      i += 2
      let depth = 1
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--
          i += 2
        } else i++
      }
      out += ' '
    } else if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < n) {
        if (sql[i] === '\\' && c !== '"' && i + 1 < n && sql[i + 1] === c) i += 2
        else if (sql[i] === c && sql[i + 1] === c) i += 2
        else if (sql[i] === c) break
        else i++
      }
      i++
      out += ' x '
    } else if (c === '[') {
      while (i < n && sql[i] !== ']') i++
      i++
      out += ' x '
    } else if (c === '$' && /^\$[A-Za-z_]*\$/.test(sql.slice(i, i + 64))) {
      // PostgreSQL dolar tırnağı: $$ ... $$ ya da $etiket$ ... $etiket$
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64))![0]
      const end = sql.indexOf(tag, i + tag.length)
      i = end === -1 ? n : end + tag.length
      out += ' x '
    } else {
      out += c
      i++
    }
  }
  return out
}

/** Bir SQL metninin okuma mı, onay isteyen yazma mı, yoksa yasak bir silme mi olduğuna karar verir. */
export function classifySql(sql: string): SqlVerdict {
  const bare = stripSql(sql)
  const statements = bare
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  if (statements.length === 0) return { kind: 'write', keywords: [], statements: 0 }

  const forbidden = new Set<string>()
  const write = new Set<string>()
  let allStartRead = true
  for (const statement of statements) {
    const tokens = statement.toUpperCase().match(/[A-Z_][A-Z0-9_$]*/g) ?? []
    if (!READ_START.has(tokens[0] ?? "")) allStartRead = false
    for (const token of tokens) {
      if (FORBIDDEN.has(token)) forbidden.add(token)
      else if (WRITE.has(token)) write.add(token)
    }
  }
  if (forbidden.size > 0) return { kind: 'forbidden', keywords: [...forbidden], statements: statements.length }
  // Birden çok ifade tek seferde çalıştırılmaz sayılır: okuma kabul edilmesi için tek bir SELECT olmalı.
  if (write.size > 0 || !allStartRead || statements.length > 1) {
    return { kind: 'write', keywords: [...write], statements: statements.length }
  }
  return { kind: 'read', keywords: [], statements: 1 }
}
