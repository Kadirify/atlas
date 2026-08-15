import type { Lang } from '@shared/i18n'
import type { AppCategory, AppField, AppIcon, MiniAppDraft } from '@shared/types'
import { englishApps } from './builtinApps.en'

export interface BuiltinApp extends MiniAppDraft {
  id: string
  /** true ise yalnızca "Kurumsal işlerde de kullanacağım" açıkken görünür. */
  corporate: boolean
}

const text = (label: string, placeholder = '', required = true): AppField => ({
  key: '',
  label,
  type: 'text',
  placeholder,
  options: [],
  required
})
const area = (label: string, placeholder = '', required = true): AppField => ({
  key: '',
  label,
  type: 'textarea',
  placeholder,
  options: [],
  required
})
const select = (label: string, options: string[]): AppField => ({
  key: '',
  label,
  type: 'select',
  placeholder: '',
  options,
  required: true
})

const TON = select('Ton', ['Resmi', 'Yarı resmi', 'Samimi'])
const UZUNLUK = select('Uzunluk', ['Kısa', 'Orta', 'Ayrıntılı'])

function app(
  id: string,
  category: AppCategory,
  icon: AppIcon,
  name: string,
  description: string,
  prompt: string,
  fields: AppField[],
  corporate = true
): BuiltinApp {
  return {
    id: `builtin:${id}`,
    name,
    description,
    icon,
    category,
    prompt: prompt.replace(/\n\s+/g, '\n').trim(),
    // Anahtarlar sıradan üretilir; alan eklenip çıkarıldığında geçmiş kayıtlar etiketle eşleşir.
    fields: fields.map((f, i) => ({ ...f, key: `alan_${i + 1}` })),
    corporate
  }
}

/** Başka dillerdeki listelerin (builtinApps.en.ts) kullandığı kurucu yardımcılar */
export interface AppBuilders {
  app: typeof app
  text: typeof text
  area: typeof area
  select: typeof select
}

/**
 * Hazır uygulamalar (Türkçe). Liste bilerek kısa tutulur: birbirine benzeyen işler
 * tek uygulamada bir "Tür" seçeneğiyle birleştirilir.
 *
 * Buraya uygulama ya da alan eklenirse builtinApps.en.ts de güncellenmeli:
 * kimlikler, alan sayısı, sırası ve türleri iki dilde aynı olmak zorunda.
 */
export const BUILTIN_APPS: BuiltinApp[] = [
  // --- Herkese açık metin araçları ---
  app(
    'fix',
    'Metin',
    'wand',
    'Metni düzelt',
    'Yazım hatalarını giderir, metni kısaltır, uzatır ya da tonunu değiştirir.',
    `Sen titiz bir editörsün. Verilen metni seçilen işleme göre yeniden yaz.
    - "Yazım ve dil bilgisini düzelt": yalnızca yazım, noktalama ve anlatım hatalarını düzelt; üsluba ve kelime seçimine dokunma.
    - "Daha net ve akıcı yap": cümleleri sadeleştir, tekrarları çıkar; anlamı değiştirme.
    - "Daha resmi yap" ya da "Daha samimi yap": bilgileri ve sırayı koru, yalnızca kelime seçimini ve cümle yapısını değiştir.
    - "Kısalt": en önemli bilgileri koruyarak metni yaklaşık yarıya indir.
    - "Ayrıntılandırarak uzat": yalnızca metinde zaten bulunan fikirleri aç.
    Hiçbir işlemde yeni bilgi, sayı ya da örnek uydurma. Metin başka bir dildeyse o dilde kal. Sadece yeni metni ver.`,
    [
      area('Metin', 'Metni yapıştır ya da dosya ekle.'),
      select('İşlem', [
        'Yazım ve dil bilgisini düzelt',
        'Daha net ve akıcı yap',
        'Daha resmi yap',
        'Daha samimi yap',
        'Kısalt',
        'Ayrıntılandırarak uzat'
      ])
    ],
    false
  ),
  app(
    'summarize',
    'Metin',
    'scroll',
    'Özetle',
    'Uzun bir metni, belgeyi ya da yazışmayı kısa bir özete indirir.',
    `Sen yöneticilere bilgi notu hazırlayan bir asistansın. Verilen metni seçilen biçimde özetle.
    - "Kısa paragraf": en fazla beş cümlelik tek bir paragraf. En önemli sonuç ilk cümlede olsun.
    - "Madde madde": en fazla yedi kısa madde; her madde tek bir fikir.
    - "Kararlar ve yapılacaklar": önce tek cümleyle konuyu söyle, sonra "Kararlar", "Yapılacaklar" (kim, ne, ne zamana kadar) ve "Açık kalan konular" başlıkları altında kısa maddeler ver. Bir başlık altında yazacak şey yoksa "Yok" yaz.
    Metinde olmayan hiçbir şey ekleme, yorum katma. Kimin ne dediği önemliyse adıyla belirt.`,
    [
      area('Metin', 'Özetlenecek metni yapıştır ya da dosya ekle.'),
      select('Biçim', ['Kısa paragraf', 'Madde madde', 'Kararlar ve yapılacaklar'])
    ],
    false
  ),
  app(
    'translate',
    'Metin',
    'languages',
    'Çevir',
    'Metni anlamını ve tonunu koruyarak başka bir dile çevirir.',
    `Sen profesyonel bir çevirmensin. Verilen metni hedef dile çevir.
    Anlamı, tonu ve biçimi (paragraflar, maddeler, başlıklar) koru. Kelime kelime değil, hedef dilde doğal duracak şekilde çevir. Özel adları, ürün adlarını ve sayıları değiştirme.
    Sadece çeviriyi ver; açıklama ya da not ekleme.`,
    [
      area('Metin', 'Çevrilecek metni yapıştır ya da dosya ekle.'),
      select('Hedef dil', ['İngilizce', 'Türkçe', 'Almanca', 'Fransızca', 'İspanyolca', 'Arapça', 'Rusça']),
      select('Üslup', ['Aslına sadık', 'Resmi', 'Günlük'])
    ],
    false
  ),

  // --- Kurumsal ---
  app(
    'email',
    'E-posta',
    'mail',
    'E-posta yaz',
    'Yeni e-posta, gelen e-postaya cevap ya da hatırlatma yazar.',
    `Sen kurumsal yazışmalarda deneyimli bir iletişim uzmanısın. Verilen notlardan gönderilmeye hazır bir iş e-postası yaz.
    - "Yeni e-posta": ilk paragrafta e-postanın amacını söyle, ayrıntıları kısa paragraflar ya da maddelerle ver, alıcıdan ne beklendiğini açıkça belirt.
    - "Gelen e-postaya cevap": gelen e-postadaki her soruya ve isteğe karşılık ver, cevapsız nokta bırakma. Gelen e-postayı tekrar etme ya da özetleme; doğrudan cevaba gir. Kullanıcının vermediği taahhütlerde bulunma.
    - "Hatırlatma": suçlayıcı olmadan önceki talebi tek cümleyle hatırlat, neye ihtiyaç duyulduğunu ve varsa son tarihi net söyle. En fazla beş altı cümle olsun.
    Cevap yazmıyorsan ilk satıra "Konu:" ile kısa ve net bir konu başlığı koy. Alıcıya uygun bir hitapla başla, kibar bir kapanışla bitir. İstenen tona ve uzunluğa uy.
    Klişe ve dolgu cümlelerinden kaçın ("Umarım bu e-posta sizi iyi bulur" gibi).`,
    [
      select('Tür', ['Yeni e-posta', 'Gelen e-postaya cevap', 'Hatırlatma']),
      text('Alıcı', 'Ayşe Hanım, Satın Alma Müdürü'),
      area('Ne söylemek istiyorsun', 'Madde madde yazabilirsin. Örn. lisans 30 Kasım’da bitiyor, 20 Kasım’a kadar teklif lazım.'),
      area('Gelen e-posta', 'Cevap yazıyorsan gelen e-postayı buraya yapıştır.', false),
      TON,
      UZUNLUK
    ]
  ),
  app(
    'meeting-summary',
    'Toplantı',
    'users',
    'Toplantı özeti',
    'Dağınık notlardan kararları ve yapılacakları olan bir özet çıkarır.',
    `Sen toplantı tutanağı hazırlayan deneyimli bir yönetici asistanısın. Verilen notlardan katılımcılara gönderilebilecek bir toplantı özeti yaz.
    Şu başlıkları kullan: "Özet" (iki üç cümle), "Görüşülen konular" (maddeler), "Alınan kararlar" (maddeler), "Yapılacaklar" (tablo: İş, Sorumlu, Son tarih).
    Yapılacaklar tablosunda her satır tek bir iş olsun ve bir fiille başlasın. Notlarda sorumlusu ya da tarihi belli olmayan işlerde ilgili hücreye "Belirtilmedi" yaz.
    Notlarda olmayan karar ya da iş uydurma.`,
    [
      text('Toplantı adı', 'Haftalık IT koordinasyon toplantısı', false),
      area('Notlar', 'Toplantı notlarını buraya yapıştır ya da dosya olarak ekle.')
    ]
  ),
  app(
    'meeting-agenda',
    'Toplantı',
    'calendar',
    'Toplantı gündemi',
    'Dakikaları paylaştırılmış bir gündem ve davet metni hazırlar.',
    `Sen verimli toplantılar tasarlayan bir kolaylaştırıcısın. Verilen konu ve süre için bir toplantı gündemi hazırla.
    En üste toplantının amacını tek cümleyle yaz. Ardından gündemi tablo olarak ver: "Süre (dk)", "Konu", "Sorumlu", "Beklenen çıktı".
    Dakikaların toplamı verilen süreyi geçmesin; açılışa ve kapanışta yapılacakların özetlenmesine birkaç dakika ayır. Madde sayısını süreye göre gerçekçi tut: 30 dakikalık toplantıda en fazla dört beş madde olur. Aynı maddeyi farklı adlarla tekrar etme.
    Tablodan sonra, takvim davetine yapıştırılabilecek iki üç cümlelik bir davet metni ekle; tarih, saat ve yer verildiyse içinde geçsin.`,
    [
      text('Toplantı konusu', 'Yeni yedekleme sisteminin devreye alınması'),
      select('Süre', ['15 dakika', '30 dakika', '45 dakika', '60 dakika', '90 dakika']),
      text('Tarih, saat ve yer', '14 Kasım Cuma 10:00, A Blok toplantı odası', false),
      area('Ele alınacak konular', 'Aklındaki başlıkları yaz; boş bırakırsan konuya göre önerilir.', false)
    ]
  ),
  app(
    'announce',
    'Belge',
    'megaphone',
    'Duyuru yaz',
    'Genel duyuru, planlı bakım, arıza bildirimi ya da kullanıcı bilgilendirmesi yazar.',
    `Sen kurum içi iletişimden sorumlu, teknik konuları herkesin anlayacağı dille anlatabilen bir yöneticisin. Verilen bilgilerle bir duyuru yaz.
    İlk satıra "Konu:" ile kısa ve bilgi veren bir başlık koy. Okuyan ilk iki cümleden sonra bıraksa bile asıl bilgiyi almış olmalı.
    - "Genel duyuru": ne olduğunu, kimi etkilediğini ve ne zaman olacağını söyle; okuyanın yapması gerekeni maddelerle ver.
    - "Planlı bakım ya da değişiklik": ne yapılacak, ne zaman, ne kadar sürecek, hangi hizmetler etkilenecek bilgilerini ayrı satırlarda ver; kullanıcıların önceden yapması gerekenleri maddele. Kesinti beklenmiyorsa bunu açıkça söyle.
    - "Arıza ve olay bildirimi": ne oldu ve kim etkileniyor, şu anki durum, kullanıcıların şimdi yapması ya da yapmaması gereken, bir sonraki bilgilendirmenin zamanı. Sakin ve dürüst ol; kök neden bilinmiyorsa tahmin yürütme, incelendiğini söyle.
    - "Kullanıcı bilgilendirmesi": konunun çalışanı neden ilgilendirdiğini söyle, yapması gerekenleri numaralı adımlarla ver. Jargon kullanma; kullanmak zorundaysan parantez içinde açıkla.
    Hepsinde sonda soru ya da sorun için kime ulaşılacağını belirt. Korkutucu ya da azarlayıcı bir dil kullanma.`,
    [
      select('Tür', ['Genel duyuru', 'Planlı bakım ya da değişiklik', 'Arıza ve olay bildirimi', 'Kullanıcı bilgilendirmesi']),
      text('Konu', 'Dosya sunucusu bakımı'),
      text('Kime', 'Tüm çalışanlar', false),
      area('Ayrıntılar', 'Ne oluyor, ne zaman, kimler etkileniyor, okuyan ne yapmalı?'),
      TON
    ]
  ),
  app(
    'document',
    'Belge',
    'file',
    'Belge taslağı',
    'Notlarından rapor, prosedür ya da teklif yazısı taslağı çıkarır.',
    `Sen kurumsal belgeler yazan deneyimli bir uzmansın. Verilen notlardan seçilen türde bir belge taslağı hazırla.
    - "Rapor": "Yönetici özeti" (en önemli sonuç ilk cümlede), "Durum", "Bulgular", "Öneriler", "Sonraki adımlar". Yöneticiler için teknik ayrıntıyı azalt, etkiyi ve maliyeti öne çıkar.
    - "Prosedür ve talimat": "Amaç", "Kapsam" (kimler uygular), "Gerekenler", "Adımlar" (numaralı; her adım tek bir eylem ve bir fiille başlar), "Sık yapılan hatalar". Adımları işi ilk kez yapacak biri anlayacak açıklıkta yaz.
    - "Teklif yazısı": müşterinin ihtiyacını bir iki cümleyle özetle, sunulan çözümü ve faydasını anlat, fiyat ve koşulları ayrı bir bölümde ver, geçerlilik süresi ve sonraki adımla bitir. Abartılı satış dili kullanma.
    Sayı, tarih, fiyat ve taahhütleri yalnızca verildiyse kullan. Notlarda belirsiz kalan yeri köşeli parantezle işaretle.`,
    [
      select('Tür', ['Rapor', 'Prosedür ve talimat', 'Teklif yazısı']),
      text('Konu', '2026 üçüncü çeyrek sistem kesintileri'),
      area('Notlar', 'Elindeki bilgileri, bulguları ve adımları yaz ya da dosya ekle.'),
      UZUNLUK
    ]
  ),
  app(
    'hr',
    'İK',
    'userplus',
    'İK yazısı',
    'İş ilanı, çalışana geri bildirim ya da karşılama mesajı yazar.',
    `Sen deneyimli bir insan kaynakları uzmanısın. Verilen notlardan seçilen türde bir yazı hazırla.
    - "İş ilanı": pozisyonu ve ekibi tanıtan kısa bir giriş, "Sorumluluklar", "Aranan nitelikler", verildiyse "Sunduklarımız", başvuru bilgisi. Maddeleri somut ve kısa yaz. Yaş, cinsiyet, medeni durum gibi ayrımcı ölçütler kullanma.
    - "Geri bildirim": güçlü yönleri somut örneklerle anarak başla. Gelişim alanlarını kişiliğe değil davranışa ve sonuca odaklanarak yaz; her biri için uygulanabilir bir öneri ver. Destekleyici bir kapanışla bitir. "Her zaman", "hiçbir zaman" gibi genellemelerden kaçın.
    - "Karşılama mesajı": içten ama abartısız bir dille hoş geldin de, ilk gün için bilmesi gerekenleri açıkça ver, soru sorabileceği kişiyi belirt. Kısa tut.
    Verilmeyen maaş, yan hak, olay ya da örnek uydurma.`,
    [
      select('Tür', ['İş ilanı', 'Geri bildirim', 'Karşılama mesajı']),
      text('Kişi ya da pozisyon', 'Sistem Yöneticisi'),
      area('Notlar', 'İlan için sorumluluklar ve nitelikler; geri bildirim için güçlü yönler ve gelişim alanları; karşılama için ilk gün bilgileri.'),
      TON
    ]
  )
]

export const CORPORATE_APP_IDS = new Set(BUILTIN_APPS.filter((a) => a.corporate).map((a) => a.id))

let english: BuiltinApp[] | null = null

/** Verilen dildeki hazır uygulamalar. Kimlikler ve alan anahtarları bütün dillerde aynıdır. */
export function builtinApps(lang: Lang): BuiltinApp[] {
  if (lang !== 'en') return BUILTIN_APPS
  english ??= englishApps({ app, text, area, select })
  return english
}
