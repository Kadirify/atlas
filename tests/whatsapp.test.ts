import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from '../src/main/db'
import { setLanguage } from '../src/main/i18n'
import { buildSystemPrompt } from '../src/main/services/chat'
import type { MemoryService } from '../src/main/services/memory'
import { findPersona, listPersonas } from '../src/main/services/personas'
import { readExport, WhatsAppService } from '../src/main/services/whatsapp'
import { parseChat } from '../src/main/services/whatsapp/parse'
import { analyze, buildPairs, laughKind, styleRules, toBursts } from '../src/main/services/whatsapp/style'
import { makeWhatsAppExport } from './fixtures/whatsapp'

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

/** Testler bilgisayardaki Ollama'ya bağlanmasın: anlamca arama kapalı sayılır. */
const noSemantic = { hasSemantic: async () => false } as unknown as MemoryService

describe('parseChat', () => {
  it('Android biçimini okur: çok satırlı mesaj, sistem mesajı, medya ve silinen mesaj', () => {
    const chat = parseChat(
      [
        '05.01.2026 09:00 - Mesajlar ve aramalar uçtan uca şifrelidir.',
        '05.01.2026 09:01 - Kadir: Şunlar lazım:',
        '- ekmek',
        '- süt',
        '05.01.2026 09:02 - Emre: tamam kanka',
        '05.01.2026 09:03 - Emre: <Medya dahil edilmedi>',
        '05.01.2026 09:04 - Kadir: Bu mesaj silindi',
        '05.01.2026 09:05 - Emre grubu oluşturdu',
        '05.01.2026, 21:30 - Emre: saat 21:30 gibi gelirim <Bu mesaj düzenlendi>'
      ].join('\r\n')
    )
    expect(chat.messages.map((m) => `${m.sender}|${m.text}`)).toEqual([
      'Kadir|Şunlar lazım:\n- ekmek\n- süt',
      'Emre|tamam kanka',
      'Emre|saat 21:30 gibi gelirim'
    ])
    expect(chat.participants).toEqual([
      { name: 'Emre', count: 2 },
      { name: 'Kadir', count: 1 }
    ])
    expect(new Date(chat.messages[2].ts).getHours()).toBe(21)
  })

  it('iPhone biçimini okur', () => {
    const chat = parseChat(
      ['\u200e[05.01.2026 09:01:12] Kadir: Günaydın', '[05.01.2026 09:02:40] Emre: gunaydin kanka', '[05.01.2026 09:03:00] Emre: \u200egörüntü dahil edilmedi'].join('\n')
    )
    expect(chat.messages.map((m) => m.text)).toEqual(['Günaydın', 'gunaydin kanka'])
    expect(new Date(chat.messages[0].ts).getSeconds()).toBe(12)
  })

  it('İngilizce tarih ve AM/PM saatini, ay/gün sırasını çözer', () => {
    const chat = parseChat(['12/25/26, 9:05 PM - Ali: Merry Christmas', '12/26/26, 12:10 AM - Veli: thanks <Media omitted>', '12/26/26, 8:00 AM - Veli: good morning'].join('\n'))
    expect(chat.messages).toHaveLength(2)
    const first = new Date(chat.messages[0].ts)
    expect([first.getFullYear(), first.getMonth(), first.getDate(), first.getHours()]).toEqual([2026, 11, 25, 21])
    expect(new Date(chat.messages[1].ts).getHours()).toBe(8)
  })

  it('WhatsApp dosyası olmayan metinde mesaj bulmaz', () => {
    expect(parseChat('Bu sıradan bir metin.\nİçinde tarih yok.').messages).toEqual([])
  })
})

describe('stil analizi', () => {
  const chat = parseChat(makeWhatsAppExport({ rounds: 120 }))
  const own = chat.messages.filter((m) => m.sender === 'Emre')
  const stats = analyze(
    own.map((m) => m.text),
    toBursts(chat.messages).filter((b) => b.sender === 'Emre').map((b) => b.texts.length)
  )

  it('örnek dosya beklenen büyüklükte', () => {
    expect(chat.participants.map((p) => p.name)).toEqual(['Emre', 'Kadir'])
    expect(own.length).toBeGreaterThan(200)
  })

  it('yazım alışkanlıklarını doğru sayar', () => {
    expect(stats.avgWords).toBeLessThan(4)
    expect(stats.avgBurst).toBeGreaterThan(1.8)
    expect(stats.burstTypical).toEqual([2, 2])
    expect(stats.lowercaseStart).toBeGreaterThan(0.95)
    expect(stats.endPunctuation).toBeLessThan(0.05)
    expect(stats.questionMark).toBeLessThan(0.05)
    expect(stats.turkishChars).toBeLessThan(0.1)
    expect(stats.emojiRate).toBe(0)
    expect(stats.laughter).toBe('sjsjsj')
    expect(stats.address).toContain('kanka')
    expect(stats.elongation).toBeGreaterThan(0.03)
    expect(stats.samples.length).toBeGreaterThan(5)
  })

  it('düzgün yazan birinde tersini bulur', () => {
    const kadir = analyze(chat.messages.filter((m) => m.sender === 'Kadir').map((m) => m.text), [1])
    expect(kadir.lowercaseStart).toBeLessThan(0.1)
    // Mesajlarının yarısı soru; noktayla bitenler diğer yarısı.
    expect(kadir.endPunctuation).toBeGreaterThan(0.4)
    expect(kadir.questionMark).toBeGreaterThan(0.9)
    expect(styleRules(kadir).join('\n')).toContain('soru işareti koyarsın')
    expect(kadir.turkishChars).toBeGreaterThan(0.6)
    expect(kadir.laughter).toBe('')
  })

  it('sayıları yazım kurallarına çevirir', () => {
    const rules = styleRules(stats).join('\n')
    expect(rules).toContain('küçük harfle başlarsın')
    expect(rules).toContain('nokta koymazsın')
    expect(rules).toContain('soru işareti koymazsın')
    expect(rules).toContain('Türkçe harfleri kullanmazsın')
    expect(rules).toContain('"sjsjsj"')
    expect(rules).toContain('"kanka"')
    expect(rules).toContain('Her cevapta aynı sayıda mesaj atma')
    // Sabit sayı dayatan eski kural geri gelmesin.
    expect(rules).not.toMatch(/genelde art arda \d+ kısa mesaj/)
  })

  it('art arda mesaj sayısını abartmaz ve eski kayıtlarda sabit sayı vermez', () => {
    // Yedişer dakika arayla atılan mesajlar ayrı cevaplardır.
    const spaced = parseChat(
      ['05.01.2026 09:00 - A: selam', '05.01.2026 09:01 - B: bir', '05.01.2026 09:08 - B: iki', '05.01.2026 09:15 - B: üç'].join('\n')
    )
    expect(toBursts(spaced.messages).filter((b) => b.sender === 'B').map((b) => b.texts.length)).toEqual([1, 1, 1])
    // Çok uzun cevaplar bile kuralda ve örnekte dört mesajla sınırlanır.
    const chatty = analyze(
      Array.from({ length: 60 }, (_, i) => `mesaj numara ${i}`),
      [9, 8, 10, 7, 9, 12]
    )
    expect(chatty.burstTypical).toEqual([4, 4])
    const rule = styleRules({ ...chatty, burstTypical: undefined }).find((r) => r.includes('mesajdan oluşur'))!
    expect(rule).toContain('1 ile 3 arası')
    expect(rule).toContain('Her cevapta aynı sayıda mesaj atma')
    const long = parseChat(
      ['05.01.2026 09:00 - A: anlat', ...Array.from({ length: 9 }, (_, i) => `05.01.2026 09:01 - B: parça ${i}`)].join('\n')
    )
    expect(buildPairs(long.messages, 'B')[0].reply.split('\n')).toHaveLength(4)
  })

  it('gülme ifadelerini tanır, sıradan kelimeleri karıştırmaz', () => {
    expect(laughKind('ahahah')).toBe('haha')
    expect(laughKind('hahaha')).toBe('haha')
    expect(laughKind('sjsjsj')).toBe('random')
    expect(laughKind('kdkdkdk')).toBe('random')
    for (const word of ['kanka', 'hadi', 'aaaa', 'saklı', 'dadaş', 'hafta', 'tamam']) expect(laughKind(word), word).toBeNull()
  })

  it('karşı tarafın mesajı ile kişinin cevabını eşleştirir', () => {
    const pairs = buildPairs(chat.messages, 'Emre')
    expect(pairs.length).toBeGreaterThan(100)
    expect(pairs[0]).toMatchObject({ context: 'Emre yarın maça geliyor musun?', reply: 'gelirim kanka\nsaat kacta' })
    expect(buildPairs(chat.messages, 'Emre', 10)).toHaveLength(10)
    // Altı saatten sonra gelen cevap eşleşmez.
    const late = parseChat('05.01.2026 09:00 - A: selam\n05.01.2026 19:00 - B: selam')
    expect(buildPairs(late.messages, 'B')).toEqual([])
  })
})

describe('WhatsAppService', () => {
  let db: Db
  let service: WhatsAppService
  beforeEach(() => {
    db = new Db(':memory:')
    service = new WhatsAppService(db, noSemantic)
  })
  const file = (rounds = 120): ArrayBuffer => toArrayBuffer(Buffer.from(makeWhatsAppExport({ rounds })))

  it('zip içindeki sohbet dosyasını okur', async () => {
    const zip = new JSZip()
    zip.file('WhatsApp Sohbeti - Emre.txt', makeWhatsAppExport({ rounds: 5 }))
    zip.file('foto.jpg', Buffer.from([1, 2, 3]))
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await readExport('sohbet.zip', toArrayBuffer(buffer))).toContain('Emre: gelirim kanka')
    const empty = await new JSZip().file('a.jpg', 'x').generateAsync({ type: 'nodebuffer' })
    await expect(readExport('bos.zip', toArrayBuffer(empty))).rejects.toThrow(/bulunamadı/)
  })

  it('dosyayı okur, kişiliği oluşturur ve yazım kurallarını sistem talimatına ekler', async () => {
    const preview = await service.parse('sohbet.txt', file())
    expect(preview.participants[0]).toMatchObject({ name: 'Emre' })
    expect(preview.to).toBeGreaterThan(preview.from)

    const stages: string[] = []
    const persona = await service.build({ importId: preview.importId, target: 'Emre', self: 'Kadir' }, null, (p) => stages.push(p.stage))
    expect(persona).toMatchObject({ name: 'Emre', whatsapp: true, multiMessage: true })
    expect(stages).toContain('analiz')
    expect(listPersonas(db).find((p) => p.id === persona.id)?.whatsapp).toBe(true)

    const profile = service.profile(persona.id)!
    expect(profile).toMatchObject({ sourceName: 'Emre', selfName: 'Kadir', similarity: 1 })
    expect(profile.examples).toBeGreaterThan(100)

    const block = await service.promptBlock(persona.id, 'yarın maça geliyor musun')
    expect(block).toContain('Türkçe harfleri kullanmazsın')
    expect(block).toContain('Gerçek mesajlarından örnekler:')
    // Gömme modeli olmadan ortak kelimeyle benzer durum bulunur.
    expect(block).toContain('Karşı taraf: Emre yarın maça geliyor musun?')
    expect(block).toContain('Sen: gelirim kanka')

    const system = buildSystemPrompt({ userName: 'Kadir', corporateMode: false, company: '', jobTitle: '', addressUser: 'siz' }, new Date(), {
      persona: findPersona(db, persona.id),
      styleBlock: block
    })
    expect(system).toContain("Sen Emre'sin")
    expect(system).toContain('nokta koymazsın')
    // Taklit edilen kişiye genel hitap ve üslup ayarları uygulanmaz.
    expect(system).not.toContain('diye hitap et')
    expect(system).not.toContain('Markdown')
  })

  it('benzerlik ayarı örnek sayısını değiştirir', async () => {
    const preview = await service.parse('sohbet.txt', file())
    const persona = await service.build({ importId: preview.importId, target: 'Emre', self: 'Kadir' }, null, () => {})
    service.setSimilarity(persona.id, 0)
    const styleOnly = await service.promptBlock(persona.id, 'yarın maça geliyor musun')
    expect(styleOnly).not.toContain('Benzer durumlarda')
    service.setSimilarity(persona.id, 2)
    const full = await service.promptBlock(persona.id, 'yarın maça geliyor musun')
    expect(full).toContain('Benzer durumlarda')
    expect(full).toContain('ortak anılardan')
  })

  it('aynı kişiye yeniden eklemede örnekleri çoğaltmaz, yenilerini ekler', async () => {
    const first = await service.parse('sohbet.txt', file(40))
    const persona = await service.build({ importId: first.importId, target: 'Emre', self: 'Kadir' }, null, () => {})
    const before = service.profile(persona.id)!.examples

    const same = await service.parse('sohbet.txt', file(40))
    await service.build({ importId: same.importId, target: 'Emre', self: 'Kadir', mergeInto: persona.id }, null, () => {})
    expect(service.profile(persona.id)!.examples).toBe(before)

    const longer = await service.parse('sohbet.txt', file(80))
    const merged = await service.build({ importId: longer.importId, target: 'Emre', self: 'Kadir', mergeInto: persona.id }, null, () => {})
    expect(merged.id).toBe(persona.id)
    expect(service.profile(persona.id)!.examples).toBeGreaterThan(before)
    expect(listPersonas(db).filter((p) => p.whatsapp)).toHaveLength(1)
  })

  it('az mesajı olan kişiyi ve tanınmayan dosyayı reddeder; kişilik silinince verisi de silinir', async () => {
    await expect(service.parse('not.txt', toArrayBuffer(Buffer.from('sıradan bir metin')))).rejects.toThrow(/mesajı bulunamadı/)
    const small = await service.parse('sohbet.txt', file(5))
    await expect(service.build({ importId: small.importId, target: 'Emre', self: 'Kadir' }, null, () => {})).rejects.toThrow(/en az/)
    await expect(service.build({ importId: 'yok', target: 'Emre', self: 'Kadir' }, null, () => {})).rejects.toThrow(/yeniden seçin/)

    const preview = await service.parse('sohbet.txt', file())
    const persona = await service.build({ importId: preview.importId, target: 'Emre', self: 'Kadir' }, null, () => {})
    db.deletePersona(persona.id)
    expect(service.profile(persona.id)).toBeNull()
    expect(db.countWaExamples(persona.id)).toBe(0)
  })
})

describe('İngilizce', () => {
  beforeEach(() => setLanguage('en'))
  afterEach(() => setLanguage('tr'))

  const chat = parseChat(makeWhatsAppExport({ rounds: 120 }))
  const stats = analyze(
    chat.messages.filter((m) => m.sender === 'Emre').map((m) => m.text),
    toBursts(chat.messages).filter((b) => b.sender === 'Emre').map((b) => b.texts.length)
  )

  it('styleRules İngilizce kural üretir', () => {
    const rules = styleRules(stats).join('\n')
    expect(rules).toContain('You start sentences with a lowercase letter')
    expect(rules).toContain('You do not put a period at the end')
    expect(rules).toContain('You do not use a question mark')
    expect(rules).not.toMatch(/yazarsın|koymazsın|kullandığın/)
  })

  it('Türkçe harf kuralı İngilizcede yalnızca sohbetin Türkçe olduğu görülmüşse yazılır', () => {
    const turkishRule = (s: typeof stats): boolean => styleRules(s).some((r) => r.includes('Turkish letters'))
    expect(turkishRule({ ...stats, turkishChars: 0 })).toBe(false)
    expect(turkishRule({ ...stats, turkishChars: 0.1 })).toBe(true)
    expect(turkishRule({ ...stats, turkishChars: 0.8 })).toBe(false)
    setLanguage('tr')
    expect(styleRules({ ...stats, turkishChars: 0 }).some((r) => r.includes('Türkçe harfleri'))).toBe(true)
  })

  it('kişilik ve sistem talimatına eklenen bölüm İngilizcedir', async () => {
    const db = new Db(':memory:')
    const service = new WhatsAppService(db, noSemantic)
    const data = toArrayBuffer(Buffer.from(makeWhatsAppExport({ rounds: 120 })))
    const preview = await service.parse('sohbet.txt', data)
    const persona = await service.build({ importId: preview.importId, target: 'Emre', self: 'Kadir' }, null, () => {})
    expect(persona.tagline).toMatch(/^Learned from WhatsApp chats \(\d+ messages\)$/)
    expect(persona.prompt).toContain('You are Emre, texting with Kadir on WhatsApp.')
    const block = await service.promptBlock(persona.id, 'naber')
    expect(block).toContain('Your writing rules')
    expect(block).toContain('Examples from your real messages:')
    expect(block).not.toContain('Yazım kuralların')
    await expect(service.build({ importId: 'yok', target: 'Emre', self: 'Kadir' }, null, () => {})).rejects.toThrow(/choose it again/)
    db.close()
  })
})
