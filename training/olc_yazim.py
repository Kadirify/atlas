"""Ayrılmış yazım testini (veri/test.jsonl, eğitimde hiç görülmemiş 300 cümle) bir Ollama modeline sorar.

Kullanım: python olc_yazim.py <model> [host] [test dosyası adı: test ya da test2]
Puan: modelin cevabı doğru cümleyle birebir aynıysa 1 (baştaki sondaki boşluk ve tırnaklar sayılmaz).
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

MODEL = sys.argv[1]
HOST = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:11434"
KOK = Path(__file__).parent
ISTEM = 'Aşağıdaki cümlede yazım yanlışı olabilir. Sadece düzeltilmiş cümleyi yaz, açıklama ekleme: "{c}"'
SISTEM = "Yardımcı bir asistansın. Kullanıcı hangi dilde yazarsa o dilde cevap ver. İstenenin dışına çıkma."


def sor(cumle):
    govde = {
        "model": MODEL,
        "stream": False,
        "think": False,
        "messages": [{"role": "system", "content": SISTEM}, {"role": "user", "content": ISTEM.format(c=cumle)}],
        "options": {"temperature": 0, "seed": 1, "num_ctx": 4096, "num_predict": 200},
    }
    istek = urllib.request.Request(f"{HOST}/api/chat", json.dumps(govde).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(istek, timeout=300) as cevap:
        metin = json.load(cevap)["message"]["content"]
    return re.sub(r"<think>[\s\S]*?</think>", "", metin).strip()


def sade(metin):
    metin = metin.strip().strip('"“”\'`').strip()
    return re.sub(r"\s+", " ", metin).replace("’", "'")


TEST = sys.argv[3] if len(sys.argv) > 3 else "test"
satirlar = [json.loads(s) for s in open(KOK / "veri" / f"{TEST}.jsonl", encoding="utf-8")]
sonuc, kural_puan = [], {}
for n, s in enumerate(satirlar):
    cevap = sor(s["yanlis"])
    dogru = sade(cevap) == sade(s["dogru"])
    sonuc.append({"yanlis": s["yanlis"], "dogru": s["dogru"], "cevap": cevap, "tamam": dogru, "kurallar": s["kurallar"]})
    for k in s["kurallar"]:
        a = kural_puan.setdefault(k, [0, 0])
        a[0] += dogru
        a[1] += 1
    if (n + 1) % 50 == 0:
        print(n + 1, "/", len(satirlar), flush=True)

toplam = sum(r["tamam"] for r in sonuc)
ozet = {
    "model": MODEL,
    "dogru": toplam,
    "toplam": len(sonuc),
    "yuzde": round(100 * toplam / len(sonuc), 1),
    "kurallar": {k: f"{a}/{b}" for k, (a, b) in sorted(kural_puan.items())},
}
print(json.dumps(ozet, ensure_ascii=False, indent=1))
cikti = KOK / "sonuc"
cikti.mkdir(exist_ok=True)
json.dump({"ozet": ozet, "cevaplar": sonuc}, open(cikti / (re.sub(r"[^\w.-]", "_", MODEL) + ("" if TEST == "test" else "-" + TEST) + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
