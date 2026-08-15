/** "WhatsApp'tan kişi ekle" ekranı ve dosya yükleme yardımcılarının metinleri. */
export const whatsapp = {
  pageTitle: 'WhatsApp’tan kişi ekle',
  styleTitle: (name: string) => `${name}: yazış tarzı`,
  backToChat: 'Sohbete dön',

  /** İlk adım: dosya seçme */
  intro: {
    title: 'Bir yakının gibi yazan kişilik oluştur',
    lead: 'Onunla olan WhatsApp konuşmanı ver; Atlas nasıl yazdığını öğrensin ve seninle onun gibi mesajlaşsın. Dosya bu bilgisayarda işlenir, hiçbir yere gönderilmez.',
    steps: [
      'WhatsApp’ta o kişiyle olan sohbeti aç.',
      'Üstteki ada (iPhone) ya da üç noktaya (Android) dokun ve “Sohbeti dışa aktar”ı seç.',
      '“Medya olmadan” de ve çıkan dosyayı bilgisayarına gönder.'
    ],
    reading: 'Dosya okunuyor…',
    drop: 'Dosyayı buraya bırak ya da seç',
    fileTypes: '.txt ya da .zip',
    learnedBefore: 'Daha önce öğrenilenler'
  },

  /** İkinci adım: kimin taklit edileceğini seçme */
  pick: {
    title: 'Kimin gibi yazsın?',
    summary: (fileName: string, total: string, from: string, to: string) =>
      `${fileName}: ${total} mesaj, ${from} ile ${to} arası.`,
    targetLabel: 'Taklit edilecek kişi',
    /** count: sayı, formatted: yerel ayara göre yazılmış hâli */
    messageCount: (_count: number, formatted: string) => `${formatted} mesaj`,
    selfLabel: 'Bu sohbette sen hangisisin?',
    mergeTitle: (name: string) => `Var olan ${name} kişiliğine ekle`,
    mergeDescription:
      'Bu konuşmadaki yeni mesajlar önceki öğrenilenlerle birleştirilir. İşaretlemezsen aynı adla ayrı bir kişilik oluşur.',
    learn: 'Tarzını öğren',
    otherFile: 'Başka dosya seç'
  },

  /** Üçüncü adım: öğrenme sürerken */
  building: {
    title: (name: string) => `${name} nasıl yazıyor, öğreniliyor`,
    lead: 'Bu birkaç dakika sürebilir. Her şey bu bilgisayarda yapılıyor.',
    starting: 'Başlıyor…',
    stage: {
      analiz: 'Mesajlar sayılıyor',
      ozet: 'Yazış tarzı özetleniyor',
      ornekler: 'Örnek cevaplar hazırlanıyor'
    },
    progress: (stage: string, percent: number) => `${stage} (%${percent})`
  },

  /** Tarz kartı */
  sheet: {
    learned: 'Yazış tarzı öğrenildi',
    summary: (messages: string, examples: string, from: string, to: string, name: string) =>
      `${messages} mesaj ve ${examples} örnek cevap, ${from} ile ${to} arası. Bu bir taklittir; gerçek ${name} değildir.`,
    topWords: 'Sık kullandığı kelimeler',
    style: 'Tarzı',
    samples: 'Gerçek mesajlarından',
    similarityTitle: 'Ne kadar benzesin?',
    similarityLabel: 'Benzerlik',
    /** Sıra benzerlik düzeyidir: 0, 1, 2 */
    similarity: [
      { label: 'Sadece üslup', hint: 'Yalnızca yazım tarzını taklit eder; eski konuşmalardaki olaylardan söz etmez.' },
      { label: 'Dengeli', hint: 'Tarzını taklit eder ve benzer durumlarda verdiği gerçek cevaplardan esinlenir.' },
      {
        label: 'Tam taklit',
        hint: 'Daha çok gerçek cevap kullanır; eski konuşmalarda geçen kişilerden ve anılardan söz edebilir.'
      }
    ],
    startChat: (name: string) => `${name} ile sohbete başla`,
    addConversation: 'Yeni konuşma ekle'
  },

  /** Tarz kartındaki satırlar: sayıların okunur cümle karşılıkları */
  stats: {
    sometimes: 'Bazen',
    unclear: 'Belirgin değil',
    length: {
      label: 'Mesaj uzunluğu',
      average: (words: string) => `Ortalama ${words} kelime`
    },
    burst: {
      label: 'Bir cevapta',
      mostly: (n: number) => `Çoğunlukla ${n} mesaj`,
      mostlyRange: (from: number, to: number) => `Çoğunlukla ${from} ile ${to} arası mesaj`,
      average: (messages: string) => `Ortalama ${messages} mesaj`
    },
    capitals: { label: 'Büyük harf', no: 'Kullanmaz', yes: 'Kullanır' },
    period: { label: 'Cümle sonu noktası', no: 'Koymaz', yes: 'Koyar' },
    question: { label: 'Soru işareti', no: 'Koymaz', yes: 'Koyar' },
    turkishChars: { label: 'Türkçe harfler', no: 'Kullanmaz: ş yerine s, ı yerine i', yes: 'Kullanır' },
    emoji: {
      label: 'Emoji',
      rare: 'Neredeyse hiç',
      rate: (percent: number, emojis: string) => `Mesajların %${percent} kadarında ${emojis}`
    },
    laughter: { label: 'Gülüşü' },
    address: { label: 'Seslenişi' }
  },

  /** Dosya ekleme hataları (lib/files.ts) */
  files: {
    tooLarge: (name: string) => `"${name}" çok büyük. En fazla 25 MB dosya eklenebilir.`,
    imageOpenFailed: (name: string) => `"${name}" resmi açılamadı.`,
    imageProcessFailed: (name: string) => `"${name}" resmi işlenemedi.`,
    /** Adı olmayan (ör. panodan yapıştırılan) resme verilen ad */
    defaultImageName: 'resim'
  }
}
