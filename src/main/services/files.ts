import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import type { CommandEffectsSummary, FileApproval, Folder, FolderCapability, IndexProgress, PlanItem, ToolStep, UndoEntry } from '@shared/types'
import type { Db, FileChunkRow } from '../db'
import { L, locale } from '../i18n'
import { decodeText, extractText, TEXT_EXTENSIONS } from './attachments'
import { classifyCommand, OVERWRITE_REDIRECT } from '@shared/command'
import { isSecretFile, runCommand } from './code'
import { closestLines, looksTruncated, numberedLines, relaxedReplace, stripLineNumbers, syntaxError } from './patch'
import { scanHardware } from './hardware'
import { cosine, EMBEDDING_MODEL, tokens, type MemoryService } from './memory'
import * as ollama from './ollama'
import type { CommandEffects, SnapshotStore } from './snapshot'

/** Tek seferde modele verilen en fazla dosya metni */
const READ_LIMIT = 12_000
/** Metin dosyası okunurken tek seferde en çok bu kadar satır verilir */
const READ_LINES = 400
const MAX_LIST = 200
const MAX_WALK_FILES = 3000
const MAX_DEPTH = 8
const MAX_GREP_BYTES = 1024 * 1024
const MAX_READ_BYTES = 25 * 1024 * 1024
const MAX_WRITE_CHARS = 500_000
const MAX_INDEX_FILES = 1500
const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 150
const MAX_CHUNKS_PER_FILE = 60

/** İçeriği metne çevrilebilen belge türleri */
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx'])
/** Gezilmeyen klasörler: sistem klasörleri ve derleme çıktıları (aramayı boğmasınlar) */
const SKIP_DIRS = new Set([
  'node_modules',
  '$RECYCLE.BIN',
  'System Volume Information',
  '__pycache__',
  'bin',
  'obj',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'venv'
])

export class FileToolError extends Error {}

/** Başka programların kendiliğinden çalıştırdığı ya da okuduğu yerler: git kancaları, editör görevleri, CI, npm betikleri */
const PROTECTED_DIRS = new Set(['.git', '.vscode', '.idea', '.github', '.husky', '.devcontainer'])
const PROTECTED_NAME =
  /^(?:package\.json|\.npmrc|\.yarnrc(?:\.yml)?|\.pnpmfile\.cjs|makefile|gnumakefile|directory\.build\.(?:props|targets)|nuget\.config|\.gitattributes|\.gitmodules|\.env(?:\..*)?)$/i
const PROTECTED_EXT = new Set(['.bat', '.cmd', '.ps1', '.psm1', '.psd1', '.sh', '.vbs', '.vbe', '.wsf', '.reg', '.props', '.targets', '.lnk', '.url'])

/**
 * Atlas bu dosyaları değiştirebilir ama "hep izin ver" bunları kapsamaz: kart her seferinde uyarıyla sorulur.
 * Aksi halde izinli bir düzenleme, sonradan başka bir programın (git, VS Code, npm) çalıştıracağı kod bırakabilirdi.
 */
export function isProtectedPath(rel: string): boolean {
  const parts = rel.split(/[\\/]+/).filter(Boolean)
  const name = parts.at(-1) ?? ''
  return parts.some((p) => PROTECTED_DIRS.has(p.toLowerCase())) || PROTECTED_NAME.test(name) || PROTECTED_EXT.has(extname(name).toLowerCase())
}

function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Düzenlenecek dosyanın metni. UTF-8 olmayan dosyalar (Windows-1254 CSV gibi) bozulmasın diye düzenlenmez. */
async function readEditable(full: string, rel: string): Promise<string> {
  const bytes = await readFile(full)
  const utf16 = bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
  try {
    if (utf16) throw new Error('utf-16')
    // ignoreBOM: dosyanın başındaki BOM metinde kalır, yazarken de korunur.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new FileToolError(L().tools.files.errors.notUtf8(rel))
  }
}

/**
 * Düzenlenen bölümün şimdiki hali (çevresiyle, satır numaralı) ve hemen yanında art arda tekrar eden bir satır varsa o satır.
 * Model değişikliğin sonucunu görsün; yanlışlıkla iki kez yazdığı satırı fark etsin.
 */
export function editedRegion(after: string, start: number, length: number): { region: string; duplicate: string | null } {
  const lines = after.split(/\r?\n/)
  const first = after.slice(0, start).split(/\r?\n/).length - 1
  const last = after.slice(0, start + length).split(/\r?\n/).length - 1
  const from = Math.max(0, first - 4)
  const to = Math.min(lines.length - 1, last + 4)
  let duplicate: string | null = null
  for (let i = Math.max(from, 1); i <= to && !duplicate; i++) {
    const line = lines[i].trim()
    if (line.length >= 8 && line === lines[i - 1].trim()) duplicate = line
  }
  const region = lines
    .slice(from, to + 1)
    .map((line, i) => `${from + i + 1}: ${line}`)
    .join('\n')
  return { region: region.length > 2000 ? `${region.slice(0, 2000)}\n…` : region, duplicate }
}

/**
 * İki yol da realpath ile diskteki gerçek yazılışına çevrildiği için birebir karşılaştırılır. Küçük harfe çevirerek
 * karşılaştırmak, "K" (Kelvin işareti) gibi benzer harfli bir kardeş klasörü içeride saydırabiliyordu.
 */
function isInside(root: string, target: string): boolean {
  if (root === target) return true
  const prefix = root.endsWith(sep) ? root : root + sep
  return target.startsWith(prefix)
}

/**
 * Windows'un yanıltıcı yol biçimleri: alternatif veri akışı ("a.txt:gizli"), sonda nokta ya da boşluk (Windows siler,
 * ".env." aslında ".env" olur) ve aygıt adları (CON, NUL, COM1...).
 */
function badSegment(part: string): boolean {
  if (part === '.' || part === '..' || part === '') return false
  return part.includes(':') || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?$/i.test(part)
}

/**
 * Göreli yolu klasörün içinde gerçek bir yola çevirir. Klasörün dışına çıkan
 * ("..", mutlak yol, dışarıyı gösteren kısayol) her yol reddedilir.
 */
export async function resolveInside(root: string, requested: unknown): Promise<string> {
  const raw = typeof requested === 'string' ? requested.trim() : ''
  const cleaned = raw.replace(/^[\\/]+/, '') || '.'
  if (cleaned.split(/[\\/]+/).some(badSegment)) throw new FileToolError(L().tools.files.errors.outside(raw))
  const rootReal = await realpath(root)
  let existing = resolve(rootReal, cleaned)
  const rest: string[] = []
  // Henüz var olmayan dosyalarda (yeni dosya yazma) var olan en yakın üst klasörün gerçek yolu kullanılır.
  for (;;) {
    try {
      const full = join(await realpath(existing), ...rest.reverse())
      if (!isInside(rootReal, full)) break
      return full
    } catch {
      // Var olup çözülemeyen bir yol (hedefi olmayan kısayol gibi) dışarıya yazdırabilir: reddedilir.
      if (await lstat(existing).then(() => true, () => false)) break
      const parent = dirname(existing)
      if (parent === existing) break
      rest.push(basename(existing))
      existing = parent
    }
  }
  throw new FileToolError(L().tools.files.errors.outside(raw))
}

function toRelative(root: string, full: string): string {
  return relative(root, full).split(sep).join('/') || '.'
}

function formatSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`
  return `${bytes} ${L().common.units.bytes}`
}

function hidden(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name)
}

/** Klasörü gezer; gizli klasörleri atlar. Dosya yollarını kök klasöre göre göreli döndürür. */
export async function walk(
  root: string,
  limit = MAX_WALK_FILES,
  /** Yalnızca bu süzgeçten geçen dosyalar sayılır ve döner */
  accept: (name: string) => boolean = () => true
): Promise<{ path: string; full: string }[]> {
  const found: { path: string; full: string }[] = []
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (found.length >= limit || depth > MAX_DEPTH) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'tr'))) {
      if (found.length >= limit) return
      if (hidden(entry.name) || entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await visit(full, depth + 1)
      else if (entry.isFile() && accept(entry.name)) found.push({ path: toRelative(root, full), full })
    }
  }
  await visit(root, 0)
  return found
}

/** Metni, anlamı bölünmeyecek şekilde üst üste binen parçalara ayırır. */
export function chunkText(text: string, size = CHUNK_SIZE, overlapSize = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (clean.length <= size) return clean ? [clean] : []
  const chunks: string[] = []
  let start = 0
  while (start < clean.length && chunks.length < MAX_CHUNKS_PER_FILE) {
    let end = Math.min(start + size, clean.length)
    if (end < clean.length) {
      // Mümkünse paragraf ya da cümle sonunda kes.
      const window = clean.slice(start, end)
      const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('\n'))
      if (cut > size * 0.5) end = start + cut + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = end - overlapSize
  }
  return chunks.filter(Boolean)
}

/**
 * Gömme modeli yokken kullanılan kaba eşleşme: sorgudaki kelimelerin ne kadarı metinde geçiyor.
 * Türkçe ekler yüzünden kelimelerin yalnızca ilk beş harfi karşılaştırılır
 * ("sözleşme" ile "sözleşmesi" eşleşsin diye).
 */
export function stemOverlap(query: string, text: string): number {
  const stem = (w: string): string => w.slice(0, 5)
  const wanted = new Set(tokens(query).map(stem))
  if (wanted.size === 0) return 0
  const present = new Set(tokens(text).map(stem))
  let hit = 0
  for (const w of wanted) if (present.has(w)) hit++
  return hit / wanted.size
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

const TOOL = (name: string, description: string, properties: Record<string, unknown>, required: string[]): unknown => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
})

/** Araç tanımları geçerli dilde üretilir; araç ve parametre adları dile göre değişmez. */
function readTools(): unknown[] {
  const d = L().tools.files.defs
  const pathArg = { type: 'string', description: d.pathArg }
  return [
    TOOL('list_folder', d.listFolder, { path: pathArg }, ['path']),
    TOOL(
      'read_file',
      d.readFile,
      { path: pathArg, line: { type: 'integer', description: d.readLineArg }, start: { type: 'integer', description: d.readStartArg } },
      ['path']
    ),
    TOOL('search_files', d.searchFiles, { query: { type: 'string', description: d.searchQueryArg } }, ['query']),
    TOOL(
      'update_plan',
      d.updatePlan,
      {
        steps: {
          type: 'array',
          description: d.planStepsArg,
          items: {
            type: 'object',
            properties: { step: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'done'] } },
            required: ['step', 'status']
          }
        }
      },
      ['steps']
    )
  ]
}

function writeTools(): unknown[] {
  const d = L().tools.files.defs
  const pathArg = { type: 'string', description: d.pathArg }
  return [
    TOOL(
      'edit_file',
      d.editFile,
      { path: pathArg, old_text: { type: 'string', description: d.editOldArg }, new_text: { type: 'string', description: d.editNewArg } },
      ['path', 'old_text', 'new_text']
    ),
    TOOL('write_file', d.writeFile, { path: pathArg, content: { type: 'string', description: d.writeContentArg } }, [
      'path',
      'content'
    ]),
    TOOL('move_file', d.moveFile, { from: pathArg, to: { type: 'string', description: d.moveToArg } }, ['from', 'to']),
    TOOL('create_folder', d.createFolder, { path: pathArg }, ['path']),
    TOOL('run_command', d.runCommand, { command: { type: 'string', description: d.runCommandArg } }, ['command'])
  ]
}

/** Bir araç başarısız olduğunda adım listesinde görünen etiket */
function failedLabel(tool: string): string {
  const f = L().tools.files.failed
  const labels: Record<string, string> = {
    list_folder: f.listFolder,
    read_file: f.readFile,
    search_files: f.searchFiles,
    write_file: f.writeFile,
    move_file: f.moveFile,
    delete_file: f.deleteFile,
    create_folder: f.createFolder
  }
  return labels[tool] ?? f.other
}

export interface FileEvents {
  approval(a: FileApproval): void
  indexProgress(p: IndexProgress): void
  /** Atlas bir dosyayı değiştirdi ya da oluşturdu; before: önceki içerik (yeni dosyada null). Geri alma için. */
  edited?(e: { conversationId: string; folderId: string; path: string; before: string | null }): void
  /** Çalışan komutun çıktısından bir parça (canlı terminal) */
  commandOutput?(e: { conversationId: string; stepId: string; command: string; chunk: string }): void
}

export interface ToolResult {
  step: ToolStep
  /** Modele verilen sonuç metni */
  result: string
}

/** Projeye özel talimat dosyaları; ilk bulunan kullanılır */
const RULE_FILES = ['ATLAS.md', 'AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md']
const MAX_RULES_CHARS = 4000

/** Proje kökündeki talimat dosyasını okur (ATLAS.md gibi): "bu projede TypeScript kullan" türünden kurallar. */
export async function projectRules(root: string): Promise<{ file: string; text: string } | null> {
  for (const file of RULE_FILES) {
    const text = await readFile(join(root, file), 'utf8').catch(() => null)
    if (text?.trim()) return { file, text: text.trim().slice(0, MAX_RULES_CHARS) }
  }
  return null
}

/** Projenin test komutu (package.json'daki test betiği, .NET çözümü, pytest); modele söylenir ki doğrulamayı tahmin etmesin. */
export async function testCommand(root: string): Promise<string | null> {
  const pkg = await readFile(join(root, 'package.json'), 'utf8').then(
    (text) => JSON.parse(text) as { scripts?: Record<string, unknown> },
    () => null
  )
  const test = pkg?.scripts?.test
  if (typeof test === 'string' && test.trim() && !/no test specified/i.test(test)) return 'npm test'
  const entries = await readdir(root).catch(() => [] as string[])
  if (entries.some((name) => /\.sln$/i.test(name))) return 'dotnet test'
  if (entries.some((name) => name === 'pytest.ini' || name === 'conftest.py')) return 'python -m pytest'
  return null
}

interface Trust {
  edits: boolean
  /** İzin verilen komut → izin verildiği andaki sorulmadan düzenleme sayısı */
  commands: Map<string, number>
  unseen: number
}

/** Arayüzde ve kayıtta gösterilecek kadarı (her türden en çok 50 dosya) */
const MAX_EFFECT_NAMES = 50

export function summarize(effects: CommandEffects): CommandEffectsSummary | null {
  const { changed, deleted, created } = effects
  if (changed.length + deleted.length + created.length === 0) return null
  const lost = [...changed.filter((c) => !c.before || !c.after), ...deleted.filter((d) => !d.before)].map((e) => e.path)
  const names = (list: { path: string }[]): string[] => list.slice(0, MAX_EFFECT_NAMES).map((e) => e.path)
  return {
    changed: names(changed),
    deleted: names(deleted),
    created: names(created),
    lost: lost.slice(0, MAX_EFFECT_NAMES),
    partial: effects.partial || [changed, deleted, created].some((list) => list.length > MAX_EFFECT_NAMES)
  }
}

/**
 * Modele komutun klasörde yaptıklarını söyler. Silinen ya da değişen dosyalar bir uyarıdır (test kodu veri silmiş
 * olabilir) ve kullanıcıya söylenmelidir; yeni dosyalar yalnızca bilgidir.
 */
function effectsForModel(s: CommandEffectsSummary): { warning: string | null; info: string | null } {
  const t = L().tools.files.result
  const list = (paths: string[]): string => paths.slice(0, 20).join(', ') + (paths.length > 20 ? ', …' : '')
  const warning =
    s.deleted.length || s.changed.length
      ? [
          t.effectsWarning,
          ...(s.deleted.length ? [t.effectsDeleted(list(s.deleted))] : []),
          ...(s.changed.length ? [t.effectsChanged(list(s.changed))] : []),
          ...(s.lost.length ? [t.effectsLost(list(s.lost))] : []),
          t.effectsTell
        ].join('\n')
      : null
  const info = s.created.length ? t.effectsCreated(list(s.created)) : null
  return { warning, info }
}

/** Değişiklik geçerli bir JSON ya da JavaScript dosyasını bozduysa modele verilecek uyarı (önceden de bozuksa boş) */
function breakage(rel: string, before: string | null, after: string): string {
  const problem = syntaxError(rel, after)
  if (!problem || (before !== null && syntaxError(rel, before))) return ''
  return L().tools.files.result.syntaxBroken(rel, problem)
}

/** Bulunamayan düzenleme için dosyada en çok benzeyen yer (varsa) */
function closestHint(content: string, oldText: string): string {
  const near = closestLines(content, oldText)
  return near ? L().tools.files.result.closest(near) : ''
}

export class FilesService {
  private pending = new Map<string, (approved: boolean) => void>()
  /**
   * Sohbet başına verilen kalıcı izinler (uygulama kapanınca unutulur): dosya düzenlemeleri ve birebir aynı komutlar.
   * Silme hiçbir izinle açılmaz. unseen: sorulmadan (izinle) yapılan düzenleme sayısı; komut izni verildiği andaki
   * sayıyla birlikte saklanır, arada sorulmadan düzenleme olduysa komut yeniden sorulur.
   */
  private trust = new Map<string, Trust>()
  /** Onay bekleyen işlemlerin sohbeti ve türü; "hep izin ver" denince neyin hatırlanacağını bilmek için */
  private pendingInfo = new Map<string, { conversationId: string; kind: FileApproval['kind']; command?: string; protected?: boolean }>()
  /** Süren cevapta değiştirilen dosyaların ilk halleri (aynı dosya ikinci kez değişirse ilk hal korunur) */
  private turnEdits = new Map<string, UndoEntry[]>()

  /** Cevap kaydedilirken çağrılır: bu cevaptaki geri alma kaydını verir ve sıfırlar. */
  takeEdits(conversationId: string): UndoEntry[] {
    const entries = this.turnEdits.get(conversationId) ?? []
    this.turnEdits.delete(conversationId)
    return entries
  }

  /** Cevap kaydedilirken çağrılır: geri alma kaydını sıfırlamadan verir. Kayıt başarılı olunca clearEdits çağrılır. */
  peekEdits(conversationId: string): UndoEntry[] {
    return [...(this.turnEdits.get(conversationId) ?? [])]
  }

  clearEdits(conversationId: string): void {
    this.turnEdits.delete(conversationId)
  }

  /** written: Atlas'ın yazdığı içerik; geri alırken dosyanın sonradan değişip değişmediğine bakmak için özeti saklanır. */
  private remember(conversationId: string, folderId: string, path: string, before: string | null, written: string): void {
    const list = this.turnEdits.get(conversationId) ?? []
    const known = list.find((e) => e.folderId === folderId && e.path === path && !e.movedFrom)
    if (known) known.afterHash = contentHash(written)
    else list.push({ folderId, path, before, afterHash: contentHash(written) })
    this.turnEdits.set(conversationId, list)
    this.events.edited?.({ conversationId, folderId, path, before })
  }

  /** Taşıma da geri alınabilsin: geri alırken dosya eski yerine taşınır. Kayıtlar sondan başa geri alınır. */
  private rememberMove(conversationId: string, folderId: string, from: string, to: string): void {
    const list = this.turnEdits.get(conversationId) ?? []
    list.push({ folderId, path: to, before: null, movedFrom: from })
    this.turnEdits.set(conversationId, list)
    this.events.edited?.({ conversationId, folderId, path: to, before: null })
  }
  /** Komutun klasörde yaptıkları geri alınabilsin: değişen ve silinen dosyaların önceki hali depodadır. */
  private rememberCommand(conversationId: string, folderId: string, effects: CommandEffects): void {
    const list = this.turnEdits.get(conversationId) ?? []
    // Önceki içerik saklanmadıysa ya da şimdiki içerik okunamadıysa (sonradan değişti mi bilinemez) dokunulmaz.
    for (const c of effects.changed) if (c.before && c.after) list.push({ folderId, path: c.path, before: null, beforeBlob: c.before, afterHash: c.after })
    for (const d of effects.deleted) if (d.before) list.push({ folderId, path: d.path, before: null, beforeBlob: d.before, deleted: true })
    // Komutun oluşturduğu dosyalar geri alırken (değişmedilerse) çöp kutusuna gider; Atlas'ın oluşturduklarıyla aynı.
    for (const c of effects.created) if (c.after) list.push({ folderId, path: c.path, before: null, afterHash: c.after })
    this.turnEdits.set(conversationId, list)
    for (const path of [...effects.changed, ...effects.deleted, ...effects.created].map((e) => e.path)) {
      this.events.edited?.({ conversationId, folderId, path, before: null })
    }
  }

  private capabilityCache: FolderCapability | null = null
  private chunks = new Map<string, FileChunkRow[]>()

  constructor(
    private db: Db,
    private events: FileEvents,
    private memory: MemoryService,
    /** Komutlar için güvenli kip; verilmezse komutlardan önce anlık görüntü alınmaz */
    private snapshots?: SnapshotStore
  ) {}

  /**
   * Bir cevaptaki değişiklikleri sondan başa geri alır (önce düzenleyip sonra taşıdıysa doğru çözülsün). Atlas'ın ya da
   * komutun oluşturduğu dosyalar silinmez, `trash` ile çöp kutusuna gider. Sonradan değişen dosyalar ezilmez.
   * left: geçici bir hata (kilitli dosya) yüzünden geri alınamayanlar; kullanıcı yeniden deneyebilir.
   */
  async undo(entries: UndoEntry[], trash: (full: string) => Promise<void>): Promise<{ restored: number; left: UndoEntry[] }> {
    const left: UndoEntry[] = []
    let restored = 0
    for (const entry of [...entries].reverse()) {
      const folder = this.db.getFolder(entry.folderId)
      if (!folder) continue
      try {
        const full = await resolveInside(folder.path, entry.path)
        if (entry.movedFrom) {
          const back = await resolveInside(folder.path, entry.movedFrom)
          // Dosya artık orada değilse ya da eski yerinde yeni bir dosya varsa dokunulmaz.
          if (!(await stat(full).catch(() => null)) || (await stat(back).catch(() => null))) continue
          await mkdir(dirname(back), { recursive: true })
          await rename(full, back)
        } else {
          const now = await readFile(full).catch(() => null)
          const nowHash = now ? createHash('sha256').update(now).digest('hex') : null
          if (entry.deleted) {
            // Komutun sildiği dosya: yerinde sonradan yeni bir dosya oluştuysa dokunulmaz.
            if (now) continue
          } else if (entry.afterHash && nowHash !== entry.afterHash) {
            // Atlas'tan (ya da komuttan) sonra dosya değiştiyse o değişiklik ezilmez.
            continue
          }
          if (entry.beforeBlob) {
            const bytes = await this.snapshots?.read(entry.beforeBlob)
            if (!bytes) continue
            await mkdir(dirname(full), { recursive: true })
            await writeFile(full, bytes)
          } else if (entry.before === null) {
            if (now) await trash(full)
          } else {
            await mkdir(dirname(full), { recursive: true })
            await writeFile(full, entry.before, 'utf8')
          }
        }
        this.db.logFileAction({ folderId: folder.id, kind: 'write', path: entry.path, detail: L().main.folders.undone })
        restored++
      } catch {
        left.unshift(entry)
      }
    }
    return { restored, left }
  }

  /** Hiçbir geri alma kaydının kullanmadığı anlık görüntü içeriklerini siler (uygulama açılırken). */
  async pruneSnapshots(): Promise<number> {
    return this.snapshots ? this.snapshots.prune(this.db.undoBlobs()) : 0
  }

  /** Zayıf bilgisayarlarda küçük modeller araçları güvenilir kullanamadığı için özellik kısılır. */
  async capability(): Promise<FolderCapability> {
    if (this.capabilityCache) return this.withReason(this.capabilityCache)
    const { tier } = await scanHardware()
    // Yalnızca donanım sonucu saklanır; neden metni her seferinde geçerli dilde üretilir.
    this.capabilityCache =
      tier === 'baslangic'
        ? { read: false, write: false, reason: '' }
        : tier === 'orta'
          ? { read: true, write: false, reason: '' }
          : { read: true, write: true, reason: '' }
    return this.withReason(this.capabilityCache)
  }

  private withReason(cap: FolderCapability): FolderCapability {
    const t = L().tools.files.capability
    return { ...cap, reason: !cap.read ? t.off : !cap.write ? t.readOnly : '' }
  }

  toolDefs(write: boolean): unknown[] {
    return write ? [...readTools(), ...writeTools()] : readTools()
  }

  /** Sistem talimatına eklenen bölüm: modelin klasörü nasıl kullanacağı. */
  async promptBlock(folder: Folder, write: boolean): Promise<string> {
    const t = L().tools.files.prompt
    const rules = await projectRules(folder.path)
    const test = write ? await testCommand(folder.path) : null
    return [
      t.intro(folder.name),
      ...(rules ? [t.projectRules(rules.file, rules.text)] : []),
      t.planFirst,
      t.lookFirst,
      t.proactive,
      t.relativePaths,
      t.dataNotInstructions,
      ...(write
        ? [
            t.callDirectly,
            t.dontAskApproval,
            t.dontRepeatContent,
            t.overridesPersona,
            t.fixCodeNotTests,
            ...(process.platform === 'win32' ? [t.windowsShell] : []),
            ...(test ? [t.testCommand(test)] : [])
          ]
        : [t.readOnly]),
      t.citeFile
    ].join('\n')
  }

  /** Onay kartına verilen cevap. remember: bu sohbette aynı türdeki işlemlere bir daha sorma. */
  respond(approvalId: string, approved: boolean, remember = false): void {
    const info = this.pendingInfo.get(approvalId)
    // Korunan dosyaların kartı "hep izin ver" iznini açmaz.
    if (approved && remember && info && !info.protected) {
      const trust = this.trustFor(info.conversationId)
      if (info.kind === 'command' && info.command) trust.commands.set(info.command, trust.unseen)
      else if (info.kind === 'write' || info.kind === 'move' || info.kind === 'mkdir') trust.edits = true
    } else if (approved && info?.kind === 'command' && info.command) {
      // Yeniden sorulan izinli komut onaylandı: izin yerinde kalır, bu ana kadarki düzenlemeler görülmüş sayılır.
      const trust = this.trust.get(info.conversationId)
      if (trust?.commands.has(info.command)) trust.commands.set(info.command, trust.unseen)
    }
    this.pendingInfo.delete(approvalId)
    this.pending.get(approvalId)?.(approved)
    this.pending.delete(approvalId)
  }

  private trustFor(conversationId: string): Trust {
    let trust = this.trust.get(conversationId)
    if (!trust) {
      trust = { edits: false, commands: new Map(), unseen: 0 }
      this.trust.set(conversationId, trust)
    }
    return trust
  }

  /** Bu sohbette verilen kalıcı izinler (arayüzde gösterilir ve geri alınır) */
  trustState(conversationId: string): { edits: boolean; commands: string[] } {
    const trust = this.trust.get(conversationId)
    return { edits: trust?.edits ?? false, commands: [...(trust?.commands.keys() ?? [])] }
  }

  revokeTrust(conversationId: string): void {
    this.trust.delete(conversationId)
  }

  /** İzin verilmişse onay sormadan geçer; verilmemişse kullanıcıya sorar. */
  private async allow(approval: FileApproval, signal: AbortSignal): Promise<boolean> {
    // Kullanıcı durdurduysa izin verilmiş işlemler de yapılmaz.
    if (signal.aborted) return false
    const trust = this.trust.get(approval.conversationId)
    if (approval.kind === 'command') {
      const since = trust?.commands.get(approval.path)
      if (since !== undefined && since === trust?.unseen) return true
      // İzin verilmişti ama Atlas o zamandan beri sorulmadan dosya değiştirdi: komut o dosyaları çalıştırabilir.
      if (since !== undefined) approval = { ...approval, recheck: true }
    } else if ((approval.kind === 'write' || approval.kind === 'move') && trust?.edits && !approval.protected) {
      trust.unseen++
      return true
    }
    this.pendingInfo.set(approval.id, {
      conversationId: approval.conversationId,
      kind: approval.kind,
      command: approval.kind === 'command' ? approval.path : undefined,
      protected: approval.protected
    })
    return this.ask(approval, signal)
  }

  private ask(approval: FileApproval, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolvePromise) => {
      const finish = (approved: boolean): void => {
        signal.removeEventListener('abort', onAbort)
        this.pending.delete(approval.id)
        this.pendingInfo.delete(approval.id)
        resolvePromise(approved)
      }
      const onAbort = (): void => finish(false)
      if (signal.aborted) return finish(false)
      signal.addEventListener('abort', onAbort)
      this.pending.set(approval.id, finish)
      this.events.approval(approval)
    })
  }

  /** Modelin istediği aracı çalıştırır. Hatalar modele metin olarak döner; sohbet kesilmez. */
  async execute(
    conversationId: string,
    folder: Folder,
    call: ollama.ToolCall,
    signal: AbortSignal,
    canWrite: boolean
  ): Promise<ToolResult> {
    const id = randomUUID()
    const done = (label: string, result: string, status: ToolStep['status'] = 'ok', terminal?: ToolStep['terminal']): ToolResult => ({
      step: { id, tool: call.name, label, status, ...(terminal ? { terminal } : {}) },
      result
    })
    const args = call.arguments ?? {}
    // Klasörün diskteki gerçek yazılışı: klasör kısa adla (RUNNER~1 gibi) ya da farklı harflerle eklenmiş olsa da
    // modele ve kullanıcıya gösterilen göreli yollar ("raporlar/ozet.md") doğru hesaplansın.
    const root = await realpath(folder.path).catch(() => folder.path)
    const t = L().tools.files

    try {
      switch (call.name) {
        case 'list_folder': {
          const full = await resolveInside(root, args.path)
          const entries = (await readdir(full, { withFileTypes: true })).filter((e) => !hidden(e.name))
          entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'tr'))
          const lines: string[] = []
          for (const entry of entries.slice(0, MAX_LIST)) {
            if (entry.isDirectory()) lines.push(t.result.folderEntry(entry.name))
            else {
              const info = await stat(join(full, entry.name)).catch(() => null)
              lines.push(info ? `${entry.name} (${formatSize(info.size)}, ${info.mtime.toLocaleDateString(locale())})` : entry.name)
            }
          }
          const more = entries.length > MAX_LIST ? `\n${t.result.moreItems(entries.length - MAX_LIST)}` : ''
          const rel = toRelative(root, full)
          return done(
            t.step.listed(rel === '.' ? folder.name : rel, entries.length),
            lines.length > 0 ? lines.join('\n') + more : t.result.emptyFolder
          )
        }

        case 'read_file': {
          const full = await resolveInside(root, args.path)
          // Parola ve anahtar dosyaları modele verilmez (kod alanında da içerikleri gösterilmez).
          if (isSecretFile(full)) throw new FileToolError(L().tools.code.secretFile)
          const info = await stat(full)
          if (info.isDirectory()) throw new FileToolError(t.errors.isFolder)
          if (info.size > MAX_READ_BYTES) throw new FileToolError(t.errors.tooLarge)
          const rel = toRelative(root, full)
          const bytes = await readFile(full)
          // Metin dosyaları satır numaralı ve satır satır sayfalanarak verilir: model hatanın yerini search_files'ın
          // gösterdiği satır numarasıyla görür, uzun dosyada "line" ile devam eder. Belgeler (PDF, Word, Excel)
          // karakter konumuyla sayfalanır.
          if (!DOCUMENT_EXTENSIONS.has(extname(full).toLowerCase())) {
            const raw = await extractText(basename(full), bytes)
            if (!raw.trim()) return done(t.step.read(rel, false), t.result.emptyFile)
            const part = numberedLines(raw, Number(args.line) || 1, READ_LIMIT, READ_LINES)
            const note = part.last < part.total ? `\n\n${t.result.readMoreLines(part.first, part.last, part.total)}` : ''
            return done(t.step.read(rel, part.first > 1), part.body + note)
          }
          const text = (await extractText(basename(full), bytes)).trim()
          const start = Math.max(0, Math.floor(Number(args.start) || 0))
          const piece = text.slice(start, start + READ_LIMIT)
          const end = start + piece.length
          const note = end < text.length ? `\n\n${t.result.readMore(end, text.length)}` : ''
          return done(t.step.read(rel, start > 0), piece ? piece + note : t.result.emptyFile)
        }

        case 'search_files': {
          const query = str(args.query).trim()
          if (!query) throw new FileToolError(t.errors.emptyQuery)
          const results = await this.search(folder, query)
          return done(t.step.searched(query, results.count), results.text)
        }

        case 'create_folder': {
          if (!canWrite) throw new FileToolError(t.errors.writeDisabled)
          const full = await resolveInside(root, args.path)
          await mkdir(full, { recursive: true })
          const rel = toRelative(root, full)
          this.db.logFileAction({ folderId: folder.id, kind: 'mkdir', path: rel, detail: t.log.folderCreated })
          return done(t.step.folderCreated(rel), t.result.folderCreated(rel))
        }

        case 'run_command': {
          if (!canWrite) throw new FileToolError(t.errors.writeDisabled)
          const command = str(args.command).trim()
          const short = command.replace(/\s+/g, ' ').slice(0, 80)
          const verdict = classifyCommand(command)
          // Silen ya da yok eden komutlar onaya bile sunulmaz.
          // Çıktıyı dosyaya "> dosya" ile yazmak isteyen komut silme değildir: modele doğru yol söylenir.
          if (verdict.forbidden && verdict.reason === OVERWRITE_REDIRECT) return done(t.step.redirectForbidden, t.result.redirectForbidden, 'denied')
          if (verdict.forbidden) return done(t.step.commandForbidden(verdict.reason || short), t.result.commandForbidden(verdict.reason), 'denied')
          // Gizli dosyaları (.env, anahtarlar) okuyan ya da gösteren komutlar da: read_file'ın yasağı "type .env" ile aşılmasın.
          const secret = command.split(/[\s"'`|&<>;(),=]+/).find((part) => part && isSecretFile(part))
          if (secret) return done(t.step.secretCommand(secret), t.result.secretCommand(secret), 'denied')
          const approved = await this.allow({ id: randomUUID(), conversationId, kind: 'command', path: command }, signal)
          if (!approved) return done(t.step.denied(short), t.result.commandDenied, 'denied')
          // Güvenli kip: komuttan önce klasörün anlık görüntüsü alınır; komut (ya da çalıştırdığı kod) bir dosyayı
          // silerse ya da bozarsa cevabın "Geri al"ı onu geri getirir.
          const snapshot = this.snapshots ? await this.snapshots.take(root).catch(() => null) : null
          const outcome = await runCommand(root, command, signal, (chunk) => this.events.commandOutput?.({ conversationId, stepId: id, command, chunk }))
          const effects = snapshot ? await this.snapshots!.diff(snapshot).catch(() => null) : null
          if (effects) this.rememberCommand(conversationId, folder.id, effects)
          const summary = effects ? summarize(effects) : null
          this.db.logFileAction({ folderId: folder.id, kind: 'command', path: command.slice(0, 500), detail: t.log.commandRan(outcome.code) })
          // Silinen ya da değişen dosya varsa uyarı sonucun başına konur: model "testler geçti" deyip geçmesin.
          const told = summary ? effectsForModel(summary) : null
          return done(
            t.step.commandRan(short, outcome.code, outcome.timedOut),
            [told?.warning, t.result.commandRan(outcome.code, outcome.timedOut, outcome.output), told?.info].filter(Boolean).join('\n\n'),
            outcome.code === 0 && !outcome.timedOut ? 'ok' : 'error',
            // Kullanıcı terminal çıktısını adımın altında görür; uzun çıktının sonu saklanır.
            {
              command,
              output: outcome.output.length > 8000 ? `…\n${outcome.output.slice(-8000)}` : outcome.output,
              code: outcome.timedOut ? null : outcome.code,
              ...(summary ? { effects: summary } : {})
            }
          )
        }

        case 'update_plan': {
          // Modelin kendi iş planı: dosyaya dokunmaz, yalnızca kullanıcıya adımları gösterir.
          const raw = Array.isArray(args.steps) ? args.steps : []
          const plan = raw
            .map((item) => {
              const o = (item ?? {}) as { step?: unknown; status?: unknown }
              const status = o.status === 'done' || o.status === 'in_progress' ? o.status : 'pending'
              return { step: str(o.step).trim().slice(0, 200), status } as PlanItem
            })
            .filter((item) => item.step)
            .slice(0, 20)
          if (plan.length === 0) throw new FileToolError(t.errors.emptyPlan)
          const doneCount = plan.filter((item) => item.status === 'done').length
          return { step: { id, tool: call.name, label: t.step.plan(doneCount, plan.length), status: 'ok', plan }, result: t.result.plan }
        }

        case 'edit_file': {
          if (!canWrite) throw new FileToolError(t.errors.writeDisabled)
          const full = await resolveInside(root, args.path)
          const rel = toRelative(root, full)
          const info = await stat(full).catch(() => null)
          if (!info) throw new FileToolError(t.errors.editMissing(rel))
          if (info.isDirectory()) throw new FileToolError(t.errors.pathIsFolder)
          if (info.size > MAX_GREP_BYTES) throw new FileToolError(t.errors.tooLarge)
          const before = await readEditable(full, rel)
          // Model read_file çıktısındaki satır numaralarını da kopyaladıysa atılır.
          let { oldText, newText } = stripLineNumbers(str(args.old_text), str(args.new_text))
          if (!oldText.trim()) throw new FileToolError(t.errors.editEmpty)
          // Dosya Windows satır sonu kullanıyorsa modelin yazdığı metin de ona çevrilir.
          if (before.includes('\r\n') && !oldText.includes('\r\n')) {
            oldText = oldText.replace(/\n/g, '\r\n')
            newText = newText.replace(/\r?\n/g, '\r\n')
          }
          const count = before.split(oldText).length - 1
          if (count > 1) return done(t.step.editAmbiguous(rel), t.result.editAmbiguous(rel, count), 'error')
          let at = before.indexOf(oldText)
          let after = before.slice(0, at) + newText + before.slice(at + oldText.length)
          let length = newText.length
          // Eski metin satırın girintisinden sonra başlıyor ve yeni metin çok satırlıysa birebir yerleştirmek alt
          // satırları girintisiz bırakır (Python'da kod bozulur): satır bazlı, girintiyi koruyan yol denenir.
          const lead = count === 1 ? before.slice(before.lastIndexOf('\n', at - 1) + 1, at) : ''
          if (count === 1 && /^[ \t]+$/.test(lead) && /\n/.test(newText)) {
            const loose = relaxedReplace(before, oldText, newText)
            if (!('error' in loose)) ({ after, at, length } = loose)
          }
          if (count === 0) {
            // Birebir yoksa girinti ve boşluk farkı yok sayılarak aranır; tek yer bulunursa orası değiştirilir.
            const loose = relaxedReplace(before, oldText, newText)
            if ('error' in loose) {
              return loose.error === 'many'
                ? done(t.step.editAmbiguous(rel), t.result.editAmbiguous(rel, loose.count), 'error')
                : done(t.step.editNotFound(rel), [t.result.editNotFound(rel), closestHint(before, oldText)].filter(Boolean).join('\n\n'), 'error')
            }
            ;({ after, at, length } = loose)
          }
          if (after === before) return done(t.step.unchanged(rel), t.result.unchanged)
          const approved = await this.allow({ id: randomUUID(), conversationId, kind: 'write', path: rel, before, after, protected: isProtectedPath(rel) }, signal)
          if (!approved) return done(t.step.denied(rel), t.result.writeDenied, 'denied')
          // Onay beklenirken dosya değiştiyse (kullanıcı düzenlediyse) onun değişikliği ezilmez.
          if ((await readEditable(full, rel)) !== before) return done(t.step.changedMeanwhile(rel), t.result.changedMeanwhile(rel), 'error')
          await writeFile(full, after, 'utf8')
          this.db.logFileAction({ folderId: folder.id, kind: 'write', path: rel, detail: t.log.contentChanged })
          this.remember(conversationId, folder.id, rel, before, after)
          const { region, duplicate } = editedRegion(after, at, length)
          const broken = breakage(rel, before, after)
          return done(
            t.step.edited(rel),
            [t.result.editedRegion(rel, region), duplicate ? t.result.duplicateLine(duplicate) : '', broken].filter(Boolean).join('\n\n')
          )
        }

        case 'write_file': {
          if (!canWrite) throw new FileToolError(t.errors.writeDisabled)
          const full = await resolveInside(root, args.path)
          const rel = toRelative(root, full)
          const content = str(args.content)
          const ext = extname(full).toLowerCase()
          if (DOCUMENT_EXTENSIONS.has(ext) || (ext && !TEXT_EXTENSIONS.has(ext))) {
            throw new FileToolError(t.errors.unsupportedType(ext))
          }
          if (content.length > MAX_WRITE_CHARS) throw new FileToolError(t.errors.contentTooLong)
          const existing = await stat(full).catch(() => null)
          if (existing?.isDirectory()) throw new FileToolError(t.errors.pathIsFolder)
          // Var olan dosyanın önceki hali geri alma için birebir saklanabilmeli: çok büyük ya da UTF-8 olmayan dosyaya yazılmaz.
          if (existing && existing.size > MAX_GREP_BYTES) throw new FileToolError(t.errors.tooLarge)
          const before = existing ? await readEditable(full, rel) : null
          if (before === content) return done(t.step.unchanged(rel), t.result.unchanged)
          // Var olan dosyayı "..." gibi yer tutucularla ya da yarısını atarak baştan yazmak dosyanın geri kalanını siler:
          // onaya bile sunulmaz, model edit_file'a yönlendirilir.
          if (before !== null && looksTruncated(before, content)) return done(t.step.writeTruncated(rel), t.result.writeTruncated(rel), 'error')

          const approved = await this.allow(
            { id: randomUUID(), conversationId, kind: 'write', path: rel, before, after: content, protected: isProtectedPath(rel) || isSecretFile(rel) },
            signal
          )
          if (!approved) return done(t.step.denied(rel), t.result.writeDenied, 'denied')
          // Onay beklenirken dosya değiştiyse ya da bu arada oluştuysa üstüne yazılmaz.
          const current = (await stat(full).catch(() => null)) ? await readEditable(full, rel) : null
          if (current !== before) return done(t.step.changedMeanwhile(rel), t.result.changedMeanwhile(rel), 'error')
          await mkdir(dirname(full), { recursive: true })
          await writeFile(full, content, 'utf8')
          // Geri alma için önceki hal saklanır (yeni dosyada null).
          this.remember(conversationId, folder.id, rel, before, content)
          this.db.logFileAction({
            folderId: folder.id,
            kind: 'write',
            path: rel,
            detail: existing ? t.log.contentChanged : t.log.fileCreated
          })
          const broken = breakage(rel, before, content)
          const written = existing ? done(t.step.updated(rel), t.result.updated(rel)) : done(t.step.created(rel), t.result.created(rel))
          return broken ? { ...written, result: `${written.result}\n\n${broken}` } : written
        }

        case 'move_file': {
          if (!canWrite) throw new FileToolError(t.errors.writeDisabled)
          const from = await resolveInside(root, args.from)
          const to = await resolveInside(root, args.to)
          await stat(from)
          if (await stat(to).catch(() => null)) throw new FileToolError(t.errors.targetExists)
          const relFrom = toRelative(root, from)
          const relTo = toRelative(root, to)
          // Yeniden adlandırma dosyayı çalıştırılabilir bir türe çeviremez (notlar.txt → baglan.rdp gibi).
          const fromExt = extname(from).toLowerCase()
          const toExt = extname(to).toLowerCase()
          if (toExt !== fromExt && !TEXT_EXTENSIONS.has(toExt) && !DOCUMENT_EXTENSIONS.has(toExt)) throw new FileToolError(t.errors.unsupportedType(toExt))
          const approved = await this.allow(
            { id: randomUUID(), conversationId, kind: 'move', path: relFrom, target: relTo, protected: isProtectedPath(relFrom) || isProtectedPath(relTo) },
            signal
          )
          if (!approved) return done(t.step.denied(relFrom), t.result.moveDenied, 'denied')
          if (await stat(to).catch(() => null)) throw new FileToolError(t.errors.targetExists)
          await mkdir(dirname(to), { recursive: true })
          await rename(from, to)
          this.rememberMove(conversationId, folder.id, relFrom, relTo)
          this.db.logFileAction({ folderId: folder.id, kind: 'move', path: relFrom, detail: t.log.movedTo(relTo) })
          return done(t.step.moved(relFrom, relTo), t.result.moved(relFrom, relTo))
        }

        case 'delete_file': {
          // Atlas dosya silmez: araç modele verilmez; yine de çağrılırsa reddedilir ve kullanıcıya kendisinin yapması söylenir.
          const rel = String(args.path ?? '')
          return done(t.step.deleteForbidden(rel), t.result.deleteForbidden(rel), 'denied')
        }

        default:
          return done(t.step.unknownTool(call.name), t.result.unknownTool(call.name), 'error')
      }
    } catch (err) {
      const message =
        err instanceof FileToolError
          ? err.message
          : (err as NodeJS.ErrnoException)?.code === 'ENOENT'
            ? t.errors.notFound
            : err instanceof Error
              ? err.message
              : String(err)
      const what = str(args.path ?? args.from ?? args.query).slice(0, 80)
      const failed = failedLabel(call.name)
      return done(what ? `${failed}: ${what}` : failed, t.result.error(message), 'error')
    }
  }

  private chunksFor(folderId: string): FileChunkRow[] {
    let list = this.chunks.get(folderId)
    if (!list) {
      list = this.db.listFileChunks(folderId)
      this.chunks.set(folderId, list)
    }
    return list
  }

  /** Dosya adlarında, metin dosyalarının satırlarında ve (indekslendiyse) belgelerin içinde arar. */
  async search(folder: Folder, query: string): Promise<{ count: number; text: string }> {
    const t = L().tools.files.search
    // Küçük harfe çevirme dilin kuralına göre yapılır: Türkçede "I" → "ı", İngilizcede "I" → "i".
    const lower = (s: string): string => s.toLocaleLowerCase(locale())
    const needle = lower(query)
    // Yalnızca aranabilecek dosyalar sayılır; derleme çıktıları ve ikili dosyalar sınırı doldurmasın.
    const files = await walk(folder.path, MAX_WALK_FILES, (name) => {
      const ext = extname(name).toLowerCase()
      return (TEXT_EXTENSIONS.has(ext) || DOCUMENT_EXTENSIONS.has(ext)) && !isSecretFile(name)
    })
    const sections: string[] = []
    let count = 0

    const byName = files.filter((f) => lower(f.path).includes(needle)).slice(0, 20)
    if (byName.length > 0) {
      count += byName.length
      sections.push(`${t.byName}\n` + byName.map((f) => `- ${f.path}`).join('\n'))
    }

    const lines: string[] = []
    for (const file of files) {
      if (lines.length >= 30) break
      if (!TEXT_EXTENSIONS.has(extname(file.path).toLowerCase())) continue
      const info = await stat(file.full).catch(() => null)
      if (!info || info.size > MAX_GREP_BYTES) continue
      const content = await readFile(file.full).then(decodeText, () => '')
      content.split('\n').forEach((line, i) => {
        if (lines.length < 30 && lower(line).includes(needle)) {
          lines.push(t.lineHit(file.path, i + 1, line.trim().slice(0, 200)))
        }
      })
    }
    if (lines.length > 0) {
      count += lines.length
      sections.push(`${t.byLine}\n` + lines.join('\n'))
    }

    // İndeks varsa PDF, Word ve Excel içerikleri de aranır; gömme modeli kuruluysa anlamca.
    const chunks = this.chunksFor(folder.id)
    if (chunks.length > 0) {
      let queryVector: Float32Array | null = null
      if (chunks.some((c) => c.vector) && (await this.memory.hasSemantic())) {
        queryVector = await ollama.embed(EMBEDDING_MODEL, [query]).then((v) => v[0], () => null)
      }
      const best = chunks
        .map((c) => ({ c, score: queryVector && c.vector ? cosine(queryVector, c.vector) : stemOverlap(query, c.text) }))
        .filter((s) => s.score >= (queryVector ? 0.35 : 0.6))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
      if (best.length > 0) {
        count += best.length
        sections.push(
          `${t.related}\n` + best.map((s) => `- ${s.c.path}: ${s.c.text.replace(/\s+/g, ' ').slice(0, 500)}`).join('\n')
        )
      }
    }

    return { count, text: sections.length > 0 ? sections.join('\n\n') : t.none(query) }
  }

  /**
   * Klasördeki belgeleri parçalara ayırıp aranabilir hale getirir.
   * Değişmeyen dosyalar atlanır, silinenler indeksten çıkarılır.
   */
  async index(folderId: string): Promise<Folder> {
    const folder = this.db.getFolder(folderId)
    if (!folder) throw new FileToolError(L().tools.files.errors.folderNotFound)
    const files = await walk(folder.path, MAX_INDEX_FILES, (name) => {
      const ext = extname(name).toLowerCase()
      return (TEXT_EXTENSIONS.has(ext) || DOCUMENT_EXTENSIONS.has(ext)) && !isSecretFile(name)
    })
    const known = this.db.indexedFiles(folderId)
    const present = new Set(files.map((f) => f.path))
    // Sınıra gelindiyse gezilmeyen dosyalar indeksten silinmez; yalnızca gerçekten silinmiş olanlar çıkarılır.
    const complete = files.length < MAX_INDEX_FILES
    for (const path of known.keys()) {
      if (present.has(path)) continue
      if (complete || !(await stat(join(folder.path, path)).catch(() => null))) this.db.removeFileChunks(folderId, path)
    }

    const semantic = await this.memory.hasSemantic(true)
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      this.events.indexProgress({ folderId, percent: Math.round((i / files.length) * 100), file: file.path })
      const info = await stat(file.full).catch(() => null)
      if (!info || info.size > MAX_READ_BYTES) continue
      const mtime = Math.floor(info.mtimeMs)
      if (known.get(file.path) === mtime) continue
      let pieces: string[] = []
      try {
        pieces = chunkText(await extractText(basename(file.full), await readFile(file.full)))
      } catch {
        // Okunamayan dosya (şifreli PDF gibi) atlanır.
      }
      // Dosya adı da parçaya yazılır ki "bütçe dosyasında ne var" gibi sorular eşleşsin.
      const texts = pieces.map((p) => `${file.path}\n${p}`)
      let vectors: (Float32Array | null)[] = texts.map(() => null)
      if (semantic && texts.length > 0) {
        vectors = await ollama.embed(EMBEDDING_MODEL, texts).catch(() => texts.map(() => null))
      }
      this.db.replaceFileChunks(folderId, file.path, mtime, pieces.map((text, j) => ({ text, vector: vectors[j] })))
    }
    this.db.markFolderIndexed(folderId)
    this.chunks.delete(folderId)
    this.events.indexProgress({ folderId, percent: 100, file: '' })
    return this.db.getFolder(folderId)!
  }

  forget(folderId: string): void {
    this.chunks.delete(folderId)
  }
}
