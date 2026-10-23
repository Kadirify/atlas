# Ajan test seti

Atlas'ın kod alanında ve veritabanı sohbetlerinde **gerçekten iş bitirip bitirmediğini** ölçer. Atlas-TR ([../RESULTS.md](../RESULTS.md)) modelin dilini ve bilgisini ölçer; bu set ise araç kullanan bir ajan olarak davranışını: testi çalıştırıp hatayı düzeltiyor mu, yanlış dosyaya yazıyor mu, silme isteğini geri çeviriyor mu, onay verilmeyince ısrar ediyor mu.

Son sonuçlar: [RESULTS.md](RESULTS.md). Zaman içindeki değişim: [GECMIS.md](GECMIS.md)

## Nasıl çalışır

Her görev için:

1. Geçici bir klasör, görevin dosyalarıyla (ve gerekiyorsa bir SQLite veritabanıyla) hazırlanır.
2. Atlas'ın **gerçek** sohbet, dosya ve veritabanı servisleri (`src/main/services`) pencere olmadan, gerçek bir Ollama modeliyle başlatılır. Bellek kapalıdır, veritabanı bellekte tutulur; senin Atlas verilerine dokunulmaz.
3. Görevin Türkçe isteği gönderilir. Onay kartları görevin kuralına göre onaylanır ya da reddedilir (kullanıcının yerine).
4. Cevap bitince görevin kendi denetimi sonucu kontrol eder: testler geçiyor mu, dosya istenen hale geldi mi, başka bir şey bozuldu mu, cevap doğru mu.

Model komutları gerçekten çalıştırır (`npm test`, `node ...`, `python -m unittest`), ama yalnızca geçici klasördeki görev dosyalarında. Görevlerin hiçbiri internete ya da `npm install`'a ihtiyaç duymaz.

## Çalıştırmak

Ollama açık olmalı ve modeller kurulu olmalı. Python görevleri için Python, git görevleri için git gerekir; yoksa o görevler atlanır.

```powershell
npm run eval:ajan
```

Varsayılan olarak `atlas-code:latest` ve `atlas-guclu:latest` modelleri, her görev bir kez denenir. Ayarlar ortam değişkenleriyle verilir:

```powershell
$env:AJAN_MODELS = 'atlas-code:latest,gemma4:12b'; $env:AJAN_REPEAT = '3'; npm run eval:ajan
```

| Değişken | Ne işe yarar |
| --- | --- |
| `AJAN_MODELS` | Virgülle ayrılmış Ollama model adları |
| `AJAN_REPEAT` | Her görevin kaç kez deneneceği. Tek deneme gürültülüdür; karşılaştırma için en az 3 |
| `AJAN_TASKS` | Yalnızca bu görevler (ör. `test-duzelt,sql-csv`) |
| `AJAN_GATE` | Sürüm kapısı: başarı oranı bunun altındaki model testi düşürür (ör. `0.7`) |
| `AJAN_GATE_KOD` | Kod görevleri için ayrı kapı: kod görevlerindeki başarı oranı bunun altındaki model testi düşürür (ör. `0.9`) |
| `AJAN_KEEP` | `1` ise başarısız görevlerin klasörleri silinmez, incelenebilir |
| `AJAN_OUT` | Sonuç klasörü (varsayılan `eval/ajan/results`). Verilirse `RESULTS.md` güncellenmez |

Bir görev RTX 5070'te Atlas Strong ile çoğunlukla 5-30 saniye, Atlas Code ile 20-120 saniye sürer. Bütün set üç tekrarla Strong için yaklaşık yarım saat, Atlas Code için bir buçuk saat.

Sonuçlar:
- `results/<tarih>.json`: her denemenin bütün ölçümleri ve son cevabı
- `results/<tarih>.md`: o çalıştırmanın özeti
- `RESULTS.md`: bütün görevlerle yapılan son çalıştırmanın özeti (filtreli çalıştırmalar ve `AJAN_OUT` verilenler bunu değiştirmez)
- `GECMIS.md`: her tam turun model başına bir satırı (tarih, commit, türlere göre sonuç)

## Sürümden önce

Her sürümden önce Atlas Strong ile bütün set üç tekrarla çalıştırılır; kod görevlerinde başarı %90'ın altına düşerse sürüm çıkmaz:

```powershell
$env:AJAN_MODELS = 'atlas-guclu:latest'; $env:AJAN_REPEAT = '3'; $env:AJAN_GATE_KOD = '0.9'; npm run eval:ajan
```

Sonuç `GECMIS.md` dosyasına kendiliğinden eklenir; bir önceki satırla karşılaştır. Bir türde belirgin düşüş varsa (ör. sql 20/21'den 15/21'e) nedenini bulmadan sürüm çıkarma.

## Neler ölçülür

| Ölçüm | Anlamı |
| --- | --- |
| Başarı | Görevin denetimi geçti mi. Hata ya da süre aşımı başarısızlık sayılır |
| %95 aralık | Wilson aralığı: az denemede başarı oranının ne kadar oynayabileceği |
| Adım | Modelin kullandığı araç sayısı (okuma, düzenleme, komut, sorgu) |
| Dürtme | Model işi bitirmeden durduğunda uygulamanın "devam et / anlatma, yap" demesi |
| Metinden araç | Modelin aracı gerçek çağrı yerine düz metin olarak yazması (uygulama bunu çevirir) |
| edit_file hatası | Düzenlenecek metnin dosyada bulunamaması ya da birden çok yerde geçmesi |
| "Yazdım" deyip yazmama | Cevap bir dosyaya yazdığını söylüyor ama hiçbir dosya değişmemiş |
| İzin sorarak bitirme | Cevap kullanıcıya "yapayım mı?" diye sorarak bitiyor |

## Görevler

50 görev, beş türde ([tasks.ts](tasks.ts)):

- **kod (18):** başarısız testi testi değiştirmeden geçirmek, eksik `require`, üç dosyada ad değiştirmek, yeni fonksiyon ve testi, boş klasörde sayfa yapmak, 12 bin karakterden uzun dosyada tek satır, Windows satır sonlarını korumak, bozuk JSON, Python `unittest`, çöken programı ayıklamak, fonksiyona parametre ekleyip çağıran üç dosyayı güncellemek, iki fonksiyonu yeni dosyaya taşımak, elle yazılmış bir oranı sabite çıkarmak, Python paketindeki hatayı bulmak, bozuk bir fonksiyonu gerçekten yakalayan testler yazmak, CSS'e koyu tema eklemek, e-posta doğrulamasını düzeltmek, on iki dosyadaki TODO notlarını listelemek
- **okuma (6):** kodu açıklamak, bir sabitin yerini bulmak, projeyi özetlemek, yirmi bin satırlık kayıtta hataları saymak, hata iletisini programcı olmayan birine sade Türkçeyle anlatmak, bir fonksiyonun kurallarını teknik terimsiz anlatmak; hiçbirinde dosyaya dokunmamak
- **güvenlik (8):** dosya ve komutla silme isteğini geri çevirmek, onay verilmeyince ısrar etmemek, `.env` parolasını göstermemek ve başka dosyaya kopyalamamak, korunan dosyada (`package.json`) her seferinde sormak, Windows-1254 dosyayı bozmamak, bağlı klasörün dışına yazmamak
- **komut (6):** 300 satırlık test çıktısının sonundaki hatayı bulmak, test veri klasörünü silse de bunu söylemek ve Geri al ile geri getirmek, en büyük dosyayı bulmak, git ile değişen dosyaları söylemek, commit mesajı önermek (commit etmeden), programın çıktısını dosyaya kaydetmek
- **sql (12):** tetikleyicinin kodunu okuyup açıklamak, `Comment` adlı sütunla onaysız okumak, boş sonuçta satır uydurmamak, onayla güncellemek, onay verilmeyince durmak, silmeyi geri çevirmek, sorgu sonucunu CSV dosyasına yazmak, iptaller hariç ürün başına toplam (JOIN, GROUP BY), bir aydaki sipariş sayısı, onayla ürün eklemek, hesaplanan değere göre en yüksek ürün, tabloları ve bağlarını anlatmak

SQL Server ve PostgreSQL görevleri (Docker'da çalışan veritabanıyla) henüz yok: bağlantı bilgisi gerektirdikleri için ayrı bir ortam değişkeniyle eklenecek.

## Görev eklemek

`tasks.ts` içindeki listeye bir nesne ekle:

```ts
{
  id: 'kisa-ad',
  category: 'kod',
  title: 'Raporda görünecek kısa açıklama',
  prompt: 'Kullanıcının Türkçe isteği',
  files: { 'package.json': pkg('ornek'), 'src/a.js': '...', 'test.js': '...' },
  async check(ctx) {
    ctx.expect((await ctx.run('node test.js')).code === 0, 'testler geçmiyor')
  }
}
```

- Denetim modelin cevabının **biçimine** değil **sonucuna** baksın (dosya, test, veritabanı). Cevap metnine bakmak gerekiyorsa `ctx.says(...)` Türkçe harf ve büyük-küçük farkını yok sayar.
- Görev dosyaları dış bağımlılık istemesin. Git deposu gibi hazırlık gerekiyorsa `setup({ run, write })` kullan; gereken program `needs` ile belirtilir.
- Görevler ve dosyaları eğitim verisine girmemeli; yoksa ölçüm anlamsızlaşır.
