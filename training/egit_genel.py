"""Atlas ince ayarı (genel betik): Qwen ailesi ve benzeri taban modellere LoRA / QLoRA.

Kullanım: python egit_genel.py <taban klasörü> <çıktı klasörü> <veri klasörü> [epoch] [en fazla adım]

Ortam değişkenleri:
  DORT_BIT=1   taban 4 bit yüklenir (QLoRA); 12 GB ekran kartına sığmayan büyük modeller için
  METIN=1      yalnızca metin modeli (AutoModelForCausalLM); görüntü katmanı olmayan tabanlar için
  MAX_TOKEN    bundan uzun örnekler atılır (varsayılan 1024)
  BATCH        yığın boyutu (varsayılan 2); BATCH * BIRIKIM = 16 olacak şekilde biriktirilir

Yalnızca dil modelinin doğrusal katmanları eğitilir; görüntü katmanlarına dokunulmaz.
İstem kısmı kayba katılmaz: model yalnızca cevabı (ve tur bitişini) yazmayı öğrenir.
"""

import json
import math
import os
import sys
import time
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoModelForImageTextToText, AutoTokenizer, BitsAndBytesConfig, get_cosine_schedule_with_warmup

TABAN = sys.argv[1]
CIKTI = Path(sys.argv[2])
VERI = Path(sys.argv[3])
EPOCH = float(sys.argv[4]) if len(sys.argv) > 4 else 1
EN_FAZLA_ADIM = int(sys.argv[5]) if len(sys.argv) > 5 else 0
DORT_BIT = os.environ.get("DORT_BIT") == "1"
METIN = os.environ.get("METIN") == "1"
MAX_TOKEN = int(os.environ.get("MAX_TOKEN", "1024"))
BATCH = int(os.environ.get("BATCH", "2"))
BIRIKIM = max(1, 16 // BATCH)
LR, R = float(os.environ.get('LR', '1e-4')), int(os.environ.get('R', '16'))
UZUN = 600  # bundan uzun örnekler belleğe sığsın diye tek başına işlenir

torch.manual_seed(7)
tok = AutoTokenizer.from_pretrained(TABAN)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token

Sinif = AutoModelForCausalLM if METIN else AutoModelForImageTextToText
ek = {}
if DORT_BIT:
    ek["quantization_config"] = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True
    )
model = Sinif.from_pretrained(TABAN, dtype=torch.bfloat16, device_map={"": 0}, **ek)
model.config.use_cache = False
for p in model.parameters():
    p.requires_grad_(False)
model.gradient_checkpointing_enable()
model.enable_input_require_grads()

hedefler = sorted(
    {
        ad.split(".")[-1]
        for ad, m in model.named_modules()
        if isinstance(m, torch.nn.Linear) and "visual" not in ad and "vision" not in ad and "lm_head" not in ad and "mtp" not in ad
    }
)
print("LoRA hedef katmanları:", hedefler, flush=True)
model = get_peft_model(
    model,
    LoraConfig(
        r=R,
        lora_alpha=2 * R,
        lora_dropout=0.05,
        target_modules=hedefler,
        exclude_modules=r".*(visual|vision|mtp).*",
        task_type="CAUSAL_LM",
    ),
)
model.print_trainable_parameters()
print(f"ekran kartı belleği (yükleme sonrası): {torch.cuda.memory_allocated() / 1e9:.1f} GB", flush=True)


def oku(ad):
    return [json.loads(satir) for satir in open(VERI / f"{ad}.jsonl", encoding="utf-8")]


def sablon(mesajlar, uretim):
    """Düşünme kipi olan modellerde (Qwen 3.5) kapalı kip kullanılır; uygulama da modeli böyle çağırır."""
    try:
        return tok.apply_chat_template(mesajlar, add_generation_prompt=uretim, tokenize=False, enable_thinking=False)
    except TypeError:
        return tok.apply_chat_template(mesajlar, add_generation_prompt=uretim, tokenize=False)


def kodla(kayit):
    mesajlar = kayit["messages"]
    istem = sablon(mesajlar[:-1], True)
    cevap = mesajlar[-1]["content"] + "<|im_end|>\n"
    a = tok(istem, add_special_tokens=False)["input_ids"]
    b = tok(cevap, add_special_tokens=False)["input_ids"]
    if len(a) + len(b) > MAX_TOKEN:
        return None
    return a + b, [-100] * len(a) + b


def yigin(ornekler):
    uzun = max(len(i) for i, _ in ornekler)
    ids = torch.full((len(ornekler), uzun), tok.pad_token_id)
    etiket = torch.full((len(ornekler), uzun), -100)
    maske = torch.zeros((len(ornekler), uzun), dtype=torch.long)
    for n, (i, e) in enumerate(ornekler):
        ids[n, : len(i)] = torch.tensor(i)
        etiket[n, : len(e)] = torch.tensor(e)
        maske[n, : len(i)] = 1
    return ids.cuda(), maske.cuda(), etiket.cuda()


def hazirla(ad):
    hepsi = [kodla(k) for k in oku(ad)]
    kalan = [x for x in hepsi if x]
    print(f"{ad}: {len(kalan)} örnek ({len(hepsi) - len(kalan)} tanesi {MAX_TOKEN} belirteçten uzun olduğu için atıldı)")
    return kalan


if "<|im_end|>" not in tok.get_vocab():
    raise SystemExit("bu betik <|im_end|> ile biten sohbet şablonları içindir")
egitim, dogrulama = hazirla("egitim"), hazirla("dogrulama")
print("örnek:\n", tok.decode(egitim[0][0]), flush=True)


def yiginlar(gen):
    """Benzer uzunluktakiler aynı yığına düşer (dolgu azalır); yığınların sırası karıştırılır."""
    sira = torch.randperm(len(egitim), generator=gen).tolist()
    parcalar = []
    for i in range(0, len(sira), BATCH * 64):
        dilim = sorted(sira[i : i + BATCH * 64], key=lambda n: len(egitim[n][0]))
        for j in range(0, len(dilim), BATCH):
            grup = dilim[j : j + BATCH]
            parcalar += [[n] for n in grup] if len(egitim[grup[-1]][0]) > UZUN else [grup]
    karisik = torch.randperm(len(parcalar), generator=gen).tolist()
    return [parcalar[i] for i in karisik]


@torch.no_grad()
def dogrulama_kaybi():
    model.eval()
    toplam = 0.0
    for i in range(len(dogrulama)):
        ids, maske, etiket = yigin(dogrulama[i : i + 1])
        toplam += model(input_ids=ids, attention_mask=maske, labels=etiket).loss.item()
    model.train()
    return toplam / len(dogrulama)


adim_sayisi = math.ceil(len(egitim) * EPOCH / (BATCH * BIRIKIM))
if EN_FAZLA_ADIM:
    adim_sayisi = min(adim_sayisi, EN_FAZLA_ADIM)
opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=LR, weight_decay=0.0)
plan = get_cosine_schedule_with_warmup(opt, int(adim_sayisi * 0.05), adim_sayisi)
gen = torch.Generator().manual_seed(7)

ilk = dogrulama_kaybi()
print(f"{len(egitim)} örnek, {adim_sayisi} adım; başlangıç doğrulama kaybı: {ilk:.4f}", flush=True)
model.train()
gunluk = [{"adim": 0, "dogrulama": round(ilk, 4)}]
basla = time.time()
adim, kuyruk, kayip_toplam = 0, [], 0.0
while adim < adim_sayisi:
    for _ in range(BIRIKIM):
        if not kuyruk:
            kuyruk = yiginlar(gen)
        ids, maske, etiket = yigin([egitim[i] for i in kuyruk.pop()])
        kayip = model(input_ids=ids, attention_mask=maske, labels=etiket).loss / BIRIKIM
        kayip.backward()
        kayip_toplam += kayip.item()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    plan.step()
    opt.zero_grad(set_to_none=True)
    adim += 1
    if adim % 10 == 0:
        satir = {
            "adim": adim,
            "kayip": round(kayip_toplam / 10, 4),
            "dakika": round((time.time() - basla) / 60, 1),
            "gb": round(torch.cuda.max_memory_allocated() / 1e9, 1),
        }
        kayip_toplam = 0.0
        if adim % 100 == 0 or adim == adim_sayisi:
            satir["dogrulama"] = round(dogrulama_kaybi(), 4)
        gunluk.append(satir)
        print(json.dumps(satir), flush=True)
    if adim % 100 == 0:
        model.save_pretrained(CIKTI / "lora")  # yarıda kesilirse eldeki kalsın

son = dogrulama_kaybi()
print(f"bitti: doğrulama kaybı {son:.4f}, süre {(time.time() - basla) / 60:.1f} dk")
CIKTI.mkdir(parents=True, exist_ok=True)
model.save_pretrained(CIKTI / "lora")
tok.save_pretrained(CIKTI / "lora")
json.dump(
    {"taban": TABAN, "epoch": EPOCH, "ornek": len(egitim), "adim": adim_sayisi, "lr": LR, "r": R, "dort_bit": DORT_BIT, "ilk_dogrulama": ilk, "son_dogrulama": son, "gunluk": gunluk},
    open(CIKTI / "egitim-gunlugu.json", "w", encoding="utf-8"),
    ensure_ascii=False,
    indent=1,
)
