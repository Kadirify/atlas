# Özellikler

Atlas'ın yapabildikleri, ekran ekran.

## Sohbet

- Cevaplar yazılırken canlı akar; Markdown, tablo ve kod blokları düzgün görünür.
- Bir cevabı kopyalayabilir, yeniden ürettirebilir, kendi mesajını düzenleyip yeniden sorabilirsin.
- Sohbetlere otomatik başlık verilir; sol menüde sabitleme, yeniden adlandırma ve arama vardır.
- **Ctrl+F** ile açık sohbetin içinde arama yapılır.
- **"/"** yazınca hazır istemler açılır: özetle, e-posta yaz, tabloya dök, çevir, düzelt... Kendi istemlerini de eklersin.
- **Düşün** düğmesi açıkken model cevap vermeden önce düşünür. Daha yavaş ama zor sorularda daha isabetlidir; düşüncesini cevabın üstünde görebilirsin.
- Sohbet Word, PDF ya da Markdown dosyası olarak kaydedilir ya da doğrudan yazdırılır.
- Yazı boyutu Ayarlar → Genel'den ya da **Ctrl +** ve **Ctrl -** ile değişir (**Ctrl 0** eski haline getirir). Pencere kapandığı yerde ve boyutta açılır.
- **Gizli sohbet**: hafızayı kullanmaz, hafızaya yazmaz, uygulama kapanınca silinir.

## Dosyalar ve belgeler

- Sohbete metin, PDF, Word (.docx), Excel (.xlsx) ve resim eklenir: sürükle-bırak ya da yapıştır.
- Uzun belgelerde modele verilen metin ekran kartına göre büyür: 12 GB'lık kartta yaklaşık 24 bin, 16 GB ve üstünde 48 bin karakter (küçük kartlarda 12 bin). Sığmayan belgede ek etiketi "baş kısmı okunur" diye uyarır; belgenin tamamı için belge panelindeki "Belgenin tamamı" düğmeleri kullanılır.
- Resimleri anlayan modellerle (Atlas Medium ve Strong) resim hakkında soru sorulur.
- **Belge paneli**: eklenen dosya sohbetin sağında kendi görünümüyle açılır. PDF sayfaları, Word düzeni ve Excel tablosu görünür.
  - Bir bölümü seçip "Yazımı düzelt", "Resmileştir", "Kısalt", "Çevir" ya da kendi isteğini uygularsın.
  - "Belgenin tamamı" düğmeleri bütün belgeyi parça parça işler.
  - Atlas'ın önerisi önce gösterilir: silinenler kırmızı, eklenenler yeşil. Onaylamadan hiçbir şey değişmez.
  - Düzenlenmiş hali Word, PDF, Markdown ya da metin olarak kaydedilir. Özgün dosyaya dokunulmaz.

## Kişilikler ve hafıza

- Hazır kişilikler: **Atlas** (genel asistan), **Kanka** (samimi sohbet), **İş danışmanı**, **Yazılım uzmanı**, **İngilizce pratik**. Kendi kişiliğini de oluşturursun.
- **Hafıza**: Atlas sohbetlerden senin hakkında kalıcı bilgiler öğrenir ("Kadir yazılım geliştirici, MSSQL kullanıyor" gibi) ve sonraki sohbetlerde kullanır. Öğrendiği her şeyi Ayarlar'da görür, düzenler ya da silersin.
- **WhatsApp'tan kişi**: dışa aktardığın bir WhatsApp sohbetinden bir kişinin yazış üslubunu öğrenir. Her şey bilgisayarında işlenir.

## Uygulamalar

Sık yaptığın işleri tek tıkla çalışan küçük uygulamalara çevirirsin.

- Hazır uygulamalar: metni düzelt, özetle, çevir, resmi yazı, toplantı tutanağı, e-posta cevabı ve benzerleri.
- **Prompt Stüdyosu**: "müşteri şikayetlerine kibar cevap yazan bir uygulama" gibi kısa bir istekten uygulamanın talimatını, form alanlarını ve simgesini önerir.
- Uygulamalar `.atlasapp` dosyası olarak paylaşılır.
- Kurumsal bilgilerini (unvan, şirket, imza) bir kez girersin; resmi yazılara kendiliğinden eklenir.

## Kod alanı

Sol menüdeki **Kod** bölümünden bir proje klasörü açarsın. Atlas o projede seninle birlikte çalışır.

- Solda dosya ağacı, ortada sohbet, sağda açtığın dosya.
- Atlas dosyaları kendisi okur ve arar; iş birden çok adımlıysa önce bir **plan** yazar ve adımları işaretleyerek ilerler.
- Dosyadaki değişikliği satır satır gösterip onayını ister. "Bu sohbette hep izin ver" dersen düzenlemeleri bir daha sormaz.
- Test, derleme, kurulum gibi komutları onayınla çalıştırır; çıktıyı canlı gösterir, hata varsa düzeltip yeniden dener.
- "Hep izin ver" dediğin düzenleme izni ve komutlar mesaj kutusunun üstünde listelenir; her birini oradan tek tek kaldırırsın.
- Onayını bekleyen bir iş varsa, kart ekranda değilken ya da başka bir sohbetteyken bile mesaj kutusunun üstünde görürsün ve tek tıkla karta gidersin.
- Atlas bir cevapta en çok 12 araç turu atar. Sınıra gelirse bunu adımlarda görürsün; cevabın altındaki **Devam et** ile kaldığı yerden sürdürür.
- **Güvenli kip:** her komuttan önce proje klasörünün anlık görüntüsü alınır. Komut (ya da çalıştırdığı test kodu) bir dosyayı silerse ya da değiştirirse terminalin altında görürsün.
- Bir cevapta yaptığı bütün dosya değişikliklerini, komutların yaptıkları dahil, tek düğmeyle **geri alırsın**.
- **Git:** proje bir git deposuysa dosya ağacının üstündeki **Değişiklikler** sekmesinde son commit'e göre değişen dosyaları görürsün; dosyaya tıklayınca farkı satır satır açılır. Dosyaları seçip mesajını yazarak commit atar, yeni dal açarsın. İstersen Atlas seçili değişikliklere bakıp deponun üslubunda bir commit mesajı önerir. Bir dosyadaki değişikliği geri çevirirsen şimdiki hali çöp kutusuna gider. Atlas kendiliğinden commit atmaz ve hiçbir zaman push yapmaz.
- Proje köküne `ATLAS.md` koyarsan ("Bu projede TypeScript kullan" gibi) Atlas bu kuralları her seferinde okur.
- **Silme aracı yok**: Atlas dosya silmez, bilinen silme komutlarını çalıştırmaz; bunu senin yapman gerektiğini söyler. Komutların sınırları için: [Gizlilik ve güvenlik](gizlilik-ve-guvenlik.md).
- `package.json`, `.git`, `.bat` gibi başka programların kendiliğinden çalıştırdığı dosyalar "hep izin ver" desen de her seferinde sorulur.

## Veritabanı

Bir sohbete veritabanı bağlarsın: **SQL Server, PostgreSQL, MySQL/MariaDB ya da SQLite.**

- Atlas tabloları, sütunları, görünümleri, saklı yordamları, tetikleyicileri ve zamanlanmış işleri görür; kodlarını okuyup açıklar.
- Sorunu Türkçe sorarsın ("Geçen ay en çok satan 10 ürün?"), sorguyu o yazar ve çalıştırır.
- **SELECT** sorguları onaysız çalışır. Veriyi ya da yapıyı değiştiren sorgular (INSERT, UPDATE, CREATE...) onay kartıyla sorulur.
- **DELETE, DROP ve TRUNCATE** hiçbir zaman çalıştırılmaz.
- Sağdaki panelde tablolara göz atar, kendi SELECT sorgunu yazar, nesnelerin kodunu görürsün. Sonucu kopyalar ya da CSV olarak kaydedersin; dosya Excel'de doğrudan açılır.
- Parolalar Windows'un güvenli deposunda şifreli saklanır; modele gönderilmez.

## Masaüstü

- **Alt+Boşluk**: her programın üstünde küçük bir soru penceresi açar.
- **Ctrl+Shift+Boşluk**: başka bir programda seçtiğin metni alır; düzelt, resmileştir, kısalt, çevir, özetle. "Yerine yaz" dersen sonuç seçili metnin yerine geçer.
- Pencereyi kapatınca Atlas sistem tepsisinde çalışmaya devam eder; istersen bilgisayar açılınca başlar.
- Uzun bir cevap biterken başka bir penceredeysen Windows bildirimi gelir.
- **Kilit**: şifre belirlersen Atlas açılışta, Windows kilitlenince ve bilgisayar boşta kalınca kilitlenir.
- **Bellek göstergesi**: hangi modelin ekran kartında durduğunu görür, oyun öncesi tek tıkla boşaltırsın.

## Kurulum ve güncelleme

- İlk açılışta bir sihirbaz bilgisayarını tarar, Ollama'yı kurar, donanımına uygun Atlas modelini önerir ve indirir.
- Arayüz Türkçe ve İngilizce.
- Yeni sürümler uygulamanın içinden indirilip kurulur.

Ayrıntılı kurulum: [Kurulum](kurulum.md).
