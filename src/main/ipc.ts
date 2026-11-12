import { readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { realpath } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type {
  ImproveRequest,
  InstalledModel,
  Level,
  MemoryCategory,
  MiniAppDraft,
  PersonaDraft,
  RunRequest,
  Settings,
  WaBuildRequest
} from '@shared/types'
import type { Db } from './db'
import { getLanguage, L, locale } from './i18n'
import type { AtlasPanel } from './panel'
import { checkUpdates, compareVersions, downloadUpdate, launchInstaller, pendingUpdate } from './services/updates'
import { safeFileName, toDocx, toHtml, toMarkdown, type ExportDocument } from './services/export'
import { buildPanelMessages, panelTemperature } from './services/panelPrompts'
import { buildRunMessages, EXPORT_EXTENSION, EXPORT_FORMAT, formatValues, sanitizeDraft } from './services/apps'
import { addAttachment, sheetPreview } from './services/attachments'
import { builtinApps, CORPORATE_APP_IDS } from './services/builtinApps'
import type { LockService } from './services/lock'
import { DOCUMENT_FORMATS, EXPORT_FORMATS, LOCK_MINUTES, documentViewKind, type DocumentFormat, type DocumentOriginal, type LoadedModel, type SqlConnectionInput, type SqlObjectType, SHORTCUT_CHOICES, UNTITLED_CONVERSATION, type ExportFormat, type PanelAction, type WhatsNew } from '@shared/types'
import { CATALOG, catalog, recommend, atlasRecipe, isAtlasModel, recipesVersion } from './services/catalog'
import type { FilesService } from './services/files'
import type { ChatService } from './services/chat'
import { scanHardware } from './services/hardware'
import type { JobService } from './services/jobs'
import { EMBEDDING_MODEL, EMBEDDING_SIZE_GB, type MemoryService } from './services/memory'
import { BUILTIN_PERSONAS, builtinPersonas, findPersona, listPersonas, personaInstructions, sanitizePersona } from './services/personas'
import * as ollama from './services/ollama'
import { sqlService } from './services/sql'
import { isRunnable, listDir, readForView } from './services/code'
import { resolveInside } from './services/files'
import { buildApp, buildImproveMessages } from './services/studio'
import type { WhatsAppService } from './services/whatsapp'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** Uygulama kilitliyken de cevap verilen istekler; diğer bütün istekler reddedilir. */
const OPEN_WHEN_LOCKED = new Set([
  'lock:state',
  'lock:unlock',
  'app:version',
  'app:setTitleBarTheme',
  'app:showMain',
  'panel:request',
  'panel:hide'
])
let isLocked: () => boolean = () => false

/** Masaüstü tarafı: kilit ve ayar değişikliklerinin tepsiye, açılış kaydına yansıtılması. */
export interface DesktopHooks {
  lock: LockService
  panel: AtlasPanel
  settingsChanged(patch: Partial<Settings>): void
  /** Ana pencereyi öne getirir. */
  showMain(): void
  /** Ana pencerede verilen sohbeti açar. */
  openConversation(id: string): void
  quit(): void
}

/** Hatalar arayüze geçerli dilde düz mesaj olarak ulaşsın diye her cevap sarmalanır. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<R>> => {
    try {
      if (isLocked() && !OPEN_WHEN_LOCKED.has(channel)) throw new Error(L().main.lock.locked)
      return { ok: true, data: await fn(...(args as A)) }
    } catch (err) {
      return { ok: false, error: ollama.describeError(err) }
    }
  })
}

/** Hazırlanan HTML'i görünmeyen bir pencerede PDF'e çevirir. */
async function renderPdf(html: string): Promise<Buffer> {
  const file = join(app.getPath('temp'), `atlas-export-${Date.now()}.html`)
  await writeFile(file, html, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await win.loadFile(file)
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
  } finally {
    win.destroy()
    await rm(file, { force: true })
  }
}

/** Bilgisayarda kurulu Atlas modelleri. Atlas başka modelleri listelemez. */
async function installedAtlas(): Promise<InstalledModel[]> {
  const names = new Map(catalog(getLanguage()).map((m) => [m.id, m.name]))
  return (await ollama.listInstalled())
    .filter((m) => isAtlasModel(m.name))
    .map((m) => ({ ...m, label: names.get(m.name) ?? m.name }))
}

async function installedModels(): Promise<InstalledModel[]> {
  try {
    return await installedAtlas()
  } catch {
    return []
  }
}

export function registerIpc(
  db: Db,
  chat: ChatService,
  jobs: JobService,
  memory: MemoryService,
  whatsapp: WhatsAppService,
  files: FilesService,
  titleBar: (dark: boolean) => void,
  /** Kullanıcı dili değiştirdiğinde çağrılır */
  onLanguageChange: (lang: Settings['language']) => void,
  desktop: DesktopHooks
): void {
  isLocked = () => desktop.lock.isLocked()

  handle('lock:state', () => desktop.lock.state())
  handle('lock:setPin', (pin: string, current?: string) => desktop.lock.setPin(pin, current))
  handle('lock:disable', (current: string) => desktop.lock.disable(current))
  handle('lock:lock', () => desktop.lock.lock())
  handle('lock:unlock', (pin: string) => desktop.lock.unlock(pin))

  /** Mini uygulamalar ve prompt geliştirme varsayılan modeli kullanır. */
  const defaultModel = (): string => {
    const model = db.getSettings().defaultModel
    if (!isAtlasModel(model)) throw new ollama.OllamaError(L().main.models.noDefault)
    return model
  }
  /** İstenen model Atlas ailesindense onu, değilse varsayılanı verir. */
  const atlasOrDefault = (model?: string | null): string => (isAtlasModel(model) ? model : defaultModel())

  handle('hardware:scan', () => scanHardware())

  handle('ollama:status', () => ollama.status())
  handle('ollama:start', () => ollama.start())
  handle('ollama:install', () => ollama.install((p) => broadcast('ollama:installProgress', p)))

  handle('models:recommend', async () => recommend(await scanHardware(), await installedModels()))
  handle('models:installed', async () => {
    const installed = await installedAtlas()
    // Varsayılan model kurulu bir Atlas modeli değilse kurulu olanların en iyisine çevrilir.
    const current = db.getSettings().defaultModel
    if (!installed.some((m) => m.name === current)) {
      const best = CATALOG.filter((m) => !m.specialty && installed.some((i) => i.name === m.id)).sort((a, b) => b.rank - a.rank)[0]
      const next = best?.id ?? installed[0]?.name ?? null
      if (next !== current) db.setSettings({ defaultModel: next })
    }
    return installed
  })
  handle('models:loaded', async (): Promise<LoadedModel[]> => {
    const names = new Map(catalog(getLanguage()).map((m) => [m.id, m.name]))
    // Ollama, dışarıdan eklenen model dosyalarında bellekteki boyutu eksik bildirebiliyor;
    // o zaman modelin diskteki boyutu daha doğru bir alt sınırdır.
    const onDisk = new Map((await ollama.listInstalled().catch(() => [])).map((m) => [m.name, m.sizeGb]))
    return (await ollama.listLoaded()).map((m) => ({
      ...m,
      sizeGb: Math.max(m.sizeGb, onDisk.get(m.name) ?? 0),
      label: names.get(m.name) ?? m.name.replace(/:latest$/, '')
    }))
  })
  handle('models:unload', async (model?: string) => {
    const names = model ? [model] : (await ollama.listLoaded()).map((m) => m.name)
    await Promise.all(names.map((name) => ollama.unloadModel(name)))
  })
  handle('models:supportsVision', (model: string) => ollama.supportsVision(model))
  handle('models:supportsTools', (model: string) => ollama.supportsTools(model))
  handle('models:pull', async (model: string) => {
    const expectedGb = CATALOG.find((m) => m.id === model)?.sizeGb ?? 0
    const recipe = atlasRecipe(model)
    if (!recipe) throw new Error(L().main.models.notAtlas)
    // İnce ayarlı ağırlıklar bu bilgisayarda kuruluysa onlar kullanılır; değilse taban model iner.
    const tuned = recipe.tuned && (await ollama.listInstalled()).some((m) => m.name === recipe.tuned) ? recipe.tuned : null
    if (!tuned) {
      await ollama.pull(recipe.base, (p) => broadcast('models:pullProgress', { ...p, model }), expectedGb * 1e9 * 0.995)
    }
    const lang = getLanguage()
    const system = recipe.system?.[lang] ?? personaInstructions(builtinPersonas(lang)[0])
    await ollama.createModel(model.replace(/:latest$/, ''), tuned ?? recipe.base, system, recipe.parameters)
  })
  handle('models:cancelPull', (model: string) => ollama.cancelPull(atlasRecipe(model)?.base ?? model))
  handle('models:remove', (model: string) => {
    const settings = db.getSettings()
    if (settings.defaultModel === model) db.setSettings({ defaultModel: null })
    return ollama.remove(model)
  })
  handle('models:benchmark', (model: string) => {
    const lang = getLanguage()
    return ollama.benchmark(model, atlasRecipe(model)?.system?.[lang] ?? personaInstructions(builtinPersonas(lang)[0]))
  })

  handle('conversations:list', () => db.listConversations())
  handle('conversations:create', (options?: { personaId?: string; private?: boolean; folderId?: string | null; sqlId?: string | null }) =>
    db.createConversation(db.getSettings().defaultModel, {
      // Silinmiş ya da geçersiz bir kişilik istenirse varsayılana düşülür.
      personaId: findPersona(db, options?.personaId).id,
      private: options?.private === true,
      folderId: options?.folderId && db.getFolder(options.folderId) ? options.folderId : null,
      sqlId: options?.sqlId && sqlService().get(options.sqlId) ? options.sqlId : null
    })
  )
  handle('conversations:setFolder', (id: string, folderId: string | null) =>
    db.setConversationFolder(id, folderId && db.getFolder(folderId) ? folderId : null)
  )
  handle('conversations:setSql', (id: string, sqlId: string | null) => db.setConversationSql(id, sqlId && sqlService().get(sqlId) ? sqlId : null))

  // --- Kod alanı: proje dosya ağacı ve dosya görüntüleme ---
  handle('code:list', (folderId: string, rel: string) => {
    const folder = db.getFolder(folderId)
    if (!folder) throw new Error(L().tools.code.noFolder)
    return listDir(folder.path, String(rel ?? ''))
  })
  handle('code:open', async (folderId: string, rel: string) => {
    const folder = db.getFolder(folderId)
    if (!folder) throw new Error(L().tools.code.noFolder)
    const full = await resolveInside(folder.path, String(rel ?? ''))
    // Çalıştırılabilir dosyalar açılmaz (açmak onları çalıştırır); Gezgin'de gösterilir.
    if (isRunnable(full)) {
      shell.showItemInFolder(full)
      return 'revealed'
    }
    const error = await shell.openPath(full)
    if (error) throw new Error(error)
    return 'opened'
  })
  handle('code:reveal', async (folderId: string, rel: string) => {
    const folder = db.getFolder(folderId)
    if (!folder) throw new Error(L().tools.code.noFolder)
    shell.showItemInFolder(await resolveInside(folder.path, String(rel ?? '')))
  })
  handle('code:read', (folderId: string, rel: string) => {
    const folder = db.getFolder(folderId)
    if (!folder) throw new Error(L().tools.code.noFolder)
    return readForView(folder.path, String(rel ?? ''))
  })

  // --- Veritabanı bağlantıları (Kod alanı) ---
  handle('sql:list', () => sqlService().list())
  handle('sql:save', (input: SqlConnectionInput, id?: string) => sqlService().save(input, id))
  handle('sql:remove', (id: string) => sqlService().remove(id))
  handle('sql:test', (id: string) => sqlService().test(id))
  handle('sql:schema', (id: string) => sqlService().schema(id))
  handle('sql:definition', (id: string, object: { schema: string; name: string; type: SqlObjectType }) => sqlService().definition(id, object))
  handle('sql:run', (id: string, sql: string) => sqlService().runRead(id, String(sql)))
  handle('sql:respond', (approvalId: string, approved: boolean) => sqlService().respond(approvalId, approved))
  handle('sql:pickFile', async () => {
    const picked = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] }, { name: '*', extensions: ['*'] }]
    })
    return picked.canceled ? null : (picked.filePaths[0] ?? null)
  })
  handle('conversations:rename', (id: string, title: string) => db.renameConversation(id, title))
  handle('conversations:setPinned', (id: string, pinned: boolean) => db.setPinned(id, pinned))
  handle('conversations:setModel', (id: string, model: string) => {
    if (!isAtlasModel(model)) throw new Error(L().main.models.notAtlas)
    return db.setConversationModel(id, model)
  })
  handle('conversations:remove', (id: string) => {
    chat.stop(id)
    db.deleteConversation(id)
  })
  handle('conversations:messages', (id: string) => db.listMessages(id))
  handle('conversations:search', (query: string) => db.search(query))
  handle('conversations:export', async (id: string, format: ExportFormat) => {
    const conversation = db.getConversation(id)
    if (!conversation || !EXPORT_FORMATS.includes(format)) return null
    const t = L().main.export
    const persona = findPersona(db, conversation.personaId)
    const messages = db
      .listMessages(id)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        author: m.role === 'user' ? db.getSettings().userName.trim() || t.you : persona.name,
        content: m.content
      }))
    if (messages.length === 0) throw new Error(t.empty)
    const title = conversation.title === UNTITLED_CONVERSATION ? L().common.newChat : conversation.title
    const date = new Date(conversation.updatedAt).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
    const model = conversation.model ? (catalog(getLanguage()).find((m) => m.id === conversation.model)?.name ?? conversation.model) : null
    const doc: ExportDocument = { title, subtitle: t.subtitle(date, model), messages }

    // Otomatik denemelerde kaydetme penceresi açılmaz; dosya verilen klasöre yazılır.
    const testDir = process.env.ATLAS_USER_DATA ? process.env.ATLAS_EXPORT_DIR : undefined
    const result = testDir
      ? { canceled: false, filePath: join(testDir, `${safeFileName(title)}.${format}`) }
      : await dialog.showSaveDialog({
          title: t.saveTitle,
          defaultPath: join(app.getPath('documents'), `${safeFileName(title)}.${format}`),
          filters: [{ name: t.formats[format], extensions: [format] }]
        })
    if (result.canceled || !result.filePath) return null
    if (format === 'md') await writeFile(result.filePath, toMarkdown(doc), 'utf8')
    else if (format === 'docx') await writeFile(result.filePath, await toDocx(doc))
    else await writeFile(result.filePath, await renderPdf(toHtml(doc)))
    return result.filePath
  })

  // --- Belge paneli ---
  handle('documents:get', (id: string) => db.getDocument(id))
  handle('documents:original', async (id: string): Promise<DocumentOriginal | null> => {
    const original = db.getOriginal(id)
    const kind = original && documentViewKind(original.name)
    if (!original || !kind) return null
    if (kind === 'xlsx') return { kind, sheets: await sheetPreview(original.bytes) }
    return { kind, bytes: new Uint8Array(original.bytes) }
  })
  handle('documents:save', (id: string, text: string) => db.saveDocument(id, String(text).slice(0, 400_000)))
  handle('documents:reset', (id: string) => {
    db.resetDocument(id)
    return db.getDocument(id)
  })
  handle('documents:export', async (id: string, format: DocumentFormat) => {
    const document = db.getDocument(id)
    if (!document || !DOCUMENT_FORMATS.includes(format)) return null
    const t = L().main.export
    // "CV.pdf" gibi bir ekin adı uzantısız başlık olur.
    const title = document.name.replace(/\.[A-Za-z0-9]{1,5}$/, '')
    const doc: ExportDocument = { title, subtitle: '', lineParagraphs: true, messages: [{ role: 'assistant', author: '', content: document.text }] }
    const testDir = process.env.ATLAS_USER_DATA ? process.env.ATLAS_EXPORT_DIR : undefined
    const result = testDir
      ? { canceled: false, filePath: join(testDir, `${safeFileName(title)}.${format}`) }
      : await dialog.showSaveDialog({
          title: t.saveDocumentTitle,
          defaultPath: join(app.getPath('documents'), `${safeFileName(title)}.${format}`),
          filters: [{ name: t.documentFormats[format], extensions: [format] }]
        })
    if (result.canceled || !result.filePath) return null
    if (format === 'txt') await writeFile(result.filePath, document.text, 'utf8')
    else if (format === 'md') await writeFile(result.filePath, toMarkdown(doc), 'utf8')
    else if (format === 'docx') await writeFile(result.filePath, await toDocx(doc))
    else await writeFile(result.filePath, await renderPdf(toHtml(doc)))
    return result.filePath
  })

  // --- Atlas paneli ---
  handle('panel:request', () => desktop.panel.request())
  handle('panel:hide', () => desktop.panel.hide())
  handle('panel:shortcutStatus', () => desktop.panel.shortcutStatus())
  handle('panel:copy', async (text: string) => clipboard.writeText(String(text)))
  handle('panel:replace', async (text: string) => {
    const ok = await desktop.panel.replace(String(text))
    // Program öne getirilemediyse sonuç kaybolmasın: panoda kalır.
    if (!ok) await clipboard.writeText(String(text))
    return ok
  })
  handle('panel:run', (action: PanelAction, text: string, instruction?: string) => {
    const lang = getLanguage()
    return jobs.start({
      model: defaultModel(),
      messages: buildPanelMessages(action, String(text), instruction, lang, personaInstructions(builtinPersonas(lang)[0])),
      temperature: panelTemperature(action)
    })
  })
  handle('panel:toChat', (question: string, answer: string) => {
    const model = defaultModel()
    const conversation = db.createConversation(model)
    db.renameConversation(conversation.id, String(question).replace(/\s+/g, ' ').trim().slice(0, 60) || L().common.newChat)
    db.addMessage({ conversationId: conversation.id, role: 'user', content: String(question) })
    if (String(answer).trim()) db.addMessage({ conversationId: conversation.id, role: 'assistant', content: String(answer), model })
    desktop.panel.hide()
    desktop.openConversation(conversation.id)
  })

  handle('chat:send', (conversationId: string, content: string, attachmentIds?: string[]) =>
    chat.send(conversationId, content, attachmentIds ?? [])
  )
  handle('chat:regenerate', (conversationId: string) => chat.regenerate(conversationId))
  handle('chat:edit', (messageId: string, content: string) => chat.edit(messageId, content))
  handle('chat:stop', (conversationId: string) => chat.stop(conversationId))

  handle('personas:list', () => listPersonas(db))
  handle('personas:save', (draft: PersonaDraft, id?: string) => {
    if (id && BUILTIN_PERSONAS.some((p) => p.id === id)) throw new Error(L().main.personas.builtinReadOnly)
    return db.savePersona(sanitizePersona(draft), id)
  })
  handle('personas:remove', (id: string) => db.deletePersona(id))

  handle('folders:list', () => db.listFolders())
  handle('folders:capability', () => files.capability())
  handle('folders:add', async () => {
    const result = await dialog.showOpenDialog({
      title: L().main.folders.pickTitle,
      buttonLabel: L().main.folders.pickButton,
      properties: ['openDirectory']
    })
    const chosen = result.filePaths[0]
    if (result.canceled || !chosen) return null
    return db.addFolder(await realpath(chosen))
  })
  handle('folders:remove', (id: string) => {
    files.forget(id)
    db.deleteFolder(id)
  })
  handle('folders:index', (id: string) => files.index(id))
  handle('folders:actions', (folderId: string) => db.listFileActions(folderId))
  handle('folders:respond', (approvalId: string, approved: boolean, remember?: boolean) => files.respond(approvalId, approved, remember === true))
  handle('folders:trust', (conversationId: string) => files.trustState(conversationId))
  // Kullanıcı bir cevaptaki dosya değişikliklerini geri alır. Atlas'ın oluşturduğu dosyalar silinmez, çöp kutusuna gider.
  handle('folders:undo', async (messageId: string) => {
    let restored = 0
    for (const entry of db.takeUndo(String(messageId))) {
      const folder = db.getFolder(entry.folderId)
      if (!folder) continue
      const full = await resolveInside(folder.path, entry.path).catch(() => null)
      if (!full) continue
      if (entry.before === null) {
        if (await stat(full).catch(() => null)) await shell.trashItem(full)
      } else {
        await mkdir(dirname(full), { recursive: true })
        await writeFile(full, entry.before, 'utf8')
      }
      db.logFileAction({ folderId: folder.id, kind: 'write', path: entry.path, detail: L().main.folders.undone })
      restored++
    }
    return restored
  })
  handle('folders:revokeTrust', (conversationId: string) => files.revokeTrust(conversationId))

  handle('whatsapp:parse', (name: string, bytes: ArrayBuffer) => whatsapp.parse(name, bytes))
  handle('whatsapp:build', (request: WaBuildRequest) =>
    whatsapp.build(request, defaultModel(), (p) => broadcast('whatsapp:progress', p))
  )
  handle('whatsapp:profile', (personaId: string) => whatsapp.profile(personaId))
  handle('whatsapp:setSimilarity', (personaId: string, level: Level) => whatsapp.setSimilarity(personaId, level))

  handle('memory:list', () => db.listMemories())
  handle('memory:status', () => memory.status())
  handle('memory:add', (text: string, category: MemoryCategory) => memory.add(text, category))
  handle('memory:update', (id: string, text: string, category: MemoryCategory) => memory.update(id, text, category))
  handle('memory:remove', (id: string) => db.deleteMemory(id))
  handle('memory:clear', () => db.clearMemories())
  handle('memory:enableSemantic', async () => {
    await ollama.pull(EMBEDDING_MODEL, (p) => broadcast('models:pullProgress', p), EMBEDDING_SIZE_GB * 1e9 * 0.995)
    await memory.hasSemantic(true)
    await memory.embedMissing()
    // Daha önce öğrenilen WhatsApp kişilerinin örnekleri de anlamca aranabilir olsun.
    for (const p of db.listPersonas().filter((x) => x.whatsapp)) await whatsapp.embedMissing(p.id)
  })

  handle('attachments:add', (name: string, mime: string, bytes: ArrayBuffer) => addAttachment(db, name, mime, bytes))
  handle('attachments:remove', (id: string) => db.deletePendingAttachment(id))

  handle('apps:list', () => {
    const corporate = db.getSettings().corporateMode
    // Hazır uygulamalar katalogdaki sırayla, kullanıcınınkiler ada göre gelir.
    const order = new Map(builtinApps(getLanguage()).map((a, i) => [a.id, i]))
    return db
      .listApps()
      .filter((a) => corporate || !CORPORATE_APP_IDS.has(a.id))
      .sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1))
  })
  handle('apps:save', (draft: MiniAppDraft, id?: string) => db.saveApp(sanitizeDraft(draft), id))
  handle('apps:remove', (id: string) => db.deleteApp(id))
  handle('apps:setFavorite', (id: string, favorite: boolean) => db.setAppFavorite(id, favorite))
  handle('apps:run', (request: RunRequest) => {
    const miniApp = db.getApp(request.appId)
    if (!miniApp) throw new Error(L().main.apps.notFound)
    const model = atlasOrDefault(miniApp.model)
    return jobs.start({
      model,
      messages: buildRunMessages(miniApp, request, db),
      temperature: 0.5,
      onFinish: (output) => db.addRun({ appId: miniApp.id, values: request.values, output, model })
    })
  })
  handle('apps:setModel', (id: string, model: string | null) => db.setAppModel(id, model))
  handle('apps:runs', (appId: string) => db.listRuns(appId))
  handle('apps:removeRun', (id: string) => db.deleteRun(id))
  handle('apps:toConversation', (runId: string) => {
    const run = db.getRun(runId)
    const miniApp = run ? db.getApp(run.appId) : null
    if (!run || !miniApp) throw new Error(L().main.apps.runNotFound)
    const conversation = db.createConversation(db.getSettings().defaultModel)
    db.renameConversation(conversation.id, miniApp.name)
    db.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: [miniApp.name, formatValues(miniApp.fields, run.values)].filter(Boolean).join('\n\n')
    })
    db.addMessage({ conversationId: conversation.id, role: 'assistant', content: run.output, model: run.model })
    return db.getConversation(conversation.id)!
  })
  handle('apps:exportFile', async (id: string) => {
    const miniApp = db.getApp(id)
    if (!miniApp) throw new Error(L().main.apps.notFound)
    const safeName = miniApp.name.replace(/[<>:"/\\|?*]/g, '').trim() || L().main.apps.fallbackFileName
    const result = await dialog.showSaveDialog({
      title: L().main.apps.exportTitle,
      defaultPath: `${safeName}.${EXPORT_EXTENSION}`,
      filters: [{ name: L().main.apps.fileFilter, extensions: [EXPORT_EXTENSION] }]
    })
    if (result.canceled || !result.filePath) return false
    const { name, description, icon, category, prompt, fields } = miniApp
    const payload = { format: EXPORT_FORMAT, version: 1, app: { name, description, icon, category, prompt, fields } }
    await writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return true
  })
  handle('apps:importFile', async () => {
    const result = await dialog.showOpenDialog({
      title: L().main.apps.importTitle,
      properties: ['openFile'],
      filters: [{ name: L().main.apps.fileFilter, extensions: [EXPORT_EXTENSION, 'json'] }]
    })
    const file = result.filePaths[0]
    if (result.canceled || !file) return null
    if ((await stat(file)).size > 1024 * 1024) throw new Error(L().main.apps.importTooLarge)
    let parsed: { format?: unknown; app?: unknown }
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'))
    } catch {
      throw new Error(L().main.apps.importUnreadable)
    }
    if (parsed?.format !== EXPORT_FORMAT) throw new Error(L().main.apps.importWrongFormat)
    return sanitizeDraft(parsed.app)
  })

  handle('studio:improve', (request: ImproveRequest) =>
    jobs.start({ model: atlasOrDefault(request.model), messages: buildImproveMessages(request), temperature: 0.6 })
  )
  handle('studio:buildApp', (prompt: string, model?: string) => buildApp(atlasOrDefault(model), prompt))

  handle('jobs:stop', (jobId: string) => jobs.stop(jobId))

  handle('settings:get', () => db.getSettings())
  handle('settings:set', (patch: Partial<Settings>) => {
    if (patch.lockAfterMinutes !== undefined && !LOCK_MINUTES.includes(patch.lockAfterMinutes)) delete patch.lockAfterMinutes
    if (patch.quickShortcut !== undefined && !SHORTCUT_CHOICES.includes(patch.quickShortcut)) delete patch.quickShortcut
    if (patch.selectionShortcut !== undefined && !SHORTCUT_CHOICES.includes(patch.selectionShortcut)) delete patch.selectionShortcut
    if (patch.slashPrompts !== undefined) {
      patch.slashPrompts = (Array.isArray(patch.slashPrompts) ? patch.slashPrompts : [])
        .filter((p) => p && typeof p.name === 'string' && typeof p.text === 'string' && p.name.trim() && p.text.trim())
        .slice(0, 30)
        .map((p) => ({ name: p.name.trim().slice(0, 40), text: p.text.trim().slice(0, 4000) }))
    }
    const updated = db.setSettings(patch)
    if (patch.language) onLanguageChange(updated.language)
    desktop.settingsChanged(patch)
    return db.getSettings()
  })

  handle('app:version', () => app.getVersion())
  handle('app:isPackaged', () => app.isPackaged)
  handle('app:showMain', () => desktop.showMain())

  // --- Güncellemeyi uygulamanın içinden kurma ---
  let downloadedInstaller: string | null = null
  handle('app:downloadUpdate', async () => {
    const asset = pendingUpdate()
    downloadedInstaller = await downloadUpdate(app.getPath('temp'), (p) => broadcast('app:updateProgress', p))
    // Yeni sürüm ilk açıldığında "neler değişti" gösterilsin diye notlar saklanır.
    if (asset) db.setInternal('whatsNew', JSON.stringify({ version: asset.version, notes: asset.notes } satisfies WhatsNew))
  })
  handle('app:installUpdate', () => {
    if (!downloadedInstaller) throw new Error(L().main.updates.nothingToInstall)
    launchInstaller(downloadedInstaller)
    desktop.quit()
  })
  handle('app:whatsNew', (): WhatsNew | null => {
    const raw = db.getInternal('whatsNew')
    if (!raw) return null
    try {
      const saved = JSON.parse(raw) as WhatsNew
      // Notlar yalnızca o sürüm gerçekten kurulduysa gösterilir.
      return compareVersions(saved.version, app.getVersion()) === 0 && saved.notes ? saved : null
    } catch {
      return null
    }
  })
  handle('app:dismissWhatsNew', () => db.setInternal('whatsNew', null))
  handle('app:dataPath', () => app.getPath('userData'))
  handle('app:checkUpdates', () => checkUpdates(app.getVersion(), recipesVersion(), app.getPath('userData')))
  handle('app:setTitleBarTheme', (dark: boolean) => titleBar(dark))
}
