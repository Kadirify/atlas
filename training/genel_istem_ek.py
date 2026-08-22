"""İkinci turda az kalan türler (sohbet, kod) için ek istemler üretir ve veri/genel_istem.jsonl dosyasına ekler.

Kullanım: python genel_istem_ek.py   (bir kez çalıştırılır; numaralar 100000'den başlar)
"""

import json
import random
from pathlib import Path

import genel_istem as g

KOK = Path(__file__).parent
random.seed(31)

SOHBET_KONU = [
    "{k} konusunda zorlanıyorum, ne önerirsin?",
    "{k} hakkında biraz sohbet edelim mi? Sen ne düşünüyorsun?",
    "Bugün {k} üzerine düşünüyordum. Bana kısa bir fikir verir misin?",
    "{k} için nereden başlamalıyım? Samimi bir dille anlat.",
]

istemler = []
for k in g.KONU:
    for b in SOHBET_KONU:
        istemler.append(("sohbet", b.format(k=k[0].upper() + k[1:] if b.startswith("{k}") else k)))
for s in g.SOHBET * 3:
    istemler.append(("sohbet", s))
for s in g.CHAT_EN * 2:
    istemler.append(("ingilizce", s))
for tr, en in g.KOD_GOREV:
    for dil in g.KOD_DIL:
        istemler.append(("kod", f"{dil} ile {tr} bir fonksiyon yaz. Kısa tut."))
        istemler.append(("kod", f"Write a short {dil} function that {en}."))
for s in g.KOD_SORU * 2:
    istemler.append(("kod", s))
for gorev in g.SQL_GOREV:
    istemler.append(("kod", f"{gorev} bir SQL sorgusu yaz ve tek cümleyle açıkla."))

eval_metni = g.EVAL.read_text(encoding="utf-8")
yol = KOK / "veri" / "genel_istem.jsonl"
mevcut = [json.loads(s) for s in open(yol, encoding="utf-8")]
if any(k["no"] >= 100000 for k in mevcut):
    raise SystemExit("ek istemler zaten eklenmiş")
with open(yol, "a", encoding="utf-8") as f:
    for n, (tur, metin) in enumerate(istemler):
        if metin in eval_metni:
            continue
        f.write(json.dumps({"no": 100000 + n, "tur": tur, "sistem": g.SISTEM if random.random() < 0.5 else None, "istem": metin, "beklenen": None}, ensure_ascii=False) + "\n")
print(len(istemler), "ek istem eklendi")
