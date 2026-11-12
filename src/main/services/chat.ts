import type {
  ChatChunk,
  ChatDone,
  ChatError,
  Conversation,
  Memory,
  Message,
  Persona,
  Settings,
  ToolStep
} from '@shared/types'
import { ATTACHMENT_CHAR_BUDGET, NEW_CONVERSATION_TITLE, type Db } from '../db'
import { getLanguage, L, locale } from '../i18n'
import { attachmentsBlock } from './attachments'
import { isAtlasModel } from './catalog'
import { loopNotice, PartialError, streamGuarded } from './generate'
import { memoryBlock, type MemoryService } from './memory'
import type { FilesService } from './files'
import { chatOnce, describeError, OllamaError, supportsTools, supportsVision, type OllamaMessage } from './ollama'
import { addressLine, builtinPersonas, findPersona, personaInstructions } from './personas'
import type { WhatsAppService } from './whatsapp'
import { sqlService } from './sql'
import { toolContextSize } from './hardware'

/** Modele gönderilen geçmişin yaklaşık karakter sınırı (8192 token bağlama sığacak şekilde). */
const HISTORY_CHAR_BUDGET = 18_000

/** Bir cevapta modelin art arda en fazla kaç kez araç kullanabileceği */
const MAX_TOOL_ROUNDS = 12
/** Model araç sonucundan sonra sustuğunda en çok kaç kez "devam et" denir */
const MAX_NUDGES = 3
/** Ollama'nın model çalıştırıcısının çöktüğünü gösteren hata metinleri */
const RUNNER_CRASH = /unexpectedly stopped|llama-server|forcibly closed|zorla kapat|ECONNRESET|socket hang up|EOF/i

/** Cevabın sonunda "şimdi şunu yapıyorum" diye bir işlem duyuruluyor mu (ama araç çağrılmamış) */
const ANNOUNCE =
  /(uyguluyorum|düzeltiyorum|değiştiriyorum|güncelliyorum|kaydediyorum|çalıştırıyorum|oluşturuyorum|yazıyorum|uygulayacağım|düzelteceğim|değiştireceğim|güncelleyeceğim|çalıştıracağım|oluşturacağım|kontrol edeceğim|i will now|i'll now|i am going to|i'm going to|let me (?:run|write|fix|apply|update|check|create)|i will (?:run|write|fix|apply|update|check|create)|applying (?:the|this)|now (?:run|write|apply|update|fix)\b)/i

/**
 * Cevabın sonunda kullanıcıdan bir inceleme adımı için izin isteniyor mu ("README'yi okuyayım mı?", "Ne dersin?").
 * Okuma ve inceleme için izin gerekmez; değiştiren işlemler zaten onay kartıyla sorulur.
 */
const ASKS_PERMISSION =
  /(ne dersin|ister misin|istersen\b|ı?yım mı|i?yim mi|u?yum mu|ü?yüm mü|ayım mı|eyim mi|edeyim mi|bakayım mı|okuyabilirim|inceleyebilirim|listeleyebilirim|bakabilirim|devam edeyim|onaylıyor musun|izin verir misin|uygun mu\?|shall i\b|should i\b|would you like me to|do you want me to|want me to|i can (?:read|look|check|list|open|go through)|let me know if you(?:'d| would) like)/i

/** Okunmamış dosyalar için tahmin yürütüp işi bırakan cevaplar ("içeriğini görmek için bu klasöre göz atılabilir") */
const LEAVES_WORK =
  /(göz atılabilir|bakılabilir|incelenebilir|okunabilir|açılabilir|içeriklerini görmek için|içeriğini görmek için|daha fazla bilgi için .{0,40}(?:bak|incele)|could (?:also )?(?:look|check|open|read)|can be (?:checked|opened|read|inspected)|to see (?:its|their) contents)/i

export function asksPermission(text: string): boolean {
  return ASKS_PERMISSION.test(text.slice(-300)) || LEAVES_WORK.test(text.slice(-1200))
}

/** Cevapta kod bloklarının içinde toplam bu kadar satır varsa "kod döküldü" sayılır */
const CODE_DUMP_LINES = 8

/** Cevap, dosyaya yazılması gereken bir kodu sohbete mi döküyor */
/** Cevap bir dosyaya yazdığını söylüyor mu ("App.js dosyasına yazdım", "index.html olarak kaydettim") */
const CLAIMS_WRITE =
  /(dosyas[ıi]na[^.\n]{0,60}?(?:yazd[ıi]m|kaydettim|ekledim)|dosyas[ıi]n[ıi][^.\n]{0,40}?(?:oluşturdum|yazd[ıi]m|güncelledim)|olarak kaydettim|dosyalar[ıi] oluşturdum|(?:created|wrote|saved) (?:the )?(?:file|files)|(?:wrote|saved) (?:it|the code) (?:to|into|in))/i

export function claimsWrite(text: string): boolean {
  return CLAIMS_WRITE.test(text)
}

export function dumpsCode(text: string): boolean {
  let lines = 0
  for (const block of text.matchAll(/```[^\n]*\n([\s\S]*?)(?:```|$)/g)) lines += block[1].split('\n').filter((l) => l.trim()).length
  return lines >= CODE_DUMP_LINES
}

export function announcesAction(text: string): boolean {
  return ANNOUNCE.test(text.slice(-500))
}

export interface ChatEvents {
  chunk(c: ChatChunk): void
  done(d: ChatDone): void
  error(e: ChatError): void
  conversationUpdated(c: Conversation): void
  /** Sohbetten kullanıcı hakkında yeni bir bilgi öğrenildi. */
  learned(e: { conversationId: string; memories: Memory[] }): void
  /** Model bir dosya aracı kullandı. */
  step(e: { conversationId: string; step: ToolStep }): void
  /** Model düşünürken düşüncesinin bir parçası */
  thinking(c: ChatChunk): void
}

/** Kullanıcının kim olduğunu modele anlatan satır; bilgi yoksa boş döner. */
export function describeUser(settings: Pick<Settings, 'userName' | 'corporateMode' | 'company' | 'jobTitle'>): string {
  const t = L().prompts.chat
  const about = [
    settings.userName && t.userName(settings.userName),
    settings.corporateMode && settings.jobTitle && t.userTitle(settings.jobTitle),
    settings.corporateMode && settings.company && t.userCompany(settings.company)
  ].filter((part): part is string => Boolean(part))
  return about.length > 0 ? t.userAbout(about) : ''
}

export function todayLine(now = new Date()): string {
  return L().prompts.chat.today(
    now.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
  )
}

export interface PromptExtras {
  /** Verilmezse varsayılan Atlas kişiliği kullanılır. */
  persona?: Persona
  /** Bu mesajla ilgili hatırlananlar */
  memories?: Memory[]
  /** Bağlama sığmayan eski mesajların özeti */
  summary?: string
  /** WhatsApp'tan öğrenilen kişilerde: yazım kuralları ve gerçek mesaj örnekleri */
  styleBlock?: string
}

export function buildSystemPrompt(
  settings: Pick<Settings, 'userName' | 'corporateMode' | 'company' | 'jobTitle'> & Partial<Pick<Settings, 'addressUser'>>,
  now = new Date(),
  extras: PromptExtras = {}
): string {
  const t = L().prompts.chat
  const persona = extras.persona ?? builtinPersonas(getLanguage())[0]
  return [
    personaInstructions(persona),
    extras.styleBlock ?? '',
    t.answerLanguage,
    t.noFabrication,
    t.attachmentsNote,
    addressLine(persona, settings.addressUser),
    todayLine(now),
    describeUser(settings),
    memoryBlock(extras.memories ?? []),
    extras.summary ? t.earlierSummary(extras.summary) : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** En yeni mesajlardan geriye doğru, bütçeye sığdığı kadarını alır. Son mesaj her zaman dahildir. */
export function trimHistory<T extends { role: string; content: string }>(
  messages: T[],
  budget = HISTORY_CHAR_BUDGET
): T[] {
  const kept: T[] = []
  let used = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'system') continue
    if (kept.length > 0 && used + m.content.length > budget) break
    kept.unshift(m)
    used += m.content.length
  }
  // Model geçmişin bir asistan cevabıyla başlamasını beklemez.
  while (kept.length > 1 && kept[0].role === 'assistant') kept.shift()
  return kept
}

export function cleanTitle(raw: string): string {
  const firstLine = raw.split('\n').find((l) => l.trim()) ?? ''
  const cleaned = firstLine
    .replace(/^(başlık|title)\s*:\s*/i, '')
    .replace(/^[\s"'“”‘’«»*#`[(-]+|[\s"'“”‘’«»*#`.\])]+$/g, '')
    .trim()
  // Küçük modeller başlık yerine cümle yazabiliyor; ilk birkaç kelime yeter.
  const words = cleaned.split(/\s+/)
  const short = words.length > 7 ? words.slice(0, 7).join(' ') + '…' : cleaned
  return short.length > 60 ? short.slice(0, 57).trimEnd() + '…' : short
}

function fallbackTitle(userText: string): string {
  const oneLine = userText.replace(/\s+/g, ' ').trim()
  return oneLine.length > 40 ? oneLine.slice(0, 40).trimEnd() + '…' : oneLine
}

/** Özetlenecek mesajları tek metin haline getirir; uzun mesajlar kırpılır. */
export function transcript(messages: Pick<Message, 'role' | 'content'>[], limit = 10_000): string {
  const t = L().prompts.chat
  const lines = messages.map((m) => `${m.role === 'user' ? t.roleUser : t.roleAssistant}: ${m.content.slice(0, 1500)}`)
  return lines.join('\n\n').slice(0, limit)
}

export class ChatService {
  private active = new Map<string, AbortController>()

  constructor(
    private db: Db,
    private events: ChatEvents,
    private memory: MemoryService,
    private whatsapp: WhatsAppService,
    private files: FilesService
  ) {}

  private modelFor(conversation: Conversation): string {
    // Eski sohbetlerde Atlas dışı bir model kayıtlı olabilir; o zaman varsayılana düşülür.
    const model = [conversation.model, this.db.getSettings().defaultModel].find(isAtlasModel)
    if (!model) throw new OllamaError(L().prompts.chat.errors.noModel)
    return model
  }

  private conversation(id: string): Conversation {
    const c = this.db.getConversation(id)
    if (!c) throw new Error(L().prompts.chat.errors.conversationNotFound)
    return c
  }

  isBusy(conversationId: string): boolean {
    return this.active.has(conversationId)
  }

  /** Kullanıcı mesajını (ve varsa eklerini) kaydeder, cevabı arka planda üretmeye başlar. */
  send(conversationId: string, content: string, attachmentIds: string[] = []): Message {
    const text = content.trim()
    if (!text && attachmentIds.length === 0) throw new Error(L().prompts.chat.errors.emptyMessage)
    if (this.isBusy(conversationId)) throw new Error(L().prompts.chat.errors.busy)
    this.conversation(conversationId)
    const message = this.db.addMessage({ conversationId, role: 'user', content: text })
    this.db.attachToMessage(attachmentIds, message.id)
    void this.generate(conversationId, true)
    return this.db.getMessage(message.id)!
  }

  /** Son asistan cevabını silip yeniden üretir. */
  regenerate(conversationId: string): void {
    if (this.isBusy(conversationId)) throw new Error(L().prompts.chat.errors.busy)
    const messages = this.db.listMessages(conversationId)
    const last = messages.at(-1)
    if (!last) throw new Error(L().prompts.chat.errors.nothingToRegenerate)
    if (last.role === 'assistant') this.db.deleteFrom(conversationId, last.createdAt)
    // Aynı mesajdan ikinci kez bilgi öğrenmeye çalışılmaz.
    void this.generate(conversationId, false)
  }

  /** Kullanıcı mesajını değiştirir; ondan sonraki her şey silinir ve cevap yeniden üretilir. Ekler korunur. */
  edit(messageId: string, content: string): Message {
    const original = this.db.getMessage(messageId)
    if (!original || original.role !== 'user') throw new Error(L().prompts.chat.errors.editOwnOnly)
    if (this.isBusy(original.conversationId)) throw new Error(L().prompts.chat.errors.busy)
    const text = content.trim()
    if (!text && original.attachments.length === 0) throw new Error(L().prompts.chat.errors.emptyMessage)
    const attachmentIds = this.db.detachFromMessage(original.id)
    this.db.deleteFrom(original.conversationId, original.createdAt)
    const message = this.db.addMessage({ conversationId: original.conversationId, role: 'user', content: text })
    this.db.attachToMessage(attachmentIds, message.id)
    void this.generate(original.conversationId, true)
    return this.db.getMessage(message.id)!
  }

  stop(conversationId: string): void {
    this.active.get(conversationId)?.abort()
  }

  stopAll(): void {
    for (const c of this.active.values()) c.abort()
  }

  /** Geçmişi modelin anlayacağı hale getirir: dosya metinleri mesaja eklenir, resimler ayrı verilir. */
  private async toModelMessages(history: Message[], model: string): Promise<OllamaMessage[]> {
    const vision = await supportsVision(model)
    const lastUser = history.findLast((m) => m.role === 'user')
    if (!vision && lastUser?.attachments.some((a) => a.kind === 'image')) {
      throw new OllamaError(L().prompts.chat.errors.noVision(model))
    }

    return history.map((m) => {
      if (m.attachments.length === 0) return { role: m.role, content: m.content } as OllamaMessage
      const files = this.db.attachmentContents(m.attachments.map((a) => a.id))
      const block = attachmentsBlock(files, ATTACHMENT_CHAR_BUDGET)
      const images = vision ? files.filter((f) => f.kind === 'image' && f.data).map((f) => f.data!) : []
      return {
        role: m.role,
        content: [block, m.content].filter(Boolean).join('\n\n') || L().prompts.chat.lookAtFile,
        ...(images.length > 0 ? { images } : {})
      } as OllamaMessage
    })
  }

  /** learn: bu mesajdan kullanıcı hakkında bilgi öğrenilmeye çalışılsın mı */
  private async generate(conversationId: string, learn: boolean): Promise<void> {
    const controller = new AbortController()
    this.active.set(conversationId, controller)
    const started = Date.now()
    let model: string | null = null
    const steps: ToolStep[] = []

    /** Bu cevap boyunca modelin düşüncesi; cevapla birlikte saklanır */
    let thoughts = ''
    const save = (
      text: string,
      partial: boolean,
      tokens: number | null = null,
      durationMs: number | null = null
    ): Message | null => {
      // Yalnızca araç kullanılıp metin yazılmadıysa da adımlar kaybolmasın.
      if (!text.trim() && steps.length === 0) return null
      return this.db.addMessage({
        conversationId,
        role: 'assistant',
        content: text,
        model,
        tokens,
        durationMs: durationMs ?? Date.now() - started,
        partial,
        steps,
        thinking: thoughts,
        undo: this.files.takeEdits(conversationId)
      })
    }

    try {
      const conversation = this.conversation(conversationId)
      model = this.modelFor(conversation)
      const settings = this.db.getSettings()
      const history = this.db.listMessages(conversationId).filter((m) => m.role !== 'system')
      const all = await this.toModelMessages(history, model)
      // Araçlı sohbetlerde (klasör, veritabanı) bağlam büyük tutulur; geçmiş de buna göre daha uzun kalır.
      const toolSession = Boolean(conversation.folderId || conversation.sqlId)
      const numCtx = toolSession ? await toolContextSize() : undefined
      const kept = trimHistory(all, numCtx && numCtx > 8192 ? Math.round((HISTORY_CHAR_BUDGET * numCtx) / 8192 / 1.5) : HISTORY_CHAR_BUDGET)
      // Bağlama sığmayan baştaki mesajlar; içerikleri özetle temsil edilir.
      const dropped = history.slice(0, all.length - kept.length)

      const lastUser = history.findLast((m) => m.role === 'user')
      const useMemory = settings.memoryEnabled && !conversation.private
      const memories = useMemory && lastUser?.content ? await this.memory.relevant(lastUser.content) : []
      const summary = dropped.length > 0 ? this.db.getSummary(conversationId).summary : ''

      const persona = findPersona(this.db, conversation.personaId)
      const styleBlock = persona.whatsapp ? await this.whatsapp.promptBlock(persona.id, lastUser?.content ?? '') : ''

      // Sohbete klasör bağlıysa model dosya araçlarını kullanabilir.
      const folder = conversation.folderId ? this.db.getFolder(conversation.folderId) : null
      let tools: unknown[] | undefined
      let canWrite = false
      if (folder) {
        const capability = await this.files.capability()
        if (!capability.read) throw new OllamaError(capability.reason)
        if (!(await supportsTools(model))) {
          throw new OllamaError(L().prompts.chat.errors.noTools(model))
        }
        canWrite = capability.write
        tools = this.files.toolDefs(canWrite)
      }
      // Sohbete veritabanı bağlıysa model şemaya bakabilir ve sorgu çalıştırabilir (yazanlar onayla, silenler hiç).
      const sql = sqlService()
      const connection = sql.get(conversation.sqlId)
      if (connection) {
        if (!(await supportsTools(model))) throw new OllamaError(L().prompts.chat.errors.noTools(model))
        tools = [...(tools ?? []), ...sql.toolDefs()]
      }

      const messages: OllamaMessage[] = [
        {
          role: 'system',
          content: [
            buildSystemPrompt(settings, new Date(), { persona, memories, summary, styleBlock }),
            folder ? await this.files.promptBlock(folder, canWrite) : '',
            connection ? await sql.promptBlock(connection) : ''
          ]
            .filter(Boolean)
            .join('\n\n')
        },
        ...kept
      ]

      // Düşünme kullanıcının seçimidir (mesaj kutusundaki "Düşün" düğmesi).
      const think = settings.think === true
      const onThinking = (delta: string): void => {
        thoughts += delta
        this.events.thinking({ conversationId, delta })
      }
      const streamModel: string = model
      /**
       * Ollama'nın model çalıştırıcısı uzun araçlı oturumlarda ara sıra çöküyor (önbellek ve taslak hızlandırmayla ilgili
       * bir hata). Çalıştırıcı kendiliğinden yeniden başlar; cevap henüz yazılmaya başlamadıysa istek bir kez daha denenir.
       */
      const guarded = async (withTools: boolean): ReturnType<typeof streamGuarded> => {
        const once = (): ReturnType<typeof streamGuarded> =>
          streamGuarded({ model: streamModel, messages, tools: withTools ? tools : undefined, think, onThinking, numCtx }, controller, (delta) =>
            this.events.chunk({ conversationId, delta })
          )
        try {
          return await once()
        } catch (err) {
          const partial = err instanceof PartialError ? err.partial : ''
          const message = err instanceof Error ? err.message : String(err)
          if (partial || controller.signal.aborted || !RUNNER_CRASH.test(message)) throw err
          await new Promise((resolve) => setTimeout(resolve, 1500))
          return once()
        }
      }
      let result = await guarded(true)
      let nudges = 0
      /** Dürtmeden önce yazılmış ve kaybolmaması gereken metin (modelin tanısı gibi) */
      let carry = ''
      const stream = guarded
      /**
       * Yerel modeller iki biçimde yarıda kalır: araç sonucundan sonra hiçbir şey yazmaz ya da "şimdi düzeltiyorum"
       * deyip aracı çağırmadan durur. İkisinde de model birkaç kez, ne yapması gerektiği söylenerek yeniden çağrılır.
       */
      const nudge = async (): Promise<void> => {
        while (tools && !result.looped && (result.stats.toolCalls?.length ?? 0) === 0 && nudges < MAX_NUDGES) {
          const silent = !result.text.trim()
          const asking = !silent && asksPermission(result.text)
          // Klasöre yazma izni varken kodu sohbete döküp dosya oluşturmayan cevap: kod dosyalara yazılmalı.
          const wroteNothing = !steps.some((s) => s.tool === 'write_file' && s.status === 'ok')
          const dumping = !silent && !!folder && canWrite && wroteNothing && (dumpsCode(result.text) || claimsWrite(result.text))
          if (silent ? steps.length === 0 : !announcesAction(result.text) && !asking && !dumping) return
          nudges++
          if (dumping) {
            // Sohbete dökülen kod modele geri verilir (dosyaya yazarken kullansın) ama cevapta tekrar gösterilmez.
            messages.push({ role: 'assistant', content: result.text })
            this.events.chunk({ conversationId, delta: '\n\n' })
          } else if (!silent) {
            carry += `${result.text.trim()}\n\n`
            messages.push({ role: 'assistant', content: result.text })
            this.events.chunk({ conversationId, delta: '\n\n' })
          }
          messages.push({
            role: 'user',
            content: dumping
              ? L().prompts.chat.codeToFiles
              : silent
                ? L().prompts.chat.continueAfterTools
                : asking
                  ? L().prompts.chat.dontAsk
                  : L().prompts.chat.actDontTell
          })
          result = await stream(true)
        }
      }
      await nudge()
      // Model araç istedikçe çalıştır, sonucunu ver ve devam ettir.
      for (let round = 0; (folder || connection) && (result.stats.toolCalls?.length ?? 0) > 0 && !result.looped; round++) {
        const calls = result.stats.toolCalls!
        messages.push({ role: 'assistant', content: result.text, tool_calls: calls.map((c) => ({ function: c })) })
        for (const call of calls) {
          const outcome =
            connection && sql.isSqlTool(call.name)
              ? await sql.execute(conversationId, connection.id, call, controller.signal)
              : folder
                ? await this.files.execute(conversationId, folder, call, controller.signal, canWrite)
                : { step: { id: call.name, tool: call.name, label: call.name, status: 'error' as const }, result: L().tools.sql.result.unknownTool(call.name) }
          steps.push(outcome.step)
          this.events.step({ conversationId, step: outcome.step })
          messages.push({ role: 'tool', tool_name: call.name, content: outcome.result })
        }
        if (controller.signal.aborted) throw new PartialError(new Error('durduruldu'), '')
        // Sınıra gelindiyse son turda araç verilmez; model elindekiyle cevap yazar.
        const last = round + 1 >= MAX_TOOL_ROUNDS
        if (last) messages.push({ role: 'user', content: L().prompts.chat.toolLimit })
        result = await stream(!last)
        if (last) break
        await nudge()
      }
      if (carry) result = { ...result, text: carry + result.text }
      this.active.delete(conversationId)

      if (result.looped) {
        this.events.error({ conversationId, error: loopNotice(), message: save(result.text, true) })
        return
      }
      const message = save(result.text, result.stats.truncated, result.stats.tokens, result.stats.durationMs)
      if (!message) throw new OllamaError(L().prompts.chat.errors.emptyReply)
      this.events.done({ conversationId, message })

      void this.afterReply({
        conversation,
        model,
        history,
        reply: result.text,
        dropped,
        learnFrom: learn && useMemory ? (lastUser?.content ?? '') : ''
      })
    } catch (err) {
      this.active.delete(conversationId)
      const partial = err instanceof PartialError ? err.partial : ''
      const cause = err instanceof PartialError ? err.original : err
      if (controller.signal.aborted) {
        // Kullanıcı durdurdu: yazılan kısım kalır, hata gösterilmez.
        const message = save(partial, true)
        if (message) this.events.done({ conversationId, message })
        else this.events.error({ conversationId, error: '', message: null })
        return
      }
      this.events.error({ conversationId, error: describeError(cause), message: save(partial, true) })
    }
  }

  /**
   * Cevaptan sonra arka planda yapılan işler. Model aynı anda tek iş yaptığı için sırayla çalışır;
   * hiçbiri kullanıcıyı bekletmez ve hiçbirinin hatası sohbeti etkilemez.
   */
  private async afterReply(job: {
    conversation: Conversation
    model: string
    history: Message[]
    reply: string
    dropped: Message[]
    learnFrom: string
  }): Promise<void> {
    const { conversation, model } = job
    if (conversation.title === NEW_CONVERSATION_TITLE) {
      await this.generateTitle(conversation.id, model, job.history, job.reply)
    }
    if (job.learnFrom) {
      const memories = await this.memory.learn(conversation.id, model, job.learnFrom)
      if (memories.length > 0) this.events.learned({ conversationId: conversation.id, memories })
    }
    await this.summarize(conversation.id, model, job.dropped)
  }

  /** Bağlama sığmayan mesajları özetler; bir sonraki cevapta bu özet kullanılır. */
  private async summarize(conversationId: string, model: string, dropped: Message[]): Promise<void> {
    const last = dropped.at(-1)
    if (!last) return
    const { summary, upto } = this.db.getSummary(conversationId)
    if (last.createdAt <= upto) return
    const fresh = dropped.filter((m) => m.createdAt > upto)
    try {
      const text = await chatOnce({
        model,
        numPredict: 400,
        messages: [
          { role: 'system', content: L().prompts.chat.summarySystem },
          { role: 'user', content: L().prompts.chat.summaryRequest(summary, transcript(fresh)) }
        ]
      })
      if (text) this.db.setSummary(conversationId, text, last.createdAt)
    } catch {
      // Özet çıkarılamazsa eski mesajlar bu cevap için bağlam dışında kalır; sonraki cevapta yeniden denenir.
    }
  }

  private async generateTitle(
    conversationId: string,
    model: string,
    history: Message[],
    reply: string
  ): Promise<void> {
    const first = history.find((m) => m.role === 'user')
    const firstUser = first?.content || first?.attachments.map((a) => a.name).join(', ') || ''
    let title = ''
    try {
      title = cleanTitle(
        await chatOnce({
          model,
          numPredict: 32,
          messages: [
            { role: 'system', content: L().prompts.chat.titleSystem },
            { role: 'user', content: L().prompts.chat.titleRequest(firstUser.slice(0, 600), reply.slice(0, 600)) }
          ]
        })
      )
    } catch {
      // Başlık üretilemezse ilk mesajdan türetilir.
    }
    const current = this.db.getConversation(conversationId)
    // Kullanıcı bu arada kendisi adlandırdıysa dokunma.
    if (!current || current.title !== NEW_CONVERSATION_TITLE) return
    this.db.renameConversation(conversationId, title || fallbackTitle(firstUser))
    const updated = this.db.getConversation(conversationId)
    if (updated) this.events.conversationUpdated(updated)
  }
}
