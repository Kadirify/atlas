import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../src/main/i18n'
import type { Memory } from '../src/shared/types'
import { Db } from '../src/main/db'
import { buildSystemPrompt, transcript, trimHistory } from '../src/main/services/chat'
import { cleanFacts, cosine, isDuplicate, memoryBlock, overlap, rank } from '../src/main/services/memory'
import {
  addressLine,
  BUILTIN_PERSONAS,
  builtinPersonas,
  findPersona,
  listPersonas,
  personaInstructions,
  sanitizePersona
} from '../src/main/services/personas'

const memory = (id: string, text: string, createdAt = 0): Memory => ({
  id,
  text,
  category: 'Diğer',
  conversationId: null,
  createdAt
})

describe('benzerlik', () => {
  it('aynı şeyi söyleyen cümleleri tekrar sayar, farklıları saymaz', () => {
    const known = ['Kullanıcı bir lojistik şirketinde IT direktörü.']
    expect(isDuplicate('Kullanıcı lojistik şirketinde IT direktörü olarak çalışıyor.', known)).toBe(true)
    expect(isDuplicate('Kullanıcının kızının adı Defne.', known)).toBe(false)
    expect(overlap('', 'bir şey')).toBe(0)
  })

  it('kosinüs benzerliğini hesaplar', () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([1, 0]))).toBeCloseTo(1)
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0)
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([1, 0, 0]))).toBe(0)
  })
})

describe('cleanFacts', () => {
  it('geçerli bilgileri alır; bozuk, kısa, bilinen ve fazla olanları atar', () => {
    const facts = cleanFacts(
      {
        facts: [
          { text: 'Kullanıcı  İzmir’de yaşıyor.', category: 'Kişisel' },
          { text: 'Kullanıcı IT direktörü olarak lojistik şirketinde çalışıyor.', category: 'İş' },
          { text: 'Hava bugün güzel.', category: 'Diğer' },
          { text: 'Kullanıcı', category: 'Diğer' },
          { text: 'Kullanıcı İzmir’de yaşıyor.', category: 'Kişisel' },
          { text: 'Kullanıcı sabahları koşmayı seviyor.', category: 'Uydurma' },
          { text: 'Kullanıcının kızının adı Defne.', category: 'Kişisel' },
          { text: 'Kullanıcı balık tutmayı seviyor ve hafta sonları gidiyor.', category: 'Tercih' },
          42
        ]
      },
      ['Kullanıcı bir lojistik şirketinde IT direktörü.']
    )
    expect(facts).toEqual([
      { text: 'Kullanıcı İzmir’de yaşıyor.', category: 'Kişisel' },
      { text: 'Kullanıcı sabahları koşmayı seviyor.', category: 'Diğer' },
      { text: 'Kullanıcının kızının adı Defne.', category: 'Kişisel' }
    ])
  })

  it('söylenmeyen, sorulan ya da istenen şeyleri bilgi saymaz', () => {
    const facts = cleanFacts(
      {
        facts: [
          { text: 'Kullanıcı adını henüz söylemedi.', category: 'Kişisel' },
          { text: 'Kullanıcı hafta sonu için etkinlik önerisi istedi.', category: 'Diğer' },
          { text: 'Kullanıcı asistanın hangi model olduğunu sordu.', category: 'Diğer' },
          { text: 'Kullanıcının yaşadığı şehir bilinmiyor.', category: 'Kişisel' },
          { text: 'Kullanıcı her sabah yürüyüş yapıyor.', category: 'Tercih' }
        ]
      },
      []
    )
    expect(facts.map((f) => f.text)).toEqual(['Kullanıcı her sabah yürüyüş yapıyor.'])
  })

  it('bozuk girdide boş döner', () => {
    expect(cleanFacts(null, [])).toEqual([])
    expect(cleanFacts({ facts: 'metin' }, [])).toEqual([])
    expect(cleanFacts({}, [])).toEqual([])
  })
})

describe('rank', () => {
  it('az kayıt varsa hepsini verir', () => {
    const items = [1, 2, 3].map((i) => ({ memory: memory(String(i), `Kullanıcı bilgi ${i}`), vector: null }))
    expect(rank(items, 'ne olursa', null)).toHaveLength(3)
  })

  it('çok kayıt varsa anlamca en yakınları ve en yenileri seçer', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      memory: memory(String(i), `Kullanıcı konu ${i}`),
      // 20. kayıt sorguyla aynı yönde, diğerleri dik.
      vector: Float32Array.from(i === 20 ? [1, 0] : [0, 1])
    }))
    const chosen = rank(items, 'soru', Float32Array.from([1, 0]), 5)
    expect(chosen.map((m) => m.id)).toContain('20')
    expect(chosen.map((m) => m.id).slice(0, 3)).toEqual(['0', '1', '2'])
    expect(chosen.length).toBeLessThanOrEqual(5)
  })

  it('vektör yoksa ortak kelimeye göre seçer', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      memory: memory(String(i), i === 17 ? 'Kullanıcı balık tutmayı seviyor.' : `Kullanıcı başka şey ${i}`),
      vector: null
    }))
    expect(rank(items, 'hafta sonu balık tutmaya gidelim mi', null, 6).map((m) => m.id)).toContain('17')
  })
})

describe('memoryBlock', () => {
  it('kayıt yoksa boş, varsa liste verir', () => {
    expect(memoryBlock([])).toBe('')
    expect(memoryBlock([memory('1', 'Kullanıcı İzmir’de yaşıyor.')])).toContain('- Kullanıcı İzmir’de yaşıyor.')
  })
})

describe('kişilikler', () => {
  const kanka = BUILTIN_PERSONAS.find((p) => p.id === 'builtin:kanka')!
  const atlas = BUILTIN_PERSONAS[0]

  it('hazır kişilikler geçerli ve ilki Atlas', () => {
    expect(atlas.id).toBe('builtin:atlas')
    expect(new Set(BUILTIN_PERSONAS.map((p) => p.id)).size).toBe(BUILTIN_PERSONAS.length)
    for (const p of BUILTIN_PERSONAS) expect(sanitizePersona(p).name, p.id).toBe(p.name)
  })

  it('kanka mesajlaşır gibi yazar ve hep sen der; Atlas ayara uyar', () => {
    expect(personaInstructions(kanka)).toContain('Mesajlaşır gibi yaz')
    expect(personaInstructions(atlas)).toContain('Markdown')
    expect(addressLine(kanka, 'siz')).toContain('"sen"')
    expect(addressLine(atlas, 'siz')).toContain('"siz"')
    expect(addressLine(atlas, 'sen')).toContain('"sen"')
  })

  it('taslağı doğrular', () => {
    expect(() => sanitizePersona({ name: '', prompt: 'x' })).toThrow()
    expect(() => sanitizePersona({ name: 'x', prompt: '' })).toThrow()
    const p = sanitizePersona({ name: 'Dede', prompt: 'Bilge bir dede.', warmth: 9, icon: 'yok', multiMessage: 'evet' })
    expect(p).toMatchObject({ warmth: 1, icon: 'smile', multiMessage: false })
  })

  it('sistem talimatı kişiliği, hafızayı ve özeti içerir', () => {
    const prompt = buildSystemPrompt(
      { userName: 'Deniz', corporateMode: false, company: '', jobTitle: '', addressUser: 'siz' },
      new Date(),
      { persona: kanka, memories: [memory('1', 'Kullanıcı İzmir’de yaşıyor.')], summary: 'Tatil planı konuşuldu.' }
    )
    expect(prompt).toContain('kankasısın')
    expect(prompt).toContain('"sen" diye hitap et')
    expect(prompt).toContain('Kullanıcı İzmir’de yaşıyor.')
    expect(prompt).toContain('Tatil planı konuşuldu.')
  })
})

describe('veritabanı: kişilik, hafıza, gizli sohbet, özet', () => {
  let db: Db
  beforeEach(() => {
    db = new Db(':memory:')
  })

  it('kişilik kaydeder; silinince sohbet Atlas’a döner', () => {
    const saved = db.savePersona(sanitizePersona({ name: 'Dede', prompt: 'Bilge bir dede.', multiMessage: true }))
    expect(listPersonas(db).map((p) => p.name)).toContain('Dede')
    expect(db.savePersona({ ...saved, name: 'Büyük dede' }, saved.id).name).toBe('Büyük dede')
    const c = db.createConversation(null, { personaId: saved.id })
    expect(findPersona(db, db.getConversation(c.id)!.personaId).name).toBe('Büyük dede')
    db.deletePersona(saved.id)
    expect(findPersona(db, db.getConversation(c.id)!.personaId).id).toBe('builtin:atlas')
    expect(findPersona(db, 'olmayan').id).toBe('builtin:atlas')
  })

  it('hafıza kaydını ekler, günceller, vektörünü saklar ve siler', () => {
    const m = db.addMemory({ text: 'Kullanıcı İzmir’de yaşıyor.', category: 'Kişisel' })
    db.setMemoryVector(m.id, Float32Array.from([0.5, -1.25, 3]))
    expect([...db.listMemoryVectors()[0].vector!]).toEqual([0.5, -1.25, 3])
    db.updateMemory(m.id, 'Kullanıcı Ankara’da yaşıyor.', 'Kişisel')
    expect(db.listMemories()[0].text).toBe('Kullanıcı Ankara’da yaşıyor.')
    // Metin değişince eski vektör geçersizdir.
    expect(db.listMemoryVectors()[0].vector).toBeNull()
    db.deleteMemory(m.id)
    expect(db.listMemories()).toEqual([])
  })

  it('gizli sohbetleri açılışta siler, diğerlerine dokunmaz', () => {
    const secret = db.createConversation(null, { private: true })
    const normal = db.createConversation(null)
    db.addMessage({ conversationId: secret.id, role: 'user', content: 'gizli mesaj' })
    expect(db.getConversation(secret.id)?.private).toBe(true)
    db.purgePrivateConversations()
    expect(db.getConversation(secret.id)).toBeNull()
    expect(db.getConversation(normal.id)).not.toBeNull()
    expect(db.search('gizli')).toEqual([])
  })

  it('özeti saklar; özetlenen mesaj silinirse özet de sıfırlanır', () => {
    const c = db.createConversation(null)
    const first = db.addMessage({ conversationId: c.id, role: 'user', content: 'bir' })
    const second = db.addMessage({ conversationId: c.id, role: 'assistant', content: 'iki' })
    const third = db.addMessage({ conversationId: c.id, role: 'user', content: 'üç' })
    db.setSummary(c.id, 'özet', second.createdAt)
    db.deleteFrom(c.id, third.createdAt)
    expect(db.getSummary(c.id).summary).toBe('özet')
    db.deleteFrom(c.id, first.createdAt)
    expect(db.getSummary(c.id)).toEqual({ summary: '', upto: 0 })
  })
})

describe('uzun sohbet', () => {
  it('bütçeye sığmayan baştaki mesajlar özetlenmek üzere ayrılır', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `${i}`.repeat(100)
    }))
    const kept = trimHistory(messages, 350)
    expect(kept.length).toBeLessThan(messages.length)
    expect(kept.at(-1)).toBe(messages.at(-1))
    expect(kept[0].role).toBe('user')
    const text = transcript(messages.slice(0, messages.length - kept.length))
    expect(text).toContain('Kullanıcı: 0000')
    expect(text).toContain('Asistan: 1111')
  })
})

describe('İngilizce', () => {
  afterEach(() => setLanguage('tr'))

  it('hazır kişiliklerin kimlikleri dile göre değişmez, metinleri değişir', () => {
    const en = builtinPersonas('en')
    expect(en.map((p) => p.id)).toEqual(BUILTIN_PERSONAS.map((p) => p.id))
    expect(builtinPersonas('tr')).toEqual(BUILTIN_PERSONAS)
    expect(en.find((p) => p.id === 'builtin:kanka')!.name).toBe('Buddy')
    for (const p of en) expect(p.prompt, p.id).not.toMatch(/[ğşıİĞŞ]/)
  })

  it('üslup ve hitap satırları İngilizce gelir', () => {
    setLanguage('en')
    const [atlas, buddy] = builtinPersonas('en')
    expect(personaInstructions(atlas)).toContain('Use Markdown')
    expect(personaInstructions(buddy)).toContain('Write as if you are texting')
    expect(personaInstructions({ ...atlas, builtin: false, name: 'Sage' })).toContain('Your name in this chat is Sage.')
    expect(addressLine(atlas, 'siz')).toContain('formally')
    expect(addressLine(atlas, 'sen')).toContain('casually')
    expect(addressLine(buddy, 'siz')).toContain('casually')
    expect(() => sanitizePersona({ name: '', prompt: 'x' })).toThrow('Give the persona a name.')
  })

  it('cleanFacts "The user ..." bilgilerini alır, bilgi olmayanları eler', () => {
    setLanguage('en')
    const facts = cleanFacts(
      {
        facts: [
          { text: 'The user lives in Izmir.', category: 'Kişisel' },
          { text: 'The user did not say their name.', category: 'Kişisel' },
          { text: "The user hasn't mentioned where they work.", category: 'İş' },
          { text: 'The user asked for weekend activity suggestions.', category: 'Diğer' },
          { text: 'The user wants to know which model the assistant is.', category: 'Diğer' },
          { text: "The user's city is not specified.", category: 'Kişisel' },
          { text: 'The weather is nice today.', category: 'Diğer' },
          { text: 'Kullanıcı her sabah yürüyüş yapıyor.', category: 'Tercih' },
          { text: "The user's daughter is named Defne.", category: 'Personal' },
          { text: 'User does not eat meat and is training for a marathon.', category: 'Tercih' }
        ]
      },
      ['The user is an IT director at a logistics company.']
    )
    expect(facts).toEqual([
      { text: 'The user lives in Izmir.', category: 'Kişisel' },
      { text: "The user's daughter is named Defne.", category: 'Diğer' },
      { text: 'User does not eat meat and is training for a marathon.', category: 'Tercih' }
    ])
  })

  it('cleanFacts dili parametreyle de alır; varsayılan Türkçedir', () => {
    const raw = { facts: [{ text: 'The user lives in Izmir.', category: 'Kişisel' }] }
    expect(cleanFacts(raw, [])).toEqual([])
    expect(cleanFacts(raw, [], 'en')).toHaveLength(1)
  })

  it('hafıza bloğu İngilizce başlıkla gelir', () => {
    setLanguage('en')
    expect(memoryBlock([memory('1', 'The user lives in Izmir.')])).toContain('What you remember about the user')
  })
})
