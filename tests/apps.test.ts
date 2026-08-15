import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP_CATEGORIES, APP_ICONS, type MiniApp } from '../src/shared/types'
import { Db } from '../src/main/db'
import { setLanguage } from '../src/main/i18n'
import { buildRunMessages, corporateBlock, formatValues, missingRequired, sanitizeDraft } from '../src/main/services/apps'
import { BUILTIN_APPS, builtinApps } from '../src/main/services/builtinApps'
import { buildImproveMessages } from '../src/main/services/studio'
import { stripFence } from '../src/renderer/src/lib/format'

describe('sanitizeDraft', () => {
  it('geçerli taslağı korur', () => {
    const draft = sanitizeDraft({
      name: ' IT e-postası ',
      description: 'Kısa açıklama',
      icon: 'mail',
      category: 'IT',
      prompt: 'Sen bir IT direktörüsün.',
      fields: [
        { key: 'alici', label: 'Alıcı', type: 'text', placeholder: 'Ayşe Hanım', options: [], required: true },
        { label: 'Ton', type: 'select', options: ['Resmi', 'Samimi'], required: true }
      ]
    })
    expect(draft.name).toBe('IT e-postası')
    expect(draft.fields.map((f) => f.key)).toEqual(['alici', 'alan_2'])
    expect(draft.fields[1].options).toEqual(['Resmi', 'Samimi'])
  })

  it('bozuk veriyi varsayılanlarla onarır', () => {
    const draft = sanitizeDraft({
      name: 'Deneme',
      prompt: 'Talimat',
      icon: 'yok-boyle-ikon',
      category: 'Uydurma',
      fields: [
        { label: '', type: 'text' },
        { label: 'Seçim', type: 'select', options: ['tek'] },
        { label: 'Garip', type: 'slider' },
        { key: 'a', label: 'Bir', type: 'toggle', required: true },
        { key: 'a', label: 'İki', type: 'text' },
        'metin',
        null
      ]
    })
    expect(draft.icon).toBe('sparkles')
    expect(draft.category).toBe('Diğer')
    expect(draft.fields.map((f) => [f.label, f.type])).toEqual([
      ['Seçim', 'text'],
      ['Garip', 'text'],
      ['Bir', 'toggle'],
      ['İki', 'text']
    ])
    expect(draft.fields[2].required).toBe(false)
    expect(sanitizeDraft({ name: 'A', prompt: 'B', fields: [{ label: 'Ton', type: 'select', options: ['x', 'y'], required: false }] }).fields[0].required).toBe(true)
    expect(new Set(draft.fields.map((f) => f.key)).size).toBe(4)
  })

  it('alan yoksa tek alanlı form verir, ad ya da prompt yoksa hata verir', () => {
    expect(sanitizeDraft({ name: 'A', prompt: 'B' }).fields).toHaveLength(1)
    expect(() => sanitizeDraft({ prompt: 'B' })).toThrow()
    expect(() => sanitizeDraft({ name: 'A' })).toThrow()
    expect(() => sanitizeDraft(null)).toThrow()
    expect(() => sanitizeDraft('metin')).toThrow()
  })
})

describe('hazır uygulamalar', () => {
  it('hepsi geçerli ve kimlikleri benzersiz', () => {
    // Liste bilerek kısa: galeri kalabalıklaşmasın.
    expect(BUILTIN_APPS.length).toBeGreaterThanOrEqual(6)
    expect(BUILTIN_APPS.length).toBeLessThanOrEqual(12)
    expect(new Set(BUILTIN_APPS.map((a) => a.id)).size).toBe(BUILTIN_APPS.length)
    for (const app of BUILTIN_APPS) {
      const clean = sanitizeDraft(app)
      expect(clean.fields, app.id).toEqual(app.fields)
      expect(APP_ICONS, app.id).toContain(app.icon)
      expect(APP_CATEGORIES, app.id).toContain(app.category)
      expect(app.prompt.length, app.id).toBeGreaterThan(150)
      expect(app.description.length, app.id).toBeLessThanOrEqual(160)
    }
  })

  it('metin araçları herkese, diğerleri kurumsal kullanıma açık', () => {
    const open = BUILTIN_APPS.filter((a) => !a.corporate)
    expect(open.length).toBeGreaterThan(0)
    expect(open.every((a) => a.category === 'Metin')).toBe(true)
  })
})

describe('form değerleri', () => {
  const fields = sanitizeDraft({
    name: 'A',
    prompt: 'B',
    fields: [
      { key: 'alici', label: 'Alıcı', type: 'text' },
      { key: 'mesaj', label: 'Ana mesaj', type: 'textarea' },
      { key: 'not', label: 'Not', type: 'text', required: false },
      { key: 'liste', label: 'Listele', type: 'toggle' }
    ]
  }).fields

  it('değerleri etiketleriyle yazar, boş isteğe bağlı alanı atlar', () => {
    const text = formatValues(fields, { alici: 'Ayşe Hanım', mesaj: 'Satır 1\nSatır 2', not: ' ', liste: 'true' })
    expect(text).toBe('Alıcı: Ayşe Hanım\n\nAna mesaj:\nSatır 1\nSatır 2\n\nListele: Evet')
  })

  it('boş zorunlu alanları bulur; dosya eklendiyse uzun metin alanı boş kalabilir', () => {
    expect(missingRequired(fields, {}, false)).toEqual(['Alıcı', 'Ana mesaj'])
    expect(missingRequired(fields, {}, true)).toEqual(['Alıcı'])
    expect(missingRequired(fields, { alici: 'x', mesaj: 'y' }, false)).toEqual([])
  })
})

describe('corporateBlock', () => {
  const base = { userName: 'Kadir', jobTitle: 'IT Direktörü', company: 'Acme', signature: 'Saygılarımla,\nKadir' }
  it('kurumsal kullanım açıkken unvan, şirket ve imzayı verir', () => {
    const block = corporateBlock({ ...base, corporateMode: true })
    expect(block).toContain('IT Direktörü')
    expect(block).toContain('Acme')
    expect(block).toContain('Saygılarımla,\nKadir')
  })
  it('seçilen hitap ve kapanışı verir; imza varsa kapanış yerine imza kullanılır', () => {
    const plain = corporateBlock({ ...base, corporateMode: false, salutation: 'Merhaba', closing: 'İyi çalışmalar' })
    expect(plain).toContain('"Merhaba" ile hitap et')
    expect(plain).toContain('"İyi çalışmalar," ile bitir')
    const signed = corporateBlock({ ...base, corporateMode: true, salutation: 'Sayın', closing: 'İyi çalışmalar' })
    expect(signed).toContain('"Sayın" ile hitap et')
    expect(signed).not.toContain('İyi çalışmalar')
    expect(signed).toContain('Saygılarımla,\nKadir')
  })

  it('kapalıyken yalnızca adı verir', () => {
    const block = corporateBlock({ ...base, corporateMode: false })
    expect(block).toContain('Kadir')
    expect(block).not.toContain('Acme')
    expect(block).not.toContain('Saygılarımla')
  })
})

describe('buildRunMessages', () => {
  let db: Db
  let app: MiniApp
  beforeEach(() => {
    db = new Db(':memory:')
    db.syncBuiltinApps(BUILTIN_APPS)
    app = db.getApp('builtin:email')!
  })
  const values = {
    alan_1: 'Yeni e-posta',
    alan_2: 'Ayşe Hanım',
    alan_3: 'Yenileme teklifi bekliyoruz',
    alan_4: '',
    alan_5: 'Resmi',
    alan_6: 'Kısa'
  }

  it('talimatı, ortak kuralları ve form değerlerini modele verir', () => {
    db.setSettings({ corporateMode: true, userName: 'Kadir', company: 'Acme' })
    const [system, user] = buildRunMessages(app, { appId: app.id, values, attachmentIds: [] }, db)
    expect(system.content).toContain(app.prompt)
    expect(system.content).toContain('Verilmeyen bilgiyi uydurma')
    expect(system.content).toContain('aynen kullan')
    expect(system.content).toContain('Acme')
    expect(user.content).toContain('Alıcı: Ayşe Hanım')
  })

  it('zorunlu alan boşsa hata verir', () => {
    expect(() => buildRunMessages(app, { appId: app.id, values: {}, attachmentIds: [] }, db)).toThrow(/Alıcı/)
  })

  it('ek dosyanın metnini ekler', () => {
    const file = db.addAttachment({ name: 'notlar.txt', kind: 'text', mime: 'text/plain', size: 10, text: 'Dosyadaki not', data: null })
    const [, user] = buildRunMessages(app, { appId: app.id, values, attachmentIds: [file.id] }, db)
    expect(user.content).toContain('[Ek dosya: notlar.txt]')
    expect(user.content).toContain('Dosyadaki not')
  })

  it('yeniden yazdırmada önceki sonucu ve talimatı ekler', () => {
    const messages = buildRunMessages(
      app,
      { appId: app.id, values, attachmentIds: [], refine: { previous: 'Eski metin', instruction: 'Kısalt' } },
      db
    )
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[3].content).toContain('Kısalt')
  })
})

describe('veritabanı: mini uygulamalar', () => {
  let db: Db
  beforeEach(() => {
    db = new Db(':memory:')
    db.syncBuiltinApps(BUILTIN_APPS)
  })
  const draft = sanitizeDraft({ name: 'Benim uygulamam', prompt: 'Talimat', fields: [{ label: 'Konu', type: 'text' }] })

  it('hazır uygulamaları eşitler, tekrar eşitlemede çoğaltmaz ve sık kullanılanı korur', () => {
    db.setAppFavorite('builtin:email', true)
    db.syncBuiltinApps(BUILTIN_APPS)
    expect(db.listApps()).toHaveLength(BUILTIN_APPS.length)
    expect(db.getApp('builtin:email')?.favorite).toBe(true)
    db.syncBuiltinApps(BUILTIN_APPS.slice(1))
    expect(db.getApp(BUILTIN_APPS[0].id)).toBeNull()
  })

  it('uygulama başına model seçimi saklanır ve hazır uygulamalar eşitlenince korunur', () => {
    expect(db.getApp('builtin:email')?.model).toBeNull()
    db.setAppModel('builtin:email', 'gemma4:12b')
    db.syncBuiltinApps(BUILTIN_APPS)
    expect(db.getApp('builtin:email')?.model).toBe('gemma4:12b')
    db.setAppModel('builtin:email', null)
    expect(db.getApp('builtin:email')?.model).toBeNull()
  })

  it('kullanıcı uygulamasını kaydeder, günceller, siler; hazır uygulamaya dokunmaz', () => {
    const saved = db.saveApp(draft)
    expect(saved.builtin).toBe(false)
    expect(db.saveApp({ ...draft, name: 'Yeni ad' }, saved.id).name).toBe('Yeni ad')
    expect(() => db.saveApp(draft, 'builtin:email')).toThrow()
    db.deleteApp('builtin:email')
    expect(db.getApp('builtin:email')).not.toBeNull()
    db.deleteApp(saved.id)
    expect(db.getApp(saved.id)).toBeNull()
  })

  it('çalıştırma geçmişini tutar, uygulama silinince geçmişi de silinir', () => {
    const saved = db.saveApp(draft)
    const first = db.addRun({ appId: saved.id, values: { alan_1: 'a' }, output: 'bir', model: 'm' })
    db.addRun({ appId: saved.id, values: { alan_1: 'b' }, output: 'iki', model: 'm' })
    expect(db.listRuns(saved.id).map((r) => r.output)).toEqual(['iki', 'bir'])
    expect(db.getRun(first.id)?.values).toEqual({ alan_1: 'a' })
    db.deleteApp(saved.id)
    expect(db.getRun(first.id)).toBeNull()
  })
})

describe('stripFence', () => {
  it('metnin tamamını saran kod bloğunu atar, içerideki bloklara dokunmaz', () => {
    expect(stripFence('```\n## Rol\nSen bir editörsün.\n```')).toBe('## Rol\nSen bir editörsün.')
    expect(stripFence('```markdown\n## Rol\n```\n')).toBe('## Rol')
    expect(stripFence('  ## Rol\nDüz metin  ')).toBe('## Rol\nDüz metin')
    const inner = 'Örnek:\n```js\nx()\n```\nson'
    expect(stripFence(inner)).toBe(inner)
    const two = '```\na\n```\narada\n```\nb\n```'
    expect(stripFence(two)).toBe(two)
  })
})

describe('buildImproveMessages', () => {
  it('kısa isteği verir; boşsa hata verir', () => {
    const messages = buildImproveMessages({ request: 'IT direktörü gibi mail hazırla' })
    expect(messages).toHaveLength(2)
    expect(messages[1].content).toContain('IT direktörü gibi mail hazırla')
    expect(() => buildImproveMessages({ request: '  ' })).toThrow()
  })
  it('yeniden geliştirmede önceki promptu ve talimatı ekler', () => {
    const messages = buildImproveMessages({ request: 'x', refine: { previous: 'Eski prompt', instruction: 'Daha kısa' } })
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[3].content).toContain('Daha kısa')
  })
})

describe('İngilizce', () => {
  afterEach(() => setLanguage('tr'))

  it('hazır uygulamalar iki dilde aynı kimliklere, alan anahtarlarına ve alan türlerine sahip', () => {
    const tr = builtinApps('tr')
    const en = builtinApps('en')
    expect(tr).toBe(BUILTIN_APPS)
    const shape = (apps: typeof tr) =>
      apps.map((a) => ({
        id: a.id,
        icon: a.icon,
        category: a.category,
        corporate: a.corporate,
        fields: a.fields.map((f) => [f.key, f.type, f.required, f.options.length])
      }))
    expect(shape(en)).toEqual(shape(tr))

    for (const app of en) {
      const clean = sanitizeDraft(app)
      expect(clean.fields, app.id).toEqual(app.fields)
      expect(clean.name, app.id).toBe(app.name)
      expect(app.prompt.length, app.id).toBeGreaterThan(150)
      expect(app.description.length, app.id).toBeLessThanOrEqual(160)
      // Türkçe metin kalmamış olmalı (kategori anahtarı hariç).
      const texts = [app.name, app.description, app.prompt, ...app.fields.flatMap((f) => [f.label, f.placeholder, ...f.options])]
      expect(texts.join('\n'), app.id).not.toMatch(/[ğşıİĞŞ]/)
    }
  })

  it('İngilizce talimatta anlatılan tür adları formdaki seçeneklerle birebir aynı', () => {
    let checked = 0
    for (const app of builtinApps('en')) {
      // Talimatta `- "Tür adı": ...` biçiminde anlatılan her tür, açılır listelerden birinin seçeneği olmalı.
      const described = [...app.prompt.matchAll(/^- "([^"]+)"(?: or "([^"]+)")?:/gm)].flatMap((m) => [m[1], m[2]]).filter(Boolean)
      const options = app.fields.filter((f) => f.type === 'select').flatMap((f) => f.options)
      for (const name of described) {
        expect(options, `${app.id}: ${name}`).toContain(name)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(15)
  })

  it('buildRunMessages İngilizce kuralları ve şablonları kullanır', () => {
    setLanguage('en')
    const db = new Db(':memory:')
    db.syncBuiltinApps(builtinApps('en'))
    const app = db.getApp('builtin:email')!
    db.setSettings({ corporateMode: true, userName: 'Kadir', company: 'Acme', salutation: 'Dear', closing: 'Best regards' })
    const values = {
      alan_1: 'New email',
      alan_2: 'Ms. Taylor',
      alan_3: 'We need the renewal quote',
      alan_4: '',
      alan_5: 'Formal',
      alan_6: 'Short'
    }
    const messages = buildRunMessages(
      app,
      { appId: app.id, values, attachmentIds: [], refine: { previous: 'Draft', instruction: 'make it shorter' } },
      db
    )
    const system = messages[0].content
    expect(system).toContain('"Subject:"')
    expect(system).toContain('General rules:')
    expect(system).toContain('Write in English unless asked otherwise.')
    expect(system).toContain('- Company: Acme')
    expect(system).toContain('Address the recipient with "Dear"')
    expect(system).not.toContain('Genel kurallar')
    expect(messages[1].content).toContain('Recipient: Ms. Taylor')
    expect(messages.at(-1)!.content).toContain('Rewrite the text above according to this instruction: make it shorter')

    expect(() => buildRunMessages(app, { appId: app.id, values: {}, attachmentIds: [] }, db)).toThrow(/cannot be left empty: .*Recipient/)
    expect(() => sanitizeDraft({ prompt: 'B' })).toThrow('The app has no name.')
    expect(sanitizeDraft({ name: 'A', prompt: 'B' }).fields[0].label).toBe('Request')
    expect(
      formatValues([{ key: 'a', label: 'Urgent', type: 'toggle', placeholder: '', options: [], required: false }], { a: 'true' })
    ).toBe('Urgent: Yes')
    db.close()
  })
})
