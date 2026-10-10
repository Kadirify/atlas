# Değişiklikler

## Yayımlanmamış

### Güvenlik
- SQL sorguları bağlı veritabanının kendi yazım kurallarıyla inceleniyor; okuma gibi görünen hileli bir sorgu artık yazma ya da silme çalıştıramıyor. PostgreSQL okumaları tek ifadeye zorlanıyor.
- Komut süzgeci gizleme hilelerini (`r^d`, `%windir:~0,0%rd`, `type nul>dosya`) yakalıyor; PowerShell ve betik çalıştırıcıları kapalı.
- Komutlar cmd.exe'nin tam yoluyla çalışıyor; proje klasöründeki `git.bat` gibi bir dosya PATH'teki programın yerine geçemiyor.
- `package.json`, `.git`, `.vscode`, `.bat` gibi dosyalar "hep izin ver" olsa da her seferinde soruluyor.
- `.env` ve anahtar dosyaları modele okutulmuyor; klasör sınırını aşan Windows yol hileleri reddediliyor.
- Model cevaplarındaki resimler dışarıdaki sunuculardan yüklenmiyor; Word önizlemesi gömülü HTML'i çizmiyor.
- Yanlış PIN sayacı yeniden başlatınca sıfırlanmıyor.

### Düzeltmeler
- UTF-8 olmayan dosyalar düzenlenince bozulmuyor; onay beklerken değişen dosyanın üstüne yazılmıyor.
- Geri alma taşımayı da kapsıyor, sonradan değişen dosyayı ezmiyor, yarıda hata olursa kaydı kaybetmiyor.
- Durdur, izin verilmiş işlemleri, komutları ve veritabanı sorgularını gerçekten durduruyor.
- Kod alanında model aracı düz metin olarak yazınca iş artık yarıda kalmıyor.
- Düzgün bir düzenlemeden sonra modelin aynı dosyanın üstüne parça yazmaya yönlendirilmesi düzeltildi.
- Araçlı sohbetlerde bağlam sessizce taşmıyor; model her turda yeniden yüklenmiyor.
- Esc yalnızca mesaj kutusundayken cevabı durduruyor.
- "Yanda göster" algılayıcısı sıradan mesajları yutmuyor.
- Yazılan taslak ve ekler başka sohbete taşınmıyor.
- Dar pencerede başlık ve yan paneller sığıyor; ikincil metinler okunaklı.
- Arama büyük "I" harfinde de buluyor.
- Veritabanı açılamazsa uygulama asılı kalmıyor, ne olduğunu söylüyor.

### Diğer
- Kod alanı artık Atlas Strong kuruluysa onunla açılıyor (yoksa Atlas Code, o da yoksa Medium); ajan test setinde kod alanında en başarılı ve en hızlı model.
- Ajan test seti (`npm run eval:ajan`): 28 görevle kod alanı ve veritabanı sohbetlerinde gerçek modelin iş bitirip bitirmediğini ölçer.
- `.env` gibi gizli dosyaların adı geçen komutlar (`type .env`) da çalıştırılmıyor.
- Kurulum dosyası küçüldü: kullanılmayan paketler, kaynak haritaları ve fazla dil dosyaları çıkarıldı.
- Kurulum dosyasının adı `Atlas-Setup-x.y.z.exe`.

## 0.1.0

İlk sürüm: sohbet, belgeler (PDF, Word, Excel), mini uygulamalar, kod alanı, SQL Server / PostgreSQL / MySQL / SQLite bağlantıları, masaüstü kısayolları ve Atlas model ailesi (Light, Medium, Strong, Code).
