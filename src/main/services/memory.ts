import { MEMORY_CATEGORIES, type Memory, type MemoryCategory, type MemoryStatus } from '@shared/types'
import type { Lang } from '@shared/i18n'
import type { Db } from '../db'
import { getLanguage, L } from '../i18n'
import * as ollama from './ollama'

/** Anlamca arama için kullanılan çok dilli gömme modeli. */
export const EMBEDDING_MODEL = 'qwen3-embedding:0.6b'
export const EMBEDDING_SIZE_GB = 0.64

/** Bu sayıya kadar kayıt varsa hepsi modele verilir; arama gerekmez. */
const ALL_UP_TO = 20
/** Arama yapıldığında modele verilen en fazla kayıt */
const RELEVANT_LIMIT = 12
/** Bir mesajdan en fazla bu kadar bilgi öğrenilir. */
const MAX_FACTS_PER_TURN = 3

// İngilizce kelimelerden Türkçede de anlam taşıyanlar ("her", "not", "but", "has") bilerek eklenmedi.
const STOP_WORDS = new Set(
  [
    'kullanıcı kullanıcının ve ile bir bu şu o da de mi mı mu mü için gibi çok daha en ama fakat veya ya olarak olan var yok ben sen biz siz onu ona benim senin',
    'the user users and with for that this these those are was were have had from they them their you your about into than then also'
  ]
    .join(' ')
    .split(' ')
)

/** Karşılaştırma için: küçük harf, noktalama yok, kısa ve anlamsız kelimeler atılmış. */
export function tokens(text: string): string[] {
  return text
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

/** İki metnin ne kadar aynı kelimelerden oluştuğu: 0 ile 1 arası. */
export function overlap(a: string, b: string): number {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let common = 0
  for (const w of ta) if (tb.has(w)) common++
  return common / Math.min(ta.size, tb.size)
}

/** Yeni bilgi, bilinenlerden biriyle hemen hemen aynı şeyi mi söylüyor? */
export function isDuplicate(text: string, known: string[]): boolean {
  return known.some((k) => overlap(text, k) >= 0.75)
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}

/**
 * Sorguyla en ilgili kayıtları seçer. Vektörü olan kayıtlar anlamca, olmayanlar
 * ortak kelimeye göre puanlanır. En yeni birkaç kayıt her zaman eklenir.
 */
export function rank(
  items: { memory: Memory; vector: Float32Array | null }[],
  query: string,
  queryVector: Float32Array | null,
  limit = RELEVANT_LIMIT
): Memory[] {
  if (items.length <= ALL_UP_TO) return items.map((i) => i.memory)
  const scored = items
    .map((item) => ({
      memory: item.memory,
      score: queryVector && item.vector ? cosine(queryVector, item.vector) : overlap(query, item.memory.text) * 0.6
    }))
    .sort((a, b) => b.score - a.score)
  const chosen = new Map<string, Memory>()
  // Liste en yeniden eskiye sıralı gelir: ilk üçü en son öğrenilenlerdir.
  for (const item of items.slice(0, 3)) chosen.set(item.memory.id, item.memory)
  for (const s of scored) {
    if (chosen.size >= limit) break
    if (s.score > 0) chosen.set(s.memory.id, s.memory)
  }
  return [...chosen.values()]
}

/** Hatırlananları modele verilecek blok haline getirir. */
export function memoryBlock(memories: Memory[]): string {
  if (memories.length === 0) return ''
  const t = L().prompts.memory
  return [t.blockHeader, ...memories.map((m) => `- ${m.text}`), t.blockFooter].join('\n')
}

const EXTRACT_SCHEMA = {
  type: 'object',
  required: ['facts'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'category'],
        properties: {
          text: { type: 'string' },
          category: { type: 'string', enum: [...MEMORY_CATEGORIES] }
        }
      }
    }
  }
}

/**
 * Bilgi olmayan "bilgiler": kullanıcının söylemediği, sorduğu ya da o an istediği şeyler.
 * Küçük modeller boş liste döndürmek yerine bunları uydurabiliyor.
 */
const NOT_A_FACT: Record<Lang, RegExp> = {
  tr: /söylemedi|belirtmedi|bahsetmedi|paylaşmadı|vermedi|bilinmiyor|belli değil|henüz|sordu|soruyor|soru sor|öğrenmek isti|merak edi|istedi\b|istiyor\.?$|rica etti|talep etti|yardım isti|asistan/i,
  en: /\b(did|has|have)(n['’]t| not) (yet )?(say|said|mention|mentioned|specify|specified|share|shared|provide|provided|give|given|state|stated|tell|told|reveal|revealed|disclose|disclosed)\b|\bnever (said|mentioned|specified|shared|stated)\b|\bnot (yet|specified|mentioned|provided|stated|known|clear|given|shared)\b|\bunknown\b|\bunclear\b|\bunspecified\b|\bask(s|ed|ing)?\b|\bwants? to know\b|\bwould like to know\b|\bwonder(s|ed|ing)?\b|\bis curious\b|\brequest(s|ed|ing)?\b|\b(wants?|wanted|needs?|needed) (help|assistance|advice|suggestions?|recommendations?)\b|\bassistant\b/i
}

/** Her bilgi kullanıcıyı anlatan bir cümle olmalı: "Kullanıcı ..." ya da "The user ...". */
const FACT_START: Record<Lang, RegExp> = {
  tr: /^kullanıcı/i,
  en: /^(the )?user\b/i
}

export interface Fact {
  text: string
  category: MemoryCategory
}

/**
 * Model çıktısını temizler: biçimi bozuk, çok kısa/uzun ya da zaten bilinen bilgileri atar.
 * Kalıplar talimatın diline göre seçilir; verilmezse geçerli dil kullanılır.
 */
export function cleanFacts(raw: unknown, known: string[], lang: Lang = getLanguage()): Fact[] {
  const list = (raw && typeof raw === 'object' ? (raw as { facts?: unknown }).facts : null) ?? []
  const accepted: Fact[] = []
  for (const item of Array.isArray(list) ? list : []) {
    const f = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const text = typeof f.text === 'string' ? f.text.replace(/\s+/g, ' ').trim() : ''
    if (text.length < 12 || text.length > 200) continue
    if (!FACT_START[lang].test(text)) continue
    if (NOT_A_FACT[lang].test(text)) continue
    if (isDuplicate(text, [...known, ...accepted.map((a) => a.text)])) continue
    accepted.push({
      text,
      category: MEMORY_CATEGORIES.includes(f.category as MemoryCategory) ? (f.category as MemoryCategory) : 'Diğer'
    })
    if (accepted.length >= MAX_FACTS_PER_TURN) break
  }
  return accepted
}

export class MemoryService {
  private semanticChecked = 0
  private semantic = false

  constructor(private db: Db) {}

  /** Gömme modeli kurulu mu (dakikada en fazla bir kez sorulur). */
  async hasSemantic(force = false): Promise<boolean> {
    if (!force && Date.now() - this.semanticChecked < 60_000) return this.semantic
    try {
      const installed = await ollama.listInstalled()
      this.semantic = installed.some((m) => m.name === EMBEDDING_MODEL)
    } catch {
      this.semantic = false
    }
    this.semanticChecked = Date.now()
    return this.semantic
  }

  async status(): Promise<MemoryStatus> {
    return {
      count: this.db.listMemories().length,
      semantic: await this.hasSemantic(true),
      embeddingModel: EMBEDDING_MODEL,
      embeddingSizeGb: EMBEDDING_SIZE_GB
    }
  }

  private async embed(texts: string[]): Promise<Float32Array[] | null> {
    if (texts.length === 0 || !(await this.hasSemantic())) return null
    try {
      return await ollama.embed(EMBEDDING_MODEL, texts)
    } catch {
      return null
    }
  }

  /** Vektörü olmayan kayıtların vektörünü hesaplar (model yeni kurulduğunda ya da metin değiştiğinde). */
  async embedMissing(): Promise<void> {
    const missing = this.db.listMemoryVectors().filter((i) => !i.vector)
    for (let i = 0; i < missing.length; i += 16) {
      const batch = missing.slice(i, i + 16)
      const vectors = await this.embed(batch.map((b) => b.memory.text))
      if (!vectors) return
      batch.forEach((b, j) => this.db.setMemoryVector(b.memory.id, vectors[j]))
    }
  }

  /** Bu mesajla ilgili hatırlanması gerekenler. */
  async relevant(query: string): Promise<Memory[]> {
    const items = this.db.listMemoryVectors()
    if (items.length === 0) return []
    const queryVector = items.length > ALL_UP_TO ? ((await this.embed([query]))?.[0] ?? null) : null
    return rank(items, query, queryVector)
  }

  async add(text: string, category: MemoryCategory, conversationId: string | null = null): Promise<Memory> {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean) throw new Error(L().prompts.memory.errors.emptyAdd)
    const memory = this.db.addMemory({ text: clean.slice(0, 300), category, conversationId })
    void this.embedMissing()
    return memory
  }

  async update(id: string, text: string, category: MemoryCategory): Promise<void> {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean) throw new Error(L().prompts.memory.errors.emptyUpdate)
    this.db.updateMemory(id, clean.slice(0, 300), category)
    void this.embedMissing()
  }

  /** Kullanıcının mesajından kalıcı bilgileri çıkarır ve kaydeder. Hata olursa sessizce boş döner. */
  async learn(conversationId: string, model: string, userMessage: string): Promise<Memory[]> {
    const message = userMessage.trim()
    // Çok kısa mesajlarda ("tamam", "devam et") öğrenilecek bir şey olmaz.
    if (message.length < 20) return []
    const known = this.db.listMemories().map((m) => m.text)
    // Talimat ve temizlik aynı dille yapılır; cevap beklenirken dil değişse bile.
    const lang = getLanguage()
    const t = L().prompts.memory
    let parsed: unknown
    try {
      const raw = await ollama.chatOnce({
        model,
        format: EXTRACT_SCHEMA,
        numPredict: 300,
        temperature: 0,
        messages: [
          { role: 'system', content: t.extractSystem },
          { role: 'user', content: t.extractRequest(known.slice(0, 40), message.slice(0, 3000)) }
        ]
      })
      parsed = JSON.parse(raw)
    } catch {
      return []
    }
    const facts = cleanFacts(parsed, known, lang)
    const saved = facts.map((f) => this.db.addMemory({ text: f.text, category: f.category, conversationId }))
    if (saved.length > 0) void this.embedMissing()
    return saved
  }
}
