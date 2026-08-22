"""Yazım örnekleriyle genel örnekleri tek eğitim kümesinde birleştirir.

Kullanım: python karistir.py [tek hatalı yazım örneği sayısı] [çıktı klasörü] [yazim2 kullan: 0/1]
Girdi:  veri/egitim.jsonl, veri/dogrulama.jsonl (yazım, ilk sürüm), veri/yazim2.jsonl (yazım, ikinci sürüm),
        veri/genel.jsonl (genel)
Çıktı:  <çıktı klasörü>/egitim.jsonl, dogrulama.jsonl

Genel örnekler çoğunlukta kalır; böylece model yazım düzeltmeyi öğrenirken her isteği düzeltme sanmaz.
Test kümelerindeki (veri/test.jsonl, veri/test2.jsonl) cümleler hiçbir kümeye girmez.
"""

import json
import random
import sys
from pathlib import Path

KOK = Path(__file__).parent
N_YAZIM = int(sys.argv[1]) if len(sys.argv) > 1 else 3200
CIKTI = KOK / (sys.argv[2] if len(sys.argv) > 2 else "veri2")
YAZIM2 = len(sys.argv) > 3 and sys.argv[3] == "1"
random.seed(13)


def oku(yol):
    return [json.loads(s) for s in open(yol, encoding="utf-8")]


yasak = set()
if YAZIM2:
    for k in oku(KOK / "veri" / "test2.jsonl"):
        yasak.add(k["dogru"])
yazim = [k for k in oku(KOK / "veri" / "egitim.jsonl") if not any(k["dogru"] in y for y in yasak)] if yasak else oku(KOK / "veri" / "egitim.jsonl")
yazim_d = oku(KOK / "veri" / "dogrulama.jsonl")
genel = oku(KOK / "veri" / "genel.jsonl")
random.shuffle(yazim)
random.shuffle(genel)

dogrulama = [{"messages": k["messages"], "tur": "yazim"} for k in yazim_d[:100]] + [{"messages": k["messages"], "tur": k["tur"]} for k in genel[:100]]
egitim = [{"messages": k["messages"], "tur": "yazim"} for k in yazim[:N_YAZIM]] + [{"messages": k["messages"], "tur": k["tur"]} for k in genel[100:]]
if YAZIM2:
    egitim += [{"messages": k["messages"], "tur": "yazim2"} for k in oku(KOK / "veri" / "yazim2.jsonl")]
random.shuffle(egitim)

CIKTI.mkdir(exist_ok=True)
for ad, liste in (("egitim", egitim), ("dogrulama", dogrulama)):
    with open(CIKTI / f"{ad}.jsonl", "w", encoding="utf-8") as f:
        for k in liste:
            f.write(json.dumps(k, ensure_ascii=False) + "\n")
sayim = {}
for k in egitim:
    sayim[k["tur"]] = sayim.get(k["tur"], 0) + 1
print(f"eğitim {len(egitim)}, doğrulama {len(dogrulama)}")
print(json.dumps(dict(sorted(sayim.items(), key=lambda x: -x[1])), ensure_ascii=False))
