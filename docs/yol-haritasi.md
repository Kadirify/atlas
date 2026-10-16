# Yol haritası

Atlas'ta sırada ne var. Öncelik sırasıyla; tarih vermiyoruz, çünkü proje gönüllü vakitle ilerliyor. Kod alanını ve modelleri etkileyen her değişiklik [ajan test setiyle](../eval/ajan/README.md) ve [Atlas-TR](olcum.md) ile ölçülerek yapılıyor.

## Şimdi: sağlamlık ve güvenlik

- **Uygulamanın donmaması.** Belge okuma ayrı iş parçacığında, süre ve boyut sınırıyla (SQLite sorguları artık ayrı süreçte).
- **İmzalı güncellemeler.** Kurulum dosyalarını ve model tariflerini imzalamak, uygulamada doğrulamak.
- **Veritabanı bağlantılarında şifreleme varsayılan.**

## Yakında: kod alanı ve modeller

- **Ajan test setini büyütmek ve sürüm kapısı yapmak:** 28 görevden 50'ye; her sürümden önce tekrarlı ölçüm.
- **Kod alanında git:** değişiklikleri git farkı olarak görmek, commit mesajı önerisi, dal açma.
- **Proje haritası:** klasör bağlanınca dosya yapısı ve fonksiyonların kısa özeti; model aramaya daha az adım harcasın.
- **Onay bekleyen işler çubuğu** ve "hep izin ver" denmiş komutları tek tek kaldırma.
- **Atlas Code için araç kullanımı eğitimi:** doğrulanmış başarılı ajan konuşmalarıyla yeni ince ayar turu. Atlas Strong için de aynısı.
- **Atlas-TR'yi büyütmek:** 92 sorudan 300'e; elle doğrulanmış gerçek yazım hataları.

## Sonra: sohbet ve belgeler

- Cevap sürümleri ve cevap üzerinde hızlı işlemler (kısalt, resmileştir, tabloya çevir).
- Taranmış (metinsiz) PDF desteği; PDF görünümünde sayfa araçları.
- Word belgesini biçimini koruyarak düzenlemek.
- Sohbetleri klasörlere ayırmak; PowerPoint ve e-posta dosyaları; ekran görüntüsü alıp sormak.
- Komut paleti (Ctrl+K), sesli okuma, hatırlatmalar.

## Daha sonra

- Sohbet verisini şifrelemek (uygulama kilidiyle birlikte).
- Kod imzalama ve otomatik sürüm hattı.
- macOS ve Linux sürümleri; daha fazla dil.

Bir öneri ya da hata için [Issues](https://github.com/Kadirify/atlas/issues) sayfasını kullanabilirsin.
