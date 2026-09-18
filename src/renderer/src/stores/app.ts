import { create } from 'zustand'
import {
  DEFAULT_PERSONA_ID,
  type Conversation,
  type FileApproval,
  type Folder,
  type InstalledModel,
  type LockState,
  type Memory,
  type Message,
  type MiniApp,
  type MiniAppDraft,
  type Persona,
  type Settings,
  type ToolStep
} from '@shared/types'
import { errorText } from '@/lib/format'

/** Ana alanda hangi ekranın gösterildiği */
export type View =
  | { name: 'chat' }
  | { name: 'apps' }
  /** Kod alanı: proje klasörü seçme ekranı */
  | { name: 'code' }
  | { name: 'run'; appId: string }
  /** editId: var olan uygulamayı düzenle. draft: içe aktarılan ya da kopyalanan taslakla başla. */
  | { name: 'studio'; editId?: string; draft?: MiniAppDraft }
  /** personaId verilirse o kişinin öğrenilmiş tarzı gösterilir; verilmezse yeni dosya istenir. */
  | { name: 'whatsapp'; personaId?: string }

interface AppState {
  ready: boolean
  view: View
  apps: MiniApp[]
  personas: Persona[]
  /** Henüz başlamamış yeni sohbet için seçilenler */
  draft: { personaId: string; private: boolean; folderId: string | null; sqlId: string | null }
  /** Atlas'ın erişmesine izin verilen klasörler */
  folders: Folder[]
  /** Cevap yazılırken kullanılan dosya araçları */
  liveSteps: Record<string, ToolStep[]>
  /** Kullanıcının onayını bekleyen dosya işlemleri */
  approvals: Record<string, FileApproval[]>
  /** Sohbetlerde yeni öğrenilen ve kullanıcıya gösterilen bilgiler */
  learned: Record<string, Memory[]>
  settings: Settings | null
  /** Uygulama kilidinin durumu; henüz okunmadıysa null */
  lock: LockState | null
  /** Sohbetin sağındaki belge panelinde açık olan ek; kapalıysa null */
  docId: string | null
  /** Belge panelinden mesaj kutusuna eklenecek alıntı; mesaj kutusu alınca temizler */
  quote: string | null
  openDoc(attachmentId: string | null): void
  conversations: Conversation[]
  /** null: henüz kaydedilmemiş yeni sohbet ekranı */
  activeId: string | null
  messages: Record<string, Message[]>
  /** Cevabı yazılmakta olan sohbetler ve o ana kadar gelen metin */
  streaming: Record<string, string>
  /** Cevap yazılırken modelin düşüncesi (yalnızca o cevap boyunca gösterilir) */
  thoughts: Record<string, string>
  /** Çalışan komutun canlı terminal çıktısı (komut bitince adımın içine geçer) */
  liveTerminal: Record<string, { command: string; output: string }>
  /** "Bu sohbette hep izin ver" denmiş sohbetler */
  trusted: Record<string, boolean>
  revokeTrust(conversationId: string): Promise<void>
  /** Bir cevaptaki dosya değişikliklerini geri alır */
  undo(messageId: string): Promise<number>
  errors: Record<string, string>
  installed: InstalledModel[]

  init(): Promise<void>
  go(view: View): void
  loadApps(): Promise<void>
  loadPersonas(): Promise<void>
  loadFolders(): Promise<void>
  /** Açık sohbete (ya da henüz başlamamış yeni sohbete) klasör bağlar; null bağlantıyı kaldırır. */
  attachFolder(folderId: string | null): Promise<void>
  /** Kod alanında sağda görüntülenen dosya */
  codeFile: { folderId: string; path: string } | null
  /** Proje dosya ağacı açık mı */
  filesOpen: boolean
  openCodeFile(file: { folderId: string; path: string } | null): void
  setFilesOpen(open: boolean): void
  /** Seçilen proje klasöründe Atlas Code ile yeni bir geliştirme sohbeti başlatır */
  startCode(folderId: string): Promise<void>
  /** Açık sohbete (ya da yeni sohbet taslağına) veritabanı bağlar; null bağlantıyı keser */
  attachSql(sqlId: string | null): Promise<void>
  respondApproval(approval: FileApproval, approved: boolean, remember?: boolean): Promise<void>
  setDraft(patch: Partial<AppState['draft']>): void
  /** Öğrenilen bilgiyi hafızadan siler. */
  forget(conversationId: string, memoryId: string): Promise<void>
  dismissLearned(conversationId: string): void
  saveSettings(patch: Partial<Settings>): Promise<void>
  refreshInstalled(): Promise<void>
  refreshConversations(): Promise<void>
  select(id: string | null): Promise<void>
  /** Mesajı gönderir; mesaj kaydedildiyse true döner (gönderilemeyen metin mesaj kutusunda kalır). */
  send(text: string, attachmentIds?: string[]): Promise<boolean>
  stop(): Promise<void>
  regenerate(): Promise<void>
  edit(messageId: string, text: string): Promise<void>
  rename(id: string, title: string): Promise<void>
  setPinned(id: string, pinned: boolean): Promise<void>
  setModel(id: string, model: string): Promise<void>
  remove(id: string): Promise<void>
  clearError(id: string): void
}

/** Kod alanında tercih edilen modeller, sırayla */
const CODE_MODEL_ORDER = [/(?:^|\/)atlas-code\b/, /(?:^|\/)atlas-(?:strong|guclu)\b/, /(?:^|\/)atlas-(?:medium|orta)\b/]

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record
  return rest
}

let subscribed = false

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  view: { name: 'chat' },
  apps: [],
  personas: [],
  draft: { personaId: DEFAULT_PERSONA_ID, private: false, folderId: null, sqlId: null },
  folders: [],
  liveSteps: {},
  approvals: {},
  learned: {},
  settings: null,
  conversations: [],
  activeId: null,
  messages: {},
  streaming: {},
  thoughts: {},
  liveTerminal: {},
  trusted: {},

  async revokeTrust(conversationId) {
    await window.api.folders.revokeTrust(conversationId)
    set((s) => ({ trusted: without(s.trusted, conversationId) }))
  },

  async undo(messageId) {
    const restored = await window.api.folders.undo(messageId)
    // Mesajın "geri al" düğmesi kaybolsun diye sayaç sıfırlanır.
    set((s) => {
      const next: typeof s.messages = {}
      for (const [id, list] of Object.entries(s.messages)) next[id] = list.map((m) => (m.id === messageId ? { ...m, undoCount: 0 } : m))
      return { messages: next }
    })
    return restored
  },
  errors: {},
  installed: [],
  lock: null,
  docId: null,
  quote: null,

  openDoc(attachmentId) {
    set({ docId: attachmentId })
  },

  async init() {
    if (!subscribed) {
      subscribed = true
      window.api.chat.onChunk(({ conversationId, delta }) =>
        set((s) => ({ streaming: { ...s.streaming, [conversationId]: (s.streaming[conversationId] ?? '') + delta } }))
      )
      window.api.chat.onThinking(({ conversationId, delta }) =>
        set((s) => ({ thoughts: { ...s.thoughts, [conversationId]: (s.thoughts[conversationId] ?? '') + delta } }))
      )
      window.api.folders.onCommandOutput(({ conversationId, command, chunk }) =>
        set((s) => {
          const current = s.liveTerminal[conversationId]
          const output = (current && current.command === command ? current.output : '') + chunk
          // Ekranda en çok son 20 bin karakter tutulur.
          return { liveTerminal: { ...s.liveTerminal, [conversationId]: { command, output: output.slice(-20_000) } } }
        })
      )
      window.api.chat.onStep(({ conversationId, step }) =>
        set((s) => ({
          liveTerminal: without(s.liveTerminal, conversationId),
          liveSteps: { ...s.liveSteps, [conversationId]: [...(s.liveSteps[conversationId] ?? []), step] },
          // Araçtan önce yazılan ara metin atılır; asıl cevap araçlardan sonra gelir.
          streaming: conversationId in s.streaming ? { ...s.streaming, [conversationId]: '' } : s.streaming
        }))
      )
      window.api.folders.onApproval((approval) =>
        set((s) => ({
          approvals: {
            ...s.approvals,
            [approval.conversationId]: [...(s.approvals[approval.conversationId] ?? []), approval]
          }
        }))
      )
      window.api.chat.onDone(({ conversationId, message }) => {
        set((s) => ({
          liveSteps: without(s.liveSteps, conversationId),
          approvals: without(s.approvals, conversationId),
          streaming: without(s.streaming, conversationId),
          thoughts: without(s.thoughts, conversationId),
          liveTerminal: without(s.liveTerminal, conversationId),
          messages: { ...s.messages, [conversationId]: [...(s.messages[conversationId] ?? []), message] }
        }))
        void get().refreshConversations()
      })
      window.api.chat.onError(({ conversationId, error, message }) => {
        set((s) => ({
          liveSteps: without(s.liveSteps, conversationId),
          approvals: without(s.approvals, conversationId),
          streaming: without(s.streaming, conversationId),
          thoughts: without(s.thoughts, conversationId),
          liveTerminal: without(s.liveTerminal, conversationId),
          errors: error ? { ...s.errors, [conversationId]: error } : s.errors,
          messages: message
            ? { ...s.messages, [conversationId]: [...(s.messages[conversationId] ?? []), message] }
            : s.messages
        }))
      })
      window.api.memory.onLearned(({ conversationId, memories }) =>
        set((s) => ({ learned: { ...s.learned, [conversationId]: [...(s.learned[conversationId] ?? []), ...memories] } }))
      )
      window.api.conversations.onUpdated((updated) =>
        set((s) => ({ conversations: s.conversations.map((c) => (c.id === updated.id ? updated : c)) }))
      )
    }
    const [settings, conversations] = await Promise.all([window.api.settings.get(), window.api.conversations.list()])
    set({ settings, conversations, ready: true })
    void get().refreshInstalled()
    void get().loadApps()
    void get().loadPersonas()
    void get().loadFolders()
  },

  go(view) {
    set({ view })
  },

  async loadPersonas() {
    try {
      set({ personas: await window.api.personas.list() })
    } catch {
      set({ personas: [] })
    }
  },

  async loadFolders() {
    try {
      set({ folders: await window.api.folders.list() })
    } catch {
      set({ folders: [] })
    }
  },

  async attachFolder(folderId) {
    const id = get().activeId
    if (!id) {
      set((s) => ({ draft: { ...s.draft, folderId } }))
      return
    }
    await window.api.conversations.setFolder(id, folderId)
    await get().refreshConversations()
  },

  codeFile: null,
  filesOpen: false,

  openCodeFile(file) {
    // Dosya görüntüleyici ile belge paneli aynı yeri kullanır; dosya açılınca belge paneli kapanır.
    set(file ? { codeFile: file, docId: null } : { codeFile: null })
  },

  setFilesOpen(open) {
    set({ filesOpen: open })
  },

  async startCode(folderId) {
    const created = await window.api.conversations.create({ personaId: 'builtin:yazilim', private: false, folderId, sqlId: null })
    // Atlas Code kuruluysa bu sohbet onunla çalışır; yoksa Strong, o da yoksa Medium; hiçbiri yoksa varsayılan model.
    // Adlar yayımlanmış ("kadirify/atlas-code") ya da yerel ("atlas-code-agirlik:tur1") olabilir.
    const names = get().installed.map((m) => m.name)
    const codeModel = CODE_MODEL_ORDER.map((pattern) => names.find((n) => pattern.test(n))).find(Boolean)
    if (codeModel) await window.api.conversations.setModel(created.id, codeModel)
    await get().refreshConversations()
    set({ filesOpen: true, codeFile: null })
    await get().select(created.id)
  },

  async attachSql(sqlId) {
    const id = get().activeId
    if (!id) {
      set((s) => ({ draft: { ...s.draft, sqlId } }))
      return
    }
    await window.api.conversations.setSql(id, sqlId)
    await get().refreshConversations()
  },

  async respondApproval(approval, approved, remember = false) {
    set((s) => ({
      approvals: {
        ...s.approvals,
        [approval.conversationId]: (s.approvals[approval.conversationId] ?? []).filter((a) => a.id !== approval.id)
      }
    }))
    await window.api.folders.respond(approval.id, approved, remember)
    if (approved && remember && approval.kind !== 'command') set((s) => ({ trusted: { ...s.trusted, [approval.conversationId]: true } }))
  },

  setDraft(patch) {
    set((s) => ({ draft: { ...s.draft, ...patch } }))
  },

  async forget(conversationId, memoryId) {
    await window.api.memory.remove(memoryId)
    set((s) => ({
      learned: { ...s.learned, [conversationId]: (s.learned[conversationId] ?? []).filter((m) => m.id !== memoryId) }
    }))
  },

  dismissLearned(conversationId) {
    set((s) => ({ learned: without(s.learned, conversationId) }))
  },

  async loadApps() {
    try {
      set({ apps: await window.api.apps.list() })
    } catch {
      set({ apps: [] })
    }
  },

  async saveSettings(patch) {
    set({ settings: await window.api.settings.set(patch) })
    // Kurumsal kullanım değişince görünen hazır uygulamalar da değişir.
    if ('corporateMode' in patch || 'language' in patch) await get().loadApps()
    // Hazır kişiliklerin adları dile göre değişir.
    if ('language' in patch) await get().loadPersonas()
    // Model adları da dile göre değişir (Atlas Orta / Atlas Medium).
    if ('language' in patch) await get().refreshInstalled()
  },

  async refreshInstalled() {
    try {
      const installed = await window.api.models.installed()
      // Varsayılan model kurulu değilse ana süreç onu kurulu bir Atlas modeline çevirir.
      set({ installed, settings: await window.api.settings.get() })
    } catch {
      set({ installed: [] })
    }
  },

  async refreshConversations() {
    set({ conversations: await window.api.conversations.list() })
  },

  async select(id) {
    // Belge paneli sohbete aittir; başka sohbete geçince kapanır.
    set({ activeId: id, view: { name: 'chat' }, docId: get().activeId === id ? get().docId : null, codeFile: get().activeId === id ? get().codeFile : null })
    if (id && !get().messages[id]) {
      const list = await window.api.conversations.messages(id)
      set((s) => ({ messages: { ...s.messages, [id]: list } }))
    }
  },

  async send(text, attachmentIds = []) {
    let id = get().activeId
    try {
      if (!id) {
        const created = await window.api.conversations.create(get().draft)
        id = created.id
        set((s) => ({
          conversations: [created, ...s.conversations],
          activeId: created.id,
          messages: { ...s.messages, [created.id]: [] },
          // Bir sonraki yeni sohbet yine varsayılanlarla başlar.
          draft: { personaId: DEFAULT_PERSONA_ID, private: false, folderId: null, sqlId: null }
        }))
      }
      const conversationId = id
      set((s) => ({ errors: without(s.errors, conversationId), streaming: { ...s.streaming, [conversationId]: '' } }))
      const message = await window.api.chat.send(conversationId, text, attachmentIds)
      set((s) => ({ messages: { ...s.messages, [conversationId]: [...(s.messages[conversationId] ?? []), message] } }))
      void get().refreshConversations()
      return true
    } catch (err) {
      if (!id) throw err
      const conversationId = id
      set((s) => ({
        streaming: without(s.streaming, conversationId),
        errors: { ...s.errors, [conversationId]: errorText(err) }
      }))
      return false
    }
  },

  async stop() {
    const id = get().activeId
    if (id) await window.api.chat.stop(id)
  },

  async regenerate() {
    const id = get().activeId
    if (!id) return
    const list = get().messages[id] ?? []
    const trimmed = list.at(-1)?.role === 'assistant' ? list.slice(0, -1) : list
    set((s) => ({
      errors: without(s.errors, id),
      streaming: { ...s.streaming, [id]: '' },
      messages: { ...s.messages, [id]: trimmed }
    }))
    try {
      await window.api.chat.regenerate(id)
    } catch (err) {
      set((s) => ({ streaming: without(s.streaming, id), errors: { ...s.errors, [id]: errorText(err) } }))
    }
  },

  async edit(messageId, text) {
    const id = get().activeId
    if (!id) return
    const list = get().messages[id] ?? []
    const index = list.findIndex((m) => m.id === messageId)
    if (index < 0) return
    set((s) => ({ errors: without(s.errors, id), streaming: { ...s.streaming, [id]: '' } }))
    try {
      const message = await window.api.chat.edit(messageId, text)
      set((s) => ({ messages: { ...s.messages, [id]: [...list.slice(0, index), message] } }))
    } catch (err) {
      set((s) => ({ streaming: without(s.streaming, id), errors: { ...s.errors, [id]: errorText(err) } }))
    }
  },

  async rename(id, title) {
    await window.api.conversations.rename(id, title)
    await get().refreshConversations()
  },

  async setPinned(id, pinned) {
    await window.api.conversations.setPinned(id, pinned)
    await get().refreshConversations()
  },

  async setModel(id, model) {
    await window.api.conversations.setModel(id, model)
    await get().refreshConversations()
  },

  async remove(id) {
    await window.api.conversations.remove(id)
    set((s) => ({
      activeId: s.activeId === id ? null : s.activeId,
      // Silinen sohbetin belge paneli ve dosya görüntüleyicisi açık kalmasın.
      docId: s.activeId === id ? null : s.docId,
      codeFile: s.activeId === id ? null : s.codeFile,
      messages: without(s.messages, id),
      streaming: without(s.streaming, id),
      thoughts: without(s.thoughts, id),
      liveSteps: without(s.liveSteps, id),
      liveTerminal: without(s.liveTerminal, id),
      approvals: without(s.approvals, id),
      learned: without(s.learned, id),
      errors: without(s.errors, id)
    }))
    await get().refreshConversations()
  },

  clearError(id) {
    set((s) => ({ errors: without(s.errors, id) }))
  }
}))
