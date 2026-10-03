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
import { chatOnce, describeError, OllamaError, supportsTools, supportsVision, type OllamaMessage, type ToolCall } from './ollama'
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
const RUNNER_CRASH =
  /unexpectedly stopped|llama-server|forcibly closed|zorla kapat|ECONNRESET|socket hang up|EOF|bad_alloc|0xc0000409|GGML_ASSERT|fetch failed|status(?: code)? 5\d\d|HTTP 5\d\d/i
/** Çöken çalıştırıcı için en çok kaç kez yeniden denenir (aralar giderek uzar) */
const CRASH_RETRIES = 2
/** Klasörde bir şeyi değiştiren araçlar; biri başarılıysa model iş yapmış sayılır */
const CHANGE_TOOLS = new Set(['write_file', 'edit_file', 'move_file', 'create_folder'])
/** Yalnızca plan güncelleyen turlar araç sınırından düşmez; ama en çok bu kadar */
const MAX_PLAN_ONLY_ROUNDS = 4

/** Metindeki dengeli { ... } bloklarını (iç içe ve tırnak içi süslü parantezlere dikkat ederek) sırayla verir. */
function* jsonObjects(text: string): Generator<string> {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let quoted = false
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (quoted) {
        if (c === '\\') i++
        else if (c === '"') quoted = false
      } else if (c === '"') quoted = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        yield text.slice(start, i + 1)
        start = i
        break
      }
    }
  }
}

function argValue(raw: string): unknown {
  const value = raw.trim()
  if (/^(["']).*\1$/s.test(value)) return value.slice(1, -1).replace(/\\(["'\\])/g, '$1')
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  if (value === 'true' || value === 'false') return value === 'true'
  return value
}

/**
 * Bazı modeller (özellikle araç verisiyle eğitilmemiş olanlar) aracı gerçek araç çağrısı yerine metin olarak yazar:
 * {"name": "run_command", "arguments": {...}}, <tool_call>...</tool_call> ya da tek satırda list_folder(path=".").
 * Ad bilinen bir araçsa gerçek çağrıya çevrilir; yoksa iş orada kalıyordu. Dosya içeriği gibi başka JSON'lara dokunulmaz.
 */
export function extractTextToolCalls(text: string, names: Set<string>): { calls: ToolCall[]; rest: string } {
  const calls: ToolCall[] = []
  let rest = text
  for (const span of jsonObjects(text)) {
    let value: unknown
    try {
      value = JSON.parse(span)
    } catch {
      continue
    }
    const found: ToolCall[] = []
    for (const item of Array.isArray(value) ? value : [value]) {
      const o = (item ?? {}) as { name?: unknown; arguments?: unknown; parameters?: unknown; function?: { name?: unknown; arguments?: unknown } }
      const name = typeof o.name === 'string' ? o.name : typeof o.function?.name === 'string' ? o.function.name : ''
      let args: unknown = o.arguments ?? o.parameters ?? o.function?.arguments ?? {}
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args)
        } catch {
          args = null
        }
      }
      if (!names.has(name) || !args || typeof args !== 'object' || Array.isArray(args)) break
      found.push({ name, arguments: args as Record<string, unknown> })
    }
    if (found.length === 0) continue
    calls.push(...found)
    rest = rest.replace(span, '')
  }
  if (calls.length === 0) {
    // Tek satırda tek başına duran Python biçimi çağrı: list_folder(path=".")
    for (const m of text.matchAll(/^[ \t>*-]*`{0,3}([a-z_]+)\(([^()\n]*)\)`{0,3}[ \t]*$/gm)) {
      if (!names.has(m[1])) continue
      const args: Record<string, unknown> = {}
      for (const a of m[2].matchAll(/(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,\s]+)/g)) args[a[1]] = argValue(a[2])
      calls.push({ name: m[1], arguments: args })
      rest = rest.replace(m[0], '')
    }
  }
  if (calls.length > 0) {
    rest = rest
      .replace(/<\/?tool_call>/g, '')
      .replace(/```[a-z]*\s*```/gi, '')
      .trim()
  }
  return { calls, rest }
}

/** Araç tanımlarındaki adlar */
function toolNames(tools: unknown[]): Set<string> {
  return new Set(tools.map((t) => (t as { function?: { name?: string } })?.function?.name).filter((n): n is string => !!n))
}

/** JavaScript'in büyük-küçük harf duyarsız araması "İ"yi "i" saymaz ("İstersen..." kaçmasın). */
function fold(text: string): string {
  return text.replace(/İ/g, 'i')
}

/**
 * Araç turlarında bağlam taşmasın: toplam metin sınırı aşınca eski araç sonuçları kısaltılır. Son turun sonuçları
 * (keepFrom'dan sonrası) ve kullanıcının ilk isteği olduğu gibi kalır; model gerekirse aracı yeniden çağırır.
 */
export function compactToolResults(messages: OllamaMessage[], budget: number, keepFrom: number, note: string): number {
  let total = messages.reduce((n, m) => n + m.content.length, 0)
  let trimmed = 0
  for (let i = 0; i < keepFrom && total > budget; i++) {
    const m = messages[i]
    if (m.role !== 'tool' || m.content.length <= 500) continue
    const short = `${m.content.slice(0, 300)}\n… ${note}`
    total -= m.content.length - short.length
    messages[i] = { ...m, content: short }
    trimmed++
  }
  return trimmed
}

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
  const folded = fold(text)
  return ASKS_PERMISSION.test(folded.slice(-300)) || LEAVES_WORK.test(folded.slice(-1200))
}

/** Cevapta kod bloklarının içinde toplam bu kadar satır varsa "kod döküldü" sayılır */
const CODE_DUMP_LINES = 8

/** Cevap, dosyaya yazılması gereken bir kodu sohbete mi döküyor */
/** Cevap bir dosyaya yazdığını söylüyor mu ("App.js dosyasına yazdım", "index.html olarak kaydettim") */
const CLAIMS_WRITE =
  /(dosyas[ıi]na[^.\n]{0,60}?(?:yazd[ıi]m|kaydettim|ekledim|yaz[ıi]ld[ıi]|kaydedildi|eklendi)|dosyas[ıi]n[ıi][^.\n]{0,40}?(?:oluşturdum|yazd[ıi]m|güncelledim)|dosyas[ıi] (?:[^.\n]{0,40}?)(?:oluşturuldu|güncellendi|düzenlendi|değiştirildi)|olarak kaydettim|olarak kaydedildi|dosyalar[ıi] oluşturdum|dosyalar[ıi]? oluşturuldu|(?:created|wrote|saved) (?:the )?(?:file|files)|(?:wrote|saved) (?:it|the code) (?:to|into|in))/i

export function claimsWrite(text: string): boolean {
  return CLAIMS_WRITE.test(fold(text))
}

/** Bir değişikliği yaptığını söyleyen ifadeler (dosya ya da veritabanı; etken ve edilgen) */
const CLAIMS_CHANGE =
  /(eklendi|ekledim|yaz[ıi]ld[ıi]|yazd[ıi]m|kaydedildi|kaydettim|güncellendi|güncelledim|değiştirildi|değiştirdim|düzenlendi|düzenledim|düzeltildi|düzelttim|kald[ıi]r[ıi]ld[ıi]|kald[ıi]rd[ıi]m|haline getirdim|haline getirildi|oluşturuldu|oluşturdum|has been (?:added|updated|saved|written|changed|created)|i (?:added|updated|saved|wrote|changed|created))/i

/** Cevap bir değişikliği yaptığını söylüyor mu (kullanıcı reddettiği halde "eklendi" demeyi yakalamak için) */
export function claimsChange(text: string): boolean {
  return CLAIMS_CHANGE.test(fold(text))
}

/** Kullanıcı yalnızca sorgunun metnini mi istiyor ("UPDATE sorgusunu yaz", "nasıl yazarım") */
const WANTS_QUERY_TEXT =
  /(sorgu(?:su|sunu|yu|lar[ıi]|lar[ıi]n[ıi])?\s+(?:yaz|ver|göster|hazırla|oluştur)|nasıl\s+(?:yaz|güncelle|ekle|değiştir)|örnek\s+(?:bir\s+)?sorgu|sql(?:'?ini|'?i)?\s+(?:yaz|ver|göster)|çalıştırma|(?:just\s+)?(?:write|show)\s+(?:me\s+)?(?:a|the)\s+(?:query|sql|statement)|how\s+(?:do|would|can)\s+i\s+(?:write|update|insert)|don'?t\s+run)/i

export function wantsQueryText(userText: string): boolean {
  return WANTS_QUERY_TEXT.test(fold(userText))
}

/** Metnin sonundaki soru cümlelerini atar ("... Bu değişikliği onaylıyor musun?") */
export function withoutTrailingQuestion(text: string): string {
  let out = text.trimEnd()
  for (let i = 0; i < 3 && /\?\s*$/.test(out); i++) {
    const end = out.length - 2
    const cut = Math.max(out.lastIndexOf('. ', end), out.lastIndexOf('! ', end), out.lastIndexOf(': ', end), out.lastIndexOf('\n', end))
    out = cut >= 0 ? out.slice(0, cut + 1).trimEnd() : ''
  }
  return out
}

/** Cevap veriyi değiştiren bir sorguyu (UPDATE, INSERT...) kod bloğu olarak yazıyor mu */
export function writesWriteQuery(text: string): boolean {
  return /```sql[^\n]*\n\s*(?:update|insert|merge|create|alter|exec|execute|replace|upsert)\b/i.test(text)
}

/** Cevap bir okuma sorgusunu (SELECT ya da WITH) kod bloğu olarak yazıyor mu */
export function writesReadQuery(text: string): boolean {
  return /```sql[^\n]*\n\s*(?:select|with)\b/i.test(text)
}

export function dumpsCode(text: string): boolean {
  let lines = 0
  for (const block of text.matchAll(/```[^\n]*\n([\s\S]*?)(?:```|$)/g)) lines += block[1].split('\n').filter((l) => l.trim()).length
  return lines >= CODE_DUMP_LINES
}

/** "Şimdi dosyayı güncelleyelim", "testi çalıştıralım" gibi birinci çoğul kişiyle duyurulan işlem */
const ANNOUNCE_PLURAL =
  /(?<!\p{L})(?:güncelleyelim|düzeltelim|değiştirelim|yazalım|çalıştıralım|oluşturalım|ekleyelim|uygulayalım|kaydedelim|okuyalım|bakalım|deneyelim|kontrol edelim|let's (?:run|write|fix|apply|update|check|create|add))(?!\p{L})/iu

export function announcesAction(text: string): boolean {
  const tail = fold(text).trimEnd().slice(-500)
  // İki noktayla biten cevap ("Şimdi dosyayı güncelleyelim:") arkasından gelecek işi duyurup durmuş demektir.
  return ANNOUNCE.test(tail) || ANNOUNCE_PLURAL.test(tail) || /:\s*$/.test(tail)
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
  /**
   * Tanılama (isteğe bağlı): döngünün kendiliğinden yaptığı düzeltmeler. Arayüz kullanmaz; ajan test seti
   * (eval/ajan) bunları sayar.
   */
  debug?(e: { conversationId: string; kind: 'nudge' | 'textToolCall' | 'retry' | 'compact'; detail: string }): void
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

  /** Süren cevaplar kaydedilip bitene kadar en çok ms milisaniye bekler (uygulama kapanırken). */
  async settle(ms: number): Promise<void> {
    const until = Date.now() + ms
    while (this.active.size > 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50))
  }

  /** Geçmişi modelin anlayacağı hale getirir: dosya metinleri mesaja eklenir, resimler ayrı verilir. */
  private async toModelMessages(history: Message[], model: string): Promise<OllamaMessage[]> {
    const vision = await supportsVision(model)
    const lastUser = history.findLast((m) => m.role === 'user')
    if (!vision && lastUser?.attachments.some((a) => a.kind === 'image')) {
      throw new OllamaError(L().prompts.chat.errors.noVision(model))
    }

    return history.map((m) => {
      // Model bir sonraki turda önceki cevapta neyi okuyup neyi değiştirdiğini bilsin (yalnızca metin kalıyordu).
      if (m.role === 'assistant' && m.steps.length > 0) {
        const log = L().prompts.chat.actionLog(m.steps.slice(-12).map((s) => s.label).join('; '))
        return { role: m.role, content: `${log}\n\n${m.content}` } as OllamaMessage
      }
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
    /** Dürtmeden önce yazılmış ve kaybolmaması gereken metin (modelin tanısı gibi) */
    let carry = ''
    const save = (
      text: string,
      partial: boolean,
      tokens: number | null = null,
      durationMs: number | null = null
    ): Message | null => {
      // Yalnızca araç kullanılıp metin yazılmadıysa da adımlar kaybolmasın.
      if (!text.trim() && steps.length === 0) return null
      // Geri alma kaydı ancak mesaj kaydedildikten sonra silinir: kayıt başarısız olursa kaybolmasın.
      const message = this.db.addMessage({
        conversationId,
        role: 'assistant',
        content: text,
        model,
        tokens,
        durationMs: durationMs ?? Date.now() - started,
        partial,
        steps,
        thinking: thoughts,
        undo: this.files.peekEdits(conversationId)
      })
      this.files.clearEdits(conversationId)
      return message
    }
    /** Hata yolunda kayıt da başarısız olabilir (sohbet bu arada silindiyse); yine de arayüze haber verilir. */
    const trySave = (text: string): Message | null => {
      try {
        return save(text, true)
      } catch {
        return null
      }
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
      // Araçlı sohbette bağlamın çoğu araç sonuçlarına (dosya, sorgu) kalmalı; eski mesajlara daha az yer ayrılır.
      const kept = trimHistory(all, numCtx ? Math.max(6000, Math.round(numCtx * 0.75)) : HISTORY_CHAR_BUDGET)
      // Bağlama sığmayan baştaki mesajlar; içerikleri özetle temsil edilir.
      const dropped = history.slice(0, all.length - kept.length)

      const lastUser = history.findLast((m) => m.role === 'user')
      // Araçlı sohbetlerde kişisel bellek kullanılmaz ve öğrenilmez: her turda değişip istemin başını bozuyor
      // (önbellek boşa gidiyor) ve ayrı bağlam boyuyla çağrıldığı için modeli yeniden yüklüyordu.
      const useMemory = settings.memoryEnabled && !conversation.private && !toolSession
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
        for (let attempt = 0; ; attempt++) {
          try {
            const r = await once()
            // Araç metin olarak yazıldıysa gerçek çağrıya çevrilir.
            if (withTools && tools && !r.looped && (r.stats.toolCalls?.length ?? 0) === 0) {
              const { calls, rest } = extractTextToolCalls(r.text, toolNames(tools))
              if (calls.length > 0) {
                this.events.debug?.({ conversationId, kind: 'textToolCall', detail: calls.map((c) => c.name).join(', ') })
                return { ...r, text: rest, stats: { ...r.stats, toolCalls: calls } }
              }
            }
            return r
          } catch (err) {
            const partial = err instanceof PartialError ? err.partial : ''
            const cause = err instanceof PartialError ? err.original : err
            const message = `${err instanceof Error ? err.message : String(err)} ${cause instanceof Error ? cause.message : ''}`
            if (partial || controller.signal.aborted || attempt >= CRASH_RETRIES || !RUNNER_CRASH.test(message)) throw err
            this.events.debug?.({ conversationId, kind: 'retry', detail: message.trim().slice(0, 200) })
            await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1) ** 2))
          }
        }
      }
      let result = await guarded(true)
      let nudges = 0
      const stream = guarded
      /**
       * Yerel modeller iki biçimde yarıda kalır: araç sonucundan sonra hiçbir şey yazmaz ya da "şimdi düzeltiyorum"
       * deyip aracı çağırmadan durur. İkisinde de model birkaç kez, ne yapması gerektiği söylenerek yeniden çağrılır.
       */
      const nudge = async (): Promise<void> => {
        while (tools && !result.looped && (result.stats.toolCalls?.length ?? 0) === 0 && nudges < MAX_NUDGES) {
          const silent = !result.text.trim()
          // Bu cevapta bir dosya gerçekten değiştiyse model iş yapmıştır: sondaki "istersen şunu da yaparım" önerisi ve
          // yaptığını özetleyen kod parçası dürtülmez (yoksa "kodu dosyaya yaz" denip düzgün dosyanın üstüne yazılıyordu).
          const changed = steps.some((s) => (CHANGE_TOOLS.has(s.tool) && s.status === 'ok') || s.changed === true)
          const asking = !silent && !changed && asksPermission(result.text)
          // Kullanıcı bu turda bir değişikliği reddettiyse "eklendi / güncellendi" diyen cevap yanlıştır: düzeltilmeli,
          // yeniden denenmemeli. (Model reddedilen düzenlemeden sonra "satır eklendi" diyebiliyordu.)
          const denied = steps.some((s) => s.status === 'denied' && (CHANGE_TOOLS.has(s.tool) || s.tool === 'sql_query' || s.tool === 'run_command'))
          const deniedClaim = !silent && denied && !changed && claimsChange(result.text)
          // Kullanıcı reddettiyse model durmalı: "tekrar gönderiyorum" gibi bir cevap dürtülürse ısrar etmiş olur.
          // Reddedilen bir işlemden sonra yalnızca yanlış "yaptım" iddiası düzeltilir.
          if (denied && !deniedClaim) return
          // Klasöre yazma izni varken kodu sohbete döküp dosya oluşturmayan cevap: kod dosyalara yazılmalı.
          const dumping =
            !silent && !!folder && canWrite && !changed && !denied && (dumpsCode(result.text) || claimsWrite(result.text))
          // Veritabanı bağlıyken okuma sorgusunu çalıştırmadan sohbete yazıp bırakan cevap: sorgu çalıştırılmalı.
          const unrunQuery = !silent && !!connection && !dumping && !steps.some((s) => s.tool === 'sql_query') && writesReadQuery(result.text)
          // Değiştiren sorguyu çalıştırmadan sohbete yazıp bırakan cevap: kullanıcı yalnızca sorgunun metnini istemediyse
          // sorgu sql_query ile gönderilmeli (uygulama onay kartı gösterir; kullanıcı reddedebilir). Model bunu yapmadan
          // "Kalem'in fiyatını güncelledim" diyebiliyordu.
          const unrunWrite =
            !silent && !!connection && !changed && writesWriteQuery(result.text) && !wantsQueryText(lastUser?.content ?? '')
          // Hiçbir dosya ya da kayıt değişmediği halde "güncelledim / düzelttim" diyen cevap (değişikliği yalnızca sohbete
          // yazmış): ya gerçekten yapılmalı ya da yapıldığı söylenmemeli.
          const claimedNotDone =
            !silent &&
            !changed &&
            !denied &&
            !dumping &&
            !unrunWrite &&
            ((!!folder && canWrite) || !!connection) &&
            claimsChange(result.text)
          if (
            silent
              ? steps.length === 0
              : !announcesAction(result.text) && !asking && !dumping && !unrunQuery && !unrunWrite && !deniedClaim && !claimedNotDone
          )
            return
          nudges++
          this.events.debug?.({
            conversationId,
            kind: 'nudge',
            detail: deniedClaim
              ? 'deniedNotDone'
              : claimedNotDone
                ? 'claimedNotDone'
                : dumping
                ? 'codeToFiles'
                : unrunQuery
                  ? 'runQuery'
                  : unrunWrite
                    ? 'runWrite'
                    : silent
                      ? 'continueAfterTools'
                      : asking
                        ? 'dontAsk'
                        : 'actDontTell'
          })
          // Yanlış ya da yarım cevap kullanıcıya kalmaz; yalnızca modele geri verilir.
          if (deniedClaim || claimedNotDone || dumping || unrunQuery || unrunWrite) {
            // Sohbete dökülen kod modele geri verilir (dosyaya yazarken kullansın) ama cevapta tekrar gösterilmez.
            messages.push({ role: 'assistant', content: result.text })
            this.events.chunk({ conversationId, delta: '\n\n' })
          } else if (!silent) {
            // İzin sorup duran cevabın sondaki sorusu ("onaylıyor musun?") kullanıcıya kalmaz: iş zaten yapılacak.
            const kept = (asking ? withoutTrailingQuestion(result.text) : result.text).trim()
            if (kept) carry += `${kept}\n\n`
            messages.push({ role: 'assistant', content: result.text })
            this.events.chunk({ conversationId, delta: '\n\n' })
          }
          messages.push({
            role: 'user',
            content: deniedClaim
              ? L().prompts.chat.deniedNotDone
              : claimedNotDone
                ? L().prompts.chat.claimedNotDone
                : dumping
                ? L().prompts.chat.codeToFiles
                : unrunQuery
                  ? L().prompts.chat.runQuery
                  : unrunWrite
                    ? L().prompts.chat.runWrite
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
      let round = 0
      let planOnly = 0
      /** Bağlamın araç turlarına ayrılan kısmı (karakter; Türkçede bir belirteç ortalama 2,6-3,5 karakter) */
      const budget = Math.round((numCtx ?? 8192) * 2.6)
      while ((folder || connection) && (result.stats.toolCalls?.length ?? 0) > 0 && !result.looped) {
        const calls = result.stats.toolCalls!
        messages.push({ role: 'assistant', content: result.text, tool_calls: calls.map((c) => ({ function: c })) })
        const roundStart = messages.length
        for (const call of calls) {
          // Kullanıcı durdurduysa sıradaki araçlar çalıştırılmaz.
          if (controller.signal.aborted) break
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
        // Yalnızca planı güncelleyen turlar (birkaç kez) sınırdan sayılmaz.
        if (calls.every((c) => c.name === 'update_plan') && planOnly < MAX_PLAN_ONLY_ROUNDS) planOnly++
        else round++
        const trimmed = compactToolResults(messages, budget, roundStart, L().prompts.chat.toolResultTrimmed)
        if (trimmed > 0) this.events.debug?.({ conversationId, kind: 'compact', detail: String(trimmed) })
        // Sınıra gelindiyse son turda araç verilmez; model elindekiyle cevap yazar.
        const last = round >= MAX_TOOL_ROUNDS
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
        // Kullanıcı durdurdu: yazılan kısım (dürtmeden önce yazılanlar dahil) kalır, hata gösterilmez.
        const message = trySave(carry + partial)
        if (message) this.events.done({ conversationId, message })
        else this.events.error({ conversationId, error: '', message: null })
        return
      }
      this.events.error({ conversationId, error: describeError(cause), message: trySave(carry + partial) })
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
