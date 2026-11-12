/** Birden çok ekranda kullanılan ortak metinler. */
export const common = {
  appName: 'Atlas',
  languageName: { tr: 'Türkçe', en: 'English' },

  tier: { baslangic: 'Başlangıç', orta: 'Orta', iyi: 'İyi', guclu: 'Güçlü' },
  tierSummary: {
    baslangic: 'Küçük modeller çalışır. Sohbet ve kısa metinler için uygun.',
    orta: 'Orta boy modeller rahat çalışır. Sohbet, e-posta ve özetleme için uygun.',
    iyi: 'Büyük modeller ekran kartında akıcı çalışır. Bütün özellikler açık.',
    guclu: 'En büyük modeller bile akıcı çalışır. Bütün özellikler en yüksek kalitede.'
  },
  fit: { rahat: 'Akıcı çalışır', yavas: 'Çalışır ama yavaş', sigmaz: 'Bu bilgisayara sığmaz' },
  speed: { good: 'Akıcı', ok: 'Yeterli', slow: 'Yavaş' },

  units: { second: 'sn', minute: 'dk', hour: 'sa', bytes: 'bayt', wordsPerSecond: 'kelime/sn' },

  /** Sohbet listesindeki tarih grupları */
  groups: { pinned: 'Sabitlenenler', today: 'Bugün', yesterday: 'Dün', lastWeek: 'Son 7 gün', older: 'Daha eski' },

  /** Henüz adlandırılmamış sohbetin görünen adı */
  newChat: 'Yeni sohbet',

  actions: {
    cancel: 'Vazgeç',
    save: 'Kaydet',
    delete: 'Sil',
    yesDelete: 'Evet, sil',
    back: 'Geri',
    continue: 'Devam et',
    close: 'Kapat',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    retry: 'Tekrar dene',
    add: 'Ekle',
    apply: 'Uygula',
    stop: 'Durdur',
    approve: 'Onayla',
    reject: 'Reddet'
  },

  /** Hafıza kayıtlarının türleri. Anahtarlar veritabanında saklanan değerlerdir. */
  memoryCategory: {
    Kişisel: 'Kişisel',
    İş: 'İş',
    Tercih: 'Tercih',
    Proje: 'Proje',
    Tarih: 'Tarih',
    Diğer: 'Diğer'
  },

  openSourceNote: (appName: string) =>
    `${appName} açık kaynaklı ve ücretsizdir. Tamamen bu bilgisayarda çalışır, verilerin sende kalır.`
}
