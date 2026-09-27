# Ajan test seti

Atlas'ın kod alanında ve veritabanı sohbetlerinde **gerçekten iş bitirip bitirmediğini** ölçer. Atlas-TR ([../RESULTS.md](../RESULTS.md)) modelin dilini ve bilgisini ölçer; bu set ise araç kullanan bir ajan olarak davranışını: testi çalıştırıp hatayı düzeltiyor mu, yanlış dosyaya yazıyor mu, silme isteğini geri çeviriyor mu, onay verilmeyince ısrar ediyor mu.

Son sonuçlar: [RESULTS.md](RESULTS.md)

## Nasıl çalışır

Her görev için:

1. Geçici bir klasör, görevin dosyalarıyla (ve gerekiyorsa bir SQLite veritabanıyla) hazırlanır.
2. Atlas'ın **gerçek** sohbet, dosya ve veritabanı servisleri (`src/main/services`) pencere olmadan, gerçek bir Ollama modeliyle başlatılır. Bellek kapalıdır, veritabanı bellekte tutulur; senin Atlas verilerine dokunulmaz.
3. Görevin Türkçe isteği gönderilir. Onay kartları görevin kuralına göre onaylanır ya da reddedilir (kullanıcının yerine).
4. Cevap bitince görevin kendi denetimi sonucu kontrol eder: testler geçiyor mu, dosya istenen hale geldi mi, başka bir şey bozuldu mu, cevap doğru mu.

Model komutları gerçekten çalıştırır (`npm test`, `node ...`, `python -m unittest`), ama yalnızca geçici klasördeki görev dosyalarında. Görevlerin hiçbiri internete ya da `npm install`'a ihtiyaç duymaz.

## Çalıştırmak

Ollama açık olmalı ve modeller kurulu olmalı. Python görevi için Python gerekir; yoksa o görev atlanır.

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
| `AJAN_KEEP` | `1` ise başarısız görevlerin klasörleri silinmez, incelenebilir |
| `AJAN_OUT` | Sonuç klasörü (varsayılan `eval/ajan/results`) |

Bir görev RTX 5070'te Atlas Strong ile 20-60 saniye, Atlas Code ile 40-120 saniye sürer. Bütün set iki modelle yaklaşık bir saat.

Sonuçlar:
- `results/<tarih>.json`: her denemenin bütün ölçümleri ve son cevabı
- `results/<tarih>.md`: o çalıştırmanın özeti
- `RESULTS.md`: bütün görevlerle yapılan son çalıştırmanın özeti (filtreli çalıştırmalar bunu değiştirmez)

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

28 görev, beş türde ([tasks.ts](tasks.ts)):

- **kod (10):** başarısız testi testi değiştirmeden geçirmek, eksik `require`, üç dosyada ad değiştirmek, yeni fonksiyon ve testi, boş klasörde sayfa yapmak, 12 bin karakterden uzun dosyada tek satır, Windows satır sonlarını korumak, bozuk JSON, Python `unittest`, çöken programı ayıklamak
- **okuma (3):** kodu açıklamak, bir sabitin yerini bulmak, projeyi özetlemek; üçünde de hiçbir dosyaya dokunmamak
- **güvenlik (6):** dosya ve komutla silme isteğini geri çevirmek, onay verilmeyince ısrar etmemek, `.env` parolasını göstermemek, korunan dosyada (`package.json`) her seferinde sormak, Windows-1254 dosyayı bozmamak
- **komut (2):** 300 satırlık test çıktısının sonundaki hatayı bulmak, en büyük dosyayı bulmak
- **sql (7):** tetikleyicinin kodunu okuyup açıklamak, `Comment` adlı sütunla onaysız okumak, boş sonuçta satır uydurmamak, onayla güncellemek, onay verilmeyince durmak, silmeyi geri çevirmek, sorgu sonucunu CSV dosyasına yazmak

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
- Görev dosyaları dış bağımlılık istemesin.
- Görevler ve dosyaları eğitim verisine girmemeli; yoksa ölçüm anlamsızlaşır.
