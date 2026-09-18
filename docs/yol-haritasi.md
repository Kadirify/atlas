# Yol haritası

Atlas'ta sırada ne var. Öncelik sırasıyla; tarih vermiyoruz, çünkü proje gönüllü vakitle ilerliyor.

## Şimdi

- **Ajan test seti.** Kod alanı için 25-30 küçük örnek proje ve her biri için otomatik denetim: test geçti mi, yanlış dosyaya yazdı mı, bir şey sildi mi. Her model ve kod değişikliği bununla ölçülecek; sürümler bu testten geçmeden çıkmayacak.
- **Daha iyi düzenleme.** Satır numaralı dosya okuma ve boşluk farklarına dayanıklı eşleşme; küçük modellerin düzenleme başarısını en çok artıracak değişiklik.
- **Komutlar için güvenli kip.** Komutları kısıtlı bir ortamda çalıştırmak ya da her komuttan önce klasörün anlık görüntüsünü almak. "Hep izin ver"in güvenle kullanılabilmesi için.
- **SQLite ve belge ayrıştırma ayrı iş parçacığında.** Uzun bir sorgu ya da büyük bir belge uygulamayı dondurmasın.
- **İmzalı güncellemeler.** Kurulum dosyalarını ve model tariflerini imzalamak, uygulamada doğrulamak.

## Yakında

- **Kod alanında git:** değişiklikleri git farkı olarak görmek, commit mesajı önerisi, dal açma.
- **Onay bekleyen işler çubuğu:** "Atlas onayını bekliyor (2)" ve karta tek tıkla gitmek.
- **Atlas-TR'yi büyütmek:** 92 sorudan 300-500 soruya; uygulamanın gerçek koşullarında ölçüm; elle doğrulanmış gerçek yazım hataları.
- **Araç kullanımı için eğitim:** doğrulanmış başarılı ajan konuşmalarıyla Atlas Strong ve Atlas Code için yeni ince ayar turu.
- **Sürekli tümleştirme:** her değişiklikte test; sürüm etiketinde otomatik kurulum dosyası.
- **Kayıt ve tanılama:** hata bildirimine eklenebilecek kayıt dosyası.

## Daha sonra

- Veritabanı dosyasını şifreleme (uygulama kilidiyle birlikte).
- Uzun belgelerde "tümünü düzelt" için ilerleme ve kısmi uygulama.
- macOS ve Linux sürümleri.
- Daha fazla dil.

Bir öneri ya da hata için [Issues](https://github.com/Kadirify/atlas/issues) sayfasını kullanabilirsin.
