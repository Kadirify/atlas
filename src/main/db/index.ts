import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { log } from '../log'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type {
  AttachmentDocument,
  AppField,
  AppRun,
  Attachment,
  AttachmentKind,
  Conversation,
  FileAction,
  FileActionKind,
  Folder,
  Memory,
  MemoryCategory,
  Message,
  MiniApp,
  MiniAppDraft,
  Level,
  Persona,
  PersonaDraft,
  Role,
  SearchHit,
  Settings,
  ToolStep,
  WaStats, UndoEntry } from '@shared/types'
import { documentViewKind } from '@shared/types'
import { ATTACHMENT_BASE_CHARS, DEFAULT_PERSONA_ID, DEFAULT_SETTINGS, UNTITLED_CONVERSATION } from '@shared/types'
import { L } from '../i18n'

/** Her dizi elemanı bir şema sürümüdür. Var olanı değiştirme; sona yenisini ekle. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    model TEXT,
    duration_ms INTEGER,
    tokens INTEGER,
    partial INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE VIRTUAL TABLE messages_fts USING fts5(
    content, content='messages', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
  END;
  CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  END;
  CREATE TRIGGER messages_au AFTER UPDATE OF content ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
  END;
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    data TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_attachments_message ON attachments(message_id);
  `,
  `
  CREATE TABLE mini_apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT NOT NULL,
    prompt TEXT NOT NULL,
    fields TEXT NOT NULL,
    builtin INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE mini_app_runs (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
    input_values TEXT NOT NULL,
    output TEXT NOT NULL,
    model TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_runs_app ON mini_app_runs(app_id, created_at);
  `,
  `
  ALTER TABLE conversations ADD COLUMN persona_id TEXT;
  ALTER TABLE conversations ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE conversations ADD COLUMN summary TEXT NOT NULL DEFAULT '';
  ALTER TABLE conversations ADD COLUMN summary_upto INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE personas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    icon TEXT NOT NULL,
    prompt TEXT NOT NULL,
    warmth INTEGER NOT NULL,
    humor INTEGER NOT NULL,
    length INTEGER NOT NULL,
    emoji INTEGER NOT NULL,
    multi_message INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    category TEXT NOT NULL,
    conversation_id TEXT,
    embedding BLOB,
    created_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE wa_profiles (
    persona_id TEXT PRIMARY KEY REFERENCES personas(id) ON DELETE CASCADE,
    source_name TEXT NOT NULL,
    self_name TEXT NOT NULL,
    stats TEXT NOT NULL,
    summary TEXT NOT NULL,
    similarity INTEGER NOT NULL DEFAULT 1,
    date_from INTEGER NOT NULL,
    date_to INTEGER NOT NULL
  );
  CREATE TABLE wa_examples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    context TEXT NOT NULL,
    reply TEXT NOT NULL,
    ts INTEGER NOT NULL,
    embedding BLOB
  );
  CREATE INDEX idx_wa_examples_persona ON wa_examples(persona_id, ts);
  `,
  `
  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    indexed_at INTEGER,
    created_at INTEGER NOT NULL
  );
  ALTER TABLE conversations ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
  ALTER TABLE messages ADD COLUMN steps TEXT;
  CREATE TABLE file_actions (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE file_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding BLOB
  );
  CREATE INDEX idx_file_chunks_folder ON file_chunks(folder_id, path);
  `,
  `
  ALTER TABLE mini_apps ADD COLUMN model TEXT;
  `,
  `
  -- Belge panelinde düzenlenen eklerin son hali. Özgün metin attachments tablosunda değişmeden kalır.
  CREATE TABLE documents (
    attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  `
  -- PDF, Word ve Excel eklerinin özgün dosyası: belge paneli dosyayı kendi görünümüyle gösterebilsin diye saklanır.
  CREATE TABLE originals (
    attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
    data BLOB NOT NULL
  );
  `,
  `
  -- Sohbete bağlı veritabanı bağlantısı (Kod alanı). Bağlantıların kendisi ayarlarda, parolası şifreli durur.
  ALTER TABLE conversations ADD COLUMN sql_id TEXT;
  `,
  `
  -- Düşünme açıkken modelin cevaptan önceki düşüncesi; cevabın üstünde kapalı bir kutuda gösterilir.
  ALTER TABLE messages ADD COLUMN thinking TEXT;
  `,
  `
  -- Atlas'ın bu cevapta değiştirdiği dosyaların önceki halleri (geri alma için).
  ALTER TABLE messages ADD COLUMN undo TEXT;
  `
]

/** Bir mesajdaki ek dosyalardan modele verilecek en fazla metin (karakter). */
export const ATTACHMENT_CHAR_BUDGET = ATTACHMENT_BASE_CHARS

/** Bağlam büyüdükçe (ekran kartı yetiyorsa) modele verilen belge metni de aynı oranda büyür: 8 bin belirteçte 12 bin karakter. */
export function attachmentBudgetFor(numCtx: number): number {
  return Math.round((Math.max(8192, numCtx) / 8192) * ATTACHMENT_CHAR_BUDGET)
}

/** Bu bilgisayarda bir belgeden modele verilebilen en çok metin; açılışta donanıma göre ayarlanır. */
let attachmentBudget = ATTACHMENT_CHAR_BUDGET

export function setAttachmentBudget(chars: number): void {
  attachmentBudget = Math.max(ATTACHMENT_CHAR_BUDGET, Math.round(chars))
}

/** Şema güncellemesinden önce alınan yedeklerden en çok bu kadarı saklanır */
const KEEP_BACKUPS = 3

/**
 * Açık veritabanının tutarlı bir kopyasını klasöre yazar (VACUUM INTO: henüz ana dosyaya işlenmemiş değişiklikler de
 * girer) ve en yeni üçü dışındaki eski yedekleri siler. Kopyanın yolunu döner.
 */
export function backupDatabase(db: DatabaseSync, dir: string, version: number, now = new Date()): string {
  mkdirSync(dir, { recursive: true })
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const file = join(dir, `atlas-v${version}-${stamp}.db`)
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  const old = readdirSync(dir)
    .filter((name) => /^atlas-v\d+-.*\.db$/.test(name))
    .map((name) => ({ name, time: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time || b.name.localeCompare(a.name))
    .slice(KEEP_BACKUPS)
  for (const entry of old) rmSync(join(dir, entry.name), { force: true })
  return file
}

/** Adı konmamış sohbetin başlığı; ayrıntı için UNTITLED_CONVERSATION. */
export const NEW_CONVERSATION_TITLE = UNTITLED_CONVERSATION

type Row = Record<string, unknown>

function toConversation(r: Row): Conversation {
  return {
    id: r.id as string,
    title: r.title as string,
    model: (r.model as string | null) ?? null,
    folderId: (r.folder_id as string | null) ?? null,
    sqlId: (r.sql_id as string | null) ?? null,
    personaId: (r.persona_id as string | null) ?? DEFAULT_PERSONA_ID,
    private: r.private === 1,
    pinned: r.pinned === 1,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number
  }
}

function toPersona(r: Row): Persona {
  return {
    id: r.id as string,
    name: r.name as string,
    tagline: r.tagline as string,
    icon: r.icon as Persona['icon'],
    prompt: r.prompt as string,
    warmth: r.warmth as Persona['warmth'],
    humor: r.humor as Persona['humor'],
    length: r.length as Persona['length'],
    emoji: r.emoji as Persona['emoji'],
    multiMessage: r.multi_message === 1,
    builtin: false,
    whatsapp: r.wa === 1
  }
}

function toFolder(r: Row): Folder {
  const path = r.path as string
  return {
    id: r.id as string,
    path,
    name: path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path,
    chunks: (r.chunks as number) ?? 0,
    indexedAt: (r.indexed_at as number | null) ?? null
  }
}

const FOLDER_SELECT =
  'SELECT f.*, (SELECT count(*) FROM file_chunks c WHERE c.folder_id = f.id) AS chunks FROM folders f'

export interface FileChunkRow {
  path: string
  text: string
  vector: Float32Array | null
}

/** Kişilikle birlikte, WhatsApp'tan öğrenilmiş olup olmadığını da getirir. */
const PERSONA_SELECT =
  'SELECT p.*, EXISTS (SELECT 1 FROM wa_profiles w WHERE w.persona_id = p.id) AS wa FROM personas p'

export interface WaExampleRow {
  id: number
  context: string
  reply: string
  ts: number
  vector: Float32Array | null
}

function toMemory(r: Row): Memory {
  return {
    id: r.id as string,
    text: r.text as string,
    category: r.category as MemoryCategory,
    conversationId: (r.conversation_id as string | null) ?? null,
    createdAt: r.created_at as number
  }
}

/** Gömme vektörü veritabanında ham 32 bit kayan nokta dizisi olarak saklanır. */
function toVector(blob: unknown): Float32Array | null {
  if (!(blob instanceof Uint8Array) || blob.byteLength === 0) return null
  return new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength))
}

function toMessage(r: Row): Message {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    role: r.role as Role,
    content: r.content as string,
    createdAt: r.created_at as number,
    model: (r.model as string | null) ?? null,
    durationMs: (r.duration_ms as number | null) ?? null,
    tokens: (r.tokens as number | null) ?? null,
    partial: r.partial === 1,
    attachments: [],
    steps: r.steps ? (JSON.parse(r.steps as string) as ToolStep[]) : [],
    thinking: (r.thinking as string | null) ?? '',
    undoCount: typeof r.undo_count === 'number' ? r.undo_count : r.undo ? (JSON.parse(r.undo as string) as UndoEntry[]).length : 0
  }
}

function toAttachment(r: Row): Attachment {
  const kind = r.kind as AttachmentKind
  const chars = r.chars as number
  return {
    id: r.id as string,
    name: r.name as string,
    kind,
    size: r.size as number,
    chars,
    truncated: chars > attachmentBudget,
    dataUrl: kind === 'image' && r.data ? `data:${r.mime as string};base64,${r.data as string}` : null
  }
}

function toApp(r: Row): MiniApp {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    icon: r.icon as MiniApp['icon'],
    category: r.category as MiniApp['category'],
    prompt: r.prompt as string,
    fields: JSON.parse(r.fields as string) as AppField[],
    builtin: r.builtin === 1,
    model: (r.model as string | null) ?? null,
    favorite: r.favorite === 1,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number
  }
}

function toRun(r: Row): AppRun {
  return {
    id: r.id as string,
    appId: r.app_id as string,
    values: JSON.parse(r.input_values as string) as Record<string, string>,
    output: r.output as string,
    model: (r.model as string | null) ?? null,
    createdAt: r.created_at as number
  }
}

/** Liste sorgularında dosya metni okunmaz; resim verisi yalnızca önizleme için alınır. */
const ATTACHMENT_COLUMNS =
  "id, message_id, name, kind, mime, size, length(text) AS chars, CASE kind WHEN 'image' THEN data END AS data"

export class Db {
  private db: DatabaseSync
  /** Aynı milisaniyede eklenen mesajların sırası bozulmasın diye. */
  private lastTs = 0

  /** backupDir verilirse şema güncellemesinden önce veritabanının kopyası o klasöre alınır. */
  constructor(path: string, options: { backupDir?: string } = {}) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    const current = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    // Yeni (boş) veritabanında ve şeması güncel olanda yedeğe gerek yok.
    if (options.backupDir && current > 0 && current < MIGRATIONS.length) {
      try {
        log('info', `Database backed up before schema update: ${backupDatabase(this.db, options.backupDir, current)}`)
      } catch (err) {
        // Yedek alınamadıysa (disk dolu, izin yok) güncelleme yine de denenir; her göç kendi işleminde geri alınır.
        log('warn', 'Database backup before schema update failed', err)
      }
    }
    this.migrate()
  }

  private migrate(): void {
    const current = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    for (let v = current; v < MIGRATIONS.length; v++) {
      this.db.exec('BEGIN')
      try {
        this.db.exec(MIGRATIONS[v])
        this.db.exec(`PRAGMA user_version = ${v + 1}`)
        this.db.exec('COMMIT')
      } catch (err) {
        this.db.exec('ROLLBACK')
        throw err
      }
    }
  }

  private now(): number {
    this.lastTs = Math.max(Date.now(), this.lastTs + 1)
    return this.lastTs
  }

  close(): void {
    this.db.close()
  }

  // --- Sohbetler ---

  listConversations(): Conversation[] {
    return (this.db.prepare('SELECT * FROM conversations ORDER BY pinned DESC, updated_at DESC').all() as Row[]).map(
      toConversation
    )
  }

  getConversation(id: string): Conversation | null {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Row | undefined
    return row ? toConversation(row) : null
  }

  createConversation(
    model: string | null,
    options: { personaId?: string; private?: boolean; folderId?: string | null; sqlId?: string | null } = {}
  ): Conversation {
    const id = randomUUID()
    const ts = this.now()
    this.db
      .prepare(
        `INSERT INTO conversations (id, title, model, persona_id, private, folder_id, sql_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        NEW_CONVERSATION_TITLE,
        model,
        options.personaId ?? DEFAULT_PERSONA_ID,
        options.private ? 1 : 0,
        options.folderId ?? null,
        options.sqlId ?? null,
        ts,
        ts
      )
    return this.getConversation(id)!
  }

  /** Bağlama sığmayan eski mesajların özeti ve özetin hangi mesaja kadar geldiği. */
  getSummary(id: string): { summary: string; upto: number } {
    const row = this.db.prepare('SELECT summary, summary_upto FROM conversations WHERE id = ?').get(id) as Row | undefined
    return { summary: (row?.summary as string) ?? '', upto: (row?.summary_upto as number) ?? 0 }
  }

  setSummary(id: string, summary: string, upto: number): void {
    this.db.prepare('UPDATE conversations SET summary = ?, summary_upto = ? WHERE id = ?').run(summary, upto, id)
  }

  /** Gizli sohbetler kalıcı değildir; uygulama açılışında silinir. */
  purgePrivateConversations(): void {
    this.db.prepare('DELETE FROM conversations WHERE private = 1').run()
  }

  renameConversation(id: string, title: string): void {
    this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title.trim() || NEW_CONVERSATION_TITLE, id)
  }

  setPinned(id: string, pinned: boolean): void {
    this.db.prepare('UPDATE conversations SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
  }

  setConversationModel(id: string, model: string): void {
    this.db.prepare('UPDATE conversations SET model = ? WHERE id = ?').run(model, id)
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  touchConversation(id: string): void {
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(this.now(), id)
  }

  // --- Mesajlar ---

  listMessages(conversationId: string): Message[] {
    const messages = (
      this.db
        // Geri alma kaydının kendisi (dosyaların eski halleri, büyük olabilir) okunmaz; yalnızca kaç öğe olduğu sayılır.
        .prepare(
          `SELECT id, conversation_id, role, content, created_at, model, duration_ms, tokens, partial, steps, thinking,
                  json_array_length(undo) AS undo_count
           FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
        )
        .all(conversationId) as Row[]
    ).map(toMessage)
    const rows = this.db
      .prepare(
        `SELECT ${ATTACHMENT_COLUMNS} FROM attachments
         WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?) ORDER BY created_at ASC`
      )
      .all(conversationId) as Row[]
    const byId = new Map(messages.map((m) => [m.id, m]))
    for (const row of rows) byId.get(row.message_id as string)?.attachments.push(toAttachment(row))
    return messages
  }

  getMessage(id: string): Message | null {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Row | undefined
    if (!row) return null
    const message = toMessage(row)
    message.attachments = (
      this.db
        .prepare(`SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE message_id = ? ORDER BY created_at ASC`)
        .all(id) as Row[]
    ).map(toAttachment)
    return message
  }

  addMessage(m: {
    conversationId: string
    role: Role
    content: string
    model?: string | null
    durationMs?: number | null
    tokens?: number | null
    partial?: boolean
    steps?: ToolStep[]
    thinking?: string
    undo?: UndoEntry[]
  }): Message {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, model, duration_ms, tokens, partial, steps, thinking, undo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        m.conversationId,
        m.role,
        m.content,
        this.now(),
        m.model ?? null,
        m.durationMs ?? null,
        m.tokens ?? null,
        m.partial ? 1 : 0,
        m.steps && m.steps.length > 0 ? JSON.stringify(m.steps) : null,
        m.thinking?.trim() ? m.thinking.slice(0, 40_000) : null,
        m.undo && m.undo.length > 0 ? JSON.stringify(m.undo) : null
      )
    this.touchConversation(m.conversationId)
    return this.getMessage(id)!
  }

  /** Verilen mesajı ve ondan sonraki her şeyi siler (düzenleme ve yeniden üretme için). */
  deleteFrom(conversationId: string, createdAt: number): void {
    this.db.prepare('DELETE FROM messages WHERE conversation_id = ? AND created_at >= ?').run(conversationId, createdAt)
    // Silinen mesajları da kapsayan bir özet artık yanlıştır.
    this.db
      .prepare("UPDATE conversations SET summary = '', summary_upto = 0 WHERE id = ? AND summary_upto >= ?")
      .run(conversationId, createdAt)
  }

  search(query: string): SearchHit[] {
    const terms = query
      .split(/\s+/)
      .map((t) => t.replace(/["*]/g, '').trim())
      .filter(Boolean)
    if (terms.length === 0) return []
    const match = terms.map((t) => `"${t}"*`).join(' ')
    const like = `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`

    const byTitle = this.db
      .prepare(
        `SELECT id AS conversation_id, title, '' AS snippet FROM conversations
         WHERE title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 25`
      )
      .all(like) as Row[]
    const byContent = this.db
      .prepare(
        `SELECT m.conversation_id, c.title, snippet(messages_fts, 0, '', '', '…', 12) AS snippet
         FROM messages_fts
         JOIN messages m ON m.rowid = messages_fts.rowid
         JOIN conversations c ON c.id = m.conversation_id
         WHERE messages_fts MATCH ?
         ORDER BY c.updated_at DESC LIMIT 100`
      )
      .all(match) as Row[]

    // Başlığı eşleşenler önce; her sohbet bir kez. İçerik eşleşmesi varsa alıntısı gösterilir.
    const hits = new Map<string, SearchHit>()
    for (const r of [...byTitle, ...byContent]) {
      const id = r.conversation_id as string
      const existing = hits.get(id)
      if (existing) {
        if (!existing.snippet) existing.snippet = r.snippet as string
        continue
      }
      hits.set(id, { conversationId: id, title: r.title as string, snippet: r.snippet as string })
    }
    return [...hits.values()].slice(0, 50)
  }

  // --- Ek dosyalar ---

  /** Dosya, bir mesaja bağlanana kadar "bekleyen" olarak saklanır. */
  addAttachment(a: {
    name: string
    kind: AttachmentKind
    mime: string
    size: number
    text: string
    data: string | null
    /** Belge panelinde özgün görünümü göstermek için dosyanın kendisi */
    original?: Buffer
  }): Attachment {
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO attachments (id, name, kind, mime, size, text, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, a.name, a.kind, a.mime, a.size, a.text, a.data, this.now())
    if (a.original) this.db.prepare('INSERT INTO originals (attachment_id, data) VALUES (?, ?)').run(id, a.original)
    return this.getAttachment(id)!
  }

  getAttachment(id: string): Attachment | null {
    const row = this.db.prepare(`SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE id = ?`).get(id) as
      | Row
      | undefined
    return row ? toAttachment(row) : null
  }

  /** Modele verilecek ham içerik: metin ya da resmin base64 hali. */
  attachmentContents(ids: string[]): { name: string; kind: AttachmentKind; text: string; data: string | null }[] {
    // Belge panelinde düzenlenmiş ekin modele düzenlenmiş hali gider.
    const stmt = this.db.prepare(
      'SELECT a.name, a.kind, COALESCE(d.text, a.text) AS text, a.data FROM attachments a LEFT JOIN documents d ON d.attachment_id = a.id WHERE a.id = ?'
    )
    return ids
      .map((id) => stmt.get(id) as Row | undefined)
      .filter((r): r is Row => !!r)
      .map((r) => ({
        name: r.name as string,
        kind: r.kind as AttachmentKind,
        text: r.text as string,
        data: (r.data as string | null) ?? null
      }))
  }

  /** Belge panelinde gösterilecek ek: özgün metin ve varsa düzenlenmiş hali. Resimler belge sayılmaz. */
  getDocument(attachmentId: string): AttachmentDocument | null {
    const row = this.db
      .prepare(
        `SELECT a.id, a.name, a.text, d.text AS edited,
                EXISTS(SELECT 1 FROM originals o WHERE o.attachment_id = a.id) AS has_original
         FROM attachments a
         LEFT JOIN documents d ON d.attachment_id = a.id WHERE a.id = ? AND a.kind = 'text'`
      )
      .get(attachmentId) as Row | undefined
    if (!row) return null
    const edited = (row.edited as string | null) ?? null
    const name = row.name as string
    return {
      id: row.id as string,
      name,
      text: edited ?? (row.text as string),
      edited: edited !== null,
      view: documentViewKind(name),
      hasOriginal: !!row.has_original
    }
  }

  /** Ekin özgün dosyası; saklanmadıysa (eski ekler, düz metin dosyaları) null. */
  getOriginal(attachmentId: string): { name: string; bytes: Buffer } | null {
    const row = this.db
      .prepare('SELECT a.name, o.data FROM originals o JOIN attachments a ON a.id = o.attachment_id WHERE o.attachment_id = ?')
      .get(attachmentId) as Row | undefined
    return row ? { name: row.name as string, bytes: Buffer.from(row.data as Uint8Array) } : null
  }

  /** Düzenlenmiş metni saklar; özgün metinle aynıysa düzenleme kaydı silinir. */
  saveDocument(attachmentId: string, text: string): void {
    const row = this.db.prepare("SELECT text FROM attachments WHERE id = ? AND kind = 'text'").get(attachmentId) as Row | undefined
    if (!row) return
    if (text === row.text) {
      this.resetDocument(attachmentId)
      return
    }
    this.db
      .prepare(
        'INSERT INTO documents (attachment_id, text, updated_at) VALUES (?, ?, ?) ON CONFLICT(attachment_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at'
      )
      .run(attachmentId, text, Date.now())
  }

  resetDocument(attachmentId: string): void {
    this.db.prepare('DELETE FROM documents WHERE attachment_id = ?').run(attachmentId)
  }

  attachToMessage(ids: string[], messageId: string): void {
    const stmt = this.db.prepare('UPDATE attachments SET message_id = ? WHERE id = ? AND message_id IS NULL')
    for (const id of ids) stmt.run(messageId, id)
  }

  /** Mesaj silinmeden önce eklerini ayırır; düzenlenen mesajın ekleri kaybolmasın diye. */
  detachFromMessage(messageId: string): string[] {
    const ids = (
      this.db.prepare('SELECT id FROM attachments WHERE message_id = ? ORDER BY created_at ASC').all(messageId) as Row[]
    ).map((r) => r.id as string)
    this.db.prepare('UPDATE attachments SET message_id = NULL WHERE message_id = ?').run(messageId)
    return ids
  }

  deletePendingAttachment(id: string): void {
    this.db.prepare('DELETE FROM attachments WHERE id = ? AND message_id IS NULL').run(id)
  }

  /** Gönderilmeden bırakılmış ekleri temizler (uygulama açılışında). */
  purgePendingAttachments(): void {
    this.db.prepare('DELETE FROM attachments WHERE message_id IS NULL').run()
  }

  // --- Mini uygulamalar ---

  listApps(): MiniApp[] {
    return (
      this.db
        .prepare('SELECT * FROM mini_apps ORDER BY favorite DESC, builtin ASC, name COLLATE NOCASE ASC')
        .all() as Row[]
    ).map(toApp)
  }

  getApp(id: string): MiniApp | null {
    const row = this.db.prepare('SELECT * FROM mini_apps WHERE id = ?').get(id) as Row | undefined
    return row ? toApp(row) : null
  }

  /** id verilirse o uygulamayı günceller, verilmezse yenisini oluşturur. Hazır uygulamalar değiştirilemez. */
  saveApp(draft: MiniAppDraft, id?: string): MiniApp {
    const ts = this.now()
    const existing = id ? this.getApp(id) : null
    if (existing?.builtin) throw new Error(L().main.apps.builtinReadOnly)
    const fields = JSON.stringify(draft.fields)
    if (existing) {
      this.db
        .prepare(
          'UPDATE mini_apps SET name = ?, description = ?, icon = ?, category = ?, prompt = ?, fields = ?, updated_at = ? WHERE id = ?'
        )
        .run(draft.name, draft.description, draft.icon, draft.category, draft.prompt, fields, ts, existing.id)
      return this.getApp(existing.id)!
    }
    const newId = randomUUID()
    this.db
      .prepare(
        `INSERT INTO mini_apps (id, name, description, icon, category, prompt, fields, builtin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(newId, draft.name, draft.description, draft.icon, draft.category, draft.prompt, fields, ts, ts)
    return this.getApp(newId)!
  }

  /** Hazır uygulamaları kataloğa göre eşitler: yenileri ekler, değişenleri günceller, kalkanları siler. */
  syncBuiltinApps(apps: (MiniAppDraft & { id: string })[]): void {
    const ts = this.now()
    const upsert = this.db.prepare(
      `INSERT INTO mini_apps (id, name, description, icon, category, prompt, fields, builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, icon = excluded.icon,
         category = excluded.category, prompt = excluded.prompt, fields = excluded.fields, updated_at = excluded.updated_at`
    )
    for (const a of apps) {
      upsert.run(a.id, a.name, a.description, a.icon, a.category, a.prompt, JSON.stringify(a.fields), ts, ts)
    }
    const keep = new Set(apps.map((a) => a.id))
    for (const row of this.db.prepare('SELECT id FROM mini_apps WHERE builtin = 1').all() as Row[]) {
      if (!keep.has(row.id as string)) this.db.prepare('DELETE FROM mini_apps WHERE id = ?').run(row.id as string)
    }
  }

  deleteApp(id: string): void {
    this.db.prepare('DELETE FROM mini_apps WHERE id = ? AND builtin = 0').run(id)
  }

  /** Hazır uygulamalar eşitlenirken bu seçim korunur. */
  setAppModel(id: string, model: string | null): void {
    this.db.prepare('UPDATE mini_apps SET model = ? WHERE id = ?').run(model || null, id)
  }

  setAppFavorite(id: string, favorite: boolean): void {
    this.db.prepare('UPDATE mini_apps SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id)
  }

  addRun(r: { appId: string; values: Record<string, string>; output: string; model: string | null }): AppRun {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO mini_app_runs (id, app_id, input_values, output, model, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, r.appId, JSON.stringify(r.values), r.output, r.model, this.now())
    return this.getRun(id)!
  }

  getRun(id: string): AppRun | null {
    const row = this.db.prepare('SELECT * FROM mini_app_runs WHERE id = ?').get(id) as Row | undefined
    return row ? toRun(row) : null
  }

  listRuns(appId: string, limit = 30): AppRun[] {
    return (
      this.db
        .prepare('SELECT * FROM mini_app_runs WHERE app_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(appId, limit) as Row[]
    ).map(toRun)
  }

  deleteRun(id: string): void {
    this.db.prepare('DELETE FROM mini_app_runs WHERE id = ?').run(id)
  }

  // --- Kişilikler (kullanıcının oluşturdukları; hazır olanlar kodda durur) ---

  listPersonas(): Persona[] {
    return (this.db.prepare(`${PERSONA_SELECT} ORDER BY p.name COLLATE NOCASE ASC`).all() as Row[]).map(toPersona)
  }

  getPersona(id: string): Persona | null {
    const row = this.db.prepare(`${PERSONA_SELECT} WHERE p.id = ?`).get(id) as Row | undefined
    return row ? toPersona(row) : null
  }

  savePersona(draft: PersonaDraft, id?: string): Persona {
    const ts = this.now()
    const values = [
      draft.name,
      draft.tagline,
      draft.icon,
      draft.prompt,
      draft.warmth,
      draft.humor,
      draft.length,
      draft.emoji,
      draft.multiMessage ? 1 : 0
    ]
    if (id && this.getPersona(id)) {
      this.db
        .prepare(
          `UPDATE personas SET name = ?, tagline = ?, icon = ?, prompt = ?, warmth = ?, humor = ?, length = ?, emoji = ?,
           multi_message = ?, updated_at = ? WHERE id = ?`
        )
        .run(...values, ts, id)
      return this.getPersona(id)!
    }
    const newId = randomUUID()
    this.db
      .prepare(
        `INSERT INTO personas (id, name, tagline, icon, prompt, warmth, humor, length, emoji, multi_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(newId, ...values, ts, ts)
    return this.getPersona(newId)!
  }

  /** Kişilik silinince onu kullanan sohbetler varsayılan kişiliğe döner. */
  deletePersona(id: string): void {
    this.db.prepare('UPDATE conversations SET persona_id = NULL WHERE persona_id = ?').run(id)
    this.db.prepare('DELETE FROM personas WHERE id = ?').run(id)
  }

  // --- Klasörler ---

  listFolders(): Folder[] {
    return (this.db.prepare(`${FOLDER_SELECT} ORDER BY f.created_at DESC`).all() as Row[]).map(toFolder)
  }

  getFolder(id: string): Folder | null {
    const row = this.db.prepare(`${FOLDER_SELECT} WHERE f.id = ?`).get(id) as Row | undefined
    return row ? toFolder(row) : null
  }

  /** Aynı klasör ikinci kez eklenirse var olan kayıt döner. */
  addFolder(path: string): Folder {
    const existing = this.db.prepare('SELECT id FROM folders WHERE path = ?').get(path) as Row | undefined
    if (existing) return this.getFolder(existing.id as string)!
    const id = randomUUID()
    this.db.prepare('INSERT INTO folders (id, path, created_at) VALUES (?, ?, ?)').run(id, path, this.now())
    return this.getFolder(id)!
  }

  deleteFolder(id: string): void {
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  }

  /** Geri alma kayıtlarının anlık görüntü deposundan kullandığı içerik özetleri (kullanılmayanlar silinebilir) */
  undoBlobs(): Set<string> {
    const keep = new Set<string>()
    const rows = this.db.prepare("SELECT undo FROM messages WHERE undo IS NOT NULL AND undo LIKE '%beforeBlob%'").all() as Row[]
    for (const row of rows) {
      for (const entry of JSON.parse(row.undo as string) as UndoEntry[]) if (entry.beforeBlob) keep.add(entry.beforeBlob)
    }
    return keep
  }

  /** Bir cevabın geri alma kaydını verir ve siler (geri alma bir kez yapılır) */
  getUndo(messageId: string): UndoEntry[] {
    const row = this.db.prepare('SELECT undo FROM messages WHERE id = ?').get(messageId) as Row | undefined
    return row?.undo ? (JSON.parse(row.undo as string) as UndoEntry[]) : []
  }

  /** Geri alınamayıp kalan kayıtlar saklanır; liste boşsa kayıt silinir. */
  setUndo(messageId: string, entries: UndoEntry[]): void {
    this.db.prepare('UPDATE messages SET undo = ? WHERE id = ?').run(entries.length > 0 ? JSON.stringify(entries) : null, messageId)
  }

  takeUndo(messageId: string): UndoEntry[] {
    const row = this.db.prepare('SELECT undo FROM messages WHERE id = ?').get(messageId) as Row | undefined
    if (!row?.undo) return []
    this.db.prepare('UPDATE messages SET undo = NULL WHERE id = ?').run(messageId)
    return JSON.parse(row.undo as string) as UndoEntry[]
  }

  setConversationSql(conversationId: string, sqlId: string | null): void {
    this.db.prepare('UPDATE conversations SET sql_id = ? WHERE id = ?').run(sqlId, conversationId)
  }

  setConversationFolder(conversationId: string, folderId: string | null): void {
    this.db.prepare('UPDATE conversations SET folder_id = ? WHERE id = ?').run(folderId, conversationId)
  }

  logFileAction(a: { folderId: string; kind: FileActionKind; path: string; detail: string }): void {
    this.db
      .prepare('INSERT INTO file_actions (id, folder_id, kind, path, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), a.folderId, a.kind, a.path, a.detail, this.now())
  }

  listFileActions(folderId: string, limit = 50): FileAction[] {
    return (
      this.db.prepare('SELECT * FROM file_actions WHERE folder_id = ? ORDER BY created_at DESC LIMIT ?').all(folderId, limit) as Row[]
    ).map((r) => ({
      id: r.id as string,
      folderId: r.folder_id as string,
      kind: r.kind as FileActionKind,
      path: r.path as string,
      detail: r.detail as string,
      createdAt: r.created_at as number
    }))
  }

  /** İndekste bulunan dosyalar ve son değişme zamanları: değişmeyen dosyalar yeniden işlenmez. */
  indexedFiles(folderId: string): Map<string, number> {
    const rows = this.db.prepare('SELECT path, max(mtime) AS mtime FROM file_chunks WHERE folder_id = ? GROUP BY path').all(folderId) as Row[]
    return new Map(rows.map((r) => [r.path as string, r.mtime as number]))
  }

  replaceFileChunks(folderId: string, path: string, mtime: number, chunks: { text: string; vector: Float32Array | null }[]): void {
    const insert = this.db.prepare('INSERT INTO file_chunks (folder_id, path, mtime, text, embedding) VALUES (?, ?, ?, ?, ?)')
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM file_chunks WHERE folder_id = ? AND path = ?').run(folderId, path)
      for (const c of chunks) {
        insert.run(folderId, path, mtime, c.text, c.vector ? new Uint8Array(c.vector.buffer, c.vector.byteOffset, c.vector.byteLength) : null)
      }
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  removeFileChunks(folderId: string, path: string): void {
    this.db.prepare('DELETE FROM file_chunks WHERE folder_id = ? AND path = ?').run(folderId, path)
  }

  listFileChunks(folderId: string): FileChunkRow[] {
    return (this.db.prepare('SELECT path, text, embedding FROM file_chunks WHERE folder_id = ?').all(folderId) as Row[]).map((r) => ({
      path: r.path as string,
      text: r.text as string,
      vector: toVector(r.embedding)
    }))
  }

  markFolderIndexed(folderId: string): void {
    this.db.prepare('UPDATE folders SET indexed_at = ? WHERE id = ?').run(this.now(), folderId)
  }

  // --- WhatsApp'tan öğrenilen kişiler ---

  saveWaProfile(p: {
    personaId: string
    sourceName: string
    selfName: string
    stats: WaStats
    summary: string
    from: number
    to: number
  }): void {
    this.db
      .prepare(
        `INSERT INTO wa_profiles (persona_id, source_name, self_name, stats, summary, date_from, date_to)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(persona_id) DO UPDATE SET source_name = excluded.source_name, self_name = excluded.self_name,
           stats = excluded.stats, summary = excluded.summary, date_from = excluded.date_from, date_to = excluded.date_to`
      )
      .run(p.personaId, p.sourceName, p.selfName, JSON.stringify(p.stats), p.summary, p.from, p.to)
  }

  getWaProfile(personaId: string): {
    sourceName: string
    selfName: string
    stats: WaStats
    summary: string
    similarity: Level
    from: number
    to: number
  } | null {
    const r = this.db.prepare('SELECT * FROM wa_profiles WHERE persona_id = ?').get(personaId) as Row | undefined
    if (!r) return null
    return {
      sourceName: r.source_name as string,
      selfName: r.self_name as string,
      stats: JSON.parse(r.stats as string) as WaStats,
      summary: r.summary as string,
      similarity: r.similarity as Level,
      from: r.date_from as number,
      to: r.date_to as number
    }
  }

  setWaSimilarity(personaId: string, level: Level): void {
    this.db.prepare('UPDATE wa_profiles SET similarity = ? WHERE persona_id = ?').run(level, personaId)
  }

  addWaExamples(personaId: string, examples: { context: string; reply: string; ts: number }[]): void {
    const stmt = this.db.prepare('INSERT INTO wa_examples (persona_id, context, reply, ts) VALUES (?, ?, ?, ?)')
    this.db.exec('BEGIN')
    try {
      for (const e of examples) stmt.run(personaId, e.context, e.reply, e.ts)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  listWaExamples(personaId: string): WaExampleRow[] {
    return (
      this.db.prepare('SELECT id, context, reply, ts, embedding FROM wa_examples WHERE persona_id = ? ORDER BY ts ASC').all(personaId) as Row[]
    ).map((r) => ({
      id: r.id as number,
      context: r.context as string,
      reply: r.reply as string,
      ts: r.ts as number,
      vector: toVector(r.embedding)
    }))
  }

  countWaExamples(personaId: string): number {
    return (this.db.prepare('SELECT count(*) AS n FROM wa_examples WHERE persona_id = ?').get(personaId) as Row).n as number
  }

  setWaExampleVectors(items: { id: number; vector: Float32Array }[]): void {
    const stmt = this.db.prepare('UPDATE wa_examples SET embedding = ? WHERE id = ?')
    this.db.exec('BEGIN')
    try {
      for (const { id, vector } of items) {
        stmt.run(new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength), id)
      }
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** En yeni `max` örneği bırakır, daha eskilerini siler. */
  trimWaExamples(personaId: string, max: number): void {
    this.db
      .prepare(
        `DELETE FROM wa_examples WHERE persona_id = ? AND id NOT IN
         (SELECT id FROM wa_examples WHERE persona_id = ? ORDER BY ts DESC LIMIT ?)`
      )
      .run(personaId, personaId, max)
  }

  // --- Hafıza ---

  listMemories(): Memory[] {
    return (this.db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all() as Row[]).map(toMemory)
  }

  /** Anlamca arama için: her kaydın (varsa) vektörüyle birlikte hali. */
  listMemoryVectors(): { memory: Memory; vector: Float32Array | null }[] {
    return (this.db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all() as Row[]).map((r) => ({
      memory: toMemory(r),
      vector: toVector(r.embedding)
    }))
  }

  addMemory(m: { text: string; category: MemoryCategory; conversationId?: string | null }): Memory {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO memories (id, text, category, conversation_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, m.text, m.category, m.conversationId ?? null, this.now())
    return toMemory(this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Row)
  }

  /** Metin değişince eski vektör geçersizdir; yeniden hesaplanana kadar silinir. */
  updateMemory(id: string, text: string, category: MemoryCategory): void {
    this.db.prepare('UPDATE memories SET text = ?, category = ?, embedding = NULL WHERE id = ?').run(text, category, id)
  }

  setMemoryVector(id: string, vector: Float32Array): void {
    this.db
      .prepare('UPDATE memories SET embedding = ? WHERE id = ?')
      .run(new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength), id)
  }

  clearMemoryVectors(): void {
    this.db.prepare('UPDATE memories SET embedding = NULL').run()
  }

  deleteMemory(id: string): void {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id)
  }

  clearMemories(): void {
    this.db.prepare('DELETE FROM memories').run()
  }

  // --- Ayarlar ---

  /** Ayar daha önce kaydedilmiş mi (varsayılan değerle karıştırmamak için). */
  /**
   * Arayüze gönderilmeyen iç kayıtlar (ör. kilit şifresinin özeti). Ayarlarla aynı tabloda durur
   * ama getSettings bunları döndürmez.
   */
  getInternal(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(`internal:${key}`) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  setInternal(key: string, value: string | null): void {
    if (value === null) this.db.prepare('DELETE FROM settings WHERE key = ?').run(`internal:${key}`)
    else {
      this.db
        .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(`internal:${key}`, value)
    }
  }

  hasSetting(key: keyof Settings): boolean {
    return !!this.db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key)
  }

  getSettings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const stored: Record<string, unknown> = {}
    for (const { key, value } of rows) {
      // Yalnızca bilinen ayarlar döner; iç kayıtlar arayüze gitmez.
      if (!(key in DEFAULT_SETTINGS)) continue
      try {
        stored[key] = JSON.parse(value)
      } catch {
        // Bozuk kayıt varsayılan değerle geçilir.
      }
    }
    return { ...DEFAULT_SETTINGS, ...stored }
  }

  setSettings(patch: Partial<Settings>): Settings {
    const stmt = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    for (const [key, value] of Object.entries(patch)) {
      if (key in DEFAULT_SETTINGS && value !== undefined) stmt.run(key, JSON.stringify(value))
    }
    return this.getSettings()
  }
}
