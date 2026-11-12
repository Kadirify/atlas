"""Atlas yazım verisi, ikinci sürüm: gerçek yazım hatalarına daha yakın örnekler.

İlk sürümden (veri_hazirla.py) farkları:
- bir cümlede bir yerine bir ile dört arası hata bulunur,
- iki üç cümlelik kısa metinler de vardır,
- istemler çok daha çeşitlidir (günlük dille, İngilizce talimatla, sistem mesajlı ya da mesajsız),
- "hangisi doğru yazım" türünden bilgi soruları eklenir.

Kaynak cümleler ilk sürümün eğitim kümesindeki doğru cümlelerdir; test kümesindeki (veri/test.jsonl)
hiçbir cümle kullanılmaz. Ayrıca daha zor ikinci bir test kümesi üretilir (veri/test2.jsonl); onun
cümleleri de eğitime girmez.

Kullanım: python veri_hazirla2.py [örnek sayısı]
Çıktı: veri/yazim2.jsonl, veri/test2.jsonl
"""

import json
import random
import sys
from pathlib import Path

HEDEF = int(sys.argv[1]) if len(sys.argv) > 1 else 2400
sys.argv = [sys.argv[0], "12000"]
import veri_hazirla as v  # noqa: E402

KOK = Path(__file__).parent
random.seed(23)

v.YANLISLAR.update(
    {
        "herhalde": ["heralde"],
        "çünkü": ["çünki"],
        "restoran": ["restorant"],
        "rastgele": ["rasgele"],
        "pantolon": ["pantalon"],
        "sarımsak": ["sarmısak"],
        "maydanoz": ["maydonoz"],
        "tabii ki": ["tabiki", "tabi ki"],
        "aferin": ["aferim"],
        "yanında": ["yanıda"],
        "kelime": ["kelme"],
        "teşekkür": ["teşekür", "tesekkür"],
        "lütfen": ["lüften", "lutfen"],
        "merhaba": ["meraba"],
        "arkadaş": ["arkdaş", "arkadaş"],
        "güzel": ["güsel"],
        "problem": ["poblem"],
        "pazartesi": ["pazertesi"],
        "çarşamba": ["çarşanba"],
        "perşembe": ["perşenbe"],
        "eylül": ["eylul"],
        "şubat": ["subat"],
        "ağustos": ["agustos"],
        "apartman": ["apartıman"],
        "çikolata": ["çukulata"],
        "cumhuriyet": ["cumhurriyet"],
        "öğrenci": ["öğrençi"],
    }
)
v.YANLISLAR = {k: [x for x in y if x != k] for k, y in v.YANLISLAR.items()}
v.YANLISLAR = {k: y for k, y in v.YANLISLAR.items() if y}

KURALLAR = [v.ayri_de, v.ayri_ki, v.bitisik_ki, v.soru_eki, v.kesme, v.kelime, v.turkce_harf, v.buyuk_harf]

ISTEMLER = [
    "Şu cümledeki yazım hatalarını düzelt, yalnızca düzeltilmiş halini yaz: \"{c}\"",
    "Yazım yanlışlarını düzelt: \"{c}\"",
    "Düzelt: {c}",
    "Şunu düzgün yazar mısın?\n\n{c}",
    "Mesajımı göndermeden önce yazım hatalarına bakar mısın? Sadece düzeltilmiş halini yaz.\n\n{c}",
    "{c}\n\nBunu yazım kurallarına uygun hale getir.",
    "Yazım ve noktalama hatalarını düzelt, anlamı değiştirme:\n{c}",
    "Bu metni imla açısından düzelt. Açıklama yazma.\n\n{c}",
    "Fix the spelling mistakes in this Turkish text. Reply with the corrected text only.\n\n{c}",
    "Aşağıdaki metinde yazım hatası varsa düzelt, yoksa aynen yaz:\n\n{c}",
    "imla hatalarını düzeltir misin: {c}",
    "Şu cümleyi doğru yazımıyla tekrar yaz: {c}",
    "Aşağıdaki cümlede yazım yanlışı olabilir. Sadece düzeltilmiş cümleyi yaz, açıklama ekleme: \"{c}\"",
    "Öğrencimin yazdığı cümleyi düzeltir misin? Sadece doğru halini istiyorum.\n\n\"{c}\"",
    "Bunu resmi bir yazıya koyacağım, yazım hatası kalmasın: {c}",
]
SISTEMLER = [
    None,
    None,
    None,
    "Yardımcı bir asistansın. Kullanıcı hangi dilde yazarsa o dilde cevap ver. İstenenin dışına çıkma.",
    "Yardımcı bir asistansın. Kullanıcı hangi dilde yazarsa o dilde cevap ver. İstenenin dışına çıkma.",
    "Türkçe yazım konusunda titiz bir editörsün.",
    "Sen Atlas'sın, kullanıcının bilgisayarında çalışan yardımcı bir asistansın. Kısa ve net cevap ver.",
]
BILGI = [
    ("Hangisi doğru yazım: \"{a}\" / \"{b}\"?", "Doğru yazımı \"{d}\"."),
    ("\"{y}\" doğru mu yazılmış?", "Hayır, doğru yazımı \"{d}\"."),
    ("\"{d}\" doğru mu yazılmış?", "Evet, \"{d}\" doğru yazılmış."),
    ("\"{y}\" kelimesinin doğru yazılışı nedir? Sadece kelimeyi yaz.", "{d}"),
    ("Türkçede \"{a}\" mi yazılır, \"{b}\" mi? Kısaca cevap ver.", "\"{d}\" yazılır."),
]


def boz_cok(c, adet):
    """Cümleye en çok `adet` farklı kural uygular; hangi kuralların uygulandığını döndürür."""
    sonuc, uygulanan = c, []
    for kural in random.sample(KURALLAR, len(KURALLAR)):
        if len(uygulanan) >= adet:
            break
        yeni = kural(sonuc)
        if yeni and yeni != sonuc:
            sonuc = yeni
            uygulanan.append(kural.__name__)
    return (sonuc, uygulanan) if uygulanan else None


def ornek(yanlis, dogru, kurallar):
    mesajlar = []
    sistem = random.choice(SISTEMLER)
    if sistem:
        mesajlar.append({"role": "system", "content": sistem})
    mesajlar.append({"role": "user", "content": random.choice(ISTEMLER).format(c=yanlis)})
    mesajlar.append({"role": "assistant", "content": dogru})
    return {"messages": mesajlar, "kurallar": kurallar, "yanlis": yanlis, "dogru": dogru}


def uret(cumleler, adet):
    cikti, i = [], 0
    while len(cikti) < adet and i < len(cumleler) - 3:
        zar = random.random()
        if zar < 0.08:  # zaten doğru
            c = cumleler[i]; i += 1
            cikti.append(ornek(c, c, ["dogru"]))
            continue
        if zar < 0.30:  # iki üç cümlelik kısa metin, her cümlede en çok iki hata
            n = random.choice([2, 2, 3])
            parcalar, kurallar, temiz = [], [], cumleler[i : i + n]
            i += n
            for c in temiz:
                b = boz_cok(c, random.choice([0, 1, 1, 2])) if random.random() < 0.85 else None
                parcalar.append(b[0] if b else c)
                kurallar += b[1] if b else []
            if kurallar:
                cikti.append(ornek(" ".join(parcalar), " ".join(temiz), kurallar))
            continue
        c = cumleler[i]; i += 1
        b = boz_cok(c, random.choice([1, 2, 2, 3, 3, 4]))
        if b:
            cikti.append(ornek(b[0], c, b[1]))
    return cikti, i


def main():
    test = {json.loads(s)["dogru"] for s in open(KOK / "veri" / "test.jsonl", encoding="utf-8")}
    cumleler = sorted({json.loads(s)["dogru"] for s in open(KOK / "veri" / "egitim.jsonl", encoding="utf-8")} - test)
    random.shuffle(cumleler)
    test2, kullanilan = uret(cumleler, 200)
    test2 = [t for t in test2 if t["kurallar"] != ["dogru"] or random.random() < 0.6]
    egitim, _ = uret(cumleler[kullanilan:], HEDEF)

    bilgi = []
    for dogru, yanlislar in v.YANLISLAR.items():
        for yanlis in yanlislar:
            for soru, cevap in random.sample(BILGI, 2):
                a, b = random.sample([dogru, yanlis], 2)
                sistem = random.choice(SISTEMLER)
                mesajlar = ([{"role": "system", "content": sistem}] if sistem else []) + [
                    {"role": "user", "content": soru.format(a=a, b=b, y=yanlis, d=dogru)},
                    {"role": "assistant", "content": cevap.format(d=dogru)},
                ]
                bilgi.append({"messages": mesajlar, "kurallar": ["bilgi"], "yanlis": yanlis, "dogru": dogru})

    for ad, liste in (("yazim2", egitim + bilgi), ("test2", test2)):
        with open(KOK / "veri" / f"{ad}.jsonl", "w", encoding="utf-8") as f:
            for k in liste:
                f.write(json.dumps(k, ensure_ascii=False) + "\n")
    hata = [len([x for x in k["kurallar"] if x != "dogru"]) for k in egitim]
    print(f"yazim2: {len(egitim)} düzeltme + {len(bilgi)} bilgi sorusu; test2: {len(test2)}")
    print("hata sayısı dağılımı:", {n: hata.count(n) for n in sorted(set(hata))})
    for k in random.sample(egitim, 5):
        print(" ", k["yanlis"], "\n   =>", k["dogru"])


if __name__ == "__main__":
    main()
