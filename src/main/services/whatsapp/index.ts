import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import JSZip from 'jszip'
import type { Level, Persona, PersonaDraft, WaBuildRequest, WaPreview, WaProfile, WaProgress, WaStats } from '@shared/types'
import type { Db, WaExampleRow } from '../../db'
import { L } from '../../i18n'
import { decodeText } from '../attachments'
import { cosine, EMBEDDING_MODEL, overlap, type MemoryService } from '../memory'
import * as ollama from '../ollama'
import { parseChat, type ParsedChat } from './parse'
import { analyze, buildPairs, MAX_BURST, styleRules, toBursts, type Pair } from './style'

const MAX_FILE_BYTES = 60 * 1024 * 1024
/** Kişi başına saklanan en fazla örnek (en yeniler tutulur). */
const MAX_EXAMPLES = 3000
/** Öğrenmek için gereken en az mesaj */
const MIN_MESSAGES = 30
const EMBED_BATCH = 32

/** Benzerlik seviyesine göre modele verilen örnek sayıları. */
const EXAMPLE_COUNTS: Record<Level, { samples: number; retrieved: number }> = {
  0: { samples: 5, retrieved: 0 },
  1: { samples: 7, retrieved: 5 },
  2: { samples: 9, retrieved: 9 }
}

export class WhatsAppError extends Error {}

/** .txt dosyasını ya da içinde sohbet dosyası olan .zip arşivini metne çevirir. */
export async function readExport(name: string, data: ArrayBuffer): Promise<string> {
  const t = L().tools.whatsapp.errors
  const bytes = Buffer.from(data)
  if (bytes.length === 0) throw new WhatsAppError(t.emptyFile)
  if (bytes.length > MAX_FILE_BYTES) throw new WhatsAppError(t.tooLarge)

  const isZip = extname(name).toLowerCase() === '.zip' || (bytes[0] === 0x50 && bytes[1] === 0x4b)
  if (!isZip) return decodeText(bytes)

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new WhatsAppError(t.zipFailed)
  }
  const texts = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith('.txt'))
  if (texts.length === 0) throw new WhatsAppError(t.zipNoChat)
  // Birden fazla varsa sohbet dosyası en büyük olandır.
  const contents = await Promise.all(texts.map((f) => f.async('nodebuffer')))
  return decodeText(contents.sort((a, b) => b.length - a.length)[0])
}

/** Stil özetini modele yazdırmak için: konuşmanın her yerinden eşit aralıklı örnek çiftler. */
function summaryInput(pairs: Pair[], count = 40): string {
  const t = L().tools.whatsapp
  const step = Math.max(1, Math.floor(pairs.length / count))
  return pairs
    .filter((_, i) => i % step === 0)
    .slice(0, count)
    .map((p) => `${t.summaryOther}: ${p.context.slice(0, 160)}\n${t.summaryPerson}: ${p.reply.slice(0, 220)}`)
    .join('\n\n')
}

export class WhatsAppService {
  /** Okunmuş ama henüz kişiliğe çevrilmemiş dosyalar */
  private imports = new Map<string, { fileName: string; chat: ParsedChat }>()
  /** Sohbet sırasında her mesajda veritabanından okumamak için */
  private examples = new Map<string, WaExampleRow[]>()

  constructor(
    private db: Db,
    private memory: MemoryService
  ) {}

  async parse(name: string, data: ArrayBuffer): Promise<WaPreview> {
    const chat = parseChat(await readExport(name, data))
    if (chat.messages.length === 0) {
      throw new WhatsAppError(L().tools.whatsapp.errors.noMessages)
    }
    const importId = randomUUID()
    this.imports.set(importId, { fileName: name, chat })
    // Bellekte en fazla üç dosya tutulur.
    while (this.imports.size > 3) this.imports.delete(this.imports.keys().next().value!)
    return {
      importId,
      fileName: name,
      participants: chat.participants,
      total: chat.messages.length,
      from: chat.messages[0].ts,
      to: chat.messages.at(-1)!.ts
    }
  }

  async build(request: WaBuildRequest, model: string | null, onProgress: (p: WaProgress) => void): Promise<Persona> {
    const t = L().tools.whatsapp
    const imported = this.imports.get(request.importId)
    if (!imported) throw new WhatsAppError(t.errors.importGone)
    const { messages } = imported.chat
    const own = messages.filter((m) => m.sender === request.target)
    if (own.length < MIN_MESSAGES) {
      throw new WhatsAppError(t.errors.tooFew(request.target, own.length, MIN_MESSAGES))
    }
    onProgress({ stage: 'analiz', percent: 10 })

    // Var olan kişiliğe ekleniyorsa eski örneklerle birleştirilir; aynı örnek iki kez girmez.
    const existing = request.mergeInto ? this.db.listWaExamples(request.mergeInto) : []
    const seen = new Set(existing.map((e) => `${e.context}\u0000${e.reply}`))
    const fresh = buildPairs(messages, request.target, MAX_EXAMPLES).filter((p) => !seen.has(`${p.context}\u0000${p.reply}`))

    // İstatistikler, saklanan bütün cevaplardan (eski + yeni) hesaplanır.
    const allReplies = [...existing.map((e) => e.reply), ...fresh.map((p) => p.reply)]
    const ownBursts = toBursts(messages).filter((b) => b.sender === request.target)
    const stats: WaStats = analyze(
      existing.length > 0 ? allReplies.flatMap((r) => r.split('\n')) : own.map((m) => m.text),
      existing.length > 0 ? allReplies.map((r) => r.split('\n').length) : ownBursts.map((b) => b.texts.length)
    )
    onProgress({ stage: 'analiz', percent: 100 })

    let summary = ''
    if (model) {
      onProgress({ stage: 'ozet', percent: 20 })
      try {
        const allPairs = [...existing.map((e) => ({ context: e.context, reply: e.reply, ts: e.ts })), ...fresh]
        summary = await ollama.chatOnce({
          model,
          numPredict: 320,
          temperature: 0.4,
          messages: [
            { role: 'system', content: t.summarySystem },
            { role: 'user', content: summaryInput(allPairs) }
          ]
        })
      } catch {
        // Özet yazılamazsa sayılardan çıkan kurallar ve örnekler yine de kullanılır.
      }
      onProgress({ stage: 'ozet', percent: 100 })
    }

    const previous = request.mergeInto ? this.db.getWaProfile(request.mergeInto) : null
    const total = existing.length + fresh.length
    const draft: PersonaDraft = {
      name: request.target.slice(0, 40),
      tagline: t.tagline(stats.messages),
      icon: 'heart',
      prompt: [t.intro(request.target, request.self), summary].filter(Boolean).join('\n\n'),
      warmth: 1,
      humor: 1,
      length: 1,
      emoji: 1,
      multiMessage: true
    }
    const persona = this.db.savePersona(draft, request.mergeInto)
    this.db.saveWaProfile({
      personaId: persona.id,
      sourceName: request.target,
      selfName: request.self,
      stats,
      summary,
      from: Math.min(previous?.from ?? Infinity, messages[0].ts),
      to: Math.max(previous?.to ?? 0, messages.at(-1)!.ts)
    })
    this.db.addWaExamples(persona.id, fresh)
    if (total > MAX_EXAMPLES) this.db.trimWaExamples(persona.id, MAX_EXAMPLES)
    this.examples.delete(persona.id)

    await this.embedMissing(persona.id, (percent) => onProgress({ stage: 'ornekler', percent }))
    this.imports.delete(request.importId)
    return this.db.getPersona(persona.id)!
  }

  /** Vektörü olmayan örneklerin vektörünü hesaplar. Gömme modeli yoksa hiçbir şey yapmaz. */
  async embedMissing(personaId: string, onPercent?: (percent: number) => void): Promise<void> {
    if (!(await this.memory.hasSemantic(true))) return
    const missing = this.db.listWaExamples(personaId).filter((e) => !e.vector)
    for (let i = 0; i < missing.length; i += EMBED_BATCH) {
      const batch = missing.slice(i, i + EMBED_BATCH)
      try {
        const vectors = await ollama.embed(EMBEDDING_MODEL, batch.map((e) => e.context))
        this.db.setWaExampleVectors(batch.map((e, j) => ({ id: e.id, vector: vectors[j] })))
      } catch {
        break
      }
      onPercent?.(Math.round(((i + batch.length) / missing.length) * 100))
    }
    this.examples.delete(personaId)
  }

  profile(personaId: string): WaProfile | null {
    const p = this.db.getWaProfile(personaId)
    if (!p) return null
    return { personaId, ...p, examples: this.db.countWaExamples(personaId) }
  }

  setSimilarity(personaId: string, level: Level): void {
    this.db.setWaSimilarity(personaId, level)
  }

  private examplesFor(personaId: string): WaExampleRow[] {
    let list = this.examples.get(personaId)
    if (!list) {
      list = this.db.listWaExamples(personaId)
      this.examples.set(personaId, list)
    }
    return list
  }

  /** Kullanıcının mesajına en çok benzeyen durumlarda kişinin verdiği gerçek cevaplar. */
  private async similar(personaId: string, query: string, count: number): Promise<WaExampleRow[]> {
    const list = this.examplesFor(personaId)
    if (count === 0 || list.length === 0 || !query.trim()) return []
    let queryVector: Float32Array | null = null
    if (list.some((e) => e.vector) && (await this.memory.hasSemantic())) {
      try {
        queryVector = (await ollama.embed(EMBEDDING_MODEL, [query]))[0]
      } catch {
        // Vektör alınamazsa ortak kelimeye bakılır.
      }
    }
    return list
      .map((e) => ({
        example: e,
        score: queryVector && e.vector ? cosine(queryVector, e.vector) : overlap(query, e.context) * 0.6
      }))
      .filter((s) => s.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map((s) => s.example)
  }

  /** Sistem talimatına eklenen bölüm: yazım kuralları, gerçek mesaj örnekleri ve benzer durumlardaki cevaplar. */
  async promptBlock(personaId: string, query: string): Promise<string> {
    const profile = this.db.getWaProfile(personaId)
    if (!profile) return ''
    const counts = EXAMPLE_COUNTS[profile.similarity] ?? EXAMPLE_COUNTS[1]
    const samples = profile.stats.samples.slice(0, counts.samples)
    const similar = await this.similar(personaId, query, counts.retrieved)

    const t = L().tools.whatsapp.prompt
    const parts = [t.rulesTitle, ...styleRules(profile.stats).map((r) => `- ${r}`)]
    if (samples.length > 0) {
      parts.push('', t.samplesTitle, ...samples.map((s) => `- ${s.replace(/\s*\n\s*/g, ' ')}`))
    }
    if (similar.length > 0) {
      // Her mesaj kendi satırında verilir: araya ayraç konursa model o ayracı da taklit eder.
      const lines = (who: string, text: string, max: number): string =>
        text
          .split('\n')
          .filter((m) => m.trim())
          .slice(-max)
          .map((m) => `${who}: ${m.trim()}`)
          .join('\n')
      parts.push(
        '',
        t.similarTitle,
        // Eski kayıtlarda bir cevap çok sayıda mesaj içerebilir; örnekte ilk birkaçı yeter.
        ...similar.map((e) => {
          const reply = e.reply.split('\n').slice(0, MAX_BURST).join('\n')
          return `${lines(t.other, e.context, 3)}\n${lines(t.you, reply, MAX_BURST)}\n`
        })
      )
    }
    parts.push('', t.noGibberish)
    parts.push('', profile.similarity === 2 ? t.imitateExact : t.imitate)
    return parts.join('\n')
  }
}
