/** Kurulum sihirbazı (Setup.tsx) metinleri. */
export const setup = {
  stepsLabel: 'Kurulum adımları',
  steps: ['Hoş geldin', 'Bilgisayar', 'Ollama', 'Model', 'İndirme', 'Hız testi', 'Sen', 'Gizlilik', 'Hazır'],

  welcome: {
    languageLabel: 'Dil',
    title: 'Atlas’a hoş geldin',
    lead: 'Atlas, tamamen bu bilgisayarda çalışan yapay zeka asistanın. Sohbetlerin, dosyaların ve yazdıkların bilgisayarından çıkmaz. İnternet sadece modeli bir kez indirmek için gerekir; sonrasında uygulama çevrimdışı çalışır.',
    duration: 'Kurulum birkaç dakika sürer.',
    start: 'Kuruluma başla',
    points: [
      'Önce bilgisayarının gücüne bakılır.',
      'Ona en uygun yapay zeka modeli önerilir; istersen başkasını seçersin.',
      'Model indirilir, hızı ölçülür ve ilk sohbetin açılır.'
    ]
  },

  hardware: {
    titleDone: 'Bilgisayarın tarandı',
    titleScanning: 'Bilgisayarın taranıyor',
    lead: 'Hangi modelin akıcı çalışacağını bellek ve ekran kartı belirler.',
    scanning: 'İşlemci, bellek ve ekran kartı okunuyor…',
    tierHeading: 'Bu bilgisayarın seviyesi',
    cpu: 'İşlemci',
    cpuValue: (cpu: string, cores: number) => `${cpu} (${cores} çekirdek)`,
    memory: 'Bellek',
    memoryValue: (gb: number) => `${gb} GB RAM`,
    gpu: 'Ekran kartı',
    noGpu: 'Ayrı ekran kartı bulunamadı. Model işlemciyle çalışacak.',
    freeDisk: 'Boş disk'
  },

  ollama: {
    title: 'Model çalıştırıcı: Ollama',
    lead: 'Ollama, yapay zeka modellerini bilgisayarında çalıştıran ücretsiz ve açık kaynaklı bir programdır. Uygulama modelleri onun üzerinden kullanır.',
    checking: 'Ollama aranıyor…',
    starting: 'Ollama kurulu, başlatılıyor…',
    downloading: (done: string, total: string) => `Ollama indiriliyor: ${done} / ${total}`,
    installing: 'Ollama kuruluyor. Bu bir dakika sürebilir…',
    downloadStarting: 'İndirme başlatılıyor…',
    running: (version?: string | null) => `Ollama çalışıyor${version ? ` (sürüm ${version})` : ''}.`,
    notInstalled:
      'Ollama bu bilgisayarda kurulu değil. Kurulum dosyası ollama.com adresinden indirilip çalıştırılacak.',
    install: "Ollama'yı indir ve kur",
    startFailed: "Ollama kurulu ama başlatılamadı. Başlat menüsünden Ollama'yı açıp tekrar deneyin."
  },

  model: {
    title: 'Modelini seç',
    lead: "Öneri bu bilgisayarın donanımına göre yapıldı. Daha güçlü bir model daha iyi yazar ama daha yavaş cevap verir. Modeli sonradan Ayarlar'dan değiştirebilirsin.",
    pickerLabel: 'Model seçimi',
    preparing: 'Modeller hazırlanıyor…',
    roleRecommended: 'Önerilen',
    roleStronger: 'Daha güçlü',
    roleFaster: 'Daha hızlı',
    toDownload: (size: string) => `${size} indirilecek`,
    installedHeading: 'Bilgisayarında kurulu',
    installedHint: 'İndirme gerekmez, hemen kullanabilirsin.',
    showMoreInstalled: (n: number) => `Diğer ${n} kurulu modeli göster`,
    downloadableHeading: 'İndirilebilir modeller',
    downloadableHint: 'Bu bilgisayarın donanımına göre sıralandı.',
    hideOthers: 'Diğer modelleri gizle',
    showOthers: (n: number) => `Diğer ${n} modeli göster`,
    continueWithModel: 'Bu modelle devam et',
    download: 'İndir',
    downloadWithSize: (size: string) => `İndir (${size})`,
    lowDisk: (free: string, needed: string) =>
      `Diskte ${free} boş yer var; bu model ${needed} yer kaplar. Önce yer açın ya da daha küçük bir model seçin.`
  },

  download: {
    titlePaused: 'İndirme duraklatıldı',
    titleDownloading: (name: string) => `${name} indiriliyor`,
    modelFallback: 'Model',
    lead: 'İndirme bitince model otomatik kurulur. Duraklatırsan kaldığı yerden devam eder.',
    chooseAnother: 'Başka model seç',
    resume: 'Devam ettir',
    pause: 'Duraklat',
    percent: (n: number) => `%${n}`,
    connecting: 'Bağlanılıyor…',
    rate: (speed: string, remaining: string) => `${speed}/sn, kalan ${remaining}`
  },

  benchmark: {
    titleDone: 'Model çalışıyor',
    titleMeasuring: 'Hız ölçülüyor',
    lead: 'Model belleğe yükleniyor ve kısa bir deneme cevabı yazıyor. İlk yükleme bir dakikaya kadar sürebilir.',
    wordsPerSecond: 'kelime / saniye',
    slowNotice:
      'Bu model bu bilgisayarda yavaş çalışıyor. Daha akıcı bir deneyim için daha küçük bir model seçebilirsin.'
  },

  profile: {
    title: 'Sana nasıl hitap edeyim?',
    lead: "İsteğe bağlı. Buradaki her şeyi sonradan Ayarlar'dan değiştirebilirsin.",
    name: 'Adın',
    namePlaceholder: 'Deniz',
    corporateTitle: 'Kurumsal işlerde de kullanacağım',
    corporateDescription:
      'E-posta, rapor, duyuru ve toplantı özeti gibi iş yazıları için hazır araçlar açılır. Unvanın, şirketin ve imzan bu yazılara eklenir.',
    jobTitle: 'Unvanın',
    jobTitlePlaceholder: 'IT Direktörü',
    company: 'Şirket',
    companyPlaceholder: 'Şirket adı',
    signature: 'E-posta imzası',
    signatureHint: 'Yazdırdığın e-postaların sonuna eklenir.',
    signaturePlaceholder: 'Saygılarımla,\nAd Soyad\nUnvan, Şirket'
  },

  privacy: {
    title: 'Verilerin sende kalır',
    lead: 'Bu uygulama bir bulut hizmeti değil. Her şey bu bilgisayarda olur ve burada kalır.',
    confirm: 'Anladım, devam et',
    stored: {
      title: 'Sohbetlerin bu bilgisayarda saklanır',
      text: 'Sohbetler, ayarlar ve profilin tek bir klasörde tutulur. Başka hiçbir yere kopyalanmaz.'
    },
    local: {
      title: 'Model bu bilgisayarda çalışır',
      text: 'Yazdıkların cevap üretmek için hiçbir sunucuya gönderilmez. İnternet yalnızca model indirirken kullanılır; sonrasında bağlantı olmadan da çalışır.'
    },
    noTelemetry: {
      title: 'Kullanım verisi toplanmaz',
      text: 'Uygulama ne yazdığını, ne sıklıkla kullandığını ya da hangi modeli seçtiğini kimseye bildirmez.'
    },
    deletion: {
      title: 'Silmek senin elinde',
      text: 'Sohbetleri tek tek silebilirsin. Veri klasörünü silersen her şey kalıcı olarak gider.'
    }
  },

  done: {
    title: 'Her şey hazır',
    titleWithName: (name: string) => `Her şey hazır, ${name}`,
    lead: 'Model kuruldu ve bu bilgisayarda çalışıyor. Artık internet olmadan da sohbet edebilirsin.',
    openFirstChat: 'İlk sohbeti aç',
    model: 'Model',
    speed: 'Hız',
    speedValue: (words: number | string) => `Saniyede yaklaşık ${words} kelime`,
    notMeasured: 'Ölçülmedi',
    tier: 'Bilgisayar seviyesi',
    corporate: 'Kurumsal kullanım',
    on: 'Açık',
    off: 'Kapalı',
    data: 'Veriler',
    dataValue: 'Sadece bu bilgisayarda saklanır'
  }
}
