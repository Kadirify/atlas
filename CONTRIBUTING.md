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
- Kod alanını, araçları ya da ajan döngüsünü (`src/main/services/chat.ts`, `files.ts`, `sql.ts`) değiştiren katkılar ajan test setiyle (`npm run eval:ajan`, [eval/ajan](eval/ajan/README.md)) ölçülür: değişiklikten önceki ve sonraki sonuçları en az üç tekrarla (`AJAN_REPEAT=3`) karşılaştır. Tek deneme gürültülüdür.

## Sürüm

Her sürümden önce:

1. `npm run typecheck` ve `npm test` temiz geçer.
2. Ajan test seti Atlas Strong ile üç tekrarla çalıştırılır ve sonuç [eval/ajan/GECMIS.md](eval/ajan/GECMIS.md) dosyasındaki bir önceki satırla karşılaştırılır. Kod görevlerinde başarı %90'ın altındaysa sürüm çıkmaz (`AJAN_GATE_KOD=0.9` bunu kendisi denetler). Ayrıntı: [eval/ajan/README.md](eval/ajan/README.md#sürümden-önce)
3. `CHANGELOG.md` güncellenir.

Sürümü çıkarırken (uygulamadaki güncelleme denetimi bu adımlara bağlıdır):

1. `package.json` sürümünü artır (`npm version X.Y.Z --no-git-tag-version`). `CHANGELOG.md` dosyasında "Yayımlanmamış" başlığını `X.Y.Z (tarih)` yap, üstüne boş bir "Yayımlanmamış" bölümü aç.
2. `npm run dist` kurulum dosyasını üretir: `release/Atlas-Setup-X.Y.Z.exe`. Adını değiştirme; Atlas kurulum dosyasını `.exe` uzantısından ve deponun sürümleri altında olmasından tanır.
3. Kurulum dosyasını temiz bir Windows kullanıcı hesabında dene: kurulum sihirbazı, model indirme, ilk sohbet, bir belge ekleme.
4. Etiket `vX.Y.Z` biçiminde ve `package.json` sürümüyle aynı olmalı. GitHub'da sürümü bu etiketle yayımla; **taslak ya da ön sürüm (pre-release) olarak işaretleme**: Atlas yalnızca "latest" sürüme bakar, öbürlerini görmez.
5. Sürüme yalnızca kurulum dosyasını yükle (tek `.exe`). Sürüm notuna `CHANGELOG.md` dosyasının o sürüme ait bölümünü yapıştır; Atlas bunu "Bu sürümde neler değişti" başlığıyla gösterir.
6. Yayımladıktan sonra bir önceki sürümle dene: **Ayarlar → Hakkında → Güncellemeleri denetle** yeni sürümü göstermeli, "İndir" düğmesi çıkmalı, indirilen dosya boyut ve özet denetiminden geçip kurulmalı.
7. `resources/atlas-models.json` ana dala girdiği anda bütün kullanıcılara ulaşır (Atlas model tariflerini ana daldan okur). Tarif değişikliğini, onu anlayan sürüm yayımlanmadan ana dala alma.

## Lisans

Gönderdiğin katkılar projenin lisansıyla ([MIT](LICENSE)) yayımlanır.
