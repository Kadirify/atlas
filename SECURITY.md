# Güvenlik / Security

## Açık bildirmek

Atlas'ta bir güvenlik açığı bulduysan lütfen herkese açık bir issue açma. GitHub'ın **Security → Report a vulnerability** düğmesiyle özel olarak bildir. Bildirimde şunlar olsun:

- Atlas sürümü (Ayarlar → Hakkında) ve Windows sürümü
- Açığı yeniden üretmek için adımlar ya da örnek (örnek SQL, komut, belge)
- Neye yol açtığı: veri kaybı, onaysız işlem, verinin dışarı çıkması...

Bildirimleri okuyup en kısa sürede dönüş yapmaya çalışıyoruz. Düzeltme yayımlanana kadar ayrıntıları paylaşmamanı rica ederiz.

## Kapsam

Özellikle önemsediğimiz konular:

- Atlas'ın onaysız yazma, silme ya da komut çalıştırması (SQL süzgecini ya da komut süzgecini atlatmak)
- Bağlanan klasörün dışına çıkmak
- Kullanıcı verisinin bilgisayardan dışarı çıkması
- Güncelleme ya da kurulum sürecinin kötüye kullanılması

Atlas'ın neyi garanti ettiği ve etmediği: [docs/gizlilik-ve-guvenlik.md](docs/gizlilik-ve-guvenlik.md)

---

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's **Security → Report a vulnerability** to report privately, with the Atlas and Windows versions, steps or a sample to reproduce, and the impact. Please keep details private until a fix is released.
