/**
 * Testler ve elle deneme için yapay bir WhatsApp dışa aktarımı üretir.
 * "Emre" belirgin bir tarzla yazar: küçük harf, Türkçe harf yok, nokta yok,
 * "kanka" diye seslenir, "sjsjsj" diye güler, art arda kısa mesajlar atar.
 */

const DENIZ = [
  'Emre yarın maça geliyor musun?',
  'Akşam bir şeyler yiyelim mi?',
  'Toplantı çok uzun sürdü, yeni çıktım.',
  'Hafta sonu Datça planı duruyor mu?',
  'Arabayı servise verdim, perşembe alacağım.',
  'Defne bugün okulda birinci olmuş!',
  'Şu yeni diziye başladın mı?',
  'Bana şarj aletini getirebilir misin?',
  'Bugün çok yoruldum ya.',
  'Yarın sabah erken kalkmam lazım.',
  'Faturayı ödedin mi?',
  'Annemler pazar günü yemeğe çağırıyor.',
  'Yeni telefonu aldım sonunda.',
  'Spor salonuna yazıldım.',
  'Bu akşam halı saha var, unutma.',
  'İşten ayrılmayı düşünüyorum.',
  'Dün gece hiç uyuyamadım.',
  'Kahve içmeye çıkalım mı?',
  'Sunucu yine çöktü, bütün gün onunla uğraştım.',
  'Doğum günün için ne istersin?'
]

/** Her biri Emre'nin art arda attığı mesajlardır. */
const EMRE: string[][] = [
  ['gelirim kanka', 'saat kacta'],
  ['olur', 'ben aciktim zaten sjsjsj'],
  ['yaaa gecmis olsun', 'kac saat surdu'],
  ['duruyor tabi', 'ben izni aldim bile'],
  ['tamamdir', 'ne kadar tuttu'],
  ['helal olsun yegenime', 'cok sevindim yaaa'],
  ['basladim kanka', 'ilk bolum cok iyi', 'ikinciyi bekliyorum'],
  ['getiririm', 'hangisi beyaz olan mi'],
  ['bosver kanka', 'aksam bi cay iceriz gecer'],
  ['ben de', 'uyuyamiyorum su aralar'],
  ['odedim odedim', 'merak etme'],
  ['gelirim tabi', 'annenin boregi efsane sjsjsj'],
  ['hayirli olsun kanka', 'hangi model'],
  ['oha', 'kac gun dayanacaksin bakalim sjsjsj'],
  ['unutmadim', 'kaleye ben gecerim'],
  ['ciddi misin kanka', 'bi dusun derim', 'konusalim aksam'],
  ['ne oldu ki', 'bi sey mi var'],
  ['cikalim', 'yarim saate ordayim'],
  ['yine mi yaaa', 'sen oraya bi tatil yap bence'],
  ['hicbi sey kanka', 'gelmen yeter']
]

const pad = (n: number): string => String(n).padStart(2, '0')

export interface FixtureOptions {
  /** Kaç tur konuşma üretileceği (her tur 1 Deniz + 2-3 Emre mesajı) */
  rounds?: number
  format?: 'android' | 'ios'
}

export function makeWhatsAppExport({ rounds = 120, format = 'android' }: FixtureOptions = {}): string {
  const lines: string[] = []
  const stamp = (date: Date): string => {
    const d = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
    const t = `${pad(date.getHours())}:${pad(date.getMinutes())}`
    return format === 'ios' ? `[${d} ${t}:${pad(date.getSeconds())}] ` : `${d} ${t} - `
  }

  const start = new Date(2026, 0, 5, 9, 0, 0)
  lines.push(`${stamp(start)}Mesajlar ve aramalar uçtan uca şifrelidir. Daha fazla bilgi edinmek için dokunun.`)

  for (let i = 0; i < rounds; i++) {
    // Her tur üç saat sonra başlar; tur içindeki mesajlar birer dakika arayla gelir.
    const at = new Date(start.getTime() + i * 3 * 60 * 60_000)
    const k = i % DENIZ.length
    lines.push(`${stamp(at)}Deniz: ${DENIZ[k]}`)
    EMRE[k].forEach((text, j) => {
      const when = new Date(at.getTime() + (j + 1) * 60_000)
      // Aynı cümleler tekrar etmesin diye tur numarasına göre küçük değişiklikler.
      const lap = Math.floor(i / DENIZ.length)
      const varied = lap > 0 && j === 0 ? `${text} ${['ya', 'valla', 'aynen', 'kanka'][lap % 4]}` : text
      lines.push(`${stamp(when)}Emre: ${varied}`)
    })
    if (i % 9 === 4) {
      lines.push(`${stamp(new Date(at.getTime() + 5 * 60_000))}Emre: <Medya dahil edilmedi>`)
      lines.push(`${stamp(new Date(at.getTime() + 6 * 60_000))}Deniz: Bu mesaj silindi`)
    }
    if (i % 11 === 3) {
      lines.push(`${stamp(new Date(at.getTime() + 7 * 60_000))}Deniz: Şunlar lazım:`)
      lines.push('- ekmek')
      lines.push('- süt')
    }
  }
  return lines.join('\n')
}
