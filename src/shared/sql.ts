/**
 * SQL güvenlik kuralları. Atlas'ın bir veritabanında neyi kendiliğinden, neyi onayla yapabileceği ve neyi hiç
 * yapamayacağı burada belirlenir. Kural bilerek katıdır: emin olunamayan her şey "onay ister" sayılır.
 *
 * - read: yalnızca okur (SELECT). Onaysız çalışır; ayrıca veritabanında geri alınan ya da salt okunur bir işlem içinde
 *   ve tek ifade olarak çalıştırılır.
 * - write: veriyi ya da yapıyı değiştirir (INSERT, UPDATE, CREATE, ALTER, EXEC ...). Kullanıcı onayı ister.
 * - forbidden: siler ya da yok eder (DELETE, DROP, TRUNCATE). Atlas bunu çalıştırmaz; kullanıcı kendisi yapar.
 *
 * Metin sabitleri ve yorumlar her veritabanında başka kurallarla yazılır (ters bölü kaçışı, # yorumu, iç içe yorum,
 * $etiket$ tırnağı). Biri için metin olan şey öteki için çalışan kod olabilir; bu yüzden metin, veritabanının olası
 * bütün okunuşlarıyla ayrı ayrı incelenir ve en tehlikeli sonuç alınır.
 */
export type SqlKind = 'read' | 'write' | 'forbidden'
export type SqlDialect = 'mssql' | 'postgres' | 'mysql' | 'sqlite'

export interface SqlVerdict {
  kind: SqlKind
  /** Kararı belirleyen anahtar kelimeler (büyük harf): "DELETE", "UPDATE" ... */
  keywords: string[]
  /** Yorumlar ve metin sabitleri çıkarıldıktan sonra kalan ifade sayısı */
  statements: number
}

/** Atlas'ın hiçbir koşulda çalıştırmadığı işlemler. ATTACH (SQLite) diskte istediği yerde dosya oluşturabildiği için burada. */
const FORBIDDEN = new Set(['DELETE', 'DROP', 'TRUNCATE', 'ATTACH'])

/** İfadenin neresinde geçerse geçsin veriyi, yapıyı, sunucuyu değiştirebilen ya da dışarıya çıkan işlemler: onay ister */
const WRITE_ANYWHERE = new Set([
  'INSERT', 'UPDATE', 'MERGE', 'UPSERT', 'INTO', 'CREATE', 'ALTER', 'EXEC', 'EXECUTE', 'GRANT', 'REVOKE', 'DENY',
  'BACKUP', 'RESTORE', 'SHUTDOWN', 'KILL', 'DBCC', 'BULK', 'OPENROWSET', 'OPENQUERY', 'OPENDATASOURCE', 'COMMIT',
  'ROLLBACK', 'DETACH', 'RECONFIGURE', 'WAITFOR', 'XP_CMDSHELL', 'SP_EXECUTESQL', 'WRITETEXT', 'UPDATETEXT', 'ENABLE',
  'DISABLE', 'RECEIVE', 'SEND', 'CONVERSATION',
  // Kilit ipuçları: okuma sırasında tabloyu başkalarına kilitler
  'TABLOCK', 'TABLOCKX', 'HOLDLOCK', 'XLOCK', 'UPDLOCK', 'PAGLOCK',
  // MySQL: dosyaya yazma, dosya okuma, bekletme
  'OUTFILE', 'DUMPFILE', 'LOAD_FILE', 'SLEEP', 'BENCHMARK', 'GET_LOCK', 'RELEASE_LOCK',
  // PostgreSQL: salt okunur işlemde bile yan etkisi olan işlevler
  'PG_SLEEP', 'PG_SLEEP_FOR', 'PG_SLEEP_UNTIL', 'PG_TERMINATE_BACKEND', 'PG_CANCEL_BACKEND', 'PG_RELOAD_CONF',
  'PG_ROTATE_LOGFILE', 'PG_READ_FILE', 'PG_READ_BINARY_FILE', 'PG_LS_DIR', 'PG_STAT_FILE', 'LO_IMPORT', 'LO_EXPORT',
  'LO_UNLINK', 'DBLINK', 'DBLINK_EXEC', 'DBLINK_CONNECT', 'DBLINK_SEND_QUERY', 'SET_CONFIG', 'PG_ADVISORY_LOCK',
  'PG_ADVISORY_XACT_LOCK', 'PG_TRY_ADVISORY_LOCK', 'PG_NOTIFY', 'NEXTVAL', 'SETVAL', 'PG_PROMOTE', 'PG_SWITCH_WAL'
])

/**
 * Yalnızca bir ifadenin başında komut olan kelimeler. Sütun adı ya da işlev olarak da sık geçtikleri için
 * (Comment, Export, REPLACE(...) gibi) ifadenin ortasında aranmaz.
 */
const WRITE_AT_START = new Set([
  'REPLACE', 'RENAME', 'CALL', 'DO', 'USE', 'SET', 'DECLARE', 'BEGIN', 'SAVE', 'LOCK', 'UNLOCK', 'VACUUM', 'REINDEX',
  'ANALYZE', 'PRAGMA', 'COPY', 'LOAD', 'HANDLER', 'COMMENT', 'REFRESH', 'CLUSTER', 'NOTIFY', 'LISTEN', 'UNLISTEN',
  'PREPARE', 'DEALLOCATE', 'IMPORT', 'EXPORT', 'SECURITY', 'REASSIGN', 'DISCARD', 'RESET', 'CHECKPOINT', 'FLUSH',
  'INSTALL', 'UNINSTALL', 'OPTIMIZE', 'REPAIR', 'PURGE', 'CHANGE', 'START', 'STOP', 'XA', 'SHOW', 'DESCRIBE',
  'EXPLAIN', 'PRINT', 'RAISERROR', 'THROW', 'IF', 'WHILE', 'GOTO', 'RETURN', 'OPEN', 'FETCH', 'CLOSE', 'MOVE', 'END'
])

/** Bir okuma sorgusunun başlayabileceği kelimeler */
const READ_START = new Set(['SELECT', 'WITH'])

/** Bir okunuşun kuralları */
interface Lexing {
  /** '...' içinde \' kaçış sayılır (MySQL varsayılanı) */
  backslash: boolean
  /** # satır yorumu (MySQL) */
  hashComment: boolean
  /** -- yorumu yalnızca ardından boşluk gelirse (MySQL) */
  dashNeedsSpace: boolean
  /** /* ... *\/ iç içe olabilir (SQL Server, PostgreSQL) */
  nested: boolean
  /** /*! ... *\/ çalışan koddur (MySQL) */
  bangCode: boolean
  /** $etiket$ ... $etiket$ metni (PostgreSQL) */
  dollar: boolean
  /** E'...' içinde ters bölü kaçışı (PostgreSQL) */
  eString: boolean
  /** [ad] tırnaklı ad (SQL Server, SQLite) */
  brackets: boolean
  /** `ad` tırnaklı ad (MySQL, SQLite) */
  backticks: boolean
}

const BASE: Lexing = {
  backslash: false,
  hashComment: false,
  dashNeedsSpace: false,
  nested: false,
  bangCode: false,
  dollar: false,
  eString: false,
  brackets: false,
  backticks: false
}

const LEXINGS: Record<SqlDialect, Lexing[]> = {
  mssql: [{ ...BASE, nested: true, brackets: true }],
  postgres: [{ ...BASE, nested: true, dollar: true, eString: true }],
  // NO_BACKSLASH_ESCAPES açık bir sunucuda ters bölü kaçış değildir: iki okunuş da incelenir.
  mysql: [
    { ...BASE, backslash: true, hashComment: true, dashNeedsSpace: true, bangCode: true, backticks: true },
    { ...BASE, hashComment: true, dashNeedsSpace: true, bangCode: true, backticks: true }
  ],
  sqlite: [{ ...BASE, brackets: true, backticks: true }]
}

const IDENT = /[A-Za-z0-9_$\u0080-￿]/

/**
 * Yorumları, metin sabitlerini ve tırnaklı adları çıkarır; geriye yalnızca anahtar kelimelerin aranacağı iskelet kalır.
 * Böylece "SELECT 'DROP TABLE x'" bir silme sayılmaz, ama yorumun içine gizlenmiş bir ifade de atlanmaz.
 */
function strip(sql: string, rules: Lexing): string {
  let out = ''
  let i = 0
  const n = sql.length
  const skipQuoted = (quote: string, backslash: boolean): void => {
    i++
    while (i < n) {
      if (backslash && sql[i] === '\\' && i + 1 < n) i += 2
      else if (sql[i] === quote && sql[i + 1] === quote) i += 2
      else if (sql[i] === quote) break
      else i++
    }
    i++
    out += ' x '
  }
  while (i < n) {
    const c = sql[i]
    const next = sql[i + 1]
    const prev = i > 0 ? sql[i - 1] : ''
    if (c === '-' && next === '-' && (!rules.dashNeedsSpace || i + 2 >= n || /\s/.test(sql[i + 2]))) {
      while (i < n && sql[i] !== '\n') i++
      out += ' '
    } else if (c === '#' && rules.hashComment) {
      while (i < n && sql[i] !== '\n') i++
      out += ' '
    } else if (c === '/' && next === '*') {
      if (rules.bangCode && (sql[i + 2] === '!' || sql[i + 2] === '+')) {
        // MySQL'in çalışan yorumu: içi kod gibi incelenir.
        i += 3
        while (i < n && /\d/.test(sql[i])) i++
        out += ' '
        continue
      }
      i += 2
      let depth = 1
      while (i < n && depth > 0) {
        if (rules.nested && sql[i] === '/' && sql[i + 1] === '*') {
          depth++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--
          i += 2
        } else i++
      }
      out += ' '
    } else if (c === "'") {
      const eString = rules.eString && /[eE]/.test(prev) && !IDENT.test(sql[i - 2] ?? '')
      skipQuoted("'", rules.backslash || eString)
    } else if (c === '"') {
      skipQuoted('"', rules.backslash)
    } else if (c === '`' && rules.backticks) {
      skipQuoted('`', false)
    } else if (c === '[' && rules.brackets) {
      i++
      while (i < n) {
        if (sql[i] === ']' && sql[i + 1] === ']') i += 2
        else if (sql[i] === ']') break
        else i++
      }
      i++
      out += ' x '
    } else if (c === '$' && rules.dollar && !IDENT.test(prev) && /^\$[A-Za-z_]?[A-Za-z0-9_]*\$/.test(sql.slice(i, i + 64))) {
      // PostgreSQL dolar tırnağı: $$ ... $$ ya da $etiket$ ... $etiket$ (bir adın içindeki $ değil: a$$ geçerli bir addır)
      const tag = /^\$[A-Za-z_]?[A-Za-z0-9_]*\$/.exec(sql.slice(i, i + 64))![0]
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

/** Metni verilen veritabanının (ilk) okunuşuyla iskeletine indirir. */
export function stripSql(sql: string, dialect: SqlDialect = 'mssql'): string {
  return strip(sql, LEXINGS[dialect][0])
}

function classifyBare(bare: string): SqlVerdict {
  const statements = bare
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  if (statements.length === 0) return { kind: 'write', keywords: [], statements: 0 }

  const forbidden = new Set<string>()
  const write = new Set<string>()
  let allStartRead = true
  for (const statement of statements) {
    const upper = statement.toUpperCase()
    const tokens = upper.match(/[A-Z_][A-Z0-9_$]*/g) ?? []
    const first = tokens[0] ?? ''
    if (!READ_START.has(first)) allStartRead = false
    if (WRITE_AT_START.has(first)) write.add(first)
    for (const token of tokens) {
      if (FORBIDDEN.has(token)) forbidden.add(token)
      else if (WRITE_ANYWHERE.has(token)) write.add(token)
    }
    // Dizi değeri ilerletir; geri alınan işlemde bile geri dönmez.
    if (/\bNEXT\s+VALUE\s+FOR\b/.test(upper)) write.add('NEXT VALUE FOR')
  }
  if (forbidden.size > 0) return { kind: 'forbidden', keywords: [...forbidden], statements: statements.length }
  // Birden çok ifade tek seferde çalıştırılmaz sayılır: okuma kabul edilmesi için tek bir SELECT olmalı.
  if (write.size > 0 || !allStartRead || statements.length > 1) {
    return { kind: 'write', keywords: [...write], statements: statements.length }
  }
  return { kind: 'read', keywords: [], statements: 1 }
}

const RANK: Record<SqlKind, number> = { read: 0, write: 1, forbidden: 2 }

/**
 * Bir SQL metninin okuma mı, onay isteyen yazma mı, yoksa yasak bir silme mi olduğuna karar verir.
 * Veritabanı türü verilmezse bütün türlerin okunuşları denenir.
 */
export function classifySql(sql: string, dialect?: SqlDialect): SqlVerdict {
  const lexings = dialect ? LEXINGS[dialect] : Object.values(LEXINGS).flat()
  let worst: SqlVerdict | null = null
  const keywords = new Set<string>()
  let statements = 0
  for (const rules of lexings) {
    const verdict = classifyBare(strip(sql, rules))
    verdict.keywords.forEach((k) => keywords.add(k))
    statements = Math.max(statements, verdict.statements)
    if (!worst || RANK[verdict.kind] > RANK[worst.kind]) worst = verdict
  }
  const kind = worst!.kind
  // Yasaksa yalnızca yasak kelimeler gösterilir; yazmaysa bütün okunuşlarda bulunan kelimeler.
  const shown = kind === 'forbidden' ? [...keywords].filter((k) => FORBIDDEN.has(k)) : [...keywords]
  return { kind, keywords: shown, statements: kind === 'read' ? 1 : statements }
}
