import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { shell } from 'electron'
import type { FileApproval, Folder, FolderCapability, IndexProgress, PlanItem, ToolStep, UndoEntry } from '@shared/types'
import type { Db, FileChunkRow } from '../db'
import { L, locale } from '../i18n'
import { extractText, TEXT_EXTENSIONS } from './attachments'
import { classifyCommand } from '@shared/command'
import { runCommand } from './code'
import { scanHardware } from './hardware'
import { cosine, EMBEDDING_MODEL, tokens, type MemoryService } from './memory'
import * as ollama from './ollama'

/** Tek seferde modele verilen en fazla dosya metni */
const READ_LIMIT = 12_000
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
/** Gezilmeyen klasörler */
const SKIP_DIRS = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information', '__pycache__'])

export class FileToolError extends Error {}

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function isInside(root: string, target: string): boolean {
  if (samePath(root, target)) return true
  const prefix = root.endsWith(sep) ? root : root + sep
  return process.platform === 'win32'
    ? target.toLowerCase().startsWith(prefix.toLowerCase())
    : target.startsWith(prefix)
}

/**
 * Göreli yolu klasörün içinde gerçek bir yola çevirir. Klasörün dışına çıkan
 * ("..", mutlak yol, dışarıyı gösteren kısayol) her yol reddedilir.
 */
export async function resolveInside(root: string, requested: unknown): Promise<string> {
  const raw = typeof requested === 'string' ? requested.trim() : ''
  const cleaned = raw.replace(/^[\\/]+/, '') || '.'
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
export async function walk(root: string, limit = MAX_WALK_FILES): Promise<{ path: string; full: string }[]> {
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
      else if (entry.isFile()) found.push({ path: toRelative(root, full), full })
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
    TOOL('read_file', d.readFile, { path: pathArg, start: { type: 'integer', description: d.readStartArg } }, ['path']),
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

export class FilesService {
  private pending = new Map<string, (approved: boolean) => void>()
  /**
   * Sohbet başına verilen kalıcı izinler (uygulama kapanınca unutulur): dosya düzenlemeleri ve birebir aynı komutlar.
   * Silme hiçbir izinle açılmaz.
   */
  private trust = new Map<string, { edits: boolean; commands: Set<string> }>()
  /** Onay bekleyen işlemlerin sohbeti ve türü; "hep izin ver" denince neyin hatırlanacağını bilmek için */
  private pendingInfo = new Map<string, { conversationId: string; kind: FileApproval['kind']; command?: string }>()
  /** Süren cevapta değiştirilen dosyaların ilk halleri (aynı dosya ikinci kez değişirse ilk hal korunur) */
  private turnEdits = new Map<string, UndoEntry[]>()

  /** Cevap kaydedilirken çağrılır: bu cevaptaki geri alma kaydını verir ve sıfırlar. */
  takeEdits(conversationId: string): UndoEntry[] {
    const entries = this.turnEdits.get(conversationId) ?? []
    this.turnEdits.delete(conversationId)
    return entries
  }

  private remember(conversationId: string, folderId: string, path: string, before: string | null): void {
    const list = this.turnEdits.get(conversationId) ?? []
    if (!list.some((e) => e.folderId === folderId && e.path === path)) list.push({ folderId, path, before })
    this.turnEdits.set(conversationId, list)
    this.events.edited?.({ conversationId, folderId, path, before })
  }
  private capabilityCache: FolderCapability | null = null
  private chunks = new Map<string, FileChunkRow[]>()

  constructor(
    private db: Db,
    private events: FileEvents,
    private memory: MemoryService
  ) {}

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
    return [
      t.intro(folder.name),
      ...(rules ? [t.projectRules(rules.file, rules.text)] : []),
      t.planFirst,
      t.lookFirst,
      t.proactive,
      t.relativePaths,
      ...(write ? [t.callDirectly, t.dontAskApproval, t.dontRepeatContent] : [t.readOnly]),
      t.citeFile
    ].join('\n')
  }

  /** Onay kartına verilen cevap. remember: bu sohbette aynı türdeki işlemlere bir daha sorma. */
  respond(approvalId: string, approved: boolean, remember = false): void {
    const info = this.pendingInfo.get(approvalId)
    if (approved && remember && info) {
      const trust = this.trustFor(info.conversationId)
      if (info.kind === 'command' && info.command) trust.commands.add(info.command)
      else if (info.kind === 'write' || info.kind === 'move' || info.kind === 'mkdir') trust.edits = true
    }
    this.pendingInfo.delete(approvalId)
    this.pending.get(approvalId)?.(approved)
    this.pending.delete(approvalId)
  }

  private trustFor(conversationId: string): { edits: boolean; commands: Set<string> } {
    let trust = this.trust.get(conversationId)
    if (!trust) {
      trust = { edits: false, commands: new Set() }
      this.trust.set(conversationId, trust)
    }
    return trust
  }

  /** Bu sohbette verilen kalıcı izinler (arayüzde gösterilir ve geri alınır) */
  trustState(conversationId: string): { edits: boolean; commands: string[] } {
    const trust = this.trust.get(conversationId)
    return { edits: trust?.edits ?? false, commands: [...(trust?.commands ?? [])] }
  }

  revokeTrust(conversationId: string): void {
    this.trust.delete(conversationId)
  }

  /** İzin verilmişse onay sormadan geçer; verilmemişse kullanıcıya sorar. */
  private async allow(approval: FileApproval, signal: AbortSignal): Promise<boolean> {
    const trust = this.trust.get(approval.conversationId)
    if (approval.kind === 'command' ? trust?.commands.has(approval.path) : (approval.kind === 'write' || approval.kind === 'move') && trust?.edits) return true
    this.pendingInfo.set(approval.id, { conversationId: approval.conversationId, kind: approval.kind, command: approval.kind === 'command' ? approval.path : undefined })
    return this.ask(approval, signal)
  }

  private ask(approval: FileApproval, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolvePromise) => {
      const finish = (approved: boolean): void => {
        signal.removeEventListener('abort', onAbort)
        this.pending.delete(approval.id)
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
    const root = folder.path
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
          const info = await stat(full)
          if (info.isDirectory()) throw new FileToolError(t.errors.isFolder)
          if (info.size > MAX_READ_BYTES) throw new FileToolError(t.errors.tooLarge)
          const text = (await extractText(basename(full), await readFile(full))).trim()
          const start = Math.max(0, Math.floor(Number(args.start) || 0))
          const piece = text.slice(start, start + READ_LIMIT)
          const end = start + piece.length
          const note = end < text.length ? `\n\n${t.result.readMore(end, text.length)}` : ''
          const rel = toRelative(root, full)
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
          if (verdict.forbidden) return done(t.step.commandForbidden(verdict.reason || short), t.result.commandForbidden(verdict.reason), 'denied')
          const approved = await this.allow({ id: randomUUID(), conversationId, kind: 'command', path: command }, signal)
          if (!approved) return done(t.step.denied(short), t.result.commandDenied, 'denied')
          const outcome = await runCommand(root, command, signal, (chunk) => this.events.commandOutput?.({ conversationId, stepId: id, command, chunk }))
          this.db.logFileAction({ folderId: folder.id, kind: 'command', path: command.slice(0, 500), detail: t.log.commandRan(outcome.code) })
          return done(
            t.step.commandRan(short, outcome.code, outcome.timedOut),
            t.result.commandRan(outcome.code, outcome.timedOut, outcome.output),
            outcome.code === 0 && !outcome.timedOut ? 'ok' : 'error',
            // Kullanıcı terminal çıktısını adımın altında görür; uzun çıktının sonu saklanır.
            { command, output: outcome.output.length > 8000 ? `…\n${outcome.output.slice(-8000)}` : outcome.output, code: outcome.timedOut ? null : outcome.code }
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
          const before = await readFile(full, 'utf8')
          let oldText = str(args.old_text)
          let newText = str(args.new_text)
          if (!oldText) throw new FileToolError(t.errors.editEmpty)
          // Dosya Windows satır sonu kullanıyorsa modelin yazdığı metin de ona çevrilir.
          if (before.includes('\r\n') && !oldText.includes('\r\n')) {
            oldText = oldText.replace(/\n/g, '\r\n')
            newText = newText.replace(/\r?\n/g, '\r\n')
          }
          const count = before.split(oldText).length - 1
          if (count === 0) return done(t.step.editNotFound(rel), t.result.editNotFound(rel), 'error')
          if (count > 1) return done(t.step.editAmbiguous(rel), t.result.editAmbiguous(rel, count), 'error')
          const after = before.replace(oldText, () => newText)
          if (after === before) return done(t.step.unchanged(rel), t.result.unchanged)
          const approved = await this.allow({ id: randomUUID(), conversationId, kind: 'write', path: rel, before, after }, signal)
          if (!approved) return done(t.step.denied(rel), t.result.writeDenied, 'denied')
          await writeFile(full, after, 'utf8')
          this.db.logFileAction({ folderId: folder.id, kind: 'write', path: rel, detail: t.log.contentChanged })
          this.remember(conversationId, folder.id, rel, before)
          return done(t.step.edited(rel), t.result.edited(rel))
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
          const before = existing && existing.size <= MAX_GREP_BYTES ? await readFile(full, 'utf8').catch(() => null) : null
          if (before === content) return done(t.step.unchanged(rel), t.result.unchanged)

          const approved = await this.allow(
            { id: randomUUID(), conversationId, kind: 'write', path: rel, before: existing ? (before ?? '') : null, after: content },
            signal
          )
          if (!approved) return done(t.step.denied(rel), t.result.writeDenied, 'denied')
          await mkdir(dirname(full), { recursive: true })
          // Geri alma için önceki hal saklanır (yeni dosyada null).
          const previous = existing ? await readFile(full, 'utf8').catch(() => before ?? '') : null
          await writeFile(full, content, 'utf8')
          this.remember(conversationId, folder.id, rel, previous)
          this.db.logFileAction({
            folderId: folder.id,
            kind: 'write',
            path: rel,
            detail: existing ? t.log.contentChanged : t.log.fileCreated
          })
          return existing ? done(t.step.updated(rel), t.result.updated(rel)) : done(t.step.created(rel), t.result.created(rel))
        }

        case 'move_file': {
          if (!canWrite) throw new FileToolError(t.errors.writeDisabled)
          const from = await resolveInside(root, args.from)
          const to = await resolveInside(root, args.to)
          await stat(from)
          if (await stat(to).catch(() => null)) throw new FileToolError(t.errors.targetExists)
          const relFrom = toRelative(root, from)
          const relTo = toRelative(root, to)
          const approved = await this.allow({ id: randomUUID(), conversationId, kind: 'move', path: relFrom, target: relTo }, signal)
          if (!approved) return done(t.step.denied(relFrom), t.result.moveDenied, 'denied')
          await mkdir(dirname(to), { recursive: true })
          await rename(from, to)
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
    const files = await walk(folder.path)
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
      const content = await readFile(file.full, 'utf8').catch(() => '')
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
    const files = (await walk(folder.path, MAX_INDEX_FILES)).filter((f) => {
      const ext = extname(f.path).toLowerCase()
      return TEXT_EXTENSIONS.has(ext) || DOCUMENT_EXTENSIONS.has(ext)
    })
    const known = this.db.indexedFiles(folderId)
    const present = new Set(files.map((f) => f.path))
    for (const path of known.keys()) if (!present.has(path)) this.db.removeFileChunks(folderId, path)

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
