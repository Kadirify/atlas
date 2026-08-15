/** Atlas panelinin (ekranın sağında açılan küçük pencere) metinleri ve modele giden talimatları. */
export const panel = {
  close: 'Paneli kapat (Esc)',
  locked: 'Atlas kilitli. Paneli kullanmak için önce Atlas’ı açıp şifreni yaz.',
  openAtlas: "Atlas'ı aç",

  askTitle: 'Atlas’a sor',
  askPlaceholder: 'Sorunu yaz. Enter gönderir, Shift + Enter yeni satır ekler.',
  ask: 'Sor',
  askAgain: 'Yeni soru',

  selectionTitle: 'Seçili metin',
  selectionEmpty: 'Seçili metin bulunamadı. Metni buraya yapıştırabilir ya da yazabilirsin.',
  selectionPlaceholder: 'Üzerinde çalışılacak metin',
  words: (n: number) => `${n} kelime`,
  actionsLabel: 'Metinle ne yapılsın?',
  actions: {
    fix: 'Yazımı düzelt',
    formal: 'Resmileştir',
    shorter: 'Kısalt',
    translate: 'Çevir',
    summarize: 'Özetle',
    explain: 'Açıkla'
  },
  customPlaceholder: 'Başka bir şey iste: “daha samimi yaz”, “madde madde yap”…',
  customSend: 'Uygula',

  resultTitle: 'Sonuç',
  writing: 'Yazıyor…',
  stop: 'Durdur',
  replace: 'Yerine yaz',
  replaceHint: 'Sonucu, metni seçtiğin programda seçimin yerine yazar.',
  copy: 'Kopyala',
  copied: 'Kopyalandı',
  toChat: 'Sohbette devam et',
  replaceFailed: 'Program öne getirilemedi. Sonuç panoya kopyalandı; Ctrl+V ile yapıştırabilirsin.',
  noChange: 'Yazım hatası bulunmadı; metin aynı kaldı.',

  prompts: {
    system:
      'Kullanıcının verdiği metin üzerinde istenen işlemi yap. Yalnızca sonucu yaz: açıklama, giriş cümlesi, başlık ya da tırnak işareti ekleme. Çeviri istenmediyse metin hangi dildeyse sonuç da o dilde olsun.',
    fix: (text: string) =>
      `Şu metindeki yazım ve noktalama hatalarını düzelt, anlamı ve üslubu değiştirme. Hata yoksa metni aynen yaz. Yalnızca düzeltilmiş halini yaz:\n\n${text}`,
    formal: (text: string) =>
      `Şu metni resmi ve kibar bir dille yeniden yaz. Anlamı değiştirme, bilgi ekleme. Yalnızca yeni halini yaz:\n\n${text}`,
    shorter: (text: string) =>
      `Şu metni anlamını koruyarak belirgin biçimde kısalt. Yalnızca kısaltılmış halini yaz:\n\n${text}`,
    translate: (text: string) =>
      `Şu metin Türkçeyse İngilizceye, başka bir dildeyse Türkçeye çevir. Yalnızca çeviriyi yaz:\n\n${text}`,
    summarize: (text: string) => `Şu metni birkaç cümleyle özetle. Metinde olmayan bilgi ekleme:\n\n${text}`,
    explain: (text: string) => `Şu metni sade bir dille açıkla; ne anlatıyor, önemli noktası ne:\n\n${text}`,
    custom: (instruction: string, text: string) => `${instruction}\n\nMetin:\n${text}`
  }
}
