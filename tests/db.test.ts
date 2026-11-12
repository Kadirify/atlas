import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db, NEW_CONVERSATION_TITLE } from '../src/main/db'
import { setLanguage } from '../src/main/i18n'

afterEach(() => setLanguage('tr'))

let db: Db
beforeEach(() => {
  db = new Db(':memory:')
})

describe('Db', () => {
  it('sohbet oluşturur, sabitler, yeniden adlandırır, siler', () => {
    const a = db.createConversation('m1')
    const b = db.createConversation(null)
    expect(a.title).toBe(NEW_CONVERSATION_TITLE)
    expect(db.listConversations().map((c) => c.id)).toEqual([b.id, a.id])
    db.setPinned(a.id, true)
    expect(db.listConversations()[0].id).toBe(a.id)
    db.renameConversation(a.id, '  Bütçe  ')
    expect(db.getConversation(a.id)?.title).toBe('Bütçe')
    db.deleteConversation(a.id)
    expect(db.listConversations()).toHaveLength(1)
  })

  it('mesajları sırayla tutar ve bir mesajdan sonrasını siler', () => {
    const c = db.createConversation(null)
    const m1 = db.addMessage({ conversationId: c.id, role: 'user', content: 'bir' })
    db.addMessage({ conversationId: c.id, role: 'assistant', content: 'iki', tokens: 5, durationMs: 100 })
    const m3 = db.addMessage({ conversationId: c.id, role: 'user', content: 'üç' })
    db.addMessage({ conversationId: c.id, role: 'assistant', content: 'dört', partial: true })
    expect(db.listMessages(c.id).map((m) => m.content)).toEqual(['bir', 'iki', 'üç', 'dört'])
    expect(db.listMessages(c.id)[3].partial).toBe(true)
    db.deleteFrom(c.id, m3.createdAt)
    expect(db.listMessages(c.id).map((m) => m.content)).toEqual(['bir', 'iki'])
    expect(m1.createdAt).toBeLessThan(m3.createdAt)
  })

  it('sohbet silinince mesajları da silinir', () => {
    const c = db.createConversation(null)
    db.addMessage({ conversationId: c.id, role: 'user', content: 'kalıcı değil' })
    db.deleteConversation(c.id)
    expect(db.search('kalıcı')).toEqual([])
  })

  it('başlıkta ve mesaj içeriğinde arar', () => {
    const a = db.createConversation(null)
    db.renameConversation(a.id, 'Tatil planı')
    db.addMessage({ conversationId: a.id, role: 'user', content: 'Antalya için otel öner' })
    const b = db.createConversation(null)
    db.addMessage({ conversationId: b.id, role: 'user', content: 'Sunucu bakım duyurusu yaz' })

    expect(db.search('tatil').map((h) => h.conversationId)).toEqual([a.id])
    expect(db.search('duyuru').map((h) => h.conversationId)).toEqual([b.id])
    expect(db.search('duyuru')[0].snippet).toContain('duyurusu')
    expect(db.search('otel antalya')).toHaveLength(1)
    expect(db.search('yok-böyle-bir-şey')).toEqual([])
    expect(db.search('"')).toEqual([])
    expect(db.search('100%')).toEqual([])
  })

  it('ayarları saklar ve bilinmeyen anahtarı yok sayar', () => {
    expect(db.getSettings().setupDone).toBe(false)
    db.setSettings({ setupDone: true, userName: 'Deniz', ...({ hack: 1 } as object) })
    const s = db.getSettings()
    expect(s.setupDone).toBe(true)
    expect(s.userName).toBe('Deniz')
    expect('hack' in s).toBe(false)
  })
})

describe('hazır uygulama hatası', () => {
  const builtin = { id: 'builtin:deneme', name: 'Deneme', description: '', icon: 'mail', category: 'Yazı', prompt: 'p', fields: [] }

  it('varsayılan dilde Türkçe, İngilizcede İngilizce hata verir', () => {
    db.syncBuiltinApps([builtin as never])
    const { id, ...draft } = builtin
    expect(() => db.saveApp(draft as never, id)).toThrow('Hazır uygulamalar değiştirilemez. Önce bir kopyasını oluşturun.')
    setLanguage('en')
    expect(() => db.saveApp(draft as never, id)).toThrow("Built-in apps can't be edited. Make a copy first.")
  })
})

describe('belge paneli', () => {
  it('özgün dosyayı saklar ve geri verir; düz metin dosyalarında özgün görünüm yoktur', () => {
    const bytes = Buffer.from([1, 2, 3, 250])
    const pdf = db.addAttachment({ name: 'Rapor.PDF', kind: 'text', mime: 'application/pdf', size: 4, text: 'metin', data: null, original: bytes })
    expect(db.getDocument(pdf.id)).toMatchObject({ view: 'pdf', hasOriginal: true })
    expect(db.getOriginal(pdf.id)).toEqual({ name: 'Rapor.PDF', bytes })
    const txt = db.addAttachment({ name: 'not.txt', kind: 'text', mime: 'text/plain', size: 4, text: 'metin', data: null })
    expect(db.getDocument(txt.id)).toMatchObject({ view: null, hasOriginal: false })
    expect(db.getOriginal(txt.id)).toBeNull()
  })

  const add = (text: string, kind: 'text' | 'image' = 'text') =>
    db.addAttachment({ name: 'cv.pdf', kind, mime: 'application/pdf', size: 10, text, data: kind === 'image' ? 'AAAA' : null })

  it('düzenlenen hali saklar; modele düzenlenmiş hali gider, özgün metin değişmez', () => {
    const a = add('özgün metin')
    expect(db.getDocument(a.id)).toEqual({ id: a.id, name: 'cv.pdf', text: 'özgün metin', edited: false, view: 'pdf', hasOriginal: false })
    db.saveDocument(a.id, 'düzeltilmiş metin')
    expect(db.getDocument(a.id)).toMatchObject({ text: 'düzeltilmiş metin', edited: true })
    expect(db.attachmentContents([a.id])[0].text).toBe('düzeltilmiş metin')
    db.resetDocument(a.id)
    expect(db.getDocument(a.id)).toMatchObject({ text: 'özgün metin', edited: false })
    expect(db.attachmentContents([a.id])[0].text).toBe('özgün metin')
  })

  it('özgün metne geri dönülürse düzenleme kaydı silinir; resim belge sayılmaz', () => {
    const a = add('aynı')
    db.saveDocument(a.id, 'başka')
    db.saveDocument(a.id, 'aynı')
    expect(db.getDocument(a.id)?.edited).toBe(false)
    expect(db.getDocument(add('', 'image').id)).toBeNull()
    expect(db.getDocument('olmayan')).toBeNull()
    db.saveDocument('olmayan', 'x')
  })
})
