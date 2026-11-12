# Atlas nedir?

Atlas, bilgisayarında çalışan bir yapay zeka asistanı. Sohbet eder, yazı yazar ve düzeltir, belge okur, kod yazar, veritabanına bakar. Bunların hepsini internete bağlanmadan, senin bilgisayarının işlemcisi ve ekran kartıyla yapar.

Sorduğun sorular, eklediğin dosyalar ve sohbetlerin hiçbir sunucuya gitmez. Hesap açmak, abonelik ödemek ya da bir şirketin kullanım koşullarına güvenmek gerekmez.

## Neden yaptık?

Bulut tabanlı yapay zeka asistanları çok güçlü, ama her işe uygun değiller:

- **Şirket verisi dışarı çıkmamalı.** Sözleşmeyi, müşteri listesini, maaş tablosunu, kaynak kodunu bir buluta yapıştırmak çoğu şirkette yasak. KVKK ve iç politikalar da bunu zorlaştırıyor.
- **İnternet her zaman yok.** Uçakta, sahada, kapalı ağlarda çalışan biri için bulut asistanı yoktur.
- **Abonelik herkes için değil.** Öğrenciler, küçük işletmeler ve ara sıra kullananlar için aylık ücret ağır.
- **Türkçe ikinci planda kalıyor.** Küçük açık modellerin çoğu Türkçede yazım hatası yapar, ekleri karıştırır, resmi yazışmada zorlanır.

Atlas bu boşluğu doldurmak için yapıldı: Türkçeyi iyi bilen, bilgisayarda kalan, ücretsiz bir asistan.

## Ne yapar?

| İş | Örnek |
| --- | --- |
| Sohbet ve yazı | "Müşteriye gecikme için kısa bir özür e-postası yaz", "Bu paragrafı daha resmi yap" |
| Yazım düzeltme | Türkçe yazım ve noktalama hatalarını düzeltir; Atlas modelleri özellikle bunun için eğitildi |
| Belgeler | PDF, Word ve Excel dosyasını sohbete ekler, özetletir, soru sorarsın; belgeyi yanda açıp bir bölümünü düzelttirirsin |
| Hazır uygulamalar | Toplantı tutanağı, resmi yazı, çeviri, özet gibi işler için tek tıkla çalışan küçük uygulamalar; kendi uygulamanı da yaparsın |
| Kod | Bir proje klasörünü açarsın; Atlas dosyaları okur, değişiklik önerir, testi çalıştırıp sonucu kontrol eder |
| Veritabanı | SQL Server, PostgreSQL, MySQL ya da SQLite'a bağlanır; tabloları, yordamları, tetikleyicileri okur, soruna göre sorgu yazar |
| Masaüstü | Her programda seçtiğin metni bir kısayolla düzelttirir ya da çevirtir; her yerden açılan küçük bir soru penceresi vardır |

Ayrıntılar: [Özellikler](ozellikler.md).

## Kimin için?

- Şirket belgeleriyle çalışan ve bunları dışarı gönderemeyen çalışanlar
- Türkçe yazışmaları hızlandırmak isteyen herkes
- Kod ve SQL ile uğraşan, verisini dışarı vermek istemeyen yazılımcılar
- İnternetin olmadığı ya da kısıtlı olduğu yerlerde çalışanlar
- Yapay zekayı ücretsiz denemek isteyen öğrenciler

## Atlas'ın kendi modelleri

Atlas sıradan bir "yapay zeka kabuğu" değil. Kendi model ailesi var: **Atlas Light, Medium, Strong ve Code.**

Bunlar sıfırdan eğitilmiş modeller değil. Google'ın Gemma 4 ve Alibaba'nın Qwen modelleri gibi açık lisanslı (Apache 2.0) taban modellerin üzerine, Türkçe için ince ayar (fine-tuning) yapılarak üretildi. Eğitim tek bir ev bilgisayarında, 12 GB'lık bir ekran kartıyla yapıldı.

Sonuç: Atlas modelleri genel işlerde tabanları kadar iyi kalırken Türkçe yazım düzeltmede belirgin şekilde daha iyi. Örneğin Atlas Strong, kurallarla bozulmuş 300 Türkçe cümlelik testte taban modelin %66'sına karşı %85 doğru sonuç veriyor.

Nasıl eğitildiğini, neyin işe yarayıp neyin yaramadığını [Atlas modelleri nasıl eğitildi?](egitim.md) sayfasında açıkça anlattık.

## Ne yapmaz?

Dürüst olmak gerekirse:

- **Bulut modelleri kadar güçlü değil.** 4 ile 14 milyar parametrelik modeller günlük işler için iyi; çok uzun ve karmaşık işlerde (büyük bir projede on dosyalık değişiklik gibi) hata yapar.
- **Güncel bilgiyi bilmez.** İnternete çıkmadığı için bugünün haberlerini, döviz kurunu ya da yeni çıkan bir kütüphaneyi bilmez.
- **Donanım ister.** En küçük model 8 GB bellekle çalışır; rahat kullanım için 8 GB ve üstü ekran kartı önerilir. Ayrıntı: [Kurulum](kurulum.md).
- **Şimdilik yalnızca Windows.** macOS ve Linux sürümleri planlarımızda.

## Kısaca

Atlas, "yapay zekayı kullanmak istiyorum ama verimi kimseye vermek istemiyorum" diyenler için. Bilgisayarına kurarsın, modelini seçersin, gerisi bilgisayarında kalır.
