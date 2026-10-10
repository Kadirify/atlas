/** Sohbet ekranı, kenar çubuğu ve onlara bağlı bileşenlerin metinleri. */
export const chat = {
  /** Boş sohbette gösterilen başlangıç önerileri */
  starters: [
    'Yarınki ekip toplantısı için 30 dakikalık bir gündem hazırla',
    'Müşteriye gecikme için özür dileyen kısa ve resmi bir e-posta yaz',
    'Bana yapay zeka modellerinin nasıl çalıştığını basitçe anlat',
    'Bu hafta sonu için İstanbul’da yapılacak üç şey öner'
  ],

  greeting: (name: string) => (name ? `Merhaba ${name},` : 'Merhaba,'),
  greetingQuestion: 'ne yapalım?',
  greetingQuestionCasual: 'naber?',
  personaPicker: 'Kiminle konuşmak istersin',
  addFromWhatsapp: 'WhatsApp’tan kişi ekle',
  privateOption: 'Gizli sohbet: hafızayı kullanmaz, uygulama kapanınca silinir',
  privateBadge: 'Gizli',
  privateHint: 'Bu sohbet hafızayı kullanmaz ve uygulama kapanınca silinir.',

  dropHere: 'Dosyayı buraya bırak',
  thinking: 'Düşünüyor',
  typing: 'Yazıyor',
  jumpToBottom: 'En alta in',
  writeAnswer: 'Cevap yazdır',
  /** Model çıktısındaki uzak adresli resim yerine gösterilen not */
  imageBlocked: (alt: string) => (alt ? `Dış adresteki resim gösterilmedi: ${alt}` : 'Dış adresteki resim gösterilmedi'),
  /** Ekran okuyucuya bildirilen durum */
  live: {
    writing: 'Atlas yazıyor',
    approval: 'Atlas onayını bekliyor',
    done: 'Cevap hazır'
  },

  message: {
    edit: 'Mesajı düzenle',
    editHint: 'Gönderince sonraki cevaplar silinir ve yeniden yazılır.',
    copyAnswer: 'Cevabı kopyala',
    regenerate: 'Cevabı yeniden yazdır',
    partial: 'Yarıda kesildi'
  },

  composer: {
    placeholder: 'Mesajını yaz ya da / ile hazır istem seç',
    label: 'Mesaj',
    send: 'Gönder',
    sendTitle: 'Gönder (Enter)',
    stop: 'Cevabı durdur',
    stopTitle: 'Cevabı durdur (Esc)',
    visionMissing: (model: string) =>
      `Seçili model (${model}) resim anlayamıyor. Resimli soru sormak için üstteki listeden resim destekleyen bir model seç.`,
    toolsMissing: (model: string) =>
      `Seçili model (${model}) dosya araçlarını kullanamıyor. Klasörle çalışmak için üstteki listeden başka bir model seç.`
  },

  doc: {
    paneLabel: 'Belge paneli',
    open: (name: string) => `${name} dosyasını yanda aç`,
    close: 'Belge panelini kapat',
    choose: 'Gösterilen belge',
    edited: 'Düzenlendi',
    editedHint: 'Atlas sonraki sorularda belgenin bu halini görür. Özgün dosyan değişmez.',
    reset: 'Özgün haline dön',
    save: 'Belgeyi kaydet',
    saved: 'Kaydedildi',
    formats: { docx: 'Word belgesi (.docx)', pdf: 'PDF (.pdf)', md: 'Markdown (.md)', txt: 'Metin (.txt)' },
    textLabel: 'Belgenin metni',
    textNote: 'Dosyadan okunan metin gösterilir; sayfa düzeni ve resimler gösterilmez.',
    selectHint: 'Bir bölümü seç: Atlas yalnızca o kısmı düzeltir, kısaltır ya da çevirir.',
    selected: (n: number) => `${n} kelime seçili`,
    quote: 'Sohbete alıntıla',
    proposal: 'Atlas’ın önerisi',
    apply: 'Seçimin yerine yaz',
    discard: 'Vazgeç',
    undo: 'Son değişikliği geri al',
    changed: 'Seçim değişti; öneri eski seçime ait. Yeniden dene.',
    notFound: 'Bu belge artık yok.',
    noDocument: 'Bu sohbette yanda gösterilecek bir belge yok. Önce bir dosya ekle.',
    quoteIntro: 'Belgedeki şu bölüm hakkında:',
    whole: 'Belgenin tamamı:',
    progress: (done: number, total: number) => `Belge işleniyor: ${done} / ${total} bölüm`,
    applyAll: 'Tümünü uygula',
    showDiff: 'Farkı göster',
    showNew: 'Yalnızca yeni metin',
    noChange: 'Atlas değiştirilecek bir şey bulmadı.',
    changeCount: (n: number) => `${n} yerde değişiklik. Kırmızı silinen, yeşil eklenen.`,
    modes: 'Belgenin gösterimi',
    modeView: 'Görünüm',
    modeText: 'Metin',
    selectHintView: 'Bir bölümü seç: Atlas o kısmı düzeltir, kısaltır ya da çevirir; sohbete de alıntılayabilirsin.',
    viewNote: 'Bu, dosyanın özgün görünümüdür. Düzenlemeler Metin sekmesinde yapılır.',
    viewEdited: 'Metinde düzenleme yaptın. Görünüm özgün dosyayı gösterir; düzenlenmiş hali Metin sekmesinde.',
    reattach: 'Bu dosya özgün görünümü saklanmadan önce eklendi. Kendi görünümüyle görmek için dosyayı sohbete yeniden ekle.',
    applyToText: 'Metne uygula',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    notInText: 'Bu bölüm metinde birebir bulunamadı. Öneriyi kopyalayıp Metin sekmesinde elle yerleştirebilirsin.',
    viewFailed: 'Dosyanın görünümü açılamadı. Metin sekmesinden devam edebilirsin.',
    morePages: (shown: number, total: number) => `İlk ${shown} sayfa gösteriliyor (toplam ${total}).`,
    sheets: 'Sayfalar',
    emptySheet: 'Bu sayfa boş.'
  },

  export: {
    button: 'Sohbeti dışa aktar',
    formats: { docx: 'Word belgesi (.docx)', pdf: 'PDF (.pdf)', md: 'Markdown (.md)' },
    saved: 'Kaydedildi'
  },

  think: {
    label: 'Düşün',
    onHint: 'Düşünme açık: Atlas cevap vermeden önce düşünür. Daha dikkatli ama daha yavaş. Kapatmak için tıkla.',
    offHint: 'Düşünme kapalı: Atlas hemen cevap verir. Zor sorularda ve kod işlerinde açman iyi olur.',
    thinking: 'Düşünüyor',
    thought: 'Düşündükleri'
  },

  undo: {
    button: (n: number) => (n === 1 ? 'Değişikliği geri al' : `${n} dosyayı geri al`),
    hint: 'Atlas\'ın bu cevapta değiştirdiği dosyalar önceki haline döner; oluşturduğu dosyalar çöp kutusuna gider.',
    confirm: (n: number) => `${n} dosya önceki haline dönecek. Sonradan yaptığın değişiklikler de gider.`,
    yes: 'Geri al',
    no: 'Vazgeç',
    done: (n: number) => `${n} dosya geri alındı.`,
    lostWarning: 'Bu cevaptaki dosya değişiklikleri artık geri alınamayacak. Devam edilsin mi?',
    lostWarningLater: 'Sonraki cevaplardaki dosya değişiklikleri artık geri alınamayacak. Devam edilsin mi?',
    continue: 'Devam et'
  },

  viewer: {
    close: 'Resmi kapat (Esc)',
    zoomIn: 'Yakınlaştır (+)',
    zoomOut: 'Uzaklaştır (-)',
    copy: 'Resmi kopyala',
    copied: 'Kopyalandı',
    save: 'Resmi kaydet',
    previous: 'Önceki resim (sol ok)',
    next: 'Sonraki resim (sağ ok)',
    zoomLevel: (percent: number) => `%${percent}`
  },

  codeArea: {
    menuOpen: 'Varsayılan programla aç',
    menuView: 'Yanda göster',
    menuReveal: 'Gezgin\'de göster',
    menuMention: 'Sohbette dosyayı an',
    title: 'Kod',
    intro: 'Bir proje klasörü aç; Atlas o projede seninle birlikte çalışsın: dosyaları okur, değişiklik önerir, testleri çalıştırıp sonucu kontrol eder ve veritabanına bağlanır.',
    ruleEdit: 'Dosya değişikliklerini satır satır gösterir; sen onaylamadan (ya da "hep izin ver" demedikçe) hiçbir şey yazılmaz.',
    ruleCommand: 'Test, derleme ve git gibi komutları çalıştırmadan önce onayını ister. Bir komuta "hep izin ver" dersen, o komut Atlas\'ın düzenlediği dosyaları da çalıştırabilir.',
    ruleSql: 'Veritabanında SELECT sorgularını kendisi çalıştırır; değiştiren sorgular için onay ister.',
    ruleDelete: 'Silme aracı yoktur: dosya silmez, bilinen silme komutlarını ve DELETE, DROP, TRUNCATE sorgularını çalıştırmaz. Bunları sana bırakır.',
    noCodeModel: 'Atlas Strong kurulu değil; sohbet varsayılan modelinle başlar. Kod işleri için Ayarlar → Modeller\'den Atlas Strong\'u kurmanı öneririm (12 GB ekran kartı gerekir).',
    projects: 'Projeler',
    openFolder: 'Proje klasörü aç',
    noProjects: 'Henüz açılmış bir proje yok. "Proje klasörü aç" ile başla.',
    start: 'Bu projede çalış',
    files: 'Proje dosyaları',
    hideFiles: 'Dosya ağacını gizle',
    refresh: 'Yenile',
    emptyFolder: 'Bu klasör boş.',
    viewerLabel: 'Dosya görüntüleyici',
    closeViewer: 'Dosyayı kapat',
    lineCount: (n: number) => `${n} satır`,
    truncated: 'yalnızca baş kısmı gösteriliyor',
    quote: 'Sohbete ekle',
    quoteHint: 'Seçili kısmı (seçim yoksa dosyanın başını) mesaj kutusuna ekler',
    quoteIntro: (path: string) => `${path} dosyasındaki şu kısım hakkında:`
  },

  sql: {
    connect: 'Veritabanı bağla',
    connected: (name: string) => `Bağlı veritabanı: ${name}`,
    none: 'Henüz kayıtlı bir veritabanı bağlantısı yok.',
    add: 'Yeni bağlantı ekle',
    edit: (name: string) => `${name} bağlantısını düzenle`,
    showTables: 'Tabloları ve verileri göster',
    rules: 'Atlas SELECT sorgularını kendisi çalıştırır. Değiştiren sorgular için senden onay ister. Silme işlemlerini (DELETE, DROP, TRUNCATE) hiç yapmaz.',
    formNew: 'Veritabanı bağlantısı ekle',
    formEdit: 'Veritabanı bağlantısını düzenle',
    engine: 'Veritabanı türü',
    name: 'Bağlantının adı',
    nameHint: 'Listede bu adla görünür. Örnek: Muhasebe (test)',
    host: 'Sunucu',
    hostHint: 'Örnek: localhost, 192.168.1.20 ya da sunucu\\ornek',
    port: 'Port',
    database: 'Veritabanı',
    databaseHint: 'Boş bırakırsan kullanıcının varsayılan veritabanı açılır.',
    user: 'Kullanıcı adı',
    password: 'Parola',
    passwordKept: 'Kayıtlı (değiştirmek için yaz)',
    passwordNote: 'Parola bu bilgisayarda Windows\'un güvenli deposuyla şifrelenir. Modele ve sohbetlere hiç gönderilmez. Bağlantı kullanıcı adı ve parolayla kurulur; Windows kimlik doğrulaması henüz yok.',
    ssl: 'Şifreli bağlantı kullan (SSL)',
    trustCert: 'Sunucunun sertifikasına güven (yerel ve şirket içi sunucularda genelde gerekir)',
    file: 'SQLite dosyası',
    browse: 'Seç…',
    remove: 'Bağlantıyı sil',
    removeConfirm: 'Bu bağlantı ve kayıtlı parolası silinsin mi?',
    cancel: 'Vazgeç',
    saveAndConnect: 'Kaydet ve bağlan',
    connecting: 'Bağlanılıyor…',
    approvalTitle: 'Atlas bu sorguyu çalıştırmak istiyor',
    approvalBody: 'Bu sorgu veritabanında değişiklik yapar. Onaylarsan çalışır ve kalıcı olur; onaylamazsan hiçbir şey değişmez.',
    approvalDoes: 'Yaptığı işlem:',
    approve: 'Onayla ve çalıştır',
    decline: 'Reddet',
    paneLabel: 'Veritabanı paneli',
    closePane: 'Veritabanı panelini kapat',
    filter: 'Tablo, yordam ya da tetikleyici ara',
    tableCount: (n: number) => `${n} nesne`,
    loading: 'Tablolar okunuyor…',
    noTables: 'Tablo bulunamadı.',
    view: 'görünüm',
    key: 'Birincil anahtar',
    kinds: { table: 'Tablolar', view: 'Görünümler', procedure: 'Saklı yordamlar', function: 'İşlevler', trigger: 'Tetikleyiciler', job: 'Zamanlanmış işler' },
    showCode: 'Kodu gör',
    noCode: '(kod okunamadı ya da şifrelenmiş)',
    peek: 'Verileri gör',
    queryPlaceholder: 'SELECT sorgusu yaz (Ctrl + Enter çalıştırır)',
    run: 'Çalıştır',
    runHint: 'Sorguyu çalıştır (Ctrl + Enter)',
    readOnlyNote: 'Buradan yalnızca SELECT çalışır ve veritabanı değişmez. Değiştiren sorguları Atlas\'a yazdır.',
    running: 'Sorgu çalışıyor…',
    empty: 'Bir tablonun yanındaki "Verileri gör" düğmesine bas ya da bir SELECT sorgusu yaz. Atlas\'ın çalıştırdığı sorguların sonucu da burada görünür.',
    noRows: 'Sorgu hiç satır döndürmedi.',
    resultInfo: (rows: number, truncated: boolean, ms: number) => `${truncated ? `İlk ${rows} satır` : `${rows} satır`}, ${ms} ms`
  },

  slash: {
    label: 'Hazır istemler',
    empty: 'Eşleşen istem yok.',
    add: 'Kendi istemini ekle',
    namePlaceholder: 'Kısa ad (ör. tutanak)',
    textPlaceholder: 'İstem metni (ör. Şu toplantı notlarını tutanağa çevir:)',
    save: 'Kaydet',
    cancel: 'Vazgeç',
    remove: (name: string) => `${name} istemini sil`,
    builtin: [
      { name: 'özetle', text: 'Şu metni kısa ve madde madde özetle:\n\n' },
      { name: 'e-posta', text: 'Şu konuda kısa ve resmi bir e-posta yaz:\n\n' },
      { name: 'tablo', text: 'Şu bilgileri bir tabloya dök:\n\n' },
      { name: 'çevir', text: 'Şu metni İngilizceye çevir:\n\n' },
      { name: 'düzelt', text: 'Şu metnin yazım ve dil bilgisi hatalarını düzelt, anlamı değiştirme:\n\n' },
      { name: 'açıkla', text: 'Şunu basit bir dille, örnek vererek açıkla:\n\n' },
      { name: 'maddeler', text: 'Şu metni madde madde yeniden yaz:\n\n' },
      { name: 'cevap', text: 'Şu mesaja kibar ve kısa bir cevap yaz:\n\n' }
    ]
  },

  find: {
    label: 'Sohbet içinde arama',
    placeholder: 'Bu sohbette ara',
    count: (current: number, total: number) => `${current} / ${total}`,
    none: 'Yok',
    previous: 'Önceki eşleşme (Shift + Enter)',
    next: 'Sonraki eşleşme (Enter)',
    close: 'Aramayı kapat (Esc)',
    open: 'Bu sohbette ara (Ctrl + F)'
  },

  memory: {
    button: 'Bellekteki modeller',
    title: 'Bellekte duran modeller',
    empty: 'Şu an bellekte model yok. İlk soruda model yeniden yüklenir.',
    size: (gb: string) => `yaklaşık ${gb} GB`,
    onGpu: (percent: number) => (percent >= 100 ? 'ekran kartında' : percent <= 0 ? 'işlemcide' : `%${percent} ekran kartında`),
    unload: 'Boşalt',
    unloadAll: 'Hepsini bellekten boşalt',
    hint: 'Oyun ya da ağır bir program açmadan önce belleği boşaltabilirsin. Sonraki soruda model kendiliğinden yeniden yüklenir.'
  },

  model: {
    none: 'Model kurulu değil',
    select: 'Bu sohbette kullanılan model'
  },

  learned: {
    title: 'Bunu hatırlayacağım',
    dismiss: 'Bildirimi kapat',
    forget: 'Unut'
  },

  sidebar: {
    apps: 'Uygulamalar',
    code: 'Kod',
    search: 'Sohbetlerde ara',
    conversations: 'Sohbetler',
    noResults: (query: string) => `“${query}” için sonuç yok.`,
    empty: 'Henüz sohbet yok. İlk mesajını yazdığında burada görünecek.',
    settings: 'Ayarlar',
    titleLabel: 'Sohbet adı',
    answering: 'Cevap yazılıyor',
    privateChat: 'Gizli sohbet',
    waitingApproval: 'Onayını bekliyor',
    optionsFor: (title: string) => `${title} için seçenekler`,
    confirmDelete: 'Bu sohbet kalıcı olarak silinsin mi?',
    pin: 'Sabitle',
    unpin: 'Sabitlemeyi kaldır',
    rename: 'Yeniden adlandır'
  },

  attachments: {
    add: 'Dosya ekle',
    addTitle: 'Dosya ekle: metin, PDF, Word, Excel ya da resim',
    remove: (name: string) => `${name} dosyasını kaldır`,
    enlarge: (name: string) => `${name} resmini büyüt`,
    truncated: 'Uzun dosya: baş kısmı okunur',
    reading: 'Dosya okunuyor…'
  },

  steps: {
    plan: 'Plan',
    planCount: (done: number, total: number) => `${done} / ${total}`,
    running: 'çalışıyor',
    exitCode: (code: number) => (code === 0 ? 'başarılı' : `hata (${code})`),
    timedOut: 'süre doldu',
    noOutput: '(çıktı yok)',
    label: 'Kullanılan dosya araçları'
  },

  diff: {
    tooLarge: 'Dosya satır satır karşılaştırılamayacak kadar büyük; yeni içerik:',
    label: 'Değişiklikler',
    unchanged: (count: number) => `${count} satır değişmedi`,
    added: 'Eklenen: ',
    removed: 'Silinen: '
  },

  approval: {
    alwaysEdits: 'Bu sohbette hep izin ver',
    alwaysEditsHint: 'Bu sohbette dosya oluşturma, değiştirme ve taşıma bir daha sorulmaz. Silme yine yapılamaz.',
    alwaysCommand: 'Bu komuta hep izin ver',
    alwaysCommandHint: 'Bu sohbette birebir aynı komut bir daha sorulmaz. Başka komutlar yine sorulur.',
    trustedNote: 'Bu sohbette dosya düzenlemeleri sorulmadan yapılıyor.',
    revoke: 'İzni kaldır',
    create: 'Atlas yeni bir dosya oluşturmak istiyor',
    change: 'Atlas bir dosyayı değiştirmek istiyor',
    move: 'Atlas bir dosyayı taşımak istiyor',
    trash: 'Atlas bir dosyayı çöp kutusuna göndermek istiyor',
    command: 'Atlas bu komutu çalıştırmak istiyor',
    commandNote: 'Komut proje klasöründe çalışır ve çıktısı Atlas\'a verilir. En çok 2 dakika sürebilir.',
    moveTo: 'şuraya:',
    trashNote: 'Dosya kalıcı olarak silinmez; çöp kutusundan geri alınabilir.',
    protectedWarning: 'Bu dosya başka programlar tarafından kendiliğinden çalıştırılabilir; dikkatle bak.'
  },

  folder: {
    attach: 'Klasör bağla',
    attachHint: 'Atlas’ın dosyalarını okuyabileceği bir klasör bağla',
    allowed: 'İzin verdiğin klasörler',
    pickAnother: 'Başka klasör seç…',
    detach: 'Bu sohbetten ayır',
    scopeNote: 'Atlas yalnızca bağladığın klasörün içini görür.',
    asksFirst: 'Dosya değiştirmeden önce her seferinde sana sorar.'
  },

  /** Dili belirtilmemiş kod bloğunun başlığı */
  code: 'kod',
  logoLabel: (appName: string) => `${appName} logosu`
}
