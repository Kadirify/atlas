// Atlas-TR ölçüm seti.
// Her soru bir ya da daha çok kuralla otomatik puanlanır (bkz. checks.mjs).
// Bu sorular hiçbir zaman eğitim verisine eklenmez.

const re = (pattern, flags = 'iu') => ({ type: 'regex', pattern: new RegExp(pattern, flags) })
const not = (pattern, flags = 'iu') => ({ type: 'notRegex', pattern: new RegExp(pattern, flags) })
const maxWords = (n) => ({ type: 'maxWords', n })
const lang = (value) => ({ type: 'lang', value })
const sentences = (min, max) => ({ type: 'sentences', min, max })
const lines = (min, max) => ({ type: 'lines', min, max })
const noLoop = { type: 'noLoop' }
const A = "['’`]" // kesme işareti çeşitleri
/** Tam kelime eşleşmesi. JavaScript'te \b Türkçe harfleri kelime saymadığı için harf sınırı elle yazılır. */
const W = (alternatives) => `(?<!\\p{L})(?:${alternatives})(?!\\p{L})`

const FIX = 'Aşağıdaki cümlede yazım yanlışı var. Sadece düzeltilmiş cümleyi yaz, açıklama ekleme: '

const REPORT = `Ocak ayında e-posta sunucusu iki kez çöktü ve toplam kesinti 3 saat 20 dakika sürdü. Sorunun kaynağı dolan disk alanıydı. Şubat ayında disk genişletildi ve kesinti yaşanmadı. Destek masasına ocakta 142, şubatta 118 talep geldi. Mart ayında yedekleme sunucusunun yenilenmesi planlanıyor; sorumlusu Deniz Akar ve son tarih 15 Mart.`

const MEETING = `Toplantıda Ayşe bütçe raporunu cuma gününe kadar hazırlayacağını söyledi. Mehmet yeni sunucu için üç firmadan teklif alacak. Elif, güvenlik duvarı kurallarını gelecek hafta gözden geçirecek. Bir sonraki toplantı 21 Kasım'da yapılacak.`

export const CATEGORIES = [
  { id: 'yazim', name: 'Yazım ve dil bilgisi' },
  { id: 'talimat', name: 'Talimata uyma' },
  { id: 'sohbet', name: 'Doğal sohbet' },
  { id: 'resmi', name: 'Resmi yazışma' },
  { id: 'akil', name: 'Akıl yürütme ve bilgi' },
  { id: 'ozet', name: 'Özetleme ve metne bağlılık' },
  { id: 'uzun', name: 'Uzun cevap ve tekrar etmeme' },
  { id: 'ceviri', name: 'Çeviri' },
  { id: 'ingilizce', name: 'İngilizce' },
  { id: 'kod', name: 'Kod ve SQL' }
]

/** Kategoriye göre sistem talimatı. Bütün modellere aynısı verilir. */
export const SYSTEM = {
  sohbet: 'Kullanıcıyla samimi ve kısa konuş.',
  default: 'Yardımcı bir asistansın. Kullanıcı hangi dilde yazarsa o dilde cevap ver. İstenenin dışına çıkma.'
}

export const ITEMS = [
  // --- Yazım ve dil bilgisi ---
  { id: 'yazim-01', cat: 'yazim', prompt: FIX + '"Herkez toplantıya zamanında geldi."', checks: [re('Herkes'), not('Herkez')] },
  { id: 'yazim-02', cat: 'yazim', prompt: FIX + '"Sende bizimle gelecekmisin?"', checks: [re('Sen de'), re('gelecek misin')] },
  { id: 'yazim-03', cat: 'yazim', prompt: FIX + '"Yarın ki toplantı iptal oldu."', checks: [re('Yarınki'), not('Yarın ki')] },
  { id: 'yazim-04', cat: 'yazim', prompt: FIX + '"Bu konuyu bir kaç gün sonra konuşalım."', checks: [re('birkaç'), not('bir kaç')] },
  { id: 'yazim-05', cat: 'yazim', prompt: FIX + '"Raporu hazırladımki herkes görsün."', checks: [re('hazırladım ki')] },
  { id: 'yazim-06', cat: 'yazim', prompt: FIX + '"Türkiyenin başkenti Ankaradır."', checks: [re(`Türkiye${A}nin`), re(`Ankara${A}dır`)] },
  { id: 'yazim-07', cat: 'yazim', prompt: FIX + '"Yanlız bir sorunumuz var."', checks: [re('Yalnız'), not('Yanlız')] },
  { id: 'yazim-08', cat: 'yazim', prompt: FIX + '"Şöför arabayı park etti."', checks: [re('Şoför'), not('Şöför')] },
  { id: 'yazim-09', cat: 'yazim', prompt: FIX + '"Toplantıya kimse gelmedi, bende gitmedim."', checks: [re('ben de'), not('bende')] },
  { id: 'yazim-10', cat: 'yazim', prompt: FIX + '"Herşey yolunda gidiyor."', checks: [re('Her şey'), not('Herşey')] },
  { id: 'yazim-11', cat: 'yazim', prompt: FIX + '"Ali\'de toplantıya katılacak."', checks: [re('Ali de'), not(`Ali${A}de`)] },
  { id: 'yazim-12', cat: 'yazim', prompt: FIX + '"Bu işi yapmağa çalışıyorum."', checks: [re('yapmaya'), not('yapmağa')] },
  {
    id: 'yazim-13',
    cat: 'yazim',
    prompt: 'Boşluğa uygun olanı seç ve sadece o kelimeyi yaz: "Kitabı masanın ___ koydum." (üstüne / üstünde / üstünden)',
    checks: [re('^\\W*üstüne\\W*$')]
  },
  {
    id: 'yazim-14',
    cat: 'yazim',
    prompt: 'Boşluğa uygun olanı seç ve sadece o kelimeyi yaz: "Dün akşam sinemaya ___." (gideceğiz / gittik / gidiyoruz)',
    checks: [re('^\\W*gittik\\W*$')]
  },
  {
    id: 'yazim-15',
    cat: 'yazim',
    prompt: 'Aşağıdaki kelimelerden hangisi yanlış yazılmıştır? Sadece o kelimeyi yaz: tabii, orijinal, süpriz, yalnız',
    checks: [re('süpriz'), not('tabii|orijinal|yalnız')]
  },
  { id: 'yazim-16', cat: 'yazim', prompt: '"hediye" kelimesinin eş anlamlısını tek kelimeyle yaz.', checks: [re('armağan'), maxWords(3)] },
  { id: 'yazim-17', cat: 'yazim', prompt: '"cömert" kelimesinin zıt anlamlısını tek kelimeyle yaz.', checks: [re('cimri|pinti'), maxWords(3)] },
  {
    id: 'yazim-18',
    cat: 'yazim',
    prompt: '"Damlaya damlaya ... olur." atasözünü tamamla; sadece eksik kelimeyi yaz.',
    checks: [re('göl'), maxWords(4)]
  },

  // --- Talimata uyma ---
  { id: 'talimat-01', cat: 'talimat', prompt: 'Türkiye\'nin başkenti Ankara mı? Sadece "evet" ya da "hayır" yaz.', checks: [re('^\\W*evet\\W*$')] },
  {
    id: 'talimat-02',
    cat: 'talimat',
    prompt: 'Üç meyve adı yaz. Her birini ayrı satıra yaz, başka hiçbir şey yazma.',
    checks: [lines(3, 3), maxWords(8)]
  },
  {
    id: 'talimat-03',
    cat: 'talimat',
    prompt: 'Şu bilgiyi JSON olarak ver, başka hiçbir şey yazma: ad Ayşe, yaş 34, şehir İzmir. Anahtarlar: ad, yas, sehir',
    checks: [{ type: 'json', keys: ['ad', 'yas', 'sehir'] }, { type: 'onlyJson' }, re('Ayşe'), re('34'), re('İzmir')]
  },
  { id: 'talimat-04', cat: 'talimat', prompt: 'Yapay zekayı tam olarak iki cümleyle açıkla.', checks: [sentences(2, 2), lang('tr')] },
  {
    id: 'talimat-05',
    cat: 'talimat',
    prompt: 'Hiç büyük harf kullanmadan kendini tek cümleyle tanıt.',
    checks: [not('[A-ZÇĞİÖŞÜ]', 'u'), lang('tr'), maxWords(30)]
  },
  {
    id: 'talimat-06',
    cat: 'talimat',
    prompt: "1'den 5'e kadar sayıları aralarında virgül olacak şekilde tek satırda yaz, başka bir şey yazma.",
    checks: [re('^\\s*1\\s*,\\s*2\\s*,\\s*3\\s*,\\s*4\\s*,\\s*5\\.?\\s*$')]
  },
  {
    id: 'talimat-07',
    cat: 'talimat',
    prompt: '"Toplantı ertelendi" cümlesini büyük harflerle yaz, başka bir şey ekleme.',
    checks: [re('^\\W*TOPLANTI ERTELENDİ\\W*$', 'u')]
  },
  { id: 'talimat-08', cat: 'talimat', prompt: 'En fazla 10 kelimeyle bir günaydın mesajı yaz.', checks: [maxWords(10), lang('tr'), re('günaydın')] },
  {
    id: 'talimat-09',
    cat: 'talimat',
    prompt: 'Aşağıdaki listeyi alfabetik sırala, her birini ayrı satıra yaz, başka bir şey yazma: zeytin, armut, muz, elma',
    checks: [re('armut[\\s\\S]*elma[\\s\\S]*muz[\\s\\S]*zeytin'), lines(4, 4)]
  },
  {
    id: 'talimat-10',
    cat: 'talimat',
    prompt: 'Cevabını "Sonuç:" kelimesiyle başlat. 12 ile 8\'in toplamı kaçtır?',
    checks: [re('^\\s*Sonuç:'), re('\\b20\\b')]
  },
  { id: 'talimat-11', cat: 'talimat', prompt: 'Bana bir şiir yazma; onun yerine sadece "tamam" yaz.', checks: [re('^\\W*tamam\\W*$')] },
  {
    id: 'talimat-12',
    cat: 'talimat',
    prompt: 'Markdown kullanmadan, madde işareti olmadan, düz tek paragrafla suyun neden önemli olduğunu anlat. En fazla 60 kelime.',
    checks: [not('^\\s*[-*#]', 'mu'), not('\\*\\*'), maxWords(70), lines(1, 1), lang('tr')]
  },
  {
    id: 'talimat-13',
    cat: 'talimat',
    prompt: 'Sadece emoji kullanarak mutlu olduğunu ifade et; harf yazma.',
    checks: [not('\\p{L}', 'u'), re('\\p{Extended_Pictographic}', 'u')]
  },
  {
    id: 'talimat-14',
    cat: 'talimat',
    prompt: 'Şu cümleyi olumsuz yap, sadece cümleyi yaz: "Yarın toplantıya geleceğim."',
    checks: [re('gelmeyeceğim'), maxWords(8)]
  },

  // --- Doğal sohbet ---
  { id: 'sohbet-01', cat: 'sohbet', prompt: 'naber', checks: [lang('tr'), maxWords(30), not('yapay zeka (dil )?modeli olarak|as an ai'), not('^#|\\*\\*', 'mu')] },
  { id: 'sohbet-02', cat: 'sohbet', prompt: 'bugün çok yorgunum ya', checks: [lang('tr'), maxWords(60), not('^\\s*([-*]|\\d+\\.)\\s', 'mu')] },
  { id: 'sohbet-03', cat: 'sohbet', prompt: 'teşekkürler, çok yardımcı oldun', checks: [lang('tr'), maxWords(30)] },
  { id: 'sohbet-04', cat: 'sohbet', prompt: 'selam, adın ne?', checks: [lang('tr'), maxWords(30)] },
  { id: 'sohbet-05', cat: 'sohbet', prompt: 'hava çok güzel bugün, sence ne yapsam?', checks: [lang('tr'), maxWords(80), not('^#', 'mu')] },
  {
    id: 'sohbet-06',
    cat: 'sohbet',
    prompt: 'Bana "siz" diye hitap et. Nasılsın?',
    checks: [re(`${W('siz|size|sizi')}|sınız|siniz|sunuz|sünüz`), not(W('sen|sana|seni|nasılsın')), lang('tr')]
  },
  { id: 'sohbet-07', cat: 'sohbet', prompt: 'iyi geceler', checks: [lang('tr'), maxWords(20)] },
  { id: 'sohbet-08', cat: 'sohbet', prompt: 'Kısa cevap ver: en sevdiğin renk ne?', checks: [lang('tr'), maxWords(25)] },

  // --- Resmi yazışma ---
  {
    id: 'resmi-01',
    cat: 'resmi',
    prompt:
      "Satın alma müdürü Ayşe Hanım'a, antivirüs lisansının 30 Kasım'da biteceğini ve 20 Kasım'a kadar teklif beklediğimizi bildiren resmi ve kısa bir e-posta yaz.",
    checks: [re('Sayın|Ayşe Hanım'), re('30 Kasım'), re('20 Kasım'), not('\\[[^\\]]*\\]'), maxWords(160), lang('tr'), re('Saygılar|İyi çalışmalar')]
  },
  {
    id: 'resmi-02',
    cat: 'resmi',
    prompt: 'Tüm çalışanlara, 15 Kasım Cumartesi 22:00 ile 02:00 arasında dosya sunucusunda bakım yapılacağını duyuran bir e-posta yaz.',
    checks: [re('15 Kasım'), re('22[:.]00'), re('02[:.]00'), re('bakım'), maxWords(200), lang('tr')]
  },
  {
    id: 'resmi-03',
    cat: 'resmi',
    prompt: 'Müşteriye siparişinin 3 gün gecikeceğini bildiren ve özür dileyen resmi bir e-posta yaz. Sipariş numarası 48213.',
    checks: [re('48213'), re('özür|üzgün'), re('3 gün|üç gün'), maxWords(180), lang('tr')]
  },
  {
    id: 'resmi-04',
    cat: 'resmi',
    prompt: 'Aşağıdaki cümleyi resmi dile çevir, sadece cümleyi yaz: "ya abi toplantıyı yarına alsak olur mu"',
    checks: [not(W('abi|ya')), re('toplantı'), re('yarın'), maxWords(30)]
  },
  {
    id: 'resmi-05',
    cat: 'resmi',
    prompt: 'Bir çalışana bu çeyrekteki performansı için teşekkür eden iki cümlelik resmi bir not yaz.',
    checks: [sentences(2, 3), re('teşekkür'), lang('tr')]
  },
  {
    id: 'resmi-06',
    cat: 'resmi',
    prompt: 'Yöneticime 24-28 Kasım arası yıllık izin istediğimi bildiren kısa bir e-posta yaz.',
    checks: [re('24'), re('28 Kasım'), re('izin'), maxWords(150), lang('tr')]
  },
  {
    id: 'resmi-07',
    cat: 'resmi',
    prompt: 'Toplantı daveti yaz: konu bütçe gözden geçirme, 14 Kasım Cuma saat 10:00, A Blok toplantı odası.',
    checks: [re('14 Kasım'), re('10[:.]00'), re('A Blok'), re('bütçe'), maxWords(150)]
  },
  {
    id: 'resmi-08',
    cat: 'resmi',
    prompt:
      "Aşağıdaki e-postayı tek cümleyle özetle: \"Merhaba, geçen hafta gönderdiğimiz faturanın ödemesi henüz hesabımıza ulaşmadı. Vade tarihi 5 Kasım'dı. Ödemenin en geç bu cuma yapılmasını rica ederiz, aksi halde hizmeti durdurmak zorunda kalacağız.\"",
    checks: [sentences(1, 2), re('ödeme|fatura'), maxWords(45), lang('tr')]
  },

  // --- Akıl yürütme ve bilgi ---
  { id: 'akil-01', cat: 'akil', prompt: "Bir toplantı 14:30'da başlıyor ve 1 saat 45 dakika sürüyor. Saat kaçta biter? Sadece saati yaz.", checks: [re('16[:.]15')] },
  { id: 'akil-02', cat: 'akil', prompt: "Bir ekipte 12 kişi var; 5'i izinde. Kaç kişi çalışıyor? Sadece sayıyı yaz.", checks: [re('^\\D*7\\D*$')] },
  { id: 'akil-03', cat: 'akil', prompt: '640000, 215000, 48000 ve 132000 sayılarının toplamı kaçtır? Sadece sayıyı yaz.', checks: [re('1[.,\\s]?035[.,\\s]?000')] },
  { id: 'akil-04', cat: 'akil', prompt: 'Bir ürün 800 TL. Yüzde 25 indirim yapılırsa kaç TL olur? Sadece sayıyı yaz.', checks: [re('\\b600\\b'), not('\\b200\\b')] },
  { id: 'akil-05', cat: 'akil', prompt: "Ali, Veli'den uzun; Veli, Can'dan uzun. En kısa kim? Sadece ismi yaz.", checks: [re('^\\W*Can\\W*$')] },
  { id: 'akil-06', cat: 'akil', prompt: 'Pazartesiden 10 gün sonra hangi gündür? Sadece günü yaz.', checks: [re('Perşembe')] },
  { id: 'akil-07', cat: 'akil', prompt: "Türkiye'nin en kalabalık şehri hangisidir? Tek kelimeyle yaz.", checks: [re('İstanbul', 'u'), maxWords(3)] },
  { id: 'akil-08', cat: 'akil', prompt: 'Bir yılda kaç hafta vardır? Sadece sayıyı yaz.', checks: [re('\\b52\\b')] },
  { id: 'akil-09', cat: 'akil', prompt: '3 işçi bir duvarı 6 günde örüyor. Aynı hızla 6 işçi kaç günde örer? Sadece sayıyı yaz.', checks: [re('^\\D*3\\D*$')] },
  { id: 'akil-10', cat: 'akil', prompt: 'Hangisi daha ağırdır: 1 kilo demir mi, 1 kilo pamuk mu? Tek cümleyle cevap ver.', checks: [re('aynı|eşit')] },
  { id: 'akil-11', cat: 'akil', prompt: '"Kalem" kelimesi kaç harflidir? Sadece sayıyı yaz.', checks: [re('^\\D*5\\D*$|beş')] },
  { id: 'akil-12', cat: 'akil', prompt: "Türkiye'de Cumhuriyet hangi yıl ilan edildi? Sadece yılı yaz.", checks: [re('1923')] },

  // --- Özetleme ve metne bağlılık ---
  { id: 'ozet-01', cat: 'ozet', prompt: `Aşağıdaki metni iki cümleyle özetle:\n\n${REPORT}`, checks: [sentences(1, 2), re('kesinti|çök'), maxWords(60), lang('tr')] },
  {
    id: 'ozet-02',
    cat: 'ozet',
    prompt: `Aşağıdaki metinden yapılacak işleri kim yapacaksa adıyla birlikte madde madde çıkar, başka bir şey yazma:\n\n${MEETING}`,
    checks: [lines(3, 4), re('Ayşe'), re('Mehmet'), re('Elif'), re('teklif')]
  },
  { id: 'ozet-03', cat: 'ozet', prompt: `Aşağıdaki metne en fazla altı kelimelik bir başlık yaz, sadece başlığı yaz:\n\n${REPORT}`, checks: [maxWords(7), lines(1, 1)] },
  {
    id: 'ozet-04',
    cat: 'ozet',
    prompt: `Sadece aşağıdaki metne göre cevap ver; metinde yoksa "Metinde yok" yaz.\n\n${REPORT}\n\nSoru: Yedekleme sunucusunun bütçesi ne kadar?`,
    checks: [re('metinde yok'), not('\\d+\\s*(TL|lira|dolar|USD)')]
  },
  {
    id: 'ozet-05',
    cat: 'ozet',
    prompt: `Sadece aşağıdaki metne göre cevap ver; metinde yoksa "Metinde yok" yaz.\n\n${REPORT}\n\nSoru: Yedekleme sunucusunun yenilenmesinden kim sorumlu ve son tarih ne?`,
    checks: [re('Deniz Akar'), re('15 Mart'), not('metinde yok')]
  },
  {
    id: 'ozet-06',
    cat: 'ozet',
    prompt: `Sadece aşağıdaki metne göre cevap ver, sadece sayıyı yaz.\n\n${REPORT}\n\nSoru: İki ayda destek masasına toplam kaç talep geldi?`,
    checks: [re('\\b260\\b')]
  },

  // --- Uzun cevap ve tekrar etmeme ---
  { id: 'uzun-01', cat: 'uzun', long: true, prompt: 'Yarınki ekip toplantısı için 30 dakikalık bir gündem hazırla.', checks: [noLoop, maxWords(350), lang('tr'), re('dakika|dk')] },
  { id: 'uzun-02', cat: 'uzun', long: true, prompt: 'Bir IT departmanının yıllık hedeflerini tam 10 madde halinde yaz; her madde tek satır olsun, başka bir şey yazma.', checks: [noLoop, lines(10, 10), lang('tr')] },
  { id: 'uzun-03', cat: 'uzun', long: true, prompt: 'Yeni başlayan bir çalışan için ilk hafta planı hazırla.', checks: [noLoop, maxWords(450), lang('tr'), re('Pazartesi|gün\\s*1|1\\.\\s*gün|ilk gün|birinci gün')] },
  { id: 'uzun-04', cat: 'uzun', long: true, prompt: "1'den 20'ye kadar sayıları alt alta yaz, başka bir şey yazma.", checks: [lines(20, 20), re('\\b20\\b'), not('\\b21\\b')] },

  // --- Çeviri ---
  {
    id: 'ceviri-01',
    cat: 'ceviri',
    prompt: 'Şu cümleyi İngilizceye çevir, sadece çeviriyi yaz: "Toplantı yarın saat ona ertelendi."',
    checks: [re('meeting'), re('tomorrow'), re('\\bten\\b|\\b10\\b'), re('postponed|rescheduled|moved|delayed|pushed'), not('[çğışöü]')]
  },
  {
    id: 'ceviri-02',
    cat: 'ceviri',
    prompt: '"The server will be down for maintenance tonight." cümlesini Türkçeye çevir, sadece çeviriyi yaz.',
    checks: [re('sunucu'), re('bakım'), re('bu gece|bu akşam'), not('\\bthe\\b|server')]
  },
  { id: 'ceviri-03', cat: 'ceviri', prompt: 'Şu cümleyi İngilizceye çevir, sadece çeviriyi yaz: "Faturanızı ekte bulabilirsiniz."', checks: [re('invoice'), re('attach'), not('[çğışöü]')] },
  {
    id: 'ceviri-04',
    cat: 'ceviri',
    prompt: '"Please reset your password by Friday." cümlesini Türkçeye çevir, sadece çeviriyi yaz.',
    checks: [re('şifre|parola'), re('cuma'), re('sıfırla'), not('password|please')]
  },
  {
    id: 'ceviri-05',
    cat: 'ceviri',
    prompt: '"It\'s raining cats and dogs." deyimini Türkçeye anlamına göre çevir, sadece çeviriyi yaz.',
    checks: [re('yağmur|bardaktan boşan'), not('kedi|köpek')]
  },
  { id: 'ceviri-06', cat: 'ceviri', prompt: 'Hasta birine söylenen "Geçmiş olsun." ifadesini İngilizceye çevir, sadece çeviriyi yaz.', checks: [re('get well|feel better|speedy recovery'), maxWords(8)] },

  // --- İngilizce ---
  { id: 'ingilizce-01', cat: 'ingilizce', prompt: 'What is the capital of France? Answer with one word.', checks: [re('^\\W*Paris\\W*$')] },
  { id: 'ingilizce-02', cat: 'ingilizce', prompt: 'Write exactly two sentences about why backups matter.', checks: [sentences(2, 2), lang('en')] },
  {
    id: 'ingilizce-03',
    cat: 'ingilizce',
    prompt: 'Fix the grammar and output only the corrected sentence: "She dont like the new system."',
    checks: [re("doesn['’]t|does not"), not('dont\\b'), maxWords(10)]
  },
  { id: 'ingilizce-04', cat: 'ingilizce', prompt: 'Reply with only "yes" or "no": Is 17 a prime number?', checks: [re('^\\W*yes\\W*$')] },
  {
    id: 'ingilizce-05',
    cat: 'ingilizce',
    prompt: 'Write a short, formal email to the IT team announcing planned maintenance on Saturday from 10 PM to 2 AM.',
    checks: [re('Saturday'), re('10(:00)?\\s?PM|22:00'), re('2(:00)?\\s?AM|02:00'), lang('en'), maxWords(200)]
  },
  { id: 'ingilizce-06', cat: 'ingilizce', prompt: 'List three benefits of remote work, one per line, nothing else.', checks: [lines(3, 3), lang('en')] },
  {
    id: 'ingilizce-07',
    cat: 'ingilizce',
    prompt:
      'Summarize in one sentence: "The quarterly report shows revenue grew 12 percent while costs fell 3 percent, mainly due to the new logistics contract signed in March."',
    checks: [sentences(1, 1), re('12'), lang('en'), maxWords(40)]
  },
  { id: 'ingilizce-08', cat: 'ingilizce', prompt: "hey, how's it going?", checks: [lang('en'), maxWords(40)] },

  // --- Kod ve SQL ---
  {
    id: 'kod-01',
    cat: 'kod',
    prompt:
      'MSSQL (T-SQL) için: "Siparisler" tablosundan toplam tutarı en yüksek 5 müşteriyi getiren sorguyu yaz. Sütunlar: MusteriId, Tutar. Sadece sorguyu yaz.',
    checks: [re('SELECT\\s+TOP\\s*\\(?\\s*5\\s*\\)?'), re('SUM\\s*\\(\\s*\\[?Tutar\\]?\\s*\\)'), re('GROUP\\s+BY\\s+\\[?MusteriId'), re('ORDER\\s+BY[\\s\\S]*DESC'), not('LIMIT\\s+5')]
  },
  {
    id: 'kod-02',
    cat: 'kod',
    prompt: 'JavaScript\'te bir dizideki sayıların ortalamasını döndüren "ortalama" adlı fonksiyonu yaz. Sadece kodu yaz.',
    checks: [re('function\\s+ortalama|(const|let)\\s+ortalama\\s*='), re('reduce|for\\s*\\('), re('\\.length')]
  },
  {
    id: 'kod-03',
    cat: 'kod',
    prompt: 'T-SQL\'de "Calisanlar" tablosuna "Eposta" adında NVARCHAR(200) bir sütun ekleyen komutu yaz. Sadece komutu yaz.',
    checks: [re('ALTER\\s+TABLE\\s+(\\[?dbo\\]?\\.)?\\[?Calisanlar\\]?\\s+ADD\\s+\\[?Eposta\\]?\\s+NVARCHAR\\s*\\(\\s*200\\s*\\)'), not('ADD\\s+COLUMN')]
  },
  {
    id: 'kod-04',
    cat: 'kod',
    prompt: 'Python\'da bir metindeki kelime sayısını döndüren bir fonksiyon yaz. Sadece kodu yaz.',
    checks: [re('def\\s+\\w+\\s*\\('), re('split\\s*\\('), re('len\\s*\\('), re('return')]
  },
  {
    id: 'kod-05',
    cat: 'kod',
    prompt: 'Bu SQL sorgusundaki hatayı düzelt ve sadece düzeltilmiş sorguyu yaz: SELECT ad, COUNT(*) FROM Calisanlar WHERE COUNT(*) > 1 GROUP BY ad',
    checks: [re('HAVING\\s+COUNT'), re('GROUP\\s+BY\\s+ad[\\s\\S]*HAVING'), not('WHERE\\s+COUNT')]
  },
  { id: 'kod-06', cat: 'kod', prompt: "T-SQL'de şu anki tarih ve saati veren fonksiyonun adını yaz. Sadece fonksiyonu yaz.", checks: [re('GETDATE|SYSDATETIME|CURRENT_TIMESTAMP'), maxWords(6)] },
  {
    id: 'kod-07',
    cat: 'kod',
    prompt: "C#'ta bir string'in null ya da boş olup olmadığını kontrol eden tek satırlık ifadeyi yaz.",
    checks: [re('string\\.IsNullOrEmpty|String\\.IsNullOrEmpty|IsNullOrWhiteSpace')]
  },
  {
    id: 'kod-08',
    cat: 'kod',
    prompt: "PowerShell'de C sürücüsündeki boş alanı gösteren tek bir komut yaz. Sadece komutu yaz.",
    checks: [re('Get-PSDrive|Get-Volume|Win32_LogicalDisk|Get-CimInstance|Get-WmiObject'), not('\\bdf\\b|\\bdu\\b')]
  }
]
