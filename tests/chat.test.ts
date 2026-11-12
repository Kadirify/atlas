import { afterEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../src/main/i18n'
import { buildSystemPrompt, cleanTitle, trimHistory } from '../src/main/services/chat'

describe('trimHistory', () => {
  it('bütçeyi aşınca eski mesajları atar, son mesajı hep tutar', () => {
    const messages = [
      { role: 'user' as const, content: 'a'.repeat(50) },
      { role: 'assistant' as const, content: 'b'.repeat(50) },
      { role: 'user' as const, content: 'c'.repeat(500) }
    ]
    expect(trimHistory(messages, 100)).toEqual([{ role: 'user', content: 'c'.repeat(500) }])
    expect(trimHistory(messages, 10_000)).toHaveLength(3)
  })

  it('geçmişi asistan mesajıyla başlatmaz', () => {
    const messages = [
      { role: 'user' as const, content: 'x'.repeat(100) },
      { role: 'assistant' as const, content: 'cevap' },
      { role: 'user' as const, content: 'soru' }
    ]
    expect(trimHistory(messages, 20).map((m) => m.role)).toEqual(['user'])
  })
})

describe('cleanTitle', () => {
  it('tırnak, etiket ve noktalamayı temizler', () => {
    expect(cleanTitle('"Toplantı Gündemi Hazırlığı."')).toBe('Toplantı Gündemi Hazırlığı')
    expect(cleanTitle('Başlık: **Gecikme Özrü**\n\naçıklama')).toBe('Gecikme Özrü')
    expect(cleanTitle('')).toBe('')
  })

  it('köşeli parantezi atar ve cümleyi yedi kelimeye indirir', () => {
    expect(cleanTitle('[Python Liste Tersine Çevirme]')).toBe('Python Liste Tersine Çevirme')
    expect(cleanTitle('bir iki üç dört beş altı yedi sekiz dokuz')).toBe('bir iki üç dört beş altı yedi…')
  })

  it('uzun başlığı kısaltır', () => {
    expect(cleanTitle('k'.repeat(100)).length).toBeLessThanOrEqual(60)
  })
})

describe('buildSystemPrompt', () => {
  it('kullanıcı bilgisi varsa ekler', () => {
    const p = buildSystemPrompt({ userName: 'Deniz', corporateMode: true, company: '', jobTitle: 'IT Direktörü' })
    expect(p).toContain('adı Deniz')
    expect(p).toContain('IT Direktörü')
    expect(
      buildSystemPrompt({ userName: '', corporateMode: false, company: '', jobTitle: '' })
    ).not.toContain('Kullanıcı hakkında')
  })

  it('seçilen hitaba göre sen ya da siz der', () => {
    const base = { userName: 'Deniz', corporateMode: false, company: '', jobTitle: '' }
    expect(buildSystemPrompt({ ...base, addressUser: 'siz' })).toContain('"siz" diye hitap et')
    expect(buildSystemPrompt({ ...base, addressUser: 'sen' })).toContain('"sen" diye hitap et')
  })

  it('kurumsal kullanım kapalıysa unvan ve şirketi eklemez', () => {
    const p = buildSystemPrompt({ userName: 'Deniz', corporateMode: false, company: 'Acme', jobTitle: 'IT Direktörü' })
    expect(p).toContain('adı Deniz')
    expect(p).not.toContain('Acme')
    expect(p).not.toContain('IT Direktörü')
  })
})

describe('buildSystemPrompt (İngilizce)', () => {
  afterEach(() => setLanguage('tr'))

  it('dil İngilizce olunca talimatı İngilizce kurar', () => {
    setLanguage('en')
    const p = buildSystemPrompt(
      { userName: 'Deniz', corporateMode: true, company: 'Acme', jobTitle: 'IT Director', addressUser: 'siz' },
      new Date(2026, 10, 11)
    )
    expect(p).toContain('Your name is Atlas.')
    expect(p).toContain('if unsure, reply in English')
    expect(p).toContain('Address the user formally')
    expect(p).toContain("Today's date: Wednesday, November 11, 2026.")
    expect(p).toContain('About the user: their name is Deniz, their job title is IT Director, they work at Acme.')
    expect(p).not.toContain('Kullanıcı')
  })

  it('dil geri alınınca yine Türkçe kurar', () => {
    const p = buildSystemPrompt({ userName: 'Deniz', corporateMode: false, company: '', jobTitle: '' })
    expect(p).toContain('Adın Atlas.')
    expect(p).toContain('Kullanıcı hakkında: adı Deniz.')
  })
})


import { announcesAction, asksPermission, claimsWrite, dumpsCode } from '../src/main/services/chat'

describe('yarıda kalan cevapları yakalama', () => {
  it('okuma için izin isteyen cevapları tanır', () => {
    expect(asksPermission('Bu projenin ne olduğunu anlamak için README.md en iyi başlangıç noktasıdır. Bu dosyayı okuyabilirim. Ne dersin?')).toBe(true)
    expect(asksPermission('Tüm klasörü listeleyeyim mi?')).toBe(true)
    expect(asksPermission('Would you like me to open the config file?')).toBe(true)
    expect(asksPermission('Testler geçti; sepet toplamı artık doğru hesaplanıyor.')).toBe(false)
    expect(asksPermission('Hangi müşterinin kaydını kastettin: Acar Ltd mi, Beta AŞ mi?')).toBe(false)
    expect(asksPermission('src/ Klasörü: ana modüller burada yer alabilir. İçeriklerini görmek için bu klasöre de göz atılabilir.\n\nÖzetle; basit bir örnek.')).toBe(true)
  })

  it('aracı çağırmadan işlem duyuran cevapları tanır', () => {
    expect(announcesAction('Bu değişikliği src/hesap.js dosyasına uyguluyorum.')).toBe(true)
    expect(announcesAction('I will now run the tests.')).toBe(true)
    expect(announcesAction('Değişikliği yaptım ve test geçti.')).toBe(false)
  })
})

describe('dumpsCode', () => {
  it('uzun kod bloğunu yakalar, kısa örneği ve düz metni yakalamaz', () => {
    const long = '```jsx\n' + Array.from({ length: 12 }, (_, i) => `const a${i} = ${i}`).join('\n') + '\n```'
    expect(dumpsCode(`İşte hesap makinesi:\n\n${long}`)).toBe(true)
    expect(dumpsCode('Çalıştırmak için:\n\n```bash\nnpm install\nnpm run dev\n```')).toBe(false)
    expect(dumpsCode('Dosyaları oluşturdum: index.html, app.js. Tarayıcıda index.html dosyasını aç.')).toBe(false)
  })
})

describe('claimsWrite', () => {
  it('dosyaya yazdığını söyleyen cevabı tanır', () => {
    expect(claimsWrite('src/App.js dosyasına ana bileşen kodlarını yazdım.')).toBe(true)
    expect(claimsWrite('Hesap makinesini index.html olarak kaydettim.')).toBe(true)
    expect(claimsWrite('I created the files and you can open index.html.')).toBe(true)
    expect(claimsWrite('Önce package.json dosyasını okumam gerekiyor.')).toBe(false)
  })
})

import { compactToolResults } from '../src/main/services/chat'
import type { OllamaMessage } from '../src/main/services/ollama'

describe('dürtme ve bağlam yardımcıları (denetimden)', () => {
  it('cümle başındaki "İ" de yakalanır', () => {
    expect(asksPermission('Dosyaları listeledim. İstersen README dosyasını da okuyayım mı?')).toBe(true)
    expect(claimsWrite('İndex.html dosyasına yazdım.')).toBe(true)
  })

  it('bağlam taşınca eski araç sonuçları kısalır; son turunkiler ve ilk istek kalır', () => {
    const big = 'x'.repeat(5000)
    const messages: OllamaMessage[] = [
      { role: 'system', content: 'talimat' },
      { role: 'user', content: `asıl görev ${big}` },
      { role: 'tool', tool_name: 'read_file', content: big },
      { role: 'tool', tool_name: 'read_file', content: big },
      { role: 'tool', tool_name: 'read_file', content: big }
    ]
    compactToolResults(messages, 9000, 4, '(kısaltıldı)')
    expect(messages[1].content.length).toBeGreaterThan(5000)
    expect(messages[2].content.length).toBeLessThan(400)
    expect(messages[2].content).toContain('(kısaltıldı)')
    expect(messages[4].content).toBe(big)
  })
})
