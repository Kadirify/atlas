/**
 * Ana süreçteki araçların metinleri: mini uygulamalar, klasör araçları ve
 * WhatsApp'tan kişi öğrenme. Çoğu modele giden talimattır; bir kısmı kullanıcıya gösterilir.
 */
export const tools = {
  /** Mini uygulamalar (services/apps.ts) */
  apps: {
    /** Her mini uygulamaya eklenen ortak kurallar */
    commonRules: [
      'Genel kurallar:',
      '- Yalnızca istenen metni yaz. "İşte metniniz" gibi bir giriş ya da "Başka bir isteğiniz var mı?" gibi bir kapanış ekleme.',
      '- Kullanıcının verdiği tarih, sayı ve adları aynen kullan; hiçbirini atlama ya da değiştirme.',
      '- Verilmeyen bilgiyi uydurma. Gerekli bir bilgi hiç verilmemişse yerine köşeli parantez içinde neyin eksik olduğunu yaz.',
      '- Aksi istenmedikçe Türkçe yaz.',
      '- Aynı cümleyi ya da maddeyi tekrar etme.'
    ].join('\n'),

    errors: {
      noName: 'Uygulamanın adı yok.',
      noPrompt: 'Uygulamanın talimatı (prompt) yok.',
      requiredMissing: (labels: string) => `Şu alanlar boş bırakılamaz: ${labels}.`
    },
    /** Hiç alanı olmayan uygulamaya eklenen tek alanın etiketi */
    defaultFieldLabel: 'İstek',
    yes: 'Evet',
    no: 'Hayır',

    writerName: (name: string) => `Metni yazan kişinin adı: ${name}.`,
    aboutWriter: 'Metni yazan kişi hakkında:',
    writerNameLine: (name: string) => `- Ad: ${name}`,
    writerTitleLine: (title: string) => `- Unvan: ${title}`,
    writerCompanyLine: (company: string) => `- Şirket: ${company}`,
    letterPrefs: 'E-posta ya da mektup yazıyorsan:',
    salutationRule: (salutation: string) => `- Alıcıya "${salutation}" ile hitap et (ör. "${salutation} Ayşe Hanım,").`,
    closingRule: (closing: string) => `- Metni "${closing}," ile bitir, altına yazanın adını koy.`,
    signatureRule: '- Metnin sonuna şu imzayı aynen ekle, başka kapanış yazma:',

    /** Form tamamen boşken modele giden kullanıcı mesajı */
    emptyRequest: 'Talimata göre metni yaz.',
    refine: (instruction: string) => `Yukarıdaki metni şu talimata göre yeniden yaz: ${instruction}\nSadece yeni metni ver.`
  },

  /** Klasör araçları (services/files.ts) */
  files: {
    /** Araç tanımları; modele gider */
    defs: {
      pathArg: 'Klasöre göre göreli yol, ör. "raporlar/ocak.pdf". Kök klasör için ".".',
      listFolder: 'Bir klasördeki dosya ve alt klasörleri listeler.',
      readFile:
        'Bir dosyanın içeriğini metin olarak okur. Metin, PDF, Word (.docx) ve Excel (.xlsx) dosyaları okunabilir. Metin dosyaları satır numaralı gelir ("12| kod"); uzun dosyalar parça parça gelir.',
      readLineArg: 'Okumaya başlanacak satır (1\'den başlar). Uzun bir dosyanın devamını okumak için.',
      readStartArg: 'Yalnızca PDF, Word ve Excel için: okumaya başlanacak karakter konumu.',
      searchFiles: 'Dosya adlarında ve dosya içeriklerinde arama yapar. Hangi dosyada ne yazdığını bulmak için kullan.',
      searchQueryArg: 'Aranacak kelime ya da kısa ifade.',
      writeFile: 'Bir metin dosyası oluşturur ya da var olanın içeriğini tamamen değiştirir. Kullanıcı onaylamadan yazılmaz.',
      writeContentArg: 'Dosyanın tam yeni içeriği.',
      moveFile: 'Bir dosyayı taşır ya da yeniden adlandırır. Kullanıcı onaylamadan yapılmaz.',
      moveToArg: 'Yeni göreli yol.',
      deleteFile: 'Bir dosyayı çöp kutusuna gönderir. Kullanıcı onaylamadan yapılmaz.',
      createFolder: 'Yeni bir klasör oluşturur.',
      editFile:
        'Var olan bir dosyada yalnızca bir parçayı değiştirir: old_text dosyada birebir ve tek bir yerde geçmeli, new_text onun yerine yazılır. Küçük değişikliklerde write_file yerine bunu kullan. Kullanıcı onaylamadan yazılmaz.',
      editOldArg: 'Dosyadaki değiştirilecek metin; boşlukları ve satır sonlarıyla birebir aynı olmalı. Tek bir yeri bulması için yeterince satır içersin.',
      editNewArg: 'old_text yerine yazılacak yeni metin.',
      updatePlan:
        'İş planını kullanıcıya gösterir. Birden çok adımlı bir işe başlarken adımları yaz; her adım bittikçe yeniden çağırıp durumunu güncelle. Dosyaya dokunmaz.',
      planStepsArg: 'Adımlar sırasıyla. status: pending (bekliyor), in_progress (yapılıyor), done (bitti).',
      runCommand: 'Proje klasöründe bir komut çalıştırır (test, derleme, git durumu gibi). Kullanıcı onaylamadan çalışmaz. Silen komutlar (rm, del, git clean, git reset --hard ...) çalıştırılmaz.',
      runCommandArg: 'Çalıştırılacak tek komut satırı. Örnek: npm test'
    },

    /** Bir araç başarısız olduğunda adım listesinde görünen etiket */
    failed: {
      listFolder: 'Listelenemedi',
      readFile: 'Okunamadı',
      searchFiles: 'Aranamadı',
      writeFile: 'Yazılamadı',
      moveFile: 'Taşınamadı',
      deleteFile: 'Silinemedi',
      createFolder: 'Klasör oluşturulamadı',
      other: 'Yapılamadı'
    },

    capability: {
      off: 'Bu bilgisayarda çalışabilen modeller dosya araçlarını güvenilir kullanamıyor; klasörle çalışma kapalı.',
      readOnly: 'Bu bilgisayarda yalnızca okuma açık; dosya yazma, taşıma ve silme kapalı.'
    },

    /** Sistem talimatına eklenen bölüm */
    prompt: {
      intro: (folderName: string) =>
        `Kullanıcı sana "${folderName}" klasörünü açtı. Bu klasördeki dosyalara araçlarla erişebilirsin.`,
      lookFirst: '- Dosyalar hakkında tahmin yürütme; önce list_folder, search_files ya da read_file ile bak.',
      proactive:
        '- Kendi başına çalış: listeleme, okuma ve arama için kullanıcıdan izin isteme, "okuyayım mı?", "ne dersin?" diye sorma; gereken dosyaları kendin aç ve görev bitene kadar adım adım devam et. Bir projeyi incelemen istenirse README, ayar dosyaları (package.json gibi) ve ana kaynak klasörlerine kendin bak, sonra bulduklarını özetle. Okumadığın bir dosya için "muhtemelen" diye tahmin yürütme ya da "göz atılabilir" deyip bırakma: gerekiyorsa aç ve oku. Kullanıcıya yalnızca gerçekten onun karar vermesi gereken bir şey varsa soru sor.',
      relativePaths: '- Yollar bu klasöre göre görelidir ("raporlar/ocak.pdf" gibi). Kök klasör için "." kullan.',
      callDirectly:
        '- Bir uygulama, sayfa ya da kod yazman istenirse kodu sohbete yazma: write_file ile klasöre dosya olarak oluştur (gerekiyorsa birden çok dosya). Sohbette yalnızca neyi oluşturduğunu ve nasıl çalıştırılacağını kısaca anlat. Proje bağımlılık istiyorsa (package.json gibi) kurulumu da kendin yap: run_command ile npm install gibi komutları sırayla çalıştır, ardından derleme ya da testi çalıştırıp çalıştığını doğrula. Her komut kullanıcıya onaya sunulur ve çıktısı ona gösterilir. Uzun süre açık kalan komutları (npm run dev, npm start gibi sunucular) çalıştırma; kullanıcıya kendisinin çalıştırmasını söyle.\n- Dosya oluşturman, değiştirmen ya da taşıman istenirse ilgili aracı (write_file, move_file) doğrudan çağır.\n- Değişiklik yaptıktan sonra işin doğru olduğunu kontrol etmek için run_command ile projenin testini ya da derlemesini çalıştır (örnek: npm test, dotnet build); çıktıda hata varsa düzelt ve yeniden çalıştır. Her komut kullanıcıya onaya sunulur.\n- Dosya ya da klasör silemezsin; bunu başka bir yolla (içini boşaltarak, üstüne yazarak) da yapma. Silme istenirse "Maalesef silme işlemlerini ben yapamam; bunu sen kendin yapabilirsin" de ve hangi dosyanın silineceğini söyle.',
      dontAskApproval:
        '- Kullanıcıya "onaylıyor musun" diye sorma: onay penceresini uygulama kendisi gösterir. Araç sonucu "onaylamadı" derse ısrar etme ve aynı işlemi yeniden deneme.',
      dontRepeatContent:
        '- Bir dosyayı yazdıktan sonra içeriğini cevabında baştan sona tekrar etme; neyi nereye kaydettiğini bir cümleyle söyle.',
      readOnly: '- Yalnızca okuma araçların var; dosya oluşturamaz, değiştiremez ya da silemezsin. İstenirse içeriği sohbete yaz.',
      windowsShell:
        "- Komutlar Windows'ta cmd.exe ile çalışır: dosya listelemek için dir, okumak için type, aramak için findstr kullan; ls, cat, grep ve rm yoktur; PowerShell komutları da çalıştırılmaz.",
      fixCodeNotTests:
        '- Bir test başarısız olursa önce kodu düzelt. Testi yalnızca testin kendisi açıkça yanlışsa değiştir ve bunu kullanıcıya söyle.',
      testCommand: (command: string) => `- Bu projenin test komutu: ${command}`,
      overridesPersona:
        '- Bu klasör kuralları, yukarıdaki kişilik talimatlarındaki kod gösterme alışkanlıklarından önce gelir: kodu sohbete değil dosyaya yaz.',
      citeFile: '- Cevabında bilgiyi hangi dosyadan aldığını dosya adıyla belirt.',
      planFirst:
        '- Birden çok adımlı işlerde (yeni bir uygulama, birkaç dosyada değişiklik, hata ayıklama) önce update_plan ile kısa bir plan yaz, her adım bittikçe güncelle. Var olan dosyada küçük değişiklik için edit_file kullan; dosyanın tamamını yeniden yazma.',
      projectRules: (file: string, text: string) => `Bu projenin kendi talimatları (${file}); bunlara uy:\n${text}`
    },

    /** Adım listesinde kullanıcıya gösterilen etiketler */
    step: {
      listed: (where: string, count: number) => `Listelendi: ${where} (${count} öğe)`,
      read: (path: string, continued: boolean) => `Okundu: ${path}${continued ? ' (devamı)' : ''}`,
      searched: (query: string, count: number) => `Arandı: “${query}” (${count} sonuç)`,
      folderCreated: (path: string) => `Klasör oluşturuldu: ${path}`,
      unchanged: (path: string) => `Değişiklik yok: ${path}`,
      denied: (path: string) => `Reddedildi: ${path}`,
      updated: (path: string) => `Güncellendi: ${path}`,
      created: (path: string) => `Oluşturuldu: ${path}`,
      moved: (from: string, to: string) => `Taşındı: ${from} → ${to}`,
      trashed: (path: string) => `Çöp kutusuna gönderildi: ${path}`,
      commandRan: (command: string, code: number | null, timedOut: boolean) =>
        timedOut ? `Komut süre sınırını aştı ve durduruldu: ${command}` : code === 0 ? `Komut çalıştı: ${command}` : `Komut hata verdi (${code ?? '?'}): ${command}`,
      commandForbidden: (reason: string) => `Çalıştırılmadı: Atlas silen komutları çalıştıramaz (${reason})`,
      secretCommand: (name: string) => `Çalıştırılmadı: komut gizli bir dosyaya erişiyor (${name})`,
      deleteForbidden: (path: string) => `Silinmedi: Atlas dosya silemez (${path})`,
      unknownTool: (name: string) => `Bilinmeyen araç: ${name}`,
      plan: (done: number, total: number) => `Plan: ${done} / ${total} adım bitti`,
      edited: (path: string) => `Düzenlendi: ${path}`,
      editNotFound: (path: string) => `Düzenlenemedi, metin bulunamadı: ${path}`,
      changedMeanwhile: (path: string) => `Yazılmadı, dosya bu arada değişti: ${path}`,
      writeTruncated: (path: string) => `Yazılmadı, yeni içerik dosyayı kısaltıyor: ${path}`,
      editAmbiguous: (path: string) => `Düzenlenemedi, metin birden çok yerde: ${path}`
    },

    /** Modele dönen sonuç metinleri */
    result: {
      folderEntry: (name: string) => `[klasör] ${name}/`,
      moreItems: (count: number) => `(${count} öğe daha var)`,
      emptyFolder: 'Bu klasör boş.',
      readMoreLines: (first: number, last: number, total: number) =>
        `(Satır ${first}-${last} gösterildi; dosya ${total} satır. Devamı için line: ${last + 1} ver. Belirli bir adı arıyorsan search_files ile ara. Satır numaraları ("12| ") dosyanın parçası değildir; edit_file'a yazma.)`,
      readMore: (end: number, total: number) =>
        `(Dosyanın ${end}. karakterine kadar okundu, toplam ${total} karakter. Devamı için start: ${end} ver.)`,
      emptyFile: 'Dosya boş.',
      folderCreated: (path: string) => `"${path}" klasörü oluşturuldu.`,
      unchanged: 'Dosya zaten bu içerikte; bir şey değişmedi.',
      writeDenied: 'Kullanıcı bu işlemi REDDETTİ; dosya yazılmadı. Yeniden deneme. Kullanıcıya dosyanın yazılmadığını söyle.',
      moveDenied: 'Kullanıcı bu işlemi REDDETTİ; dosya taşınmadı. Yeniden deneme. Kullanıcıya dosyanın yerinde durduğunu söyle.',
      deleteDenied: 'Kullanıcı bu işlemi REDDETTİ; dosya silinmedi. Yeniden deneme. Kullanıcıya dosyanın silinmediğini söyle.',
      updated: (path: string) => `"${path}" güncellendi.`,
      created: (path: string) => `"${path}" oluşturuldu.`,
      moved: (from: string, to: string) => `"${from}" şuraya taşındı: "${to}".`,
      trashed: (path: string) => `"${path}" çöp kutusuna gönderildi.`,
      commandRan: (code: number | null, timedOut: boolean, output: string) =>
        `${timedOut ? 'Komut 2 dakikalık süre sınırını aştı ve durduruldu.' : `Komut bitti. Çıkış kodu: ${code ?? 'bilinmiyor'}.`}\nÇıktı:\n${output || '(çıktı yok)'}`,
      commandDenied: 'Kullanıcı bu komutu onaylamadı; çalıştırılmadı. Üsteleme.',
      secretCommand: (name: string) =>
        `Bu komut çalıştırılmadı: "${name}" parola ya da anahtar içerebilecek gizli bir dosya. Atlas bu dosyaların içeriğini okuyamaz ve gösteremez; başka bir yolla da deneme. Kullanıcıya dosyayı kendisinin açabileceğini söyle.`,
      commandForbidden: (reason: string) =>
        `Bu komut çalıştırılmadı (${reason}): Atlas silen, üstüne yazan ya da sistemi değiştiren komutları çalıştıramaz ve başka bir yolla da denememelisin. Kullanıcıya "Maalesef silme işlemlerini ben yapamam; bunu sen kendin çalıştırabilirsin" de ve komutu kod bloğu içinde ver.`,
      deleteForbidden: (path: string) =>
        `"${path}" silinmedi: Atlas dosya ve klasör silemez, başka bir yolla da denememelisin. Kullanıcıya şunu söyle: "Maalesef silme işlemlerini ben yapamam; bunu sen kendin yapabilirsin." ve silinecek dosyanın yolunu ver.`,
      unknownTool: (name: string) => `"${name}" diye bir araç yok.`,
      plan: 'Plan kullanıcıya gösterildi. Şimdi ilk bekleyen adımı yap.',
      edited: (path: string) => `"${path}" düzenlendi.`,
      editNotFound: (path: string) =>
        `old_text "${path}" dosyasında birebir bulunamadı. Önce read_file ile dosyanın güncel halini oku, değiştirmek istediğin kısmı boşlukları ve satır sonlarıyla aynen kopyala ve yeniden dene.`,
      syntaxBroken: (path: string, problem: string) =>
        `Dikkat: bu değişiklikten sonra "${path}" artık geçerli değil (${problem}). read_file ile dosyanın şimdiki halini oku ve hatayı düzelt.`,
      writeTruncated: (path: string) =>
        `"${path}" yazılmadı: yeni içerik dosyanın bazı kısımlarını "..." gibi yer tutucularla atlıyor ya da dosyanın yarısından kısa. Böyle yazılsaydı dosyanın geri kalanı silinirdi. Var olan dosyada yalnızca değişen satırları edit_file ile düzenle.`,
      closest: (snippet: string) =>
        `Dosyada buna en çok benzeyen yer:\n${snippet}\nold_text'i bu satırlardan birebir kopyala (satır numaraları olmadan) ve yeniden dene.`,
      editAmbiguous: (path: string, count: number) =>
        `old_text "${path}" dosyasında ${count} yerde geçiyor. Tek bir yeri gösterecek kadar çevresindeki satırları da ekleyip yeniden dene.`,
      changedMeanwhile: (path: string) =>
        `"${path}" onay beklenirken değişti (kullanıcı ya da başka bir program düzenledi); hiçbir şey yazılmadı. read_file ile güncel halini oku ve değişikliği yeniden yap.`,
      editedRegion: (path: string, region: string) => `"${path}" düzenlendi. Değişen bölümün şimdiki hali:
${region}`,
      duplicateLine: (line: string) =>
        `Dikkat: değişikliğin hemen yanında aynı satır art arda iki kez geçiyor ("${line}"). Yanlışlıkla tekrar etmiş olabilirsin; kontrol et ve gerekiyorsa düzelt.`,
      error: (message: string) => `Hata: ${message}`
    },

    /** İşlem geçmişine yazılan açıklamalar */
    log: {
      folderCreated: 'Klasör oluşturuldu',
      contentChanged: 'İçerik değiştirildi',
      fileCreated: 'Yeni dosya oluşturuldu',
      movedTo: (to: string) => `Şuraya taşındı: ${to}`,
      trashed: 'Çöp kutusuna gönderildi',
      commandRan: (code: number | null) => `Komut çalıştırıldı (çıkış kodu ${code ?? '?'})`
    },

    errors: {
      outside: (path: string) => `"${path}" bu klasörün dışında. Yalnızca bağlı klasörün içindeki dosyalara erişilebilir.`,
      isFolder: 'Bu bir klasör; içeriğini görmek için list_folder kullan.',
      tooLarge: 'Dosya okunamayacak kadar büyük (25 MB üstü).',
      emptyQuery: 'Aranacak bir şey verilmedi.',
      writeDisabled: 'Bu bilgisayarda dosya değiştirme kapalı.',
      unsupportedType: (ext: string) =>
        `"${ext}" türünde dosya yazılamaz. .txt, .md, .csv, .json gibi metin dosyaları yazılabilir.`,
      contentTooLong: 'İçerik tek seferde yazılamayacak kadar uzun.',
      pathIsFolder: 'Bu yol bir klasör; dosya adı ver.',
      targetExists: 'Hedefte aynı adda bir dosya zaten var.',
      cannotDeleteRoot: 'Bağlı klasörün kendisi silinemez.',
      notFound: 'Böyle bir dosya ya da klasör yok. list_folder ile adını kontrol et.',
      folderNotFound: 'Klasör bulunamadı.',
      emptyPlan: 'Plan boş; en az bir adım yaz.',
      editMissing: (path: string) => `"${path}" diye bir dosya yok. Yeni dosya için write_file kullan.`,
      editEmpty: 'old_text boş olamaz.',
      notUtf8: (path: string) =>
        `"${path}" UTF-8 değil (büyük olasılıkla Windows-1254 ya da UTF-16). Bozulmasın diye bu dosya değiştirilmez. Kullanıcıya dosyayı UTF-8 olarak kaydetmesini söyle.`
    },

    search: {
      byName: 'Adı eşleşen dosyalar:',
      byLine: 'İçinde geçen satırlar:',
      lineHit: (path: string, line: number, text: string) => `- ${path}, satır ${line}: ${text}`,
      related: 'Konuyla ilgili bölümler:',
      none: (query: string) => `"${query}" için sonuç bulunamadı.`
    }
  },

  /** Kod alanı (services/code.ts) */
  code: {
    noFolder: 'Bu proje klasörü artık bağlı değil.',
    notAFile: 'Bu bir dosya değil.',
    secretFile: 'Bu dosya gizli bilgi (parola, anahtar) içerebilir; içeriği gösterilmez ve Atlas\'a verilmez.',
    binaryFile: 'Bu dosya metin değil; içeriği gösterilemiyor.'
  },

  /** Veritabanı araçları (services/sql.ts) */
  sql: {
    defs: {
      schema: 'Veritabanındaki bir nesneye bakar. "table" bir tablo ya da görünüm adıysa sütunlarını ve türlerini, yordam, işlev, tetikleyici ya da zamanlanmış iş adıysa kodunu verir. Talimattaki listede olmayan ya da ayrıntısını bilmediğin nesneler için kullan.',
      schemaTableArg: 'Nesne adı: tablo, görünüm, yordam, işlev, tetikleyici ya da iş. Örnek: Personel, dbo.Personel, dbo.trg_SiparisIptal',
      query: 'Bağlı veritabanında bir SQL sorgusu çalıştırır. SELECT hemen çalışır. Veri ya da yapı değiştiren sorgular kullanıcıya onaya sunulur. DELETE, DROP ve TRUNCATE çalıştırılmaz.',
      querySqlArg: 'Çalıştırılacak tek bir SQL ifadesi'
    },
    prompt: {
      intro: (name: string, engine: string) => `Bu sohbete "${name}" adlı veritabanı bağlı. Türü: ${engine}. Sorguları bu türün söz dizimiyle yaz.`,
      schemaTitle: 'Veritabanındaki tablolar ve sütunları:',
      objectsTitle: 'Programlanabilir nesneler (kodunu görmek için sql_schema ile adını ver):',
      objectsHint:
        '- Yordam, işlev, tetikleyici, görünüm ya da zamanlanmış işin ne yaptığı sorulursa önce sql_schema ile adını vererek kodunu oku, sonra açıkla. Bir yordamı çalıştırmak (EXEC) veriyi değiştirebileceği için onay kartıyla sorulur.',
      schemaMore: (n: number) => `(${n} nesne daha var; sql_schema ile bak)`,
      schemaFirst: 'Yalnızca bu listedeki gerçek tablo ve sütun adlarını kullan; ad uydurma. Listede yoksa sql_schema ile bak.',
      readFree: 'Veri okumak için sql_query ile SELECT çalıştır; bunun için kullanıcıdan izin isteme. Sonucu kısa ve anlaşılır biçimde özetle.',
      writeApproval: 'INSERT, UPDATE, CREATE, ALTER gibi değiştiren sorguları da sql_query ile gönder: uygulama kullanıcıya onay kartı gösterir. Kullanıcı reddederse üsteleme.',
      forbidden: 'DELETE, DROP ve TRUNCATE işlemlerini sen yapamazsın; bunları deneme ve başka bir yolla (örneğin EXEC içinde) yapmaya çalışma. Kullanıcı böyle bir şey isterse "Maalesef silme işlemlerini ben yapamam; bunu sen kendi aracınla çalıştırabilirsin" de ve çalıştırabileceği sorguyu kod bloğu içinde ver.',
      limit: 'Büyük tablolarda her zaman satır sınırı kullan (SQL Server: TOP; PostgreSQL, MySQL ve SQLite: LIMIT) ve yalnızca gereken sütunları seç.'
    },
    steps: {
      schema: (n: number) => `Veritabanı şemasına bakıldı: ${n} tablo`,
      schemaTable: (table: string) => `Tabloya bakıldı: ${table}`,
      query: (sql: string) => `Sorgu: ${sql}`,
      read: (rows: number, truncated: boolean) => (truncated ? `Sorgu çalıştı: ilk ${rows} satır` : `Sorgu çalıştı: ${rows} satır`),
      wrote: (rows: number) => `Onaylandı ve çalıştı: ${rows} satır etkilendi`,
      denied: (sql: string) => `Reddedildi: ${sql}`,
      forbidden: (keywords: string) => `Çalıştırılmadı: ${keywords} işlemini Atlas yapamaz`,
      failed: 'Sorgu hata verdi'
    },
    result: {
      key: 'anahtar',
      notNull: 'boş olamaz',
      view: 'görünüm',
      kinds: { table: 'tablo', view: 'görünüm', procedure: 'saklı yordam', function: 'işlev', trigger: 'tetikleyici', job: 'zamanlanmış iş' },
      parent: (table: string) => `bağlı olduğu tablo: ${table}`,
      code: 'Kaynak kodu:',
      noTables: 'Veritabanında tablo yok.',
      noTable: (table: string) => `"${table}" adında bir tablo yok. sql_schema aracını tablo adı vermeden çağırıp listeye bak.`,
      emptySql: 'Sorgu boş.',
      noRows: '(Sorgu çalıştı; hiç satır dönmedi.)',
      more: (shown: number, total: number, truncated: boolean) =>
        truncated ? `(ilk ${shown} satır gösterildi; sonuç daha uzun ve kesildi)` : `(${total} satırın ilk ${shown} tanesi gösterildi)`,
      wrote: (rows: number) => `Kullanıcı onayladı. Sorgu çalıştı ve kalıcı oldu: ${rows} satır etkilendi.`,
      denied: 'Kullanıcı bu sorguyu onaylamadı; çalıştırılmadı. Üsteleme, ne yapmak istediğini sor.',
      forbidden: (keywords: string) =>
        `Bu sorgu çalıştırılmadı: ${keywords} işlemlerini Atlas yapamaz ve başka bir yolla da denememelisin. Kullanıcıya şunu söyle: "Maalesef silme işlemlerini ben yapamam; bunu sen kendi aracınla çalıştırabilirsin." Ardından çalıştırabileceği sorguyu kod bloğu içinde ver ve neyi sileceğini bir cümleyle açıkla.`,
      failed: (message: string) => `Sorgu hata verdi: ${message}`,
      unknownTool: (name: string) => `"${name}" adında bir araç yok.`
    },
    errors: {
      noName: 'Bağlantıya bir ad ver.',
      missingServer: 'Sunucu adresi ve kullanıcı adı gerekli.',
      missingFile: 'SQLite dosyasını seç.',
      noFile: (file: string) => `Dosya bulunamadı: ${file}`,
      noSafeStorage: 'Parola bu bilgisayarda güvenli biçimde saklanamıyor; bağlantı kaydedilmedi.',
      notFound: 'Bu veritabanı bağlantısı artık yok.',
      connect: (message: string) => `Veritabanına bağlanılamadı: ${message}`,
      unreachable: (host: string, port: number) => `Sunucuya ulaşılamadı (${host}, port ${port}). Sunucunun çalıştığını, adresin ve portun doğru olduğunu kontrol et.`,
      stopped: 'Cevap durduruldu; sorgu çalıştırılmadı.',
      panelReadOnly: 'Buradan yalnızca SELECT sorguları çalıştırılır. Değiştiren sorguları Atlas\'a yazdır; onay kartıyla çalışır. Silme işlemlerini kendi aracınla yap.'
    }
  },

  /** WhatsApp'tan kişi öğrenme (services/whatsapp) */
  whatsapp: {
    errors: {
      emptyFile: 'Dosya boş.',
      tooLarge: 'Dosya çok büyük. Sohbeti "medya olmadan" dışa aktarın.',
      zipFailed: 'Zip dosyası açılamadı.',
      zipNoChat: 'Zip dosyasının içinde sohbet dosyası (.txt) bulunamadı.',
      noMessages:
        'Bu dosyada WhatsApp mesajı bulunamadı. WhatsApp\'ta sohbeti açıp "Sohbeti dışa aktar" ile aldığınız dosyayı seçin.',
      importGone: 'Dosya artık bellekte değil. Lütfen yeniden seçin.',
      tooFew: (target: string, count: number, min: number) =>
        `${target} bu sohbette yalnızca ${count} mesaj yazmış. Tarzını öğrenmek için en az ${min} mesaj gerekir.`
    },

    /** Tarz özeti yazdırılırken örneklerdeki etiketler; summarySystem içindeki "Kişi" ile aynı olmalı */
    summaryOther: 'Karşı taraf',
    summaryPerson: 'Kişi',
    summarySystem: `Bir kişinin WhatsApp yazışmalarından örnekler verilecek. "Kişi" diye işaretlenen mesajları yazan insanın yazışma tarzını anlat.

Dört ile altı cümle yaz ve kişiye "sen" diye hitap et (ör. "Lafı uzatmazsın, çoğu şeye tek kelimeyle cevap verirsin.").
Şunlara değin: genel tavrı (sakin, heyecanlı, alaycı, şefkatli), mizahı, karşısındakine nasıl tepki verdiği, konuşmayı nasıl sürdürdüğü ya da kestiği.
Yalnızca örneklerde gördüğünü yaz; kişinin hayatı hakkında tahmin yürütme. Örneklerden alıntı yapma. Sadece tarz özetini yaz.`,

    /** Kişiliğin talimatının başı. self boşsa genel bir ad kullanılır. */
    intro: (target: string, self: string) =>
      [
        `Sen ${target}'sin ve ${self || 'kullanıcı'} ile WhatsApp'ta yazışıyorsun. Onun gerçek mesajlarından öğrenilen tarzı taklit ediyorsun.`,
        'Bir asistan gibi değil, o kişi gibi yaz: yardım teklif etme, açıklama yapma, madde sıralama.',
        `Karşındaki ciddi olarak gerçek ${target} olup olmadığını sorarsa, onun yazışma tarzını taklit eden bir yapay zeka olduğunu söyle.`
      ].join('\n'),
    tagline: (messages: number) => `WhatsApp yazışmalarından öğrenildi (${messages} mesaj)`,

    /** Sistem talimatına eklenen bölüm */
    prompt: {
      rulesTitle: 'Yazım kuralların (gerçek mesajlarından çıkarıldı; hepsine uy):',
      samplesTitle: 'Gerçek mesajlarından örnekler:',
      similarTitle: 'Benzer durumlarda verdiğin gerçek cevaplar (her satır ayrı bir mesajdır):',
      other: 'Karşı taraf',
      you: 'Sen',
      noGibberish: 'Mesajlarının sonuna anlamsız harf, rakam ya da işaret ekleme; yalnızca gerçek kelimeler yaz.',
      imitateExact:
        'Bu örneklerdeki üslubu, kelimeleri ve uzunluğu birebir taklit et. Örneklerde geçen kişilerden ve ortak anılardan söz edebilirsin. Örnekleri kelimesi kelimesine kopyalama; bugünkü mesaja cevap ver.',
      imitate:
        'Bu örneklerdeki üslubu, kelimeleri ve uzunluğu taklit et. Örnekleri kelimesi kelimesine kopyalama ve içlerindeki olayları bugün olmuş gibi anlatma; bugünkü mesaja cevap ver.'
    },

    /** Sayılardan çıkarılan yazım kuralları (services/whatsapp/style.ts) */
    style: {
      veryShort: (avgWords: number) => `Çok kısa yazarsın: mesajların ortalama ${avgWords} kelime. Uzun cümle kurma.`,
      short: (avgWords: number) => `Kısa yazarsın: mesajların ortalama ${avgWords} kelime.`,
      long: (avgWords: number) => `Mesajların ortalama ${avgWords} kelime; gerektiğinde uzun yazarsın.`,
      singleMessage: 'Genelde tek mesajla cevap verirsin; art arda çok mesaj atmazsın.',
      /** low ile high eşitse tek sayı, değilse aralık söylenir */
      burst: (low: number, high: number) =>
        `Cevapların çoğu zaman ${low === high ? `${high}` : `${low} ile ${high} arası`} kısa mesajdan oluşur, dörtten fazla olmaz. Her cevapta aynı sayıda mesaj atma: selama ya da kısa bir soruya tek mesaj yeter, anlatacak bir şeyin olduğunda daha çok yazarsın.`,
      lowercaseStart: 'Cümleye küçük harfle başlarsın; büyük harf kullanmazsın.',
      uppercaseStart: 'Cümleye büyük harfle başlarsın.',
      noEndPunctuation: 'Cümle sonuna nokta koymazsın.',
      endPunctuation: 'Cümle sonuna nokta koyarsın.',
      noQuestionMark: 'Soru sorarken soru işareti koymazsın; cümleyi olduğu gibi bırakırsın (ör. "saat kacta").',
      questionMark: 'Sorularının sonuna soru işareti koyarsın.',
      noTurkishLetters:
        'Türkçe harfleri kullanmazsın: ş yerine s, ı yerine i, ğ yerine g, ç yerine c, ö yerine o, ü yerine u yazarsın.',
      noEmoji: 'Emoji neredeyse hiç kullanmazsın.',
      emoji: (percent: number, top: string[]) =>
        `Mesajlarının yaklaşık %${percent} kadarında emoji var.${top.length > 0 ? ` En çok kullandıkların: ${top.join(' ')}` : ''}`,
      elongation: 'Vurgulamak için harfleri uzatırsın: "yaaa", "tamammm" gibi.',
      laughter: (example: string) => `Güldüğünde "${example}" gibi yazarsın.`,
      address: (words: string[]) => `Karşındakine ${words.map((a) => `"${a}"`).join(', ')} diye seslenirsin.`,
      topWords: (words: string[]) => `Sık kullandığın kelimeler: ${words.join(', ')}.`,
      topPhrases: (phrases: string[]) => `Sık kullandığın kalıplar: ${phrases.map((p) => `"${p}"`).join(', ')}.`
    }
  }
}
