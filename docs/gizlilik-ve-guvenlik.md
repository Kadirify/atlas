# Gizlilik ve güvenlik

Atlas'ın var olma nedeni verinin senin bilgisayarında kalması. Bu sayfa verilerin nerede durduğunu, Atlas'ın ne zaman internete çıktığını ve neleri yapamadığını açıkça anlatır. Bir şeyi garanti edemediğimiz yerde bunu da söyleriz.

## Verilerin nerede durur

| Ne | Nerede |
| --- | --- |
| Sohbetler, eklenen belgelerin metni ve aslı, ayarlar, bellek notları, veritabanı bağlantıları | `%APPDATA%\Atlas Asistan\atlas.db` (tek bir SQLite dosyası) |
| Modeller | Ollama'nın klasörü (varsayılan `%USERPROFILE%\.ollama\models`) |
| Komutlar için güvenli kip: komuttan önceki dosyaların kopyaları (geri alma için) | `%LOCALAPPDATA%\Atlas Asistan\snapshots` (hiçbir geri alma kaydının kullanmadığı kopyalar açılışta silinir) |
| Şema güncellemesinden önce alınan veritabanı kopyaları (en yeni üçü) | `%APPDATA%\Atlas Asistan\backups` |
| Hata kaydı: hatalar, çökmeler, donmalar (sohbet, dosya içeriği, komut ve sorgu metni yazılmaz) | `%APPDATA%\Atlas Asistan\logs` (en çok 4 MB; eskiler kendiliğinden silinir) |
| Güncelleme denetlediğinde indirilen Atlas model listesi | `%APPDATA%\Atlas Asistan\atlas-models.json` |
| Geçici dosyalar: indirilen güncelleme ve Ollama kurulum dosyası, PDF'e aktarırken ve yazdırırken hazırlanan sayfa | `%TEMP%` altında `atlas-update` ve `atlas-setup` klasörleri, `atlas-export-*.html` ve `atlas-print-*.html`. Sayfalar ve Ollama kurulum dosyası iş bitince silinir |
| Proje klasörlerin | Oldukları yerde; Atlas yalnızca senin bağladığın klasörün içinde çalışır |

- **Veritabanı parolaları** Windows'un güvenli deposuyla (DPAPI) şifrelenerek saklanır; başka bir kullanıcı ya da başka bir bilgisayar çözemez.
- **Uygulama kilidi** ekranı kilitler ve kilitliyken arayüze veri gönderilmez. Ama `atlas.db` dosyası şifreli değildir: diski kopyalayan biri sohbetleri okuyabilir. Hassas belgelerle çalışıyorsan Windows hesabını parolayla koru, gerekiyorsa BitLocker kullan.
- **Gizli sohbet** hafızayı kullanmaz, hafızaya bir şey yazmaz ve uygulama kapanınca silinir (diskteki kaydı bir sonraki açılışta temizlenir).

## Atlas ne zaman internete çıkar

Yalnızca şu durumlarda:

1. **Kurulumda:** Ollama'yı `ollama.com`'dan indirirken ve seçtiğin modeli indirirken (model indirmeyi Ollama yapar). İndirilen Ollama kurulum dosyası çalıştırılmadan önce Windows imzası denetlenir: imza geçerli ve Ollama'ya ait değilse dosya çalıştırılmaz.
2. **Yeni sürüme bakarken:** Atlas açılınca ve günde bir kez (ya da sen "Güncellemeleri denetle" dediğinde) GitHub'dan son sürümün bilgisini ve model tarifleri dosyasını okur; yeni sürüm varsa haber verir. Kurulum dosyasını yalnızca sen "İndir" dersen indirir. Kendiliğinden bakmayı **Ayarlar → Hakkında → Yeni sürüm çıkınca haber ver** ile kapatabilirsin; o zaman yalnızca düğmeye bastığında bakar.

Bunların hiçbirinde seninle ilgili bir bilgi gönderilmez. Kullanım istatistiği, hata raporu ya da reklam kimliği yoktur.

- Sohbetteki bir bağlantıya tıklarsan bağlantı tarayıcında açılır; bu senin yaptığın bir işlemdir.
- Model cevaplarındaki resimler yalnızca uygulamanın içindeki veriden gösterilir; bir cevap Atlas'ı dışarıdaki bir sunucuya bağlatamaz.
- Ollama kendi güncellemelerini denetleyebilir; bu Ollama'nın davranışıdır, Atlas'ın değil.

## Atlas neleri yapamaz

Bu kurallar modele verilen talimatlarda değil, uygulamanın kodunda durur. Model ne derse desin bunları aşamaz.

### Dosyalar
- **Silme aracı yoktur.** Atlas bir dosyayı ya da klasörü silemez; içini boşaltarak ya da üstüne yazarak dolaylı yoldan silmeye çalışması da talimatla yasaktır.
- Yalnızca bağladığın klasörün içinde çalışır. `..`, başka sürücüye giden yollar, klasör dışını gösteren kısayollar, `dosya.txt:gizli` gibi Windows hileleri reddedilir.
- Bir dosyayı değiştirmeden önce farkı satır satır gösterir ve onayını ister. Onay beklerken dosyayı sen değiştirirsen Atlas üstüne yazmaz.
- `package.json`, `.git`, `.vscode`, `.bat`, `.ps1` gibi başka programların kendiliğinden çalıştırdığı dosyalar, "hep izin ver" desen bile her seferinde kırmızı uyarıyla sorulur.
- `.env`, anahtar ve parola dosyalarını okumaz, aramaya ve indekse almaz.
- UTF-8 olmayan dosyaları bozmamak için değiştirmez.
- PDF, Word ve Excel dosyalarını ayrı, bellek sınırlı bir süreçte okur; açıldığında 200 MB'ı aşan dosyayı açmaz. Bozuk ya da kötü niyetli bir belge uygulamayı düşüremez.
- Dosyaların, belgelerin, komut çıktılarının ve sorgu sonuçlarının içindeki metin modele "veri" olarak tanıtılır: içinde talimat gibi sözler geçse de uygulamaması söylenir. Bu bir talimattır, kesin bir engel değildir; asıl koruma onay kartlarıdır.
- Bir cevapta yaptığı değişiklikleri tek düğmeyle geri alırsın. Atlas'tan sonra dosyayı sen değiştirdiysen geri alma senin değişikliğine dokunmaz.

### Komutlar
- Her komut (test, derleme, git) çalışmadan önce onay kartıyla sorulur. "Bu komuta hep izin ver" dersen o birebir aynı komut o sohbette yeniden sorulmaz; ama Atlas o zamandan beri sana sormadan bir dosya değiştirdiyse (düzenlemelere de "hep izin ver" dediysen) komut uyarıyla yeniden sorulur, çünkü o dosyayı çalıştırabilir.
- "Hep izin ver" dediğin komutlar mesaj kutusunun üstünde listelenir; yanındaki çarpıyla o komutun iznini kaldırırsın. İzinler sohbete özgüdür; Atlas kapanınca ya da sohbetin klasörü değişince unutulur.
- Bilinen silme ve yok etme komutları (`rm`, `del`, `rd`, `format`, `git clean`, `git reset --hard`, `git push --force`...) ve bunları gizleme hileleri hiç çalıştırılmaz. PowerShell ve betik çalıştırıcıları kapalıdır.
- **Güvenli kip:** yasak listesi bir komutun çalıştırdığı dosyanın içinde ne olduğunu bilemez; onayladığın `npm test`, test dosyasının içindeki her şeyi çalıştırır. Bu yüzden Atlas her komuttan önce proje klasörünün anlık görüntüsünü alır. Komuttan sonra silinen, değişen ve oluşan dosyalar terminal çıktısının altında listelenir, Atlas da bunu sana söyler. Cevabın altındaki **Geri al** komutun yaptıklarını da geri alır: silinen ve değişen dosyalar eski haline döner, komutun oluşturduğu dosyalar çöp kutusuna gider.
- Git (Değişiklikler sekmesi): commit, dal açma ve geri çevirme yalnızca senin tıklamanla yapılır; model bu işlemleri kendisi yapamaz. Push ve başka hiçbir ağ işlemi yoktur. Geri çevirdiğin dosyanın şimdiki hali silinmez, çöp kutusuna gider.
- `.env` ve anahtar dosyaları değişiklik listesinde kilit işaretiyle görünür, commit için kendiliğinden seçilmez; içerikleri fark görünümünde gösterilmez ve commit mesajı önerisi için modele verilmez.
- Git, bir deponun kendi ayarında yazan programları çalıştırabilir. Atlas durumu ve farkı okurken git'i bu özellikler kapalı olarak çağırır. Deponun yerel ayarında kapatılamayan türden bir program (içerik süzgeci, imza programı, dış fark aracı) tanımlıysa ya da çalışma klasörü başka bir yere yönlendirilmişse o depoda git'i hiç çalıştırmaz ve nedenini söyler. Böylece indirdiğin bir projeyi kod alanında açmak, içindeki depo ayarı yüzünden program çalıştırmaz. Git programı tam yoluyla çağrılır; proje klasöründeki `git.exe` gibi bir dosya onun yerine geçemez.
- Depodaki betikler (`pre-commit` gibi hook'lar) commit sırasında, kendi terminalinde olduğu gibi çalışır; hangilerinin çalışacağı commit kutusunun altında yazar.
- Güvenli kibin sınırları: `node_modules`, `dist`, `build`, `bin`, `obj` gibi bağımlılık ve derleme klasörlerine ve noktayla başlayan klasörlere (`.git` dahil) bakılmaz. 8 MB'tan büyük dosyaların ve `.env` gibi gizli dosyaların önceki hali saklanmaz; bunlar değişirse "geri getirilemez" diye ayrıca söylenir. Önemli projelerde yine de git gibi bir sürüm kontrolü kullan.

### Veritabanı
- **SELECT** sorguları onaysız çalışır; veritabanı tarafında da salt okunur ya da geri alınan bir işlem içinde, tek ifade olarak.
- Veriyi ya da yapıyı değiştiren her sorgu (INSERT, UPDATE, CREATE, EXEC...) onay kartıyla sorulur.
- **DELETE, DROP ve TRUNCATE** hiç çalıştırılmaz. Sorgu, bağlı veritabanının kendi yazım kurallarıyla incelenir; metin ya da yorum gibi görünen bir yere gizlenmiş komut da yakalanır.
- Üretim veritabanına bağlanacaksan Atlas için **yalnızca okuma yetkisi olan bir kullanıcı** aç. En sağlam koruma veritabanının kendi yetkileridir.

## Güvenlik açığı bildirmek

Bir güvenlik açığı bulduysan herkese açık bir kayıt (issue) açmak yerine [SECURITY.md](../SECURITY.md) dosyasındaki yolu izle.
