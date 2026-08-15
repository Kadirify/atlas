/** Ayarlar penceresinin metinleri. */
export const settings = {
  title: 'Ayarlar',
  sectionsLabel: 'Ayar bölümleri',
  closeLabel: 'Ayarları kapat',

  /** Anahtarlar kod içindeki sekme kimlikleridir. */
  tabs: {
    genel: 'Genel',
    masaustu: 'Arka plan ve kilit',
    kisilikler: 'Kişilikler',
    hafiza: 'Hafıza',
    klasorler: 'Klasörler',
    modeller: 'Modeller',
    hakkinda: 'Hakkında'
  },

  confirmDelete: 'Silinsin mi?',
  connecting: 'Bağlanılıyor…',
  downloadProgress: (percent: number, done: string, total: string) => `%${percent}, ${done} / ${total}`,

  general: {
    appearance: 'Görünüm',
    themeLabel: 'Tema',
    theme: { system: 'Sistemle aynı', light: 'Açık', dark: 'Koyu' },

    language: 'Dil',
    languageHint: "Arayüzün ve Atlas'ın yazdığı metinlerin dili.",

    addressTitle: 'Atlas sana nasıl hitap etsin?',
    addressHint: 'Sohbetlerde kullanılır.',
    yourName: 'Adın',
    addressLabel: 'Sen ya da siz',
    address: { sen: 'Sen', siz: 'Siz' },

    lettersTitle: 'Yazılarda hitap',
    lettersHint: 'Uygulamaların yazdığı e-posta ve mektuplarda kullanılır. Listeden seç ya da kendin yaz.',
    salutation: 'Başlangıç',
    closing: 'Kapanış',
    salutationSuggestions: ['Sayın', 'Merhaba', 'Merhabalar', 'Değerli', 'İyi günler'],
    closingSuggestions: ['Saygılarımla', 'İyi çalışmalar', 'Teşekkür ederim', 'Selamlar', 'Sevgiler'],
    sampleName: 'Ayşe Hanım',

    corporateTitle: 'Kurumsal kullanım',
    corporateCheck: 'Kurumsal işlerde de kullanacağım',
    corporateDescription:
      'E-posta, toplantı, duyuru ve belge uygulamaları açılır. Unvanın, şirketin ve imzan bu yazılara eklenir.',
    jobTitle: 'Unvanın',
    company: 'Şirket',
    signature: 'E-posta imzası',
    signatureHint: 'İmza varsa kapanış yerine imza kullanılır.',

    saveChanges: 'Değişiklikleri kaydet',
    saved: 'Kaydedildi'
  },

  desktop: {
    backgroundTitle: 'Arka planda çalışma',
    closeToTray: 'Pencereyi kapatınca arka planda çalışsın',
    closeToTrayDescription:
      "Atlas görev çubuğunun sağındaki simgelerin arasında bekler; yazılmakta olan cevaplar yarıda kalmaz. Tamamen kapatmak için simgeye sağ tıklayıp \"Atlas'tan çık\"ı seç.",
    launchAtLogin: 'Bilgisayar açılınca başlat',
    launchAtLoginDescription: 'Atlas pencere açmadan, arka planda başlar.',
    launchAtLoginDevNote: 'Bu ayar yalnızca kurulum dosyasıyla kurulan Atlas’ta çalışır.',

    notifyWhenDone: 'Cevap hazır olunca bildir',
    notifyWhenDoneDescription: 'Atlas penceresi önde değilken biten cevaplar için Windows bildirimi gösterir.',

    shortcutsTitle: 'Her yerden Atlas',
    shortcutsHint:
      'Bu kısayollar başka bir programdayken de çalışır ve ekranın sağında Atlas panelini açar. Seçtiğin tuş o programdaki aynı kısayolun yerine geçer.',
    quickShortcut: 'Soru sor',
    quickShortcutHint: 'Boş bir soru kutusu açar.',
    selectionShortcut: 'Seçili metinle çalış',
    selectionShortcutHint:
      'Önce metni seç, sonra kısayola bas: metin panelde görünür; düzeltir, çevirir, özetler. Metni almak için o programa Ctrl+C gönderilir.',
    shortcutOff: 'Kapalı',
    spaceKey: 'Boşluk',
    shortcutTaken: (key: string) => `${key} kısayolu başka bir program tarafından kullanılıyor. Başka bir tuş seç.`,
    shortcutSame: 'İki kısayol aynı olamaz.',
    selectionWindowsOnly: 'Seçili metinle çalışma şimdilik yalnızca Windows’ta var.',

    lockTitle: 'Uygulama kilidi',
    lockOff: 'Kilit kapalı. Atlas’ı açan herkes sohbetlerini görebilir.',
    lockOn: 'Kilit açık. Atlas açılırken, pencere kapatılınca ve bilgisayar kilitlenince şifre sorar.',
    lockLimits:
      'Şifreni unutursan sıfırlanamaz; sohbetlere ulaşmanın yolu kalmaz. Kilit ekranı korur, veritabanı dosyasını şifrelemez.',
    newPin: 'Yeni şifre',
    newPinAgain: 'Yeni şifre (tekrar)',
    currentPin: 'Geçerli şifre',
    pinHint: (min: number) => `En az ${min} karakter. Rakam, harf ya da ikisi birden olabilir.`,
    mismatch: 'İki şifre aynı değil.',
    enable: 'Kilidi aç',
    change: 'Şifreyi değiştir',
    disable: 'Kilidi kaldır',
    lockNow: 'Şimdi kilitle',
    enabled: 'Kilit açıldı.',
    changed: 'Şifre değiştirildi.',
    disabled: 'Kilit kaldırıldı.',
    autoLock: 'Bilgisayar boş kalınca kilitle',
    autoLockOff: 'Kilitleme',
    minutes: (n: number) => `${n} dakika sonra`,
    shortcut: 'Kısayol: Ctrl+L'
  },

  lockScreen: {
    title: 'Atlas kilitli',
    hint: 'Devam etmek için şifreni yaz.',
    password: 'Şifre',
    unlock: 'Kilidi aç',
    wait: (seconds: number) => `${seconds} saniye sonra tekrar deneyebilirsin.`
  },

  models: {
    checking: 'Kontrol ediliyor…',
    running: (version: string | null) => `Çalışıyor (sürüm ${version})`,
    installedNotRunning: 'Kurulu ama çalışmıyor',
    notInstalled: 'Kurulu değil',
    startOllama: "Ollama'yı başlat",

    installedTitle: 'Kurulu modeller',
    installedHint: 'Varsayılan model yeni sohbetlerde kullanılır.',
    noneInstalled: 'Kurulu model yok. Aşağıdan bir model indir.',
    default: 'Varsayılan',
    makeDefault: 'Varsayılan yap',
    deleteModel: (name: string) => `${name} modelini sil`,

    downloadableTitle: 'İndirilebilir modeller',
    downloadableHint: 'Uygunluk bu bilgisayarın donanımına göre hesaplanır.',
    recommended: 'Önerilen',
    pause: 'Duraklat',
    download: 'İndir'
  },

  about: {
    version: (version: string) => `Sürüm ${version}`,
    privacy:
      'Sohbetlerin ve ayarların sadece bu bilgisayarda saklanır. Uygulama internete yalnızca model indirirken ve sen güncelleme denetlediğinde bağlanır.',
    openSource: (appName: string) =>
      `${appName} açık kaynaklı ve ücretsizdir. Kaynak kodu MIT lisansıyla yayımlanır: inceleyebilir, değiştirebilir ve kendi işinde kullanabilirsin.`,
    updatesTitle: 'Güncellemeler',
    updatesHint: 'Yeni sürüme ve yeni Atlas modellerine GitHub deposundan bakar. Depoya hiçbir bilgi gönderilmez.',
    checkUpdates: 'Güncellemeleri denetle',
    checking: 'Denetleniyor…',
    upToDate: 'En güncel sürümü kullanıyorsun.',
    noRelease: 'Henüz yayımlanmış bir sürüm yok.',
    updateAvailable: (version: string) => `Yeni sürüm hazır: ${version}`,
    download: 'İndirme sayfasını aç',
    notesTitle: 'Bu sürümde neler değişti',
    downloadAndInstall: (mb: number) => `İndir (${mb} MB)`,
    downloading: (percent: number) => `İndiriliyor… %${percent}`,
    readyToInstall: 'İndirildi ve denetlendi. Kurulum başlayınca Atlas kapanır; sohbetlerin silinmez.',
    install: 'Kur ve Atlas’ı yeniden başlat',
    whatsNewTitle: (version: string) => `Atlas ${version} kuruldu`,
    whatsNewClose: 'Tamam',
    modelsUpdated: 'Atlas model listesi yenilendi.',
    wizardTitle: 'Kurulum sihirbazı',
    wizardHint: 'Bilgisayarı yeniden tarar ve model önerir. Sohbetlerin silinmez.',
    restartWizard: 'Sihirbazı yeniden başlat'
  },

  personas: {
    title: 'Kişilikler',
    description:
      'Yeni sohbete başlarken kiminle konuşacağını seçersin. Hazır olanları kopyalayıp değiştirebilir ya da kendi kişiliğini oluşturabilirsin.',
    newPersona: 'Yeni kişilik',
    addFromWhatsapp: 'WhatsApp’tan ekle',
    viewStyle: 'Tarzı gör',
    duplicateLabel: (name: string) => `${name} kişiliğinin kopyasını oluştur`,
    editLabel: (name: string) => `${name} kişiliğini düzenle`,
    deleteLabel: (name: string) => `${name} kişiliğini sil`,
    copyName: (name: string) => `${name} (kopya)`,

    editTitle: 'Kişiliği düzenle',
    name: 'Ad',
    tagline: 'Kısa tanım',
    taglinePlaceholder: 'Örn. bilge ve sabırlı bir dede',
    icon: 'Simge',
    prompt: 'Nasıl biri?',
    promptHint: 'Kim olduğunu ve nasıl konuştuğunu kendi cümlelerinle anlat.',
    promptPlaceholder:
      'Örn. Sen kullanıcının bilge dedesisin. Sakin ve ağır konuşursun, atasözlerini seversin, her derde bir hikâyeyle karşılık verirsin.',
    warmth: 'Samimiyet',
    warmthLevels: ['Mesafeli', 'Dengeli', 'Sıcak'] as [string, string, string],
    humor: 'Mizah',
    humorLevels: ['Yok', 'Az', 'Esprili'] as [string, string, string],
    length: 'Cevap uzunluğu',
    lengthLevels: ['Kısa', 'Orta', 'Uzun'] as [string, string, string],
    emoji: 'Emoji',
    emojiLevels: ['Yok', 'Az', 'Bol'] as [string, string, string],
    multiMessage: 'Mesajlaşır gibi yazsın',
    multiMessageDescription:
      'Tek uzun cevap yerine art arda kısa mesajlar gönderir; başlık ve liste kullanmaz. Sana her zaman “sen” der.',
    savePersona: 'Kişiliği kaydet'
  },

  memory: {
    enable: 'Atlas beni hatırlasın',
    enableDescription:
      'Sohbetlerde kendin hakkında söylediklerinden kalıcı olanları (işin, yakınların, tercihlerin, süren işlerin) öğrenir ve sonraki sohbetlerde kullanır. Bilgiler yalnızca bu bilgisayarda durur.',
    knownTitle: 'Senin hakkında bildikleri',
    empty: 'Henüz bir şey öğrenmedi. Sohbet ettikçe burası dolar; istersen kendin de ekleyebilirsin.',
    count: (n: number) => `${n} bilgi. Yanlış ya da gereksiz olanı düzeltebilir ya da silebilirsin.`,
    addPlaceholder: 'Örn. Kullanıcı kahvesini şekersiz içer.',
    addLabel: 'Hafızaya eklenecek bilgi',
    textLabel: 'Bilgi',
    categoryLabel: 'Tür',
    rowMeta: (category: string, date: string, manual: boolean) =>
      `${category}, ${date}${manual ? ', elle eklendi' : ''}`,
    editLabel: 'Bu bilgiyi düzenle',
    forgetLabel: 'Bu bilgiyi unut',
    confirmClear: 'Bütün bilgiler kalıcı olarak silinsin mi?',
    yesDeleteAll: 'Evet, hepsini sil',
    clearAll: 'Bütün hafızayı sil',

    semanticTitle: 'Anlamca arama',
    semanticOn: 'Açık. Kayıtlar çoğaldığında konuyla ilgili olanlar anlamına göre bulunur.',
    semanticDescription:
      '20 bilgiye kadar hepsi her sohbette kullanılır. Daha fazlası olduğunda konuyla ilgili olanları anlamına göre bulmak için küçük bir yardımcı model gerekir. Kurulmazsa ortak kelimelere bakılır.',
    downloadHelper: (sizeGb: string) => `Yardımcı modeli indir (${sizeGb} GB)`
  },

  folders: {
    title: 'Klasörler',
    description:
      'Atlas yalnızca burada izin verdiğin klasörlerin içini görür. Bir sohbette kullanmak için sohbetin üstündeki “Klasör bağla” düğmesinden seç. Dosya yazmadan, taşımadan ya da silmeden önce her seferinde sana sorar.',
    addFolder: 'Klasör ekle',
    empty: 'Henüz izin verilmiş klasör yok.',

    /** count: sayı, countText: yerel ayara göre biçimlendirilmiş hali */
    indexed: (count: number, countText: string, date: string) => `${countText} bölüm indekslendi, ${date}`,
    notIndexed: 'İndekslenmedi: PDF, Word ve Excel dosyalarının içinde arama yapılamaz.',
    index: 'İndeksle',
    reindex: 'Yeniden indeksle',
    removeAccess: 'İzni kaldır',
    removeAccessLabel: (name: string) => `${name} klasörünün iznini kaldır`,
    removeAccessNote: 'Atlas bu klasöre artık erişemez. Klasördeki dosyaların silinmez.',
    scanning: 'Dosyalar taranıyor…',
    showChanges: 'Yapılan değişiklikleri göster',
    hideChanges: 'Değişiklikleri gizle',
    noChanges: 'Atlas bu klasörde henüz bir şey değiştirmedi.',
    /** Anahtarlar dosya işlemi türleridir. */
    action: { write: 'Yazıldı', move: 'Taşındı', delete: 'Silindi', mkdir: 'Klasör', command: 'Komut' }
  }
}
