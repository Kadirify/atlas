"""Atlas yazım düzeltme verisi.

Temiz Türkçe cümleleri alır, içlerine Türkçede en sık yapılan yazım yanlışlarını
kurallarla yerleştirir ve "yanlış cümle -> doğru cümle" çiftleri üretir.

Kaynak cümleler Türkçe Vikipedi'den gelir (CC BY-SA). Ölçüm setindeki (eval/items.mjs)
cümleler burada kullanılmaz; ölçüm cümleleriyle çakışan cümleler ayrıca elenir.

Çıktı: veri/egitim.jsonl, veri/dogrulama.jsonl, veri/test.jsonl  (sohbet biçiminde)
"""

import json
import random
import re
import sys
from pathlib import Path

from datasets import load_dataset

HEDEF = int(sys.argv[1]) if len(sys.argv) > 1 else 12000
CIKTI = Path(__file__).parent / "veri"
EVAL = Path(__file__).parent.parent / "eval" / "items.mjs"
random.seed(7)

# Doğru yazım -> sık yapılan yanlış yazım(lar)
YANLISLAR = {
    "herkes": ["herkez"],
    "yalnız": ["yanlız"],
    "yanlış": ["yalnış"],
    "şoför": ["şöför"],
    "sürpriz": ["süpriz"],
    "birkaç": ["bir kaç"],
    "her şey": ["herşey"],
    "bir şey": ["birşey"],
    "hiçbir": ["hiç bir"],
    "birçok": ["bir çok"],
    "pek çok": ["pekçok"],
    "ya da": ["yada"],
    "hâlâ": ["hala"],
    "her zaman": ["herzaman"],
    "bugün": ["bu gün"],
    "biraz": ["bir az"],
    "hiçbir şey": ["hiçbirşey", "hiç birşey"],
    "tabii": ["tabi"],
    "orijinal": ["orjinal"],
    "egzersiz": ["egzersis", "eksersiz"],
    "kirpik": ["kiprik"],
    "kibrit": ["kirbit"],
    "yalnızca": ["yanlızca"],
    "meyve": ["meyva"],
    "poğaça": ["poaça"],
    "program": ["proğram"],
    "gazete": ["gaste"],
    "eczane": ["ezcane"],
    "makine": ["makina"],
    "şemsiye": ["şemşiye"],
    "tıraş": ["traş"],
    "kılavuz": ["klavuz"],
    "karşı": ["karşi"],
    "değil": ["deil", "diil"],
    "geliyorum": ["geliyom"],
    "aşağı": ["aşşağı"],
    "müsait": ["müsayit"],
    "direkt": ["direk"],
    "mahcup": ["mahçup"],
    "doküman": ["döküman"],
    "kontrol": ["kontröl"],
    "inisiyatif": ["insiyatif"],
    "laboratuvar": ["labaratuar", "laboratuar"],
    "antrenman": ["antreman"],
    "ambulans": ["ambülans"],
    "entelektüel": ["entellektüel"],
    "malzeme": ["mazleme"],
    "sandviç": ["sandöviç"],
    "tezgâh": ["tezgah"],
    "ardından": ["ardıdan"],
    "üniversite": ["ünüversite"],
    "öğretmen": ["öretmen"],
    "kütüphane": ["kütüpane"],
    "muhtemelen": ["muhtemelen"],
    "sağlık": ["sağlik"],
    "kravat": ["kıravat"],
    "tren": ["tiren"],
    "spor": ["sipor"],
    "grup": ["gurup"],
    "plan": ["pilan"],
    "kulüp": ["klüp"],
    "şarj": ["şarz"],
    "zaten": ["zaaten"],
    "rağmen": ["rağmen"],
}
YANLISLAR = {k: [x for x in v if x != k] for k, v in YANLISLAR.items()}
YANLISLAR = {k: v for k, v in YANLISLAR.items() if v}

HARF = "a-zA-ZçğıöşüÇĞİÖŞÜâîûÂÎÛ"
SINIR = lambda kelime: re.compile(rf"(?<![{HARF}]){re.escape(kelime)}(?![{HARF}])")  # noqa: E731

ISTEMLER = [
    "Aşağıdaki cümlede yazım yanlışı var. Sadece düzeltilmiş cümleyi yaz, açıklama ekleme: \"{c}\"",
    "Şu cümledeki yazım hatalarını düzelt, yalnızca düzeltilmiş halini yaz: \"{c}\"",
    "Yazım yanlışlarını düzelt: \"{c}\"",
    "Bu cümleyi yazım kurallarına göre düzeltir misin? Sadece cümleyi yaz.\n\n{c}",
    "Cümleyi düzelt, başka bir şey yazma: {c}",
    "Aşağıdaki cümleyi imla açısından düzelt ve sadece doğru halini ver:\n{c}",
    "\"{c}\"\n\nBu cümledeki yazım hatalarını düzelt.",
    "Düzelt: {c}",
]

SISTEMLER = [
    None,
    None,
    "Yardımcı bir asistansın. Kullanıcı hangi dilde yazarsa o dilde cevap ver. İstenenin dışına çıkma.",
    "Türkçe yazım konusunda titiz bir editörsün.",
]


def ayri_de(c):
    """Bağlaç olan ayrı 'de/da' bitişik yazılır: 'Sen de' -> 'Sende'."""
    m = list(re.finditer(rf"([{HARF}]+) (de|da)(?=[,.!?]| (?!la |las |los |el |le |facto))", c))
    m = [x for x in m if not (x.group(1)[0].isupper() and x.start() > 0 and c[x.end() : x.end() + 2].strip()[:1].isupper())]
    if not m:
        return None
    x = random.choice(m)
    return c[: x.start()] + x.group(1) + x.group(2) + c[x.end():]


def ayri_ki(c):
    """Bağlaç olan 'ki' bitişik yazılır: 'gördüm ki' -> 'gördümki'."""
    m = list(re.finditer(rf"([{HARF}]+) ki(?=[ ,.!?])", c))
    if not m:
        return None
    x = random.choice(m)
    return c[: x.start()] + x.group(1) + "ki" + c[x.end():]


def bitisik_ki(c):
    """Ek olan '-ki' ayrı yazılır: 'yarınki' -> 'yarın ki'."""
    m = list(re.finditer(r"(yarın|bugün|dün|akşam|sabah|şimdi|önce|sonra|evde|okulda|masada|yanında|içinde|üstünde)ki(?![a-zçğıöşü])", c, re.I))
    if not m:
        return None
    x = random.choice(m)
    return c[: x.start()] + x.group(1) + " ki" + c[x.end():]


def soru_eki(c):
    """Soru eki bitişik yazılır: 'geldi mi' -> 'geldimi'."""
    m = list(re.finditer(rf"([{HARF}]+) (m[ıiuü](?:s[ıiuü]n(?:[ıiuü]z)?|y[ıiuü]m|y[ıiuü]z|d[ıiuü]r|yd[ıiuü]|ym[ıiuü]ş)?)(?=[ ,.!?])", c))
    if not m:
        return None
    x = random.choice(m)
    return c[: x.start()] + x.group(1) + x.group(2) + c[x.end():]


def kesme(c):
    """Özel ada gelen ekin kesme işareti kaldırılır: 'Ankara'da' -> 'Ankarada'."""
    m = list(re.finditer(rf"([A-ZÇĞİÖŞÜ][{HARF}]+)['’]([a-zçğıöşü]+)", c))
    if not m:
        return None
    x = random.choice(m)
    return c[: x.start()] + x.group(1) + x.group(2) + c[x.end():]


def kelime(c):
    """Sık karıştırılan bir kelime yanlış yazılır."""
    bulunan = [(k, SINIR(k)) for k in YANLISLAR if SINIR(k).search(c.lower())]
    if not bulunan:
        return None
    k, desen = random.choice(bulunan)
    x = re.compile(desen.pattern, re.I).search(c)
    yanlis = random.choice(YANLISLAR[k])
    if x.group(0)[0].isupper():
        yanlis = yanlis[0].upper() + yanlis[1:]
    return c[: x.start()] + yanlis + c[x.end():]


def turkce_harf(c):
    """Bir iki kelimede Türkçe harfler ASCII yazılır: 'çalışıyor' -> 'calisiyor'."""
    kelimeler = c.split(" ")
    aday = [i for i, k in enumerate(kelimeler) if re.search("[çğıöşü]", k) and not k[0].isupper()]
    if not aday:
        return None
    tablo = str.maketrans("çğıöşü", "cgiosu")
    for i in random.sample(aday, min(len(aday), random.choice([1, 1, 2]))):
        kelimeler[i] = kelimeler[i].translate(tablo)
    return " ".join(kelimeler)


def buyuk_harf(c):
    """Cümle küçük harfle başlar ya da sondaki nokta unutulur."""
    if random.random() < 0.5 and c[0].isupper():
        return c[0].lower() + c[1:]
    if c.endswith("."):
        return c[:-1]
    return None


KURALLAR = [
    (ayri_de, 5),
    (ayri_ki, 3),
    (bitisik_ki, 3),
    (soru_eki, 4),
    (kesme, 4),
    (kelime, 6),
    (turkce_harf, 2),
    (buyuk_harf, 1),
]


SAYAC = {}
TAVAN = {"turkce_harf": 0.16, "buyuk_harf": 0.07, "kesme": 0.2, "kelime": 0.25}


def boz(c):
    """Cümleye bir (bazen iki) yanlış yerleştirir; o ana kadar en az kullanılan kuralı seçer ki veri dengeli olsun."""
    uygun = []
    for kural, _ in KURALLAR:
        ad = kural.__name__
        if ad in TAVAN and SAYAC.get(ad, 0) >= TAVAN[ad] * HEDEF:
            continue
        yeni = kural(c)
        if yeni and yeni != c:
            uygun.append((SAYAC.get(ad, 0) + random.random() * 40, ad, kural))
    if not uygun:
        return None
    uygun.sort(key=lambda x: x[0])
    sonuc, uygulanan = c, []
    for _, ad, kural in uygun[: 2 if random.random() < 0.25 else 1]:
        yeni = kural(sonuc)
        if yeni and yeni != sonuc:
            sonuc = yeni
            uygulanan.append(ad)
            SAYAC[ad] = SAYAC.get(ad, 0) + 1
    return (sonuc, uygulanan) if uygulanan else None


# Vikipedi'de az geçen konuşma dili kalıpları: soru eki, bağlaç de/da/ki, sık yanlış yazılan kelimeler.
OZNE = ["Sen", "Ben", "O", "Biz", "Siz", "Onlar", "Ayşe", "Mehmet", "Elif", "Deniz", "Kerem", "Zeynep", "Annem", "Kardeşim", "Müdür", "Öğretmen"]
YER = ["toplantıya", "okula", "markete", "sinemaya", "ofise", "eve", "maça", "düğüne", "kursa", "hastaneye", "pazara", "kütüphaneye"]
ZAMAN = ["yarın", "bugün", "akşam", "hafta sonu", "sabah", "öğleden sonra", "gelecek hafta", "birazdan"]
SEHIR = ["Ankara", "İzmir", "Bursa", "Adana", "Konya", "Trabzon", "Antalya", "Eskişehir", "Samsun", "Mardin", "Almanya", "Fransa", "Japonya"]
SEHIR_EK = {"Ankara": ("'da", "'ya", "'nın"), "İzmir": ("'de", "'e", "'in"), "Bursa": ("'da", "'ya", "'nın"), "Adana": ("'da", "'ya", "'nın"), "Konya": ("'da", "'ya", "'nın"), "Trabzon": ("'da", "'a", "'un"), "Antalya": ("'da", "'ya", "'nın"), "Eskişehir": ("'de", "'e", "'in"), "Samsun": ("'da", "'a", "'un"), "Mardin": ("'de", "'e", "'in"), "Almanya": ("'da", "'ya", "'nın"), "Fransa": ("'da", "'ya", "'nın"), "Japonya": ("'da", "'ya", "'nın")}
NESNE = ["raporu", "ödevi", "bileti", "kitabı", "dosyayı", "faturayı", "anahtarı", "mektubu", "sunumu", "listeyi"]

def de(kelime):
    for harf in reversed(kelime.lower()):
        if harf in "aıou":
            return "da"
        if harf in "eiöü":
            return "de"
    return "de"


def ozne_de():
    o = random.choice(OZNE)
    return f"{o} {de(o)}"


KALIPLAR = [
    lambda: f"{ozne_de()} {random.choice(ZAMAN)} {random.choice(YER)} gelecek mi?",
    lambda: f"{random.choice(ZAMAN).capitalize()} {random.choice(YER)} gidecek misin?",
    lambda: f"{random.choice(NESNE).capitalize()} dün akşam bitirdin mi?",
    lambda: f"Herkes {random.choice(YER)} zamanında geldi.",
    lambda: f"Bu konuyu birkaç gün sonra {random.choice(SEHIR)}{SEHIR_EK[random.choice(SEHIR)][0]} konuşalım." if False else f"Bu konuyu birkaç gün sonra tekrar konuşalım.",
    lambda: (lambda s: f"{s}{SEHIR_EK[s][0]} hava bugün çok güzel.")(random.choice(SEHIR)),
    lambda: (lambda s: f"Geçen yaz {s}{SEHIR_EK[s][1]} gittik ama çok kalamadık.")(random.choice(SEHIR)),
    lambda: (lambda s: f"{s}{SEHIR_EK[s][2]} en sevdiğim yeri burası.")(random.choice(SEHIR)),
    lambda: f"{ozne_de()} bizimle {random.choice(YER)} gelmek istiyor.",
    lambda: f"Öyle bir yağmur yağdı ki {random.choice(YER)} gidemedik.",
    lambda: f"{random.choice(NESNE).capitalize()} hazırladım ki herkes rahatça görsün.",
    lambda: f"{random.choice(ZAMAN).capitalize()}ki toplantı iptal oldu." if False else "Yarınki toplantı saat üçe alındı.",
    lambda: f"Dünkü maçı izledin mi, sence kim daha iyi oynadı?",
    lambda: f"Evdeki hesap çarşıya uymadı, {random.choice(NESNE)} yeniden hazırlıyoruz.",
    lambda: f"Her şey yolunda, sadece {random.choice(NESNE)} biraz geç teslim edeceğiz.",
    lambda: f"Bir şey soracağım, {random.choice(ZAMAN)} müsait misin?",
    lambda: f"Yalnız bir sorunumuz var, {random.choice(NESNE)} hâlâ bulamadık.",
    lambda: f"Hiçbir şey söylemeden {random.choice(YER)} gitti.",
    lambda: f"Birçok kişi {random.choice(ZAMAN)} {random.choice(YER)} gelemeyeceğini söyledi.",
    lambda: f"Çay ya da kahve alır mısınız?",
    lambda: f"{random.choice(OZNE)} gelmedi, ben de gitmedim.",
    lambda: f"Bu işi {random.choice(ZAMAN)} bitirmeye çalışıyorum.",
    lambda: f"Şoför arabayı {random.choice(YER).rstrip('aey')} önüne park etti." if False else "Şoför otobüsü durağın önüne park etti.",
    lambda: f"Sürpriz bir şekilde {ozne_de()} {random.choice(YER)} geldi.",
    lambda: f"Bu program {random.choice(ZAMAN)} yeniden kurulacak mı?",
    lambda: f"Makine {random.choice(ZAMAN)} tamir edilecek, yanlış bir parça takılmış.",
    lambda: f"Tabii ki {random.choice(ZAMAN)} {random.choice(YER)} geleceğim.",
    lambda: f"Sen de {random.choice(NESNE)} okudun mu?",
    lambda: f"Toplantı o kadar uzun sürdü ki yemeğe çıkamadık.",
    lambda: f"Kimse {random.choice(NESNE)} zamanında getirmedi mi?",
]


def temiz_mi(c):
    if not (35 <= len(c) <= 170) or not c[0].isupper() or c[-1] not in ".?!":
        return False
    if re.search(r"[\[\]{}()|=<>*#:;\"“”«»/\\0-9]", c):
        return False
    if len(c.split()) < 6 or re.search(r"\b[A-ZÇĞİÖŞÜ]{2,}\b", c):
        return False
    if not re.search("[çğıöşü]", c):
        return False
    return True


def vikipedi(adet):
    veri = load_dataset("wikimedia/wikipedia", "20231101.tr", split="train", streaming=True)
    cumleler, gorulen = [], set()
    for i, madde in enumerate(veri):
        govde = madde["text"].split("\n\n")[0]
        for c in re.split(r"(?<=[.?!])\s+", govde)[:4]:
            c = c.strip()
            if temiz_mi(c) and c not in gorulen:
                gorulen.add(c)
                cumleler.append(c)
        if len(cumleler) >= adet or i > 400000:
            break
    return cumleler


def ornek(yanlis, dogru):
    mesajlar = []
    sistem = random.choice(SISTEMLER)
    if sistem:
        mesajlar.append({"role": "system", "content": sistem})
    mesajlar.append({"role": "user", "content": random.choice(ISTEMLER).format(c=yanlis)})
    mesajlar.append({"role": "assistant", "content": dogru})
    return {"messages": mesajlar}


def main():
    eval_metni = EVAL.read_text(encoding="utf-8") if EVAL.exists() else ""
    kalip = list({k() for _ in range(40000) for k in [random.choice(KALIPLAR)]})
    viki = vikipedi(HEDEF * 6)
    print(f"Vikipedi cümlesi: {len(viki)}, kalıp cümlesi: {len(kalip)}")

    random.shuffle(kalip)
    kaynak = viki + kalip[: HEDEF // 3]
    random.shuffle(kaynak)

    ornekler, sayac = [], {}
    for c in kaynak:
        if c in eval_metni:
            continue
        # Yedide biri zaten doğrudur: model gereksiz değişiklik yapmayı öğrenmesin.
        if random.random() < 0.14 and sayac.get("dogru", 0) < 0.12 * HEDEF:
            ornekler.append((c, c, ["dogru"]))
            sayac["dogru"] = sayac.get("dogru", 0) + 1
            continue
        b = boz(c)
        if not b or b[0] in eval_metni:
            continue
        ornekler.append((b[0], c, b[1]))
        for k in b[1]:
            sayac[k] = sayac.get(k, 0) + 1
        if len(ornekler) >= HEDEF:
            break

    random.shuffle(ornekler)
    n_test, n_dogrulama = 300, 200
    parcalar = {
        "test": ornekler[:n_test],
        "dogrulama": ornekler[n_test : n_test + n_dogrulama],
        "egitim": ornekler[n_test + n_dogrulama :],
    }
    CIKTI.mkdir(exist_ok=True)
    for ad, liste in parcalar.items():
        with open(CIKTI / f"{ad}.jsonl", "w", encoding="utf-8") as f:
            for yanlis, dogru, kurallar in liste:
                kayit = ornek(yanlis, dogru)
                kayit["kurallar"] = kurallar
                kayit["yanlis"] = yanlis
                kayit["dogru"] = dogru
                f.write(json.dumps(kayit, ensure_ascii=False) + "\n")
        print(ad, len(liste))
    print("Kural dağılımı:", json.dumps(sayac, ensure_ascii=False))


if __name__ == "__main__":
    main()
