# Atlas-TR ölçümü

Atlas modellerini seçmek ve eğitimin işe yarayıp yaramadığını görmek için küçük bir Türkçe ölçüm seti hazırladık: **Atlas-TR**. Sorular, puanlama kuralları ve sonuçlar [`eval/`](../eval) klasöründe.

## Ne ölçüyor?

92 soru, 10 kategori:

| Kategori | Soru | Ne bakılıyor |
| --- | ---: | --- |
| Yazım ve dil bilgisi | 18 | Yazım hatası düzeltme, doğru yazımı seçme, eş anlamlı, boşluk doldurma |
| Talimata uyma | 14 | "Üç madde yaz", "50 kelimeyi geçme", "yalnızca JSON ver" gibi kurallara uyuyor mu |
| Akıl yürütme ve bilgi | 12 | Hesap, mantık, genel bilgi |
| Doğal sohbet | 8 | Türkçe cevap veriyor mu, kısa ve doğal mı, dil karışıyor mu |
| Resmi yazışma | 8 | Dilekçe, e-posta, resmi yazı biçimi ve hitap |
| İngilizce | 8 | İngilizce soruya İngilizce ve doğru cevap |
| Kod ve SQL | 8 | Beklenen yapıda kod ve SQL (MSSQL dahil) |
| Özetleme ve metne bağlılık | 6 | Özet metinde olmayan bilgi uyduruyor mu |
| Çeviri | 6 | Türkçe ↔ İngilizce, anlam ve terim doğruluğu |
| Uzun cevap ve tekrar etmeme | 4 | Uzun metinde aynı cümleyi tekrar ediyor mu |

## Nasıl puanlanıyor?

Her soruya otomatik kurallarla puan verilir: beklenen kelimeler ve yapılar geçiyor mu (örneğin SQL sorusunda `TOP 5`, `GROUP BY`, `ORDER BY ... DESC`), istenen biçimde mi, dil doğru mu, uzunluk sınırına uyuyor mu, yasak bir kalıp var mı... Kod çalıştırılmaz; yazılan kodun beklenen yapıları içerip içermediğine bakılır. Hakem olarak başka bir yapay zeka kullanılmaz. Böylece:

- Aynı cevap her seferinde aynı puanı alır.
- Herkes ölçümü kendi bilgisayarında yeniden üretebilir.

Puanlar 100 üzerinden. "Genel", kategorilerin ortalaması.

## Sonuçlar

Taban model seçimi için ölçülen açık modeller:

| Model | Genel | Türkçe | Yazım | Kod ve SQL | Hız (token/sn) |
| --- | ---: | ---: | ---: | ---: | ---: |
| gemma4:12b | 97 | 98 | 100 | 95 | 125 |
| gemma4:e4b | 97 | 97 | 94 | 100 | 187 |
| qwen3.5:9b | 93 | 92 | 86 | 95 | 97 |
| qwen2.5-coder:14b | 92 | 90 | 61 | 98 | 64 |
| qwen3.5:4b | 90 | 89 | 75 | 100 | 146 |
| alibayram/turkish-gemma-9b-v0.1 | 89 | 93 | 92 | 95 | 91 |
| yunusemrejs/turkish-qwen-4b-v1 | 87 | 84 | 36 | 100 | 168 |
| qwen3.5:2b | 87 | 86 | 64 | 80 | 201 |
| qwen2.5-coder:7b | 83 | 80 | 50 | 91 | 122 |
| alibayram/kumru | 57 | 60 | 53 | 34 | 328 |

Hızlar RTX 5070 (12 GB) üzerinde ölçüldü. Bütün kategoriler: [`eval/RESULTS.md`](../eval/RESULTS.md). Atlas modellerinin tabanlarıyla karşılaştırması: [Atlas modelleri](modeller.md).

## Yeniden üretmek

[Ollama](https://ollama.com) kuruluyken:

```bash
node eval/run.mjs --models "gemma4:e4b,kadirify/atlas-medium"
```

Her model için `eval/results/<model>.json` yazılır ve `eval/RESULTS.md` yeniden üretilir.

## Sınırlar

- **Küçük bir set.** 92 soruda bir sorudaki yarım puan genel sonucu oynatabiliyor; 1-2 puanlık farklar anlamlı değil. Seti en az 300 soruya çıkarmak yol haritamızda.
- **Kurallar her şeyi yakalamaz.** Üslup, ton ve "doğal" Türkçe gibi öznel nitelikleri kurallarla ölçmek zor.
- **Tek seferlik çalıştırma.** Her soru bir kez soruluyor; modelin rastgeleliği küçük oynamalara yol açabilir.

Bu yüzden ölçümü bir pusula olarak kullanıyoruz: büyük farklar gerçek, küçük farklar değil.
