# Atlas-TR ölçüm sonuçları

92 soru, 10 kategori. Puanlar 100 üzerinden; her soru otomatik kurallarla puanlanır.
"Genel" kategorilerin ortalamasıdır. "Türkçe", İngilizce ve kod dışındaki kategorilerin ortalamasıdır.

| Model | Genel | Türkçe | Yazım ve dil bilgisi | Talimata uyma | Doğal sohbet | Resmi yazışma | Akıl yürütme ve bilgi | Özetleme ve metne bağlılık | Uzun cevap ve tekrar etmeme | Çeviri | İngilizce | Kod ve SQL | Hız (token/sn) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gemma4:12b | **97** | 98 | 100 | 100 | 94 | 100 | 92 | 100 | 100 | 100 | 94 | 95 | 125 |
| gemma4:e4b | **97** | 97 | 94 | 100 | 100 | 98 | 83 | 100 | 100 | 97 | 100 | 100 | 187 |
| qwen3.5:9b | **93** | 92 | 86 | 93 | 92 | 95 | 75 | 100 | 100 | 93 | 100 | 95 | 97 |
| qwen2.5-coder:14b | **92** | 90 | 61 | 93 | 85 | 95 | 83 | 100 | 100 | 100 | 100 | 98 | 64 |
| qwen3.5:4b | **90** | 89 | 75 | 94 | 92 | 96 | 75 | 92 | 100 | 88 | 88 | 100 | 146 |
| alibayram/turkish-gemma-9b-v0.1 | **89** | 93 | 92 | 100 | 94 | 96 | 83 | 79 | 100 | 100 | 54 | 95 | 91 |
| yunusemrejs/turkish-qwen-4b-v1 | **87** | 84 | 36 | 86 | 85 | 95 | 75 | 100 | 100 | 92 | 100 | 100 | 168 |
| qwen3.5:2b | **87** | 86 | 64 | 90 | 92 | 98 | 67 | 100 | 94 | 80 | 100 | 80 | 201 |
| qwen2.5-coder:7b | **83** | 80 | 50 | 89 | 85 | 88 | 67 | 96 | 88 | 81 | 100 | 91 | 122 |
| alibayram/kumru | **57** | 60 | 53 | 49 | 92 | 71 | 21 | 51 | 83 | 63 | 58 | 34 | 328 |

Yeniden üretmek için: `node eval/run.mjs --models "<model adları>"`. Sorular `eval/items.mjs`, kurallar `eval/checks.mjs` dosyasındadır.
