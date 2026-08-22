"""Genel istemleri bir öğretmen modele (Ollama) cevaplatır ve eğitim örneklerine çevirir.

Kullanım: python genel_uret.py <öğretmen model> [host] [paralel]
Girdi:  veri/genel_istem.jsonl
Çıktı:  veri/genel.jsonl  (yarıda kesilirse kaldığı yerden devam eder)

Atılan cevaplar: boş, yarıda kesilmiş (uzunluk sınırı), kendini başka bir model olarak tanıtan,
ve sayısal sorularda beklenen sonucu içermeyenler.
"""

import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

MODEL = sys.argv[1]
HOST = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:11434"
PARALEL = int(sys.argv[3]) if len(sys.argv) > 3 else 4
KOK = Path(__file__).parent
CIKTI = KOK / "veri" / "genel.jsonl"
YASAK = re.compile("gemma|deepmind|google taraf|by google|trained by|[一-鿿]", re.I)


def sor(k):
    mesajlar = ([{"role": "system", "content": k["sistem"]}] if k["sistem"] else []) + [{"role": "user", "content": k["istem"]}]
    govde = {
        "model": MODEL,
        "stream": False,
        "think": False,
        "messages": mesajlar,
        "options": {"temperature": 0.3, "seed": k["no"], "num_ctx": 2048, "num_predict": int(__import__("os").environ.get("UZUNLUK", 420))},
    }
    istek = urllib.request.Request(f"{HOST}/api/chat", json.dumps(govde).encode(), {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(istek, timeout=600) as cevap:
            j = json.load(cevap)
    except Exception as hata:  # noqa: BLE001
        return k, None, f"hata: {hata}"
    metin = re.sub(r"<think>[\s\S]*?</think>", "", j["message"]["content"]).strip()
    if not metin:
        return k, None, "boş"
    if j.get("done_reason") == "length":
        return k, None, "kesildi"
    if YASAK.search(metin):
        return k, None, "kimlik/yabancı yazı"
    if k["beklenen"] and not re.search(rf"(?<![\d.,]){re.escape(k['beklenen'])}(?![\d])", metin.replace(":", ".")):
        return k, None, "yanlış sonuç"
    return k, metin, None


kayitlar = [json.loads(s) for s in open(KOK / "veri" / "genel_istem.jsonl", encoding="utf-8")]
bitmis = set()
if CIKTI.exists():
    bitmis = {json.loads(s)["no"] for s in open(CIKTI, encoding="utf-8")}
kalan = [k for k in kayitlar if k["no"] not in bitmis]
print(f"{len(kayitlar)} istem, {len(bitmis)} hazır, {len(kalan)} sorulacak", flush=True)

atilan, yazilan = {}, 0
with open(CIKTI, "a", encoding="utf-8") as f, ThreadPoolExecutor(PARALEL) as havuz:
    for n, (k, metin, neden) in enumerate(havuz.map(sor, kalan)):
        if metin is None:
            atilan[neden.split(":")[0]] = atilan.get(neden.split(":")[0], 0) + 1
        else:
            mesajlar = ([{"role": "system", "content": k["sistem"]}] if k["sistem"] else []) + [
                {"role": "user", "content": k["istem"]},
                {"role": "assistant", "content": metin},
            ]
            f.write(json.dumps({"no": k["no"], "tur": k["tur"], "messages": mesajlar}, ensure_ascii=False) + "\n")
            f.flush()
            yazilan += 1
        if (n + 1) % 200 == 0:
            print(n + 1, "/", len(kalan), "yazılan", yazilan, "atılan", json.dumps(atilan, ensure_ascii=False), flush=True)
print("bitti: yazılan", yazilan, "atılan", json.dumps(atilan, ensure_ascii=False))
