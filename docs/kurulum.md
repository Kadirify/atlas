# Kurulum

## Gereksinimler

- **Windows 10 ya da 11**, 64 bit
- **Bellek (RAM)**: en az 8 GB, önerilen 16 GB ve üstü
- **Ekran kartı**: şart değil ama çok fark eder. NVIDIA kartlarda modeller çok daha hızlı çalışır.
- **Disk**: uygulama için yaklaşık 500 MB, seçtiğin model için 3 ile 10 GB arası
- Kurulum ve model indirme sırasında internet; sonrasında gerekmez

## Hangi model bana uygun?

Kurulum sihirbazı bilgisayarını tarayıp bunu kendisi önerir. Kabaca:

| Bilgisayarın | Önerilen model | Boyut |
| --- | --- | ---: |
| Ekran kartı yok, 8 GB bellek | Atlas Mini | 2,7 GB |
| Ekran kartı yok ya da 4-6 GB ekran kartı, 16 GB bellek | Atlas Light | 3,5 GB |
| 8 GB ekran kartı | Atlas Medium | 7,3 GB |
| 12 GB ve üstü ekran kartı | Atlas Strong | 9,2 GB |
| Yazılım işleri, 12 GB ve üstü ekran kartı | Atlas Code | 9,0 GB |

Birden fazla model kurup sohbet başına seçebilirsin. Modellerin ayrıntısı: [Atlas modelleri](modeller.md).

## Kurulum adımları

1. [Sürümler](https://github.com/Kadirify/atlas/releases) sayfasından `Atlas-Setup-x.y.z.exe` dosyasını indir.
2. Dosyayı çalıştır. Kurulum dosyası imzalı olmadığı için Windows "Bilinmeyen yayıncı" uyarısı gösterebilir: **Ek bilgi → Yine de çalıştır**. (Kod imzalama sertifikası ücretli; açık kaynak bir proje için şimdilik almadık. Kaynak kodun tamamı bu depoda.)
3. Atlas ilk açıldığında kurulum sihirbazı başlar:
   - Dil seçimi (Türkçe / English)
   - Bilgisayar taraması (bellek, ekran kartı, disk)
   - [Ollama](https://ollama.com) kontrolü: yoksa sihirbaz indirip kurar. Ollama, modelleri bilgisayarında çalıştıran açık kaynak bir araçtır.
   - Model seçimi ve indirme
   - Kısa bir hız testi
4. Hazır. Sihirbazdan sonra internet bağlantısını kesebilirsin.

## Güncelleme

**Ayarlar → Hakkında → Güncellemeleri denetle.** Yeni sürüm varsa notlarını gösterir, kurulum dosyasını indirir, boyutunu ve özetini kontrol edip kurar. Atlas kendiliğinden internete çıkmaz; yalnızca bu düğmeye bastığında GitHub'daki sürümlere bakar.

## Verilerin nerede?

Sohbetler, hafıza, ayarlar ve eklenen dosyalar tek bir dosyada durur:

```
%APPDATA%\Atlas Asistan\atlas.db
```

Modeller Ollama'nın klasöründedir (varsayılan `%USERPROFILE%\.ollama\models`).

## Kaldırma

Windows **Ayarlar → Uygulamalar** üzerinden Atlas'ı kaldır. Verilerini de silmek istersen `%APPDATA%\Atlas Asistan` klasörünü sil. Modelleri silmek için `ollama rm <model adı>` ya da Ollama'nın klasörü.

## Kaynaktan derleme

Geliştiriciler için:

```bash
git clone https://github.com/Kadirify/atlas.git
cd atlas
npm install
npm run dev        # geliştirme modu, canlı yenileme
npm test           # birim testleri
npm run typecheck  # tip denetimi
npm run dist       # Windows kurulum dosyası (release/ klasörüne)
```

Node.js 22.13 ya da üstü gerekir (veritabanı için yerleşik `node:sqlite` kullanılıyor). Ayrıntı: [Mimari](mimari.md) ve [Katkı rehberi](../CONTRIBUTING.md).
