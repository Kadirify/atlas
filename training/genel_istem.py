"""Genel (yazım dışı) eğitim örnekleri için istemleri üretir.

Amaç: model yazım düzeltmeyi öğrenirken başka işleri unutmasın. Burada yalnızca istemler üretilir;
cevapları `genel_uret.py` bir öğretmen modele (aynı aileden daha büyük model) yazdırır.

Ölçüm setindeki (eval/items.mjs) hiçbir soru burada kullanılmaz; çakışan istemler elenir.
Çıktı: veri/genel_istem.jsonl
"""

import json
import random
import re
import os
from pathlib import Path

from datasets import load_dataset

KOK = Path(__file__).parent
# Ölçüm soruları eğitim verisine karışmasın diye okunur; depo dışında çalışırken ATLAS_EVAL_ITEMS ile verilir.
EVAL = Path(os.environ.get("ATLAS_EVAL_ITEMS") or Path(__file__).resolve().parent.parent / "eval" / "items.mjs")
random.seed(11)

SISTEM = "Yardımcı bir asistansın. Kullanıcı hangi dilde yazarsa o dilde cevap ver. İstenenin dışına çıkma."

KAVRAM = """fotosentez; enflasyon; yer çekimi; demokrasi; küresel ısınma; bağışıklık sistemi; yapay zekâ; deprem; faiz; vitamin;
internet; elektrik; mıknatıs; gökkuşağı; volkan; ekosistem; geri dönüşüm; kan dolaşımı; atom; hücre; evrim; mevsimler; gelgit;
güneş tutulması; ay tutulması; sera etkisi; yenilenebilir enerji; bütçe; vergi; borsa; döviz kuru; arz ve talep; işsizlik;
anayasa; seçim; belediye; cumhuriyet; insan hakları; telif hakkı; sigorta; kredi kartı; emeklilik; kira sözleşmesi; noter;
antibiyotik; aşı; tansiyon; kolesterol; diyabet; alerji; uyku düzeni; stres; sağlıklı beslenme; protein; karbonhidrat;
şiir; roman; deneme; masal; destan; mecaz; atasözü; deyim; özne; yüklem; sıfat; zarf; bağlaç; noktalama işaretleri;
üçgen; asal sayı; kesir; yüzde; ortalama; olasılık; denklem; çember; alan ve çevre; ondalık sayı;
veritabanı; algoritma; değişken; döngü; fonksiyon; şifreleme; yedekleme; işletim sistemi; tarayıcı; bulut depolama;
açık kaynak yazılım; virüs ve antivirüs; yapay sinir ağı; arama motoru; e-posta; parola yöneticisi;
Osmanlı Devleti; Kurtuluş Savaşı; Sanayi Devrimi; Rönesans; İpek Yolu; matbaa; Göbeklitepe; Çanakkale Savaşı;
Karadeniz; Akdeniz iklimi; Kapadokya; Van Gölü; Toros Dağları; Fırat Nehri; İstanbul Boğazı; Pamukkale;
satranç; maraton; olimpiyatlar; ebru sanatı; hat sanatı; halk müziği; tiyatro; belgesel; müze; kütüphane;
arı; göçmen kuşlar; balina; karınca; zeytin ağacı; çay bitkisi; buğday; orman yangını; erozyon; kuraklık""".replace("\n", " ")
KAVRAM = [k.strip() for k in KAVRAM.split(";") if k.strip()]

KAVRAM_BICIM = [
    "{k} nedir? Kısaca açıkla.",
    "{k} ne demek? İki cümleyle anlat.",
    "{k} konusunu on yaşındaki bir çocuğa anlatır gibi açıkla.",
    "{k} hakkında bilinmesi gereken üç şeyi madde madde yaz.",
    "{k} nedir? Tek cümleyle cevap ver.",
    "{k} neden önemlidir? Kısa bir paragraf yaz.",
    "{k} hakkında kısa bir bilgi verir misin?",
    "{k} ile ilgili bir örnek vererek açıklar mısın?",
    "Bana {k} konusunu basitçe anlat.",
    "{k} hakkında dört maddelik kısa bir özet çıkar. Her madde tek cümle olsun.",
]

CONCEPT = """photosynthesis; inflation; gravity; democracy; climate change; the immune system; machine learning; earthquakes;
compound interest; vitamins; the internet; electricity; magnets; rainbows; volcanoes; recycling; the water cycle; atoms; cells;
evolution; seasons; tides; solar eclipses; renewable energy; a budget; taxes; the stock market; exchange rates; supply and demand;
a constitution; elections; human rights; copyright; insurance; a credit score; antibiotics; vaccines; blood pressure; allergies;
sleep hygiene; protein; a metaphor; a proverb; a prime number; a fraction; probability; an average; a database; an algorithm;
a variable in programming; a loop in programming; encryption; a backup; an operating system; cloud storage; open source software;
a search engine; a password manager; the Industrial Revolution; the Renaissance; the Silk Road; the printing press; chess;
the Olympic Games; a documentary; a library; bees; whale migration; ants; wildfires; erosion; drought; a résumé; a job interview;
time management; a to-do list; a healthy breakfast; jet lag; a time zone; a leap year""".replace("\n", " ")
CONCEPT = [k.strip() for k in CONCEPT.split(";") if k.strip()]

CONCEPT_FORM = [
    "What is {k}? Explain briefly.",
    "Explain {k} in two sentences.",
    "Explain {k} as if I were ten years old.",
    "Give me three key facts about {k} as a bulleted list.",
    "Describe {k} in one sentence.",
    "Why does {k} matter? Write a short paragraph.",
    "Can you give a simple example that explains {k}?",
]

SOHBET = [
    "Selam, nasılsın?", "Günaydın! Bugün için bir önerin var mı?", "Bugün çok yorgunum, ne yapsam iyi gelir?",
    "Canım çok sıkılıyor, evde yapabileceğim bir şey önerir misin?", "Akşam yemeğinde ne pişirsem? Evde tavuk ve pirinç var.",
    "Sınavım var ve çok heyecanlıyım. Biraz moral verir misin?", "Yeni bir hobi edinmek istiyorum, aklına ne geliyor?",
    "Hafta sonu için İstanbul'da gezilecek bir yer önerir misin?", "Uyuyamıyorum, ne yapmalıyım?",
    "Bugün işte kötü bir gün geçirdim.", "Arkadaşımın doğum günü var, ne hediye alabilirim?", "Kitap okumaya nasıl alışırım?",
    "Sabahları erken kalkmak için bir tavsiyen var mı?", "Teşekkür ederim, çok yardımcı oldun.", "Sence kedi mi köpek mi?",
    "Bana kısa bir fıkra anlatır mısın?", "Bugün hava çok güzel, dışarıda ne yapabilirim?", "Spora başlamak istiyorum ama üşeniyorum.",
    "Yeni taşındım, komşularla nasıl tanışırım?", "Bir film önerir misin? Komedi olsun.", "Kahve mi çay mı, sen olsan hangisini seçerdin?",
    "İngilizcemi geliştirmek istiyorum, nereden başlamalıyım?", "Para biriktirmek için basit bir yöntem önerir misin?",
    "Çok dağınık biriyim, masamı nasıl düzenli tutarım?", "Yarın iş görüşmem var, biraz gerginim.", "Bana güzel bir söz söyler misin?",
    "Çocuğum sebze yemiyor, ne yapabilirim?", "Uzun yola çıkacağım, yanıma ne almalıyım?", "Kendimi motive edemiyorum.",
    "Tatil için deniz mi dağ mı?", "Bugün ne öğrendin diye sorsam ne dersin?", "Akşam misafir gelecek, hızlı bir tatlı tarifi var mı?",
    "Telefona çok bakıyorum, bunu nasıl azaltırım?", "Yeni bir dil öğrenmek kaç ay sürer sence?", "Bitkilerim hep kuruyor, neyi yanlış yapıyorum?",
    "Bir arkadaşımla tartıştım, nasıl barışabilirim?", "Bana kısa bir şiir yazar mısın? Konusu sonbahar olsun.",
    "Kısa bir masal anlatır mısın?", "Bugün kendime zaman ayırmak istiyorum, fikir verir misin?", "Yürüyüş mü koşu mu daha iyi?",
    "Ders çalışırken dikkatim dağılıyor.", "Evde ekmek yapmak zor mu?", "Kedim gece çok miyavlıyor, neden olabilir?",
    "Haftalık yemek planı yapmama yardım eder misin? Üç gün yeter.", "Bisiklet almayı düşünüyorum, nelere dikkat etmeliyim?",
    "Kısa bir doğum günü mesajı yazar mısın? Annem için.", "Arkadaşıma geçmiş olsun mesajı yazar mısın?",
    "Bayram için kısa bir kutlama mesajı yazar mısın?", "İyi geceler!", "Görüşürüz, kendine iyi bak.",
    "Naber?", "Kolay gelsin, bir şey soracaktım: pilav neden lapa olur?", "Sana bir sır versem tutar mısın?",
    "Bugün çok mutluyum, terfi aldım!", "Sınavdan düşük aldım, moralim bozuk.", "Sence yağmurlu havada ne yapılır?",
    "Çay demlemenin püf noktası ne?", "Menemen soğanlı mı olur soğansız mı?", "Bana üç tane bilmece sorar mısın?",
    "Hızlı okuma teknikleri işe yarar mı?", "Bir sunum yapacağım, heyecanımı nasıl yenerim?",
]

CHAT_EN = [
    "Hi, how are you?", "Good morning! Any tips for a productive day?", "I'm really tired today. What would help?",
    "I'm bored at home. Can you suggest something to do?", "What should I cook tonight? I have chicken and rice.",
    "I have an exam tomorrow and I'm nervous.", "I want to pick up a new hobby. Any ideas?", "I can't sleep. What should I do?",
    "It's my friend's birthday. What could I get her?", "How do I build a reading habit?", "Thanks, that was really helpful.",
    "Tell me a short joke.", "Can you recommend a comedy movie?", "How can I save money each month?", "I have a job interview tomorrow.",
    "What should I pack for a long road trip?", "How do I spend less time on my phone?", "My plants keep dying. What am I doing wrong?",
    "Write a short poem about autumn.", "Write a short birthday message for my mom.", "Is walking or running better for beginners?",
    "I keep losing focus while studying.", "Write a two-line thank-you note for a colleague.", "Good night!",
    "How do I make a good cup of tea?", "Give me three riddles.", "How do I calm my nerves before a presentation?",
    "Suggest a simple three-day meal plan.", "What's a polite way to decline an invitation?", "How do I start learning Turkish?",
]

KONU = ["sağlıklı beslenme", "zaman yönetimi", "kitap okuma alışkanlığı", "tasarruf", "evde spor", "iyi uyku", "verimli ders çalışma",
        "iş görüşmesine hazırlık", "sunum hazırlama", "seyahat planı", "ev temizliği", "bitki bakımı", "bütçe yapma", "yeni dil öğrenme",
        "stresle başa çıkma", "sabah rutini", "uzaktan çalışma", "toplantı yönetimi", "e-posta yazma", "kahvaltı hazırlama",
        "çocuklarla vakit geçirme", "bisiklet bakımı", "kamp hazırlığı", "fotoğraf çekme", "mutfak alışverişi", "taşınma", "sınav haftası",
        "su tasarrufu", "enerji tasarrufu", "trafik güvenliği", "internet güvenliği", "ilk yardım çantası", "misafir ağırlama"]

BICIM = [
    "{k} için beş maddelik bir liste yaz. Her madde en fazla sekiz kelime olsun.",
    "{k} hakkında tam olarak üç cümle yaz.",
    "{k} konusunda tek bir tavsiye ver. Tek cümle olsun.",
    "{k} için numaralı üç adım yaz.",
    "{k} hakkında bir başlık ve altına iki cümle yaz.",
    "{k} için yapılacaklar listesi hazırla. Dört madde yeter.",
    "{k} konusunda yapılması ve yapılmaması gerekenleri ikişer madde halinde yaz.",
    "{k} hakkında kısa bir tablo yap: iki sütun (Öneri, Neden), üç satır.",
    "{k} ile ilgili üç anahtar kelimeyi virgülle ayırarak yaz, başka bir şey yazma.",
    "{k} için bir slogan yaz. Sadece sloganı yaz.",
    'Şu JSON biçiminde cevap ver, başka bir şey yazma: {{"konu": "...", "oneri": "..."}}. Konu: {k}',
]

KISA = [
    ("Türkiye'nin başkenti neresidir? Tek kelimeyle cevap ver.", None), ("Bir haftada kaç gün vardır? Sadece sayıyı yaz.", None),
    ("Suyun kimyasal formülü nedir? Sadece formülü yaz.", None), ("Fransa'nın başkenti neresidir? Tek kelimeyle cevap ver.", None),
    ("Bir yılda kaç ay vardır? Sadece sayıyı yaz.", None), ("Gökyüzü gündüz genelde ne renktir? Tek kelimeyle cevap ver.", None),
    ("İstanbul hangi iki kıtada yer alır? Kısaca yaz.", None), ("Bir saatte kaç dakika vardır? Sadece sayıyı yaz.", None),
    ("Güneş sistemindeki en büyük gezegen hangisidir? Tek kelimeyle cevap ver.", None), ("Japonya'nın başkenti neresidir? Tek kelimeyle cevap ver.", None),
    ("Balinalar memeli midir? Sadece evet ya da hayır yaz.", None), ("Örümcekler böcek midir? Sadece evet ya da hayır yaz.", None),
    ("Ay, Dünya'nın uydusu mudur? Sadece evet ya da hayır yaz.", None), ("İtalya'nın başkenti neresidir? Tek kelimeyle cevap ver.", None),
    ("Bir düzinede kaç tane vardır? Sadece sayıyı yaz.", None), ("Türkiye'nin en kalabalık şehri hangisidir? Tek kelimeyle cevap ver.", None),
    ("What is the capital of Germany? Answer with one word.", None), ("How many days are in a week? Write only the number.", None),
    ("Is a tomato a fruit? Answer only yes or no.", None), ("What is the chemical symbol for gold? Write only the symbol.", None),
    ("How many minutes are in two hours? Write only the number.", None), ("What is the capital of Spain? Answer with one word.", None),
]

KELIME = ["güzel", "hızlı", "büyük", "küçük", "mutlu", "üzgün", "zor", "kolay", "eski", "yeni", "sıcak", "soğuk", "cesur", "zengin",
          "fakir", "uzak", "yakın", "temiz", "kirli", "akıllı", "sessiz", "kalabalık", "ucuz", "pahalı", "güçlü", "zayıf", "erken", "geç",
          "başlamak", "bitirmek", "sevmek", "hatırlamak", "unutmak", "yardım", "hediye", "cevap", "soru", "öğrenci", "doktor", "ev"]
KELIME_BICIM = [
    "\"{k}\" kelimesinin eş anlamlısı nedir? Sadece kelimeyi yaz.",
    "\"{k}\" kelimesinin zıt anlamlısı nedir? Sadece kelimeyi yaz.",
    "\"{k}\" kelimesini bir cümlede kullan.",
    "\"{k}\" kelimesi kaç hecelidir? Hecelerine ayırarak göster.",
    "\"{k}\" kelimesiyle iki farklı cümle kur.",
]

CUMLE_ISI = [
    "Şu cümleyi daha basit bir dille yeniden yaz: \"{c}\"",
    "Şu cümleyi daha kısa yaz, anlam değişmesin: \"{c}\"",
    "Bu cümle ne anlatıyor? Kendi cümlenle bir cümlede açıkla.\n\n{c}",
    "Şu cümleyi İngilizceye çevir: \"{c}\"",
    "Şu cümlenin devamına uygun bir cümle ekle. Sadece eklediğin cümleyi yaz.\n\n{c}",
    "Bu cümledeki özel adları listele: \"{c}\"",
    "Şu cümleyi soru cümlesine çevir: \"{c}\"",
    "Bu cümleyi günlük konuşma diliyle yeniden söyle: \"{c}\"",
    "Bu cümle için kısa bir başlık öner. Sadece başlığı yaz.\n\n{c}",
    "Bu cümleyi iki ayrı cümleye böl: \"{c}\"",
]

OZET = [
    "Şu metni iki cümleyle özetle:\n\n{m}",
    "Aşağıdaki metni tek cümleyle özetle.\n\n{m}",
    "Bu metnin ana fikri nedir? Kısaca yaz.\n\n{m}",
    "Aşağıdaki metni üç madde halinde özetle. Metinde olmayan bilgi ekleme.\n\n{m}",
    "Şu metne uygun kısa bir başlık yaz. Sadece başlığı yaz.\n\n{m}",
    "Metinden en önemli iki bilgiyi madde madde çıkar:\n\n{m}",
    "{m}\n\nBu metni kısaca özetler misin?",
    "Aşağıdaki metni bir ortaokul öğrencisinin anlayacağı şekilde iki üç cümleyle anlat.\n\n{m}",
    "Bu metinde geçen yer ve kişi adlarını listele. Metinde yoksa \"yok\" yaz.\n\n{m}",
    "Aşağıdaki metne göre üç kısa soru hazırla.\n\n{m}",
]

CEVIR_TR_EN = ["Şu cümleyi İngilizceye çevir: \"{c}\"", "İngilizceye çevir, sadece çeviriyi yaz:\n{c}", "Translate into English: {c}",
               "Bunun İngilizcesi nedir?\n\n{c}", "Aşağıdaki cümleyi İngilizceye çevirir misin?\n\n{c}"]
CEVIR_EN_TR = ["Şu cümleyi Türkçeye çevir: \"{c}\"", "Türkçeye çevir, sadece çeviriyi yaz:\n{c}", "Translate into Turkish: {c}",
               "Bunun Türkçesi nedir?\n\n{c}", "Aşağıdaki cümleyi Türkçeye çevirir misin?\n\n{c}"]

RESMI_KONU = ["yıllık izin talebi", "toplantı tarihinin ertelenmesi", "geciken bir fatura", "iş başvurusu", "staj başvurusu", "adres değişikliği bildirimi",
              "teklif isteme", "ürün iadesi", "randevu talebi", "teşekkür", "şikâyet", "bilgi talebi", "toplantı daveti", "proje teslim tarihinin uzatılması",
              "referans mektubu isteme", "eğitim katılım talebi", "sözleşme yenileme", "abonelik iptali", "arıza bildirimi", "fiyat güncellemesi duyurusu",
              "yeni çalışanın tanıtılması", "işten ayrılma bildirimi", "ödeme hatırlatması", "tedarikçiye sipariş onayı", "veli toplantısı duyurusu"]
RESMI_BICIM = [
    "{k} konusunda kısa ve resmi bir e-posta yaz.",
    "Müdürüme {k} hakkında resmi bir e-posta yazmam gerekiyor. Yardım eder misin? Kısa olsun.",
    "{k} için resmi bir dilekçe örneği yaz. Kısa tut.",
    "Bir müşteriye {k} hakkında nazik ve resmi bir mesaj yaz. En fazla beş cümle.",
    "{k} konulu bir e-posta için yalnızca konu satırı ve ilk iki cümleyi yaz.",
    "Write a short, formal email in English about: {k}",
]

KOD_GOREV = [
    ("bir listenin en büyük elemanını bulan", "finds the largest element of a list"),
    ("bir metindeki sesli harfleri sayan", "counts the vowels in a string"),
    ("bir sayının asal olup olmadığını kontrol eden", "checks whether a number is prime"),
    ("bir metni tersine çeviren", "reverses a string"),
    ("bir listedeki tekrar eden elemanları kaldıran", "removes duplicates from a list"),
    ("iki sayının en büyük ortak bölenini bulan", "computes the greatest common divisor of two numbers"),
    ("bir sayının faktöriyelini hesaplayan", "computes the factorial of a number"),
    ("bir listedeki sayıların ortalamasını hesaplayan", "computes the average of a list of numbers"),
    ("bir metnin palindrom olup olmadığını kontrol eden", "checks whether a string is a palindrome"),
    ("bir metindeki kelimeleri sayan", "counts the words in a string"),
    ("Fibonacci dizisinin ilk n elemanını döndüren", "returns the first n Fibonacci numbers"),
    ("bir listeyi küçükten büyüğe sıralayan (hazır sıralama kullanmadan)", "sorts a list in ascending order without using a built-in sort"),
    ("bir listedeki çift sayıları filtreleyen", "filters the even numbers from a list"),
    ("iki listeyi birleştirip sıralayan", "merges two lists and sorts the result"),
    ("bir metindeki en uzun kelimeyi bulan", "finds the longest word in a string"),
    ("santigrat dereceyi fahrenhayta çeviren", "converts Celsius to Fahrenheit"),
    ("bir yılın artık yıl olup olmadığını kontrol eden", "checks whether a year is a leap year"),
    ("bir listedeki sayıların toplamını döngüyle hesaplayan", "sums a list of numbers using a loop"),
    ("bir metnin her kelimesinin ilk harfini büyüten", "capitalises the first letter of every word in a string"),
    ("bir sözlükteki/nesnedeki en büyük değere sahip anahtarı bulan", "finds the key with the largest value in a dictionary/object"),
    ("1'den n'e kadar olan sayılardan 3'e bölünenleri listeleyen", "lists the numbers from 1 to n that are divisible by 3"),
    ("bir e-posta adresinin içinde @ olup olmadığını kontrol eden basit", "does a simple check that an email address contains an @ sign"),
    ("iki metnin anagram olup olmadığını kontrol eden", "checks whether two strings are anagrams"),
    ("bir listenin ikinci en büyük elemanını bulan", "finds the second largest element of a list"),
    ("bir sayının basamakları toplamını hesaplayan", "computes the sum of the digits of a number"),
]
KOD_DIL = ["Python", "JavaScript", "TypeScript"]
SQL_GOREV = [
    "musteriler(id, ad, sehir) tablosunda İzmir'de yaşayan müşterilerin adlarını getiren",
    "siparisler(id, musteri_id, tutar, tarih) tablosunda toplam tutarı müşteri bazında hesaplayan",
    "urunler(id, ad, fiyat, stok) tablosunda stoğu 10'dan az olan ürünleri fiyata göre sıralayan",
    "calisanlar(id, ad, departman, maas) tablosunda her departmanın ortalama maaşını bulan",
    "ogrenciler(id, ad, sinif, not_ortalamasi) tablosunda ortalaması en yüksek beş öğrenciyi getiren",
    "kitaplar(id, baslik, yazar, yil) tablosunda 2010'dan sonra basılan kitapları yıla göre sıralayan",
    "siparisler(id, musteri_id, tutar) ve musteriler(id, ad) tablolarını birleştirip her müşterinin sipariş sayısını gösteren",
    "calisanlar(id, ad, maas) tablosunda maaşı ortalamanın üzerinde olanları listeleyen",
    "urunler(id, ad, kategori, fiyat) tablosunda her kategorideki en pahalı ürünün fiyatını bulan",
    "ziyaretler(id, kullanici_id, tarih) tablosunda günlük ziyaret sayısını veren",
    "faturalar(id, musteri_id, odendi, tutar) tablosunda ödenmemiş faturaların toplamını hesaplayan",
    "personel(id, ad, ise_giris) tablosunda en son işe giren üç kişiyi getiren",
]
KOD_SORU = [
    "Python'da liste ile demet (tuple) arasındaki fark nedir? Kısaca açıkla.", "JavaScript'te let ile const arasındaki fark nedir?",
    "SQL'de INNER JOIN ile LEFT JOIN farkını bir örnekle açıkla.", "Python'da bir dosyayı satır satır nasıl okurum? Kısa bir örnek ver.",
    "Git'te commit ile push arasındaki fark nedir?", "JavaScript'te bir diziyi nasıl tersine çeviririm? Tek satırlık örnek yeter.",
    "Python'da sözlükte bir anahtarın olup olmadığını nasıl kontrol ederim?", "Bir fonksiyona neden açıklama satırı (docstring) yazılır?",
    "Python'da `for i in range(5): print(i)` kodu ne yazdırır?", "JavaScript'te `[1, 2, 3].map(x => x * 2)` ne döndürür?",
    "Şu Python kodundaki hatayı bul ve düzelt:\n\n```python\ndef topla(a, b)\n    return a + b\n```",
    "Şu kod ne yapıyor? Bir cümleyle açıkla.\n\n```python\nsonuc = [x for x in sayilar if x % 2 == 0]\n```",
    "Şu JavaScript kodundaki hatayı düzelt:\n\n```js\nconst toplam = (a, b) => { a + b }\nconsole.log(toplam(2, 3))\n```",
    "What is the difference between a list and a set in Python? Keep it short.", "How do I read a JSON file in Python? Give a short example.",
    "What does `git status` do?", "In SQL, what does GROUP BY do? Explain with a small example.",
    "Python'da try/except ne işe yarar? Küçük bir örnek ver.", "Değişken adı seçerken nelere dikkat etmeliyim? Üç madde yaz.",
    "REST API nedir? İki cümleyle açıkla.", "JSON ile CSV arasındaki fark nedir?",
]


def saat(dakika):
    return f"{dakika // 60 % 24:02d}.{dakika % 60:02d}"


def problem():
    """(soru, cevapta geçmesi gereken sayı) üretir; öğretmenin cevabı bu sayıyı içermiyorsa örnek atılır."""
    r = random.randint
    t = r(1, 16)
    if t == 1:
        a, b = r(8, 45), r(2, 6); c = (a * b // 50 + 1) * 50
        return f"Elmanın kilosu {a} lira. {b} kilo elma alıp kasaya {c} lira verirsem kaç lira para üstü alırım?", str(c - a * b)
    if t == 2:
        v, s = r(4, 11) * 10, r(2, 7)
        return f"Saatte {v} kilometre hızla giden bir araç {s} saatte kaç kilometre yol alır?", str(v * s)
    if t == 3:
        a = r(18, 40); b = r(5, a - 5)
        return f"{a} kişilik bir sınıfta {b} kız öğrenci var. Sınıfta kaç erkek öğrenci vardır?", str(a - b)
    if t == 4:
        n, p = r(2, 20) * 100, random.choice([10, 20, 25, 50])
        return f"{n} liralık bir ürün yüzde {p} indirimle kaç liraya satılır?", str(n * (100 - p) // 100)
    if t == 5:
        a, b, c = r(12, 30), r(2, 8), r(2, 9)
        return f"Ali {a} yaşında, kardeşi ondan {b} yaş küçük. {c} yıl sonra kardeşi kaç yaşında olur?", str(a - b + c)
    if t == 6:
        b, f = r(2, 9), r(2, 9)
        dizi = [b + f * i for i in range(5)]
        return f"{', '.join(map(str, dizi[:4]))} dizisinde sıradaki sayı kaçtır? Kuralı da söyle.", str(dizi[4])
    if t == 7:
        b = random.choice([2, 3, 4, 6]); a = b * r(2, 8)
        return f"Bir işi 1 işçi {a} günde bitiriyor. Aynı hızda çalışan {b} işçi bu işi kaç günde bitirir?", str(a // b)
    if t == 8:
        bas, sure = r(9, 20) * 60 + random.choice([0, 15, 30, 45]), random.choice([45, 90, 100, 110, 135, 150])
        return f"Saat {saat(bas)}'te başlayan {sure} dakikalık bir film saat kaçta biter?", saat(bas + sure)
    if t == 9:
        a, b = r(3, 12), r(3, 12)
        return f"Kenarları {a} metre ve {b} metre olan dikdörtgen bir bahçenin alanı kaç metrekaredir?", str(a * b)
    if t == 10:
        a, b = r(3, 12), r(3, 12)
        return f"Kenarları {a} cm ve {b} cm olan bir dikdörtgenin çevresi kaç santimetredir?", str(2 * (a + b))
    if t == 11:
        k, n = r(3, 9), r(4, 12)
        return f"Her kutuda {k} kalem var. {n} kutuda toplam kaç kalem olur?", str(k * n)
    if t == 12:
        k = r(3, 8); n = k * r(3, 9)
        return f"{n} cevizi {k} çocuğa eşit paylaştırırsak her çocuğa kaç ceviz düşer?", str(n // k)
    if t == 13:
        x, y, z = r(40, 95), r(40, 95), r(40, 95); z += (3 - (x + y + z) % 3) % 3
        return f"Bir öğrencinin üç sınav notu {x}, {y} ve {z}. Not ortalaması kaçtır?", str((x + y + z) // 3)
    if t == 14:
        a, b = r(20, 60), r(2, 5); c = (a * b // 50 + 1) * 50
        return f"An apple costs {a} cents. If I buy {b} apples and pay with {c} cents, how much change do I get?", str(c - a * b)
    if t == 15:
        v, s = r(4, 11) * 10, r(2, 7)
        return f"A car travels at {v} km per hour. How far does it go in {s} hours?", str(v * s)
    a, b = r(120, 900), r(15, 99)
    return f"{a} + {b} işleminin sonucu kaçtır? Sadece sayıyı yaz.", str(a + b)


def temiz_cumle(c):
    if not (40 <= len(c) <= 200) or not c[0].isupper() or c[-1] != ".":
        return False
    return not re.search(r"[\[\]{}()|=<>*#\"“”«»/\\]", c) and len(c.split()) >= 7


def vikipedi(dil, n_paragraf, n_cumle):
    veri = load_dataset("wikimedia/wikipedia", f"20231101.{dil}", split="train", streaming=True)
    paragraflar, cumleler = [], []
    for i, madde in enumerate(veri):
        if i < 3000 and dil == "tr":
            continue  # ilk maddeler yazım verisinde yoğun kullanıldı; farklı maddelerden al
        govde = madde["text"].split("\n\n")[0].strip()
        if 350 <= len(govde) <= 900 and "\n" not in govde and not re.search(r"[\[\]{}|=<>*#]", govde):
            paragraflar.append(govde)
        elif len(cumleler) < n_cumle:
            for c in re.split(r"(?<=[.?!])\s+", govde)[:2]:
                if temiz_cumle(c.strip()):
                    cumleler.append(c.strip())
        if len(paragraflar) >= n_paragraf and len(cumleler) >= n_cumle:
            break
        if i > 300000:
            break
    random.shuffle(paragraflar)
    random.shuffle(cumleler)
    return paragraflar[:n_paragraf], cumleler[:n_cumle]


def main():
    eval_metni = EVAL.read_text(encoding="utf-8") if EVAL.exists() else ""
    test = {json.loads(s)["dogru"] for s in open(KOK / "veri" / "test.jsonl", encoding="utf-8")}
    tr_par, tr_cumle = vikipedi("tr", 700, 1300)
    tr_cumle = [c for c in tr_cumle if c not in test]
    _, en_cumle = vikipedi("simple", 0, 500)
    print(f"TR paragraf {len(tr_par)}, TR cümle {len(tr_cumle)}, EN cümle {len(en_cumle)}")

    istemler = []  # (tür, istem, beklenen)

    def ekle(tur, metin, beklenen=None):
        istemler.append((tur, metin, beklenen))

    for m in tr_par[:650]:
        ekle("ozet", random.choice(OZET).format(m=m))
    for c in tr_cumle[:450]:
        ekle("ceviri", random.choice(CEVIR_TR_EN).format(c=c))
    for c in en_cumle[:450]:
        ekle("ceviri", random.choice(CEVIR_EN_TR).format(c=c))
    for c in tr_cumle[450:900]:
        ekle("cumle", random.choice(CUMLE_ISI).format(c=c))
    for s in SOHBET * 7:
        ekle("sohbet", s)
    for s in CHAT_EN * 5:
        ekle("ingilizce", s)
    for k in KAVRAM:
        for b in random.sample(KAVRAM_BICIM, 4):
            ekle("bilgi", b.format(k=k[0].upper() + k[1:] if b.startswith("{k}") else k))
    for k in CONCEPT:
        for b in random.sample(CONCEPT_FORM, 4):
            metin = b.format(k=k)
            ekle("ingilizce", metin[0].upper() + metin[1:])
    for k in KONU:
        for b in random.sample(BICIM, 9):
            ekle("talimat", b.format(k=k[0].upper() + k[1:] if b.startswith("{k}") else k))
    for s, _ in KISA * 3:
        ekle("talimat", s)
    for k in KELIME:
        for b in random.sample(KELIME_BICIM, 4):
            ekle("dil", b.format(k=k))
    for _ in range(650):
        soru, cevap = problem()
        ekle("akil", soru, cevap)
    for k in RESMI_KONU:
        for b in RESMI_BICIM:
            ekle("resmi", b.format(k=k[0].upper() + k[1:] if b.startswith("{k}") else k))
    for tr, en in KOD_GOREV:
        for dil in KOD_DIL:
            if random.random() < 0.7:
                ekle("kod", random.choice([f"{dil} ile {tr} bir fonksiyon yaz.", f"{tr.capitalize()} bir {dil} fonksiyonu yazar mısın? Kısa bir açıklama da ekle.",
                                           f"{dil}: {tr} fonksiyon. Sadece kodu yaz."]))
            else:
                ekle("kod", f"Write a {dil} function that {en}.")
    for g in SQL_GOREV:
        ekle("kod", f"{g} bir SQL sorgusu yaz.")
        ekle("kod", f"SQL: {g} sorgu. Sadece sorguyu yaz.")
    for s in KOD_SORU * 2:
        ekle("kod", s)

    # Aynı istem birden çok kez geçebilir (sohbet gibi); öğretmen her seferinde farklı tohumla cevaplar.
    kayitlar, atilan = [], 0
    for n, (tur, metin, beklenen) in enumerate(istemler):
        if metin in eval_metni or (len(metin) > 25 and metin[:60] in eval_metni):
            atilan += 1
            continue
        kayitlar.append({"no": n, "tur": tur, "sistem": SISTEM if random.random() < 0.5 else None, "istem": metin, "beklenen": beklenen})
    random.shuffle(kayitlar)
    with open(KOK / "veri" / "genel_istem.jsonl", "w", encoding="utf-8") as f:
        for k in kayitlar:
            f.write(json.dumps(k, ensure_ascii=False) + "\n")
    sayim = {}
    for k in kayitlar:
        sayim[k["tur"]] = sayim.get(k["tur"], 0) + 1
    print(len(kayitlar), "istem; ölçümle çakıştığı için atılan:", atilan)
    print(json.dumps(sayim, ensure_ascii=False))


if __name__ == "__main__":
    main()
