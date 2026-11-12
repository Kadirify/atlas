# Katkı rehberi

Atlas'a katkı vermek istediğin için teşekkürler. Hata bildirimi, öneri, çeviri, belge düzeltmesi ve kod katkısı; hepsi değerli.

## Hata bildirmek

[Issues](https://github.com/Kadirify/atlas/issues) sayfasında yeni bir kayıt aç ve şunları yaz:

- Atlas sürümü (Ayarlar → Hakkında) ve Windows sürümü
- Kullandığın model ve ekran kartın
- Ne yaptın, ne bekledin, ne oldu
- Mümkünse ekran görüntüsü

Sohbet içeriği, belge ya da veritabanı bilgisi paylaşırken kişisel ve gizli bilgileri çıkarmayı unutma.

## Geliştirme ortamı

Gerekenler: Windows 10/11, Node.js 22.13 ya da üstü, [Ollama](https://ollama.com) ve en az bir Atlas modeli.

```bash
git clone https://github.com/Kadirify/atlas.git
cd atlas
npm install
npm run dev
```

Kendi verilerini bozmamak için ayrı bir profille çalışabilirsin (PowerShell):

```powershell
$env:ATLAS_USER_DATA = 'C:\atlas-deneme'; npm run dev
```

## Göndermeden önce

```bash
npm run typecheck
npm test
```

İkisi de temiz geçmeli. Yeni bir davranış ekliyorsan testini de ekle; özellikle güvenlik kuralları (`src/shared/command.ts`, `src/shared/sql.ts`, `src/main/services/files.ts`) test olmadan değiştirilmez.

## Kurallar

- **Metinler iki dilde.** Arayüze ya da modele giden her metin `src/shared/i18n/tr` ve `src/shared/i18n/en` altına yazılır; bileşenlerde sabit metin bırakılmaz. Türkçe kaynak dildir.
- **Ana süreç ile arayüz ayrı.** Arayüz dosya sistemine, veritabanına ya da Ollama'ya doğrudan erişmez; her şey `window.api` üzerinden, `src/main/ipc.ts` içindeki işleyicilerden geçer. Yeni bir işleyici, arayüzden gelen her değeri doğrulamalı.
- **Model kural koymaz, uygulama koyar.** Modelin neyi yapabileceği (silme yasağı, onay gerektiren işlemler) kodda belirlenir; talimatlar yalnızca yardımcıdır.
- **Kullanıcı verisi dışarı çıkmaz.** Yeni bir özellik internete istek atacaksa bu, kullanıcının açıkça başlattığı bir işlem olmalı ve gizlilik belgesine yazılmalı.
- Commit mesajları kısa ve ne yaptığını anlatan cümleler olsun: `Belge panelinde Excel sayfa sekmeleri`, `SQL okumalarına zaman aşımı`.

## Model ve ölçüm katkıları

- Yeni ölçüm soruları `eval/items.mjs`, kuralları `eval/checks.mjs` dosyasına eklenir. Eğitim verisiyle çakışmamalı.
- Eğitim betikleri `training/` altında. Bir model değişikliği, Atlas-TR'de ve yazım testlerinde tabanından kötü değilse kabul edilir; sonuçlar `training/README.md` dosyasına yazılır.

## Lisans

Gönderdiğin katkılar projenin lisansıyla ([MIT](LICENSE)) yayımlanır.
