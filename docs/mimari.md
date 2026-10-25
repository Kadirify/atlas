# Mimari

Geliştiriciler için Atlas'ın iç yapısı.

## Genel bakış

Atlas bir [Electron](https://www.electronjs.org) uygulaması. Modelleri kendisi çalıştırmaz; aynı bilgisayarda çalışan [Ollama](https://ollama.com) sunucusuyla (`127.0.0.1:11434`) konuşur.

```
┌──────────────────────────── Atlas (Electron) ────────────────────────────┐
│                                                                           │
│  Arayüz (renderer)           Köprü (preload)        Ana süreç (main)       │
│  React 19 + zustand   ──►   window.api.*     ──►   IPC işleyicileri       │
│  Tailwind 4                  (contextBridge)        servisler, SQLite      │
│                                                         │                 │
└─────────────────────────────────────────────────────────┼─────────────────┘
                                                          │ HTTP (yerel)
                                                          ▼
                                                 Ollama (Atlas modelleri)
```

- Arayüz Node.js'e erişemez (`contextIsolation`, `sandbox`, `nodeIntegration: false`). Her şey önceden tanımlı `window.api` çağrılarından geçer.
- Dosya sistemi, veritabanı, komut çalıştırma ve model çağrıları yalnızca ana süreçte yapılır.

## Klasörler

```
src/
  main/                 Ana süreç
    index.ts            Uygulama yaşam döngüsü, pencereler, sistem tepsisi, kilit zamanlayıcısı
    ipc.ts              Arayüzden gelen bütün istekler (handle('kanal', ...))
    panel.ts            Kısayolla açılan küçük soru penceresi
    tray.ts             Sistem tepsisi simgesi ve menüsü
    log.ts              Kayıt dosyası: hatalar, çökmeler, donmalar
    windowState.ts      Pencerenin kaydedilen yerini ve boyutunu geri yükleme
    db/index.ts         SQLite (node:sqlite): göçler ve sorgular
    workers/sqlite.ts   Bağlanan SQLite dosyalarındaki sorgular (ayrı süreçte çalışır)
    workers/document.ts PDF, Word ve Excel okuma (ayrı süreçte çalışır)
    services/
      chat.ts           Sohbet döngüsü: istem, geçmiş, akış, araç çağrıları, hafıza
      ollama.ts         Ollama istemcisi: akış, model indirme, oluşturma, bellek
      generate.ts       Akışı tekrar döngüsüne karşı koruyan sarmalayıcı
      files.ts          Klasör araçları: listele, oku, ara, düzenle, yaz, taşı, komut
      code.ts           Kod alanı: dosya ağacı, dosya görüntüleme, komut çalıştırma
      git.ts            Kod alanında git: durum, fark, commit, dal açma, geri çevirme (push yok)
      sql.ts            Veritabanı bağlantıları ve sürücüler (mssql, pg, mysql2, node:sqlite)
      sqliteRunner.ts   SQLite sorgusunu ayrı süreçte çalıştırma; Durdur'da ve 30 sn'de kapatma
      snapshot.ts       Komutlar için güvenli kip: komuttan önce klasörün anlık görüntüsü, sonra farkı
      diagnostics.ts    Hata bildirimi için tanılama bilgisi
      memory.ts         Kalıcı hafıza: öğrenme, gömme (embedding), anlamca arama
      attachments.ts    Ek dosyalardan metin çıkarma (PDF, Word, Excel)
      documentRunner.ts Belgeyi ayrı süreçte okutma; açılmış boyut, süre ve bellek sınırı
      export.ts         Sohbeti Word, PDF ve Markdown'a çevirme
      apps.ts studio.ts Mini uygulamalar ve Prompt Stüdyosu
      personas.ts       Kişilikler
      whatsapp/         WhatsApp dışa aktarımını ayrıştırma ve üslup çıkarma
      lock.ts           Uygulama kilidi (scrypt)
      selection.ts      Başka programdaki seçili metni alma ve yerine yazma
      updates.ts        GitHub sürümlerinden güncelleme
      hardware.ts catalog.ts  Donanım taraması ve model önerisi
  preload/index.ts      window.api köprüsü
  renderer/src/         Arayüz
    App.tsx             Ana ekran yönlendirmesi, kilit ekranı
    stores/             zustand depoları (app.ts, sql.ts)
    components/         Sohbet, belge paneli, kod alanı, veritabanı paneli, ayarlar...
    pages/              Kurulum sihirbazı, uygulamalar, stüdyo, WhatsApp
  shared/               İki tarafın da kullandığı kod
    types.ts            Bütün tipler ve window.api sözleşmesi
    i18n/tr, i18n/en    Arayüz metinleri ve modele giden talimatlar
    sql.ts              SQL güvenlik kuralı (okuma / onay / yasak)
    command.ts          Komut güvenlik kuralı
    text.ts             Kelime düzeyinde fark ve metin parçalama
resources/atlas-models.json   Atlas model tarifleri
eval/                         Atlas-TR ölçümü
training/                     Model eğitim betikleri
tests/                        Birim testleri (vitest)
```

## Bir mesajın yolculuğu

1. Kullanıcı mesajı yazar; arayüz `window.api.chat.send(...)` çağırır.
2. Ana süreç mesajı veritabanına yazar, `ChatService` cevabı başlatır.
3. Sistem talimatı kurulur: kişilik, kullanıcı bilgisi, ilgili hafıza kayıtları, uzun sohbetlerde özet. Sohbete klasör ya da veritabanı bağlıysa araç tanımları ve kuralları eklenir.
4. Geçmiş, modelin bağlamına sığacak şekilde kırpılır (normalde 8 bin, araçlı sohbetlerde 16 bin token).
5. Ollama'ya akışlı istek gider. Gelen parçalar `chat:chunk` olayıyla arayüze akar; düşünme açıksa düşünce parçaları `chat:thinking` ile gelir.
6. Model bir araç çağırırsa (dosya oku, sorgu çalıştır...) araç ana süreçte çalışır, sonucu modele geri verilir. Değiştiren işlemler için arayüze onay kartı gönderilir ve cevap beklenir. Bu döngü en çok 12 tur sürer.
7. Model yarıda kalırsa (izin istemek, "şimdi düzeltiyorum" deyip durmak, kodu dosyaya yazmak yerine sohbete dökmek) kısa bir yönlendirmeyle yeniden çağrılır.
8. Cevap, kullanılan araç adımları, düşünce ve geri alma kaydıyla birlikte veritabanına yazılır.
9. Arka planda başlık üretilir, hafızaya alınacak bilgiler çıkarılır.

## Güvenlik kuralları kodda

Modelin ne yapabileceğine model değil uygulama karar verir:

- **Dosya yolları** `resolveInside` ile bağlanan klasörün içinde tutulur; klasör dışına çıkan yollar, bağlantılar, alternatif veri akışları ve aygıt adları reddedilir. Başka programların kendiliğinden çalıştırdığı dosyalar (`isProtectedPath`) her seferinde sorulur; gizli dosyalar (`isSecretFile`) modele verilmez.
- **Komutlar** `src/shared/command.ts` ile sınıflandırılır: bilinen silme ve sistemi değiştiren komutlar ve gizleme hileleri hiç çalışmaz, geri kalanı onay kartıyla çalışır. Bu bir yasak listesidir; onaylanan komutun çalıştırdığı dosyanın içeriğini denetlemez.
- **SQL** `src/shared/sql.ts` ile, bağlı veritabanının yazım kurallarıyla sınıflandırılır: yalnızca tek bir SELECT onaysız çalışır; DELETE, DROP, TRUNCATE ve ATTACH hiç çalışmaz. Okumalar veritabanı tarafında da salt okunur ya da geri alınan bir işlem içinde, PostgreSQL'de tek ifadeye zorlanarak yapılır.
- **Onaylar** ana süreçte beklenir; arayüz yalnızca kullanıcının cevabını iletir.

Kuralların her biri testlerle korunuyor (`tests/command.test.ts`, `tests/sql.test.ts`, `tests/files.test.ts`, `tests/sqlService.test.ts`).

## Veritabanı

Atlas'ın kendi verisi `%APPDATA%\Atlas Asistan\atlas.db` dosyasında (SQLite, WAL kipi). Şema `src/main/db/index.ts` içindeki `MIGRATIONS` dizisiyle sürümlenir; her göç bir kez çalışır. Başlıca tablolar: `conversations`, `messages`, `attachments`, `documents`, `memories`, `personas`, `mini_apps`, `folders`, `file_actions`, `settings`.

## Dil desteği

Bütün metinler `src/shared/i18n/tr` (kaynak) ve `src/shared/i18n/en` altında. İngilizce sözlük Türkçenin tipini (`Dict`) uygular; eksik bir anahtar derlemeyi bozar. Modele giden talimatlar da (`prompts.ts`, `tools.ts`) dile göre seçilir.

## Testler

```bash
npm test            # vitest, 200'den fazla birim testi
npm run typecheck   # ana süreç ve arayüz için ayrı tip denetimi
```

Testler gerçek bir Ollama sunucusu istemez. Veritabanı testleri bellekte, klasör testleri geçici klasörlerde çalışır.

## Paketleme

`npm run dist`, electron-builder ile `release/` altına Windows kurulum dosyası (NSIS) üretir. Kurulum dosyası imzasızdır.
