# Atlas modelleri nasıl eğitildi?

Bu sayfa, Atlas modellerinin nasıl üretildiğini baştan sona anlatıyor: veri, yöntem, donanım, sonuçlar ve işe yaramayan denemeler. Betiklerin tamamı [`training/`](../training) klasöründe; isteyen aynı sonucu kendi bilgisayarında yeniden üretebilir.

## Sıfırdan değil, ince ayarla

Bir dil modelini sıfırdan eğitmek binlerce ekran kartı ve aylar ister. Atlas modelleri bunun yerine **ince ayar (fine-tuning)** ile üretildi: açık lisanslı, zaten güçlü bir taban modelin üzerine Türkçe için ek eğitim yapıldı.

Tabanları seçmek için önce on açık modeli kendi ölçümümüzle ([Atlas-TR](olcum.md)) karşılaştırdık. Türkçe için özel eğitilmiş açık modeller de dahildi. En iyi sonucu Google'ın Gemma 4 ailesi verdi (97 puan); küçük boyutlarda Qwen 3.5 öne çıktı.

| Atlas modeli | Taban | Lisans |
| --- | --- | --- |
| Light | `Qwen/Qwen3.5-4B` | Apache 2.0 |
| Medium | `google/gemma-4-E4B-it` | Apache 2.0 |
| Strong | `google/gemma-4-12b-it` | Apache 2.0 |
| Code | `Qwen/Qwen2.5-Coder-14B-Instruct` | Apache 2.0 |

## Neyi öğrettik?

Ölçümde en zayıf kalan konu **Türkçe yazım düzeltme** idi. Taban modeller "yarın ankaraya gidicem sende gelirmisin" gibi bir cümleyi çoğu zaman yarım yamalak düzeltiyor; "de/da" ve "ki" ayrımını, özel adlardaki kesme işaretini, soru ekini karıştırıyordu.

Hedef iki şeydi:

1. Yazım düzeltmeyi belirgin şekilde iyileştirmek.
2. Bunu yaparken modelin başka işlerdeki becerisini **bozmamak**.

İkincisi birincisi kadar önemli, çünkü ilk denememizde tam olarak bu oldu (aşağıda).

## Veri

Eğitim kümesi iki parçadan oluşuyor.

**Yazım örnekleri (yaklaşık 3.900).** Türkçe Vikipedi cümlelerine (CC BY-SA) ve elle yazılmış günlük konuşma kalıplarına, Türkçede sık yapılan yazım yanlışları kurallarla yerleştirildi:

- bağlaç "de/da" ve "ki"nin bitişik yazılması, ek olan "-ki"nin ayrılması
- soru eki "mi"nin bitişik yazılması
- özel adlarda kesme işaretinin unutulması
- sık karıştırılan kelimeler (herkez, birşey, yalnış...)
- Türkçe harflerin yerine İngilizce harfler (ı → i, ş → s...)
- büyük harf ve nokta hataları

Bir cümlede bir ile dört hata, iki üç cümlelik kısa metinler, on beş farklı istek biçimi ("şunu düzelt", "yazım hatalarını gider", "hangisi doğru yazılır?") kullanıldı. Örneklerin bir kısmı zaten doğruydu; model doğru metne dokunmamayı da öğrensin diye.

**Genel örnekler (yaklaşık 5.000).** Özet, çeviri, akıl yürütme, bilgi, sohbet, resmi yazışma, talimata uyma, kod ve İngilizce istekleri. Bunların cevaplarını bir "öğretmen" model (Gemma 4 E4B) yazdı; yarıda kesilen ve sayısal sonucu yanlış olan cevaplar atıldı. Amaç modele yeni bilgi öğretmek değil, eski davranışını korumaktı.

Toplam **8.955 örnek**. Ölçüm setindeki hiçbir soru ve test cümlesi eğitime girmedi.

## Yöntem ve donanım

- **LoRA / QLoRA**: modelin bütün ağırlıkları yerine küçük ek katmanlar eğitildi (r=16, alpha=32, öğrenme oranı 1e-4). Büyük modeller 4 bite sıkıştırılarak yüklendi.
- Kayıp yalnızca cevap kısmından hesaplandı; model istemi ezberlemedi, cevap vermeyi öğrendi.
- **Donanım**: tek bir ev bilgisayarı. NVIDIA RTX 5070 (12 GB), 32 GB bellek.
- **Süreler**: Atlas Medium 57 dakika, Atlas Code yaklaşık 1 saat 45 dakika, Atlas Strong yaklaşık 10 saat.

Eğitimden sonraki zincir:

1. LoRA ağırlıklarının taban modele işlenmesi (model belleğe yüklenmeden, doğrudan dosya üzerinde)
2. llama.cpp ile GGUF biçimine dönüştürme
3. Sıkıştırma (Q4_K_M, Q5_K_M ya da Q6_K)
4. Ollama modeli oluşturma
5. Yazım testleri ve Atlas-TR ölçümü

Bütün bu adımlar tek bir betikte: [`training/zincir.sh`](../training/zincir.sh).

## Sonuçlar

| Model | Yazım testi (300 cümle) | Zor yazım testi (187 metin) | Atlas-TR genel |
| --- | ---: | ---: | ---: |
| Qwen 3.5 4B (taban) | %35,3 | %25,1 | 90 |
| **Atlas Light** | **%82,7** | **%80,7** | 92 |
| Gemma 4 E4B (taban) | %64,7 | %51,3 | 97 |
| **Atlas Medium** | **%88,0** | **%83,4** | 97 |
| Gemma 4 12B (taban) | %65,7 | %64,2 | 98 |
| **Atlas Strong** | **%85,0** | **%86,6** | 98 |
| Qwen2.5-Coder 14B (taban) | %31,7 | %26,7 | 92 |
| **Atlas Code** | **%77,0** | **%62,6** | 91 |

Medium ve Strong'un zor yazım testi ile tabanların zor test puanları, aynı dönüştürme zincirinden geçmiş Q4 dosyalarında ölçüldü; diğer puanlar yayımlanan dosyalara ait.

Yazım düzeltme bütün modellerde büyük ölçüde iyileşti; genel puanlar yerinde kaldı. Ham sonuçlar ve her denemenin günlüğü [`training/README.md`](../training/README.md) dosyasında.

## İşe yaramayanlar

Başarısız denemeleri de yazıyoruz, çünkü asıl ders onlarda.

**İlk deneme: tek konulu veri modeli bozdu.** Qwen 3.5 2B'ye yalnızca yazım düzeltme örnekleri verdik. Yazım testinde %14'ten %90'a çıktı, ama genel ölçümde 87'den 70'e düştü: model her isteği cümle düzeltme sanmaya başladı. "Kendini tanıt" denince cümleyi düzeltip geri veriyordu. Bu yüzden veriye genel örnekler ekledik.

**Atlas Mini ince ayarsız kaldı.** 2 milyar parametrelik model üç farklı denemede de (daha az yazım verisi, daha düşük öğrenme oranı) yazımı öğrenirken başka becerilerinden 3 ile 7 puan kaybetti. Ölçütümüz açık: tabanından kötü olan model yayımlanmaz. Mini şimdilik taban modelle çalışıyor.

**Atlas Strong'un ilk eğitimi bozuk çıktı.** Gemma 4 12B'nin sohbet şablonu, düşünme kapalıyken cevabın başına boş bir "düşünme" bölümü koyuyor. Eğitimde bu bölümü yanlış tarafta bıraktık; model bölümü açıp kapatmamayı öğrendi ve Ollama bütün cevabı "düşünce" sanıp gizledi. Ölçümde genel puan 38'e düştü. Şablonu düzeltip mevcut eğitimin üzerine 30 adımlık kısa bir ek eğitimle sorunu giderdik.

**Sıkıştırma puan kaybettiriyor.** Bizim dönüştürme zincirimiz, Ollama'nın kendi dosyalarına göre yaklaşık 2 puan kaybettiriyordu. Biraz daha az sıkıştırınca (Q4 yerine Q5 ve Q6) fark kapandı; bu yüzden Medium ve Strong biraz daha büyük dosyalarla yayımlandı.

**22 GB'lık dosya Windows'ta açılmadı.** Gemma 4 12B'nin tek parça ağırlık dosyası Windows'un sanal bellek sınırına takıldı. Dosyayı belleğe yüklemeden parçalara bölen küçük bir araç yazdık ([`training/parcala.py`](../training/parcala.py)).

## Sınırlar

- Yazım testleri kurallarla üretildi. %85, "bu kurallarla bozulmuş cümleleri düzeltiyor" demek; gerçek insanların hatalarında sonuç farklı olabilir. Elle doğrulanmış gerçek metinlerden bir test hazırlıyoruz.
- Atlas-TR 92 sorudan oluşuyor; 1-2 puanlık farkları güvenilir şekilde ayırt edemiyor. Ölçümü büyütmek yol haritamızda.
- Modellere yeni bilgi öğretilmedi. Bilgi seviyeleri tabanlarınınki kadar.

## Kendin dene

```bash
cd training
python veri_hazirla2.py 2400          # yazım verisi
python genel_istem.py && python genel_uret.py gemma4:e4b   # genel örnekler
python karistir.py 1300 veri3 1       # iki kümeyi birleştir
bash zincir.sh orta taban/gemma-4-E4B-it gemma4:e4b veri3 Q6_K 1
```

Gerekenler: Python 3.11+, PyTorch (CUDA), `transformers`, `peft`, `bitsandbytes`, llama.cpp ve Ollama. Ayrıntılı açıklamalar [`training/README.md`](../training/README.md) dosyasında.
