# Atlas model eğitimi

Bu klasör, Atlas modellerini eğitmek için kullanılan betikleri ve yapılan denemelerin sonuçlarını tutar.
Amaç: isteyen herkes aynı sonucu kendi bilgisayarında yeniden üretebilsin.

Atlas modelleri sıfırdan eğitilmez; açık bir taban modelin üzerine ince ayar (LoRA) yapılır.
Bir model, Atlas-TR ölçümünde (`eval/`) tabanından belirgin iyi değilse yayımlanmaz.

Betiklerdeki ve aşağıdaki iç adlar yayımlanan adlara şöyle karşılık gelir: Mini → Atlas Mini, Hafif → Atlas Light,
Orta → Atlas Medium, Güçlü → Atlas Strong, Code → Atlas Code.

`zincir.sh` çalışma klasörünü (taban/, veri/, cikti/, venv/) bulunduğun klasör sayar; `ATLAS_EGITIM`, `ATLAS_DEPO` ve
`ATLAS_OLCUM` değişkenleriyle değiştirilebilir.

## Betikler

| Dosya | Ne yapar |
| --- | --- |
| `veri_hazirla.py` | Türkçe Vikipedi cümlelerine sık yapılan yazım yanlışlarını kurallarla yerleştirir; eğitim, doğrulama ve test dosyalarını üretir. Ölçüm setindeki cümleleri dışarıda bırakır. |
| `egit.py` | Taban modele LoRA ile ince ayar yapar (yalnızca metin katmanları). |
| `birlestir.py` | LoRA ağırlıklarını taban modele işler. |
| `eksik_tamamla.py` | Birleştirme sırasında kaydedilmeyen katmanları (ör. `mtp`) tabandan tamamlar; GGUF dönüşümü bunları ister. |
| `olc_yazim.py` | Ayrılmış 300 cümlelik yazım testini bir Ollama modeline sorar, birebir eşleşmeyi sayar. |
| `genel_istem.py` | Yazım dışı işler için istemler üretir (özet, çeviri, sohbet, bilgi, talimat, akıl yürütme, resmi yazışma, kod). Ölçüm sorularını kullanmaz. |
| `genel_uret.py` | Bu istemleri bir öğretmen modele cevaplatır; yarıda kesilen ve yanlış sonuç veren cevapları atar. |
| `karistir.py` | Yazım örnekleriyle genel örnekleri tek eğitim kümesinde birleştirir. |
| `egit_gemma.py` | Gemma 4 tabanına QLoRA ile ince ayar yapar; 12 GB ekran kartına sığacak şekilde ayarlıdır. |
| `birlestir_dogrudan.py` | LoRA ağırlıklarını taban dosyasına yerinde işler; modeli belleğe yüklemez, hiçbir katman eksilmez. |
| `veri_hazirla2.py` | Yazım verisinin ikinci sürümü: cümle başına bir ile dört hata, kısa metinler, çeşitli istemler, "hangisi doğru" soruları. Zor testi (`test2`) de üretir. |
| `genel_istem_ek.py` | Az kalan türler (sohbet, kod) için ek istemler ekler. |

Adımlar (12 GB ekran kartı yeterli):

```bash
python veri_hazirla.py 12000
python egit.py taban/Qwen3.5-2B cikti/atlas-yazim-2b 1
python birlestir.py taban/Qwen3.5-2B cikti/atlas-yazim-2b/lora cikti/atlas-yazim-2b/birlesik
python eksik_tamamla.py taban/Qwen3.5-2B cikti/atlas-yazim-2b/birlesik
python llama.cpp/convert_hf_to_gguf.py cikti/atlas-yazim-2b/birlesik --outfile atlas-f16.gguf --outtype f16
llama-quantize atlas-f16.gguf atlas-Q4_K_M.gguf Q4_K_M
ollama create atlas-yazim-pilot:2b -f Modelfile
python olc_yazim.py atlas-yazim-pilot:2b
```

`Modelfile`, taban modelin tarifiyle aynıdır (`ollama show qwen3.5:2b --modelfile`); yalnızca ilk `FROM` satırı yeni GGUF dosyasını gösterir.

## Deneme 1: yazım düzeltme pilotu (11 Kasım 2026)

Amaç bir model yayımlamak değil, zinciri uçtan uca kurmaktı: veri, eğitim, birleştirme, GGUF, Ollama, ölçüm.

- Taban: `Qwen/Qwen3.5-2B` (Apache 2.0)
- Veri: 11.500 eğitim, 200 doğrulama, 300 test çifti. Kaynak cümleler Türkçe Vikipedi (CC BY-SA) ve elle yazılmış konuşma kalıpları.
  Kurallar: bağlaç de/da, bağlaç ki, ek olan -ki, soru eki, özel adlarda kesme işareti, sık karıştırılan kelimeler, Türkçe harfler, büyük harf ve nokta. Örneklerin yüzde 12'si zaten doğrudur.
- Eğitim: LoRA (r=16, alpha=32), 1 tur, 719 adım, öğrenme oranı 1e-4, RTX 5070 üzerinde 34 dakika. Doğrulama kaybı 0,31'den 0,014'e indi (`pilot-egitim-gunlugu.json`).
- Çıktı: 4 bit GGUF, 1,9 GB.

### Sonuç

Ayrılmış yazım testi (300 cümle, eğitimde görülmedi, birebir eşleşme):

| Model | Doğru | Yüzde |
| --- | ---: | ---: |
| qwen3.5:2b (taban) | 42 / 300 | 14,0 |
| atlas-yazim-pilot:2b | 269 / 300 | 89,7 |

Atlas-TR genel ölçümü (92 soru):

| Kategori | Taban | Pilot |
| --- | ---: | ---: |
| Yazım ve dil bilgisi | 64 | 64 |
| Talimata uyma | 90 | 65 |
| Doğal sohbet | 92 | 97 |
| Resmi yazışma | 98 | 92 |
| Akıl yürütme ve bilgi | 67 | 42 |
| Özetleme | 100 | 59 |
| Uzun cevap | 94 | 85 |
| Çeviri | 80 | 29 |
| İngilizce | 100 | 100 |
| Kod ve SQL | 80 | 71 |
| **Genel** | **87** | **70** |

### Ne öğrendik

- Zincir çalışıyor: 12 GB ekran kartında yarım saatte eğitilen model Ollama'da çalışıyor.
- Model öğretilen işi çok iyi öğrendi ama başka her şeyi düzeltme isteği sanmaya başladı: "kendini tanıt" denince cümleyi düzeltip geri veriyor. Çeviri, özet ve akıl yürütme puanları bu yüzden düştü. **Bu model yayımlanmaz.**
- Atlas-TR'deki yazım puanı değişmedi (64). O kategorideki soruların yarısı düzeltme değil (eş anlamlı, boşluk doldurma, atasözü) ve düzeltme sorularında model bazen yalnızca hatalı kelimeyi düzeltip cümlenin geri kalanına dokunuyor; ayrılmış testteki kazanç oraya taşınmadı. Sebebi ayrıca incelenmeli.
- Ayrılmış test, eğitim verisiyle aynı kurallarla üretildi. Yüzde 90, "bu kurallarla bozulmuş cümleleri düzeltir" demektir; gerçek insanların yazım hatalarında aynı sonucu vereceği anlamına gelmez.

## Deneme 2: Gemma 4 E4B, karışık veri (11 Kasım 2026)

İlk denemenin iki sorununu çözmek için iki şey değişti: taban ve veri.

- Taban: `google/gemma-4-E4B-it` (Apache 2.0). Atlas-TR'de 97 puanla en iyi iki modelden biri; Qwen 3.5 2B 87 idi.
- Veri: 7.510 örnek. 3.200'ü ilk denemedeki yazım çiftlerinden; 4.310'u genel örnek (çeviri 878, özet 641, akıl yürütme 639,
  cümle üzerinde başka işler 436, bilgi 427, İngilizce 364, talimat 353, sohbet 196, dil bilgisi 156, resmi yazışma 140, kod 80).
  Genel örneklerin cevaplarını taban modelin kendisi yazdı (`gemma4:e4b`); amaç yeni bilgi öğretmek değil, eski davranışı korumak.
  Sayısal sorularda cevabı yanlış olan örnekler atıldı.
- Eğitim: QLoRA (4 bit, r=16, alpha=32), 1 tur, 470 adım, RTX 5070'te 45 dakika. Doğrulama kaybı 0,58'den 0,12'ye indi (`tur2-egitim-gunlugu.json`).
- Çıktı: 4 bit GGUF, 5,3 GB.

```bash
python genel_istem.py
python genel_uret.py gemma4:e4b
python karistir.py 3200
python egit_gemma.py taban/gemma-4-E4B-it cikti/atlas-orta-yazim veri2 1
python birlestir_dogrudan.py taban/gemma-4-E4B-it cikti/atlas-orta-yazim/lora cikti/atlas-orta-yazim/birlesik
python llama.cpp/convert_hf_to_gguf.py cikti/atlas-orta-yazim/birlesik --outfile atlas-f16.gguf --outtype f16
llama-quantize atlas-f16.gguf atlas-Q4_K_M.gguf Q4_K_M
```

### Sonuç

Ayrılmış yazım testi (aynı 300 cümle):

| Model | Doğru | Yüzde |
| --- | ---: | ---: |
| gemma4:e4b (taban) | 194 / 300 | 64,7 |
| gemma4:12b | 197 / 300 | 65,7 |
| ince ayarlı E4B | 263 / 300 | 87,7 |

Atlas-TR genel ölçümü (92 soru):

| Kategori | Taban | İnce ayarlı |
| --- | ---: | ---: |
| Yazım ve dil bilgisi | 94 | 92 |
| Talimata uyma | 100 | 100 |
| Doğal sohbet | 100 | 94 |
| Resmi yazışma | 98 | 98 |
| Akıl yürütme ve bilgi | 83 | 83 |
| Özetleme | 100 | 100 |
| Uzun cevap | 100 | 100 |
| Çeviri | 97 | 97 |
| İngilizce | 100 | 94 |
| Kod ve SQL | 100 | 100 |
| **Genel** | **97** | **96** |

### Ne öğrendik

- Karışık veri işe yaradı: model yazım düzeltmeyi öğrendi (64,7 → 87,7) ve başka işleri unutmadı. İlk denemedeki çöküş (87 → 70) tekrarlanmadı.
- Genel puan 97,2'den 95,7'ye indi. Fark 92 sorunun beşinden geliyor: dördünde yarım puan kayıp, birinde yarım puan kazanç.
  Bu kadar küçük bir fark ölçümün gürültüsü içinde olabilir; ama "düşmedi" de denemez.
- Atlas-TR'deki yazım kategorisi yine yükselmedi (94 → 92). Model bir soruda "gelecekmisin" yanlışını düzeltmeden bıraktı.
  Ayrılmış testteki kazanç, ölçümdeki farklı biçimli yazım sorularına tam taşınmıyor.
- İki model aynı yoldan sıkıştırılmadı: taban Ollama'nın kendi dosyası, ince ayarlı model burada dönüştürüldü. Küçük farkların bir kısmı buradan gelebilir; taban da aynı zincirden geçirilip ölçülmeli.
- **Bu model henüz yayımlanmaz.** Yayım ölçütü, Atlas-TR'de tabandan belirgin iyi olmak; şu an yalnızca kendi yazım testimizde iyi.

## Deneme 3: çeşitlendirilmiş yazım verisi (11 Kasım 2026)

Taban yine `google/gemma-4-E4B-it`. Üç şey değişti:

- Yazım verisi gerçek hatalara yaklaştırıldı (`veri_hazirla2.py`): bir cümlede bir ile dört hata, iki üç cümlelik kısa metinler,
  on beş farklı istem biçimi, "hangisi doğru yazım" soruları. 2.592 yeni örnek + ilk sürümden 1.300 tek hatalı örnek.
- Sohbet ve kod örnekleri artırıldı; uzun cevaplar artık kesilmiyor (örnek başına 1.024 belirtece kadar). Genel örnek 5.063.
- Toplam 8.955 örnek, 560 adım, RTX 5070'te 57 dakika. Doğrulama kaybı 0,61'den 0,105'e indi (`tur3-egitim-gunlugu.json`).

```bash
python veri_hazirla2.py 2400
python genel_istem_ek.py
UZUNLUK=900 python genel_uret.py gemma4:e4b
python karistir.py 1300 veri3 1
python egit_gemma.py taban/gemma-4-E4B-it cikti/atlas-orta-tur3 veri3 1
```

Ayrıca adil karşılaştırma için taban model de aynı dönüştürme zincirinden geçirildi ("taban, aynı zincir").
Daha zor ikinci bir yazım testi kuruldu (`test2`: 187 metin, çoğunda birden çok hata; cümleleri eğitimde yok).

### Sonuç

| Model | Yazım testi (300) | Zor yazım testi (187) | Atlas-TR genel | Atlas-TR yazım |
| --- | ---: | ---: | ---: | ---: |
| gemma4:e4b (Ollama'nın dosyası) | 64,7 | ölçülmedi | 97,3 | 94 |
| taban, aynı zincir (Q4_K_M) | 67,0 | 51,3 | 94,9 | 92 |
| deneme 2 (Q4_K_M) | 87,7 | 72,2 | 95,7 | 92 |
| deneme 3 (Q4_K_M, 5,3 GB) | 89,3 | 83,4 | 96,3 | 97 |
| deneme 3 (Q5_K_M, 5,8 GB) | 88,0 | ölçülmedi | 96,6 | 100 |
| deneme 3 (Q6_K, 6,2 GB) | 88,0 | ölçülmedi | 97,2 | 100 |

### Ne öğrendik

- Aynı zincirle karşılaştırınca ince ayar genel puanı düşürmüyor, biraz yükseltiyor (94,9 → 96,3). Deneme 2'de görünen kayıp eğitimden değil, sıkıştırmadan geliyordu.
- Bizim dönüştürme zincirimiz, Ollama'nın kendi Gemma dosyasına göre yaklaşık 2 puan kaybettiriyor (97,3 → 94,9). Daha az sıkıştırınca (Q6_K) fark kapanıyor: 97,2.
- Yazım verisini çeşitlendirmek işe yaradı: zor testte 72,2 → 83,4, Atlas-TR yazım kategorisinde 92 → 97.
- Sonuç: deneme 3, genel ölçümde tabanla aynı düzeyde, yazım düzeltmede belirgin daha iyi. Atlas-TR genel puanında "tabandan belirgin iyi" değil; 92 soruluk ölçüm bu büyüklükteki farkları ayırt edemiyor.
- Yazım testleri kurallarla üretildi. Yüzde 89 ve 83, "bu kurallarla bozulmuş metinleri düzeltir" demektir; gerçek insanların yazdığı metinlerle ayrıca denenmeli.

### Sıradaki deneme

- Gerçek insanların yazdığı hatalı metinlerle küçük bir test kurmak (elle doğrulanmış).
- Ölçüm setini büyütmek: 92 soruda bir sorunun yarım puanı genel sonucu oynatıyor.
- Sıkıştırma kaybını azaltmak: Ollama'nın dosyasının neden daha iyi olduğunu bulmak (nicemleme ayarları).
- Aynı yöntemi Gemma 4 12B (Atlas Güçlü) için denemek.

## Öteki Atlas modelleri (aynı veriyle)

Atlas Orta'da işe yarayan veri (`veri3`: 8.955 örnek) öteki tabanlara da uygulandı. Zincirin tamamı tek betikte: `zincir.sh`
(eğitim, birleştirme, GGUF, sıkıştırma, Ollama modeli, iki yazım testi, Atlas-TR ölçümü).

```bash
bash zincir.sh mini  taban/Qwen3.5-2B qwen3.5:2b veri3 Q4_K_M 1
bash zincir.sh hafif taban/Qwen3.5-4B qwen3.5:4b veri3 Q4_K_M 1
EGIT=egit_gemma12.py bash zincir.sh guclu taban/gemma-4-12b-it gemma4:12b veri3 Q4_K_M 1
```

`egit_genel.py` Qwen ailesi içindir; `egit_gemma12.py` Gemma 4 12B'yi 4 bit yükleyip 12 GB ekran kartına sığdırır.

| Model | Yazım testi (300) | Zor yazım testi (187) | Atlas-TR genel | Karar |
| --- | ---: | ---: | ---: | --- |
| qwen3.5:2b (taban) | 14,0 | 12,3 | 87 | |
| Atlas Mini denemesi (Q4_K_M ve Q8_0) | 78,7 | 67,9 | 82 | Uygulamaya alınmadı |
| qwen3.5:4b (taban) | 35,3 | 25,1 | 90 | |
| Atlas Hafif denemesi (Q4_K_M, 2,8 GB) | 82,7 | 80,7 | 92 | Uygulamaya alındı (`atlas-hafif-agirlik:tur1`) |

- Hafif: yazım düzeltme çok iyileşti, genel puan düşmedi (90 → 92; bu fark ölçümün ayırt edebildiğinden küçük). Doğal sohbet ve resmi yazışma kategorilerinde birkaç puan geriledi (92 → 85, 96 → 91).
- Mini: yazım çok iyileşti ama genel puan 5 puan düştü. Q8_0 ile de aynı çıktı, yani kayıp sıkıştırmadan değil eğitimden. 2B'lik model bu kadar yazım verisiyle öteki becerilerinden veriyor; daha az yazım verisiyle ikinci tur gerekir.

### Atlas Güçlü (Gemma 4 12B)

12 GB ekran kartında 4 bit yükleyerek eğitildi: yarım tur (262 adım), 512 belirteçten kısa örnekler, yaklaşık 10 saat.
22 GB'lık tek parça taban dosyası Windows'ta açılamadığı için önce `parcala.py` ile parçalara bölündü.

| Model | Yazım testi (300) | Zor yazım testi (187) | Atlas-TR genel | Karar |
| --- | ---: | ---: | ---: | --- |
| gemma4:12b (taban) | 65,7 | 64,2 | 98 | |
| ilk eğitim (Q4_K_M) | 0 | 0 | 38 | Bozuk, aşağıya bakın |
| ek eğitimden sonra (Q4_K_M, 7,4 GB) | 84,3 | 86,6 | 96 | |
| ek eğitimden sonra (Q5_K_M, 8,5 GB) | 85,0 | ölçülmedi | 98 | Uygulamaya alındı (`atlas-guclu-agirlik:tur1`) |

Ders: Gemma 4 12B'nin sohbet şablonu, düşünme kapalıyken cevabın başına boş bir düşünme kanalı koyar
(`<|channel>thought\n<channel|>`). Ollama bu kanalı isteme koymaz; modelin kendisinin yazmasını bekler. İlk eğitimde
kanal istem tarafında (kayba katılmayan kısımda) bırakılmıştı: model kanalı açıp kapatmamayı öğrendi, Ollama bütün
cevabı düşünme sayıp gizledi. Kanal cevap tarafına alınıp mevcut LoRA üzerinden 30 adımlık ek eğitim yapılınca düzeldi
(`DEVAM=<lora klasörü> LR=5e-5`). Q4_K_M'de genel puan 2 puan düşük kaldı, Q5_K_M'de tabanla aynı.

### Atlas Mini, ikinci ve üçüncü tur

Yazım verisi 3.892'den 1.400 örneğe indirildi (`veri4`: 6.463 örnek). Sonuç daha iyi olmadı:

| Model | Yazım testi (300) | Zor yazım testi (187) | Atlas-TR genel |
| --- | ---: | ---: | ---: |
| qwen3.5:2b (Ollama'nın dosyası) | 14,0 | 12,3 | 87 |
| taban, aynı zincir (Q8_0) | ölçülmedi | ölçülmedi | 87 |
| birinci tur (Q8_0) | 78,7 | 67,9 | 82 |
| ikinci tur (Q8_0) | 71,0 | 61,0 | 80 |
| üçüncü tur (`LR=3e-5 R=8`, `veri3`) | 71,0 | 58,8 | 84 |

Taban aynı zincirden geçince puanı değişmiyor; yani kayıp dönüştürmeden değil eğitimden. Yazım verisini azaltmak da
kaybı gidermedi. Üçüncü turda öğrenme hızı ve LoRA sırası düşürüldü: kayıp azaldı (87 → 84) ama taban yine geçilemedi,
resmi yazışma kategorisi 98'den 78'e düştü. 2B'lik model bu veriyle (Gemma E4B'nin yazdığı cevaplar) genel becerilerinden
veriyor; Atlas Mini taban modelle bırakıldı. Denenmemiş yol: yalnızca yazım görevine özel küçük veri.

### Atlas Code (Qwen2.5-Coder 14B)

`METIN=1 DORT_BIT=1 MAX_TOKEN=512 bash zincir.sh code taban/Qwen2.5-Coder-14B-Instruct qwen2.5-coder:14b veri4 Q4_K_M 1`
(362 adım, yaklaşık 1 saat 45 dakika).

| Model | Yazım testi (300) | Zor yazım testi (187) | Atlas-TR genel | Kod ve SQL | Çeviri |
| --- | ---: | ---: | ---: | ---: | ---: |
| qwen2.5-coder:14b (taban) | 31,7 | 26,7 | 92 | 98 | 100 |
| Atlas Code denemesi (Q4_K_M, 9,0 GB) | 77,0 | 62,6 | 91 | 98 | 83 |

Kod puanı değişmedi, yazım belirgin iyileşti, çeviri kategorisi geriledi (100 → 83). Uygulamaya alındı (`atlas-code-agirlik:tur1`).
