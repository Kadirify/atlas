# Atlas modelleri

Atlas yalnızca kendi model ailesiyle çalışır. Her model, açık lisanslı bir taban modelin Türkçe için ince ayar yapılmış hâlidir.

| Model | Taban | Boyut | Kimin için | Ollama | Hugging Face |
| --- | --- | ---: | --- | --- | --- |
| **Atlas Light** | Qwen 3.5 4B | 3,5 GB | Çoğu dizüstü; günlük sohbet, e-posta, özet | [`kadirify/atlas-light`](https://ollama.com/kadirify/atlas-light) | [atlas-light-GGUF](https://huggingface.co/kadirify/atlas-light-GGUF) |
| **Atlas Medium** | Gemma 4 E4B | 7,3 GB | 8 GB ekran kartı; en dengeli seçenek, resimleri de anlar | [`kadirify/atlas-medium`](https://ollama.com/kadirify/atlas-medium) | [atlas-medium-GGUF](https://huggingface.co/kadirify/atlas-medium-GGUF) |
| **Atlas Strong** | Gemma 4 12B | 9,2 GB | 12 GB ve üstü ekran kartı; resmi yazışma, uzun metin, akıl yürütme | [`kadirify/atlas-strong`](https://ollama.com/kadirify/atlas-strong) | [atlas-strong-GGUF](https://huggingface.co/kadirify/atlas-strong-GGUF) |
| **Atlas Code** | Qwen2.5-Coder 14B | 9,0 GB | Yazılım: kod, hata ayıklama, SQL (MSSQL dahil) | [`kadirify/atlas-code`](https://ollama.com/kadirify/atlas-code) | [atlas-code-GGUF](https://huggingface.co/kadirify/atlas-code-GGUF) |
| **Atlas Mini** | Qwen 3.5 2B | 2,7 GB | Ekran kartı olmayan, 8 GB bellekli bilgisayarlar | taban modelle çalışır | — |

Atlas Mini için ince ayar denendi ama genel becerilerini düşürdüğü için yayımlanmadı; şimdilik taban modelle ve Atlas ayarlarıyla çalışıyor. Ayrıntı: [eğitim sayfası](egitim.md).

## Ölçüm sonuçları

İki tür ölçüm kullanıyoruz:

- **Yazım testi**: kurallarla bozulmuş 300 Türkçe cümle; modelin cümleyi birebir doğru hâline getirip getirmediği sayılır. Cümlelerin hiçbiri eğitimde görülmedi.
- **Atlas-TR**: 10 kategoride 92 soruluk genel Türkçe ölçüm (yazım, talimata uyma, sohbet, resmi yazışma, akıl yürütme, özet, uzun cevap, çeviri, İngilizce, kod). Ayrıntı: [Atlas-TR ölçümü](olcum.md).

| Model | Yazım testi: taban → Atlas | Atlas-TR genel: taban → Atlas |
| --- | ---: | ---: |
| Atlas Light | %35 → **%83** | 90 → 92 |
| Atlas Medium | %65 → **%88** | 97 → 97 |
| Atlas Strong | %66 → **%85** | 98 → 98 |
| Atlas Code | %32 → **%77** | 92 → 91 (kod ve SQL: 98 → 98) |

Kısaca: ince ayar, modellerin genel becerisini korurken Türkçe yazım düzeltmeyi belirgin şekilde iyileştirdi.

Bilinen zayıflıklar:

- Atlas Code'un çeviri puanı düştü (100 → 83). Kod ve SQL'de tabanıyla aynı, genel sohbet için diğer modeller daha uygun.
- Atlas Light'ın doğal sohbet ve resmi yazışma puanları birkaç puan geriledi.
- Yazım testi kurallarla üretildi; gerçek insanların yazdığı hatalı metinlerde sonuç farklı olabilir. Bu yüzden elle doğrulanmış gerçek metinlerden bir test hazırlıyoruz.

## Kod alanında hangisi?

Kod alanında model dosya okur, düzenler, test çalıştırır ve veritabanına sorgu gönderir. Bunu ayrı bir test setiyle ölçüyoruz ([eval/ajan](../eval/ajan/README.md)): 54 küçük görev (hatayı bulup düzeltmek, dosyalar arasında ad değiştirmek, silme isteğini geri çevirmek, tetikleyiciyi okuyup açıklamak...). Son tam ölçüm (15 Kasım 2026, RTX 5070, her görev üç kez):

| Model | Başarı | Kod | Okuma | Güvenlik | Komut | SQL | Görev başına süre |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Atlas Strong** | 141/162 (%87) | 47/57 | 15/18 | 30/33 | 17/18 | 32/36 | 10 sn |

Atlas Strong'un takıldığı yerler: çok uzun bir dosyada bir şeyi saymak (yalnızca baş kısmına bakıyor), `package.json` gibi ayar dosyalarına ekleme yaparken var olan ayarı silmek ve birkaç dosyayı birden değiştiren işlerin bir kısmı. Her denemenin ayrıntısı: [RESULTS.md](../eval/ajan/RESULTS.md).

Atlas Code bu 54 görevlik setle henüz baştan sona ölçülmedi. Önceki, 28 görevlik ve tek denemeli ölçümde (13 Kasım) Atlas Strong 26/28, Atlas Code 18/28 almıştı; görev başına süre Atlas Strong'da 6, Atlas Code'da 38 saniyeydi.

Kod alanı bu yüzden **Atlas Strong** kuruluysa onunla açılır (yoksa Atlas Code, o da yoksa Atlas Medium); istersen sohbetin model seçicisinden değiştirebilirsin. Atlas Code kod yazma ve SQL sorularında iyi (Atlas-TR kod puanı 98), ama araç kullanırken sık takılıyor ve 12 GB ekran kartına tam sığmadığı için yavaş. Bir sonraki eğitim turu bunu hedefliyor.

## Modelleri Atlas dışında kullanmak

Modeller Ollama ile her yerde çalışır:

```bash
ollama run kadirify/atlas-strong
```

Hugging Face'teki GGUF dosyaları llama.cpp, LM Studio ve benzeri araçlarla da kullanılabilir.

## Lisanslar

| Model | Taban modelin lisansı |
| --- | --- |
| Atlas Light, Atlas Mini | Qwen 3.5: Apache 2.0 |
| Atlas Medium, Atlas Strong | Gemma 4: Apache 2.0 |
| Atlas Code | Qwen2.5-Coder: Apache 2.0 |

Atlas modelleri de aynı lisansla ([Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)) yayımlanır. Taban modellerin geliştiricilerine teşekkür ederiz: Google DeepMind (Gemma) ve Alibaba Qwen ekibi.

- **Değişiklik bildirimi:** Atlas modelleri taban modellerin kendisi değildir; taban modelin ağırlıkları Türkçe yazım düzeltme verisiyle ince ayarlanarak (LoRA) değiştirilmiş ve yeniden paketlenmiştir. Hangi tabandan türedikleri [Nasıl eğitildi?](egitim.md) sayfasındaki tabloda yazar.
- **Kullanırken:** Apache 2.0, modeli ticari işler dahil serbestçe kullanmana, değiştirmene ve dağıtmana izin verir. Yeniden dağıtırsan lisans metnini ve bu değişiklik bildirimini yanında bulundurman gerekir. Model hiçbir garanti olmadan sunulur; çıktılarından sen sorumlusun.
- **Eğitim verisi:** yazım örneklerindeki cümlelerin bir kısmı Türkçe Vikipedi'den alınmıştır ([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.tr), Vikipedi katkıcıları); cümlelere yazım yanlışları kurallarla yerleştirilmiştir.
