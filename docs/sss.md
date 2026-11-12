# Sık sorulan sorular

**Atlas gerçekten internete hiç çıkmıyor mu?**
Sohbetlerin, dosyaların ve soruların hiçbir sunucuya gitmez. Atlas yalnızca iki durumda internete çıkar: kurulumda Ollama'yı ve modeli indirirken, ve sen "Güncellemeleri denetle" düğmesine bastığında GitHub'daki sürümlere bakarken. İkisinde de seninle ilgili hiçbir bilgi gönderilmez. Ayrıntı: [Gizlilik ve güvenlik](gizlilik-ve-guvenlik.md).

**ChatGPT ya da Claude'dan farkı ne?**
Onlar bulutta çalışan çok daha büyük modeller; karmaşık işlerde Atlas'tan güçlüler. Atlas'ın farkı verinin bilgisayarında kalması, internetsiz ve ücretsiz çalışması, Türkçe için ayrıca eğitilmiş olması ve dosyalarınla, veritabanınla doğrudan çalışabilmesi. Şirket verisini buluta yapıştıramadığın işler için yapıldı.

**Ücretli mi?**
Hayır. Atlas ve modelleri tamamen ücretsiz ve açık kaynak (uygulama MIT, modeller Apache 2.0 lisanslı).

**Ekran kartım yok, çalışır mı?**
Çalışır ama yavaş olur. Ekran kartı olmayan 8 GB bellekli bir bilgisayarda Atlas Mini, 16 GB bellekte Atlas Light önerilir. Kurulum sihirbazı bilgisayarını tarayıp uygun modeli seçer.

**AMD ya da Intel ekran kartıyla çalışır mı?**
Modelleri Ollama çalıştırıyor; Ollama'nın desteklediği kartlarda (yeni AMD kartlar dahil) çalışır. En iyi deneyim NVIDIA kartlarda.

**Mac ya da Linux sürümü var mı?**
Şimdilik yalnızca Windows. Sistem tepsisi, kısayollar ve seçili metinle çalışma gibi özellikler Windows'a özel yazıldı; diğer sistemler yol haritamızda.

**Atlas'ın modeli sıfırdan mı eğitildi?**
Hayır. Gemma 4 ve Qwen gibi açık modellerin üzerine Türkçe için ince ayar yapıldı. Nasıl yapıldığını [Atlas modelleri nasıl eğitildi?](egitim.md) sayfasında bütün ayrıntısıyla anlattık.

**Atlas dosyalarımı silebilir mi?**
Atlas'ın silme aracı yoktur: dosya silmez, bilinen silme komutlarını çalıştırmaz, veritabanında DELETE, DROP ve TRUNCATE çalıştırmaz. Dosyaları değiştirmeden önce farkı gösterip onayını ister; bir cevapta yaptığı değişiklikleri tek düğmeyle geri alırsın. Tek sınır komutlar: onayladığın bir komut (ör. `npm test`) projedeki dosyaları çalıştırır ve Atlas o dosyaların içinde ne olduğunu bilemez. Bu yüzden önemli projelerde git gibi bir sürüm kontrolü kullanmanı öneririz. Ayrıntı: [Gizlilik ve güvenlik](gizlilik-ve-guvenlik.md).

**Veritabanıma bağlamak güvenli mi?**
Atlas SELECT sorgularını onaysız çalıştırır, veriyi değiştiren her sorgu için onay kartı gösterir, silme sorgularını hiç çalıştırmaz. Parolan Windows'un güvenli deposunda şifrelenir. Üretim veritabanına bağlanacaksan, yalnızca okuma yetkisi olan bir kullanıcıyla bağlanmanı öneririz.

**Hangi dilleri biliyor?**
Arayüz Türkçe ve İngilizce. Modeller başka dillerde de konuşabilir ama özellikle Türkçe ve İngilizce için ayarlandı.

**Sohbetlerimi yedekleyebilir miyim?**
Bütün verin tek bir dosyada: `%APPDATA%\Atlas Asistan\atlas.db`. Atlas kapalıyken bu dosyayı kopyalaman yeterli. Sohbetleri tek tek Word, PDF ya da Markdown olarak da kaydedebilirsin.

**Şifremi unuttum, kilidi nasıl açarım?**
Şifre hiçbir yerde açık olarak saklanmadığı için kurtarılamıyor. Atlas'ı kapatıp `%APPDATA%\Atlas Asistan\atlas.db` dosyasını silersen kilit kalkar ama bütün sohbetlerin de gider.

**Bir hata buldum, nereye bildireyim?**
GitHub'daki [Issues](https://github.com/Kadirify/atlas/issues) sayfasına. Ayarlar → Hakkında'daki sürüm numarasını ve hatanın nasıl oluştuğunu yazarsan çok yardımcı olur.
