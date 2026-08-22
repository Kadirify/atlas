"""Atlas pilot eğitimi: taban modele LoRA ile Türkçe yazım düzeltmeyi öğretir.

Kullanım: python egit.py <taban klasörü> <çıktı klasörü> [epoch]
Yalnızca dil modelinin (metin) katmanları eğitilir; görsel katmanlara dokunulmaz.
"""

import json
import math
import sys
import time
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForImageTextToText, AutoTokenizer, get_cosine_schedule_with_warmup

TABAN = sys.argv[1]
CIKTI = Path(sys.argv[2])
EPOCH = float(sys.argv[3]) if len(sys.argv) > 3 else 2
VERI = Path(__file__).parent / "veri"
BATCH, BIRIKIM, LR, MAX_TOKEN = 2, 8, 1e-4, 224

torch.manual_seed(7)
tok = AutoTokenizer.from_pretrained(TABAN)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
model = AutoModelForImageTextToText.from_pretrained(TABAN, dtype=torch.bfloat16, device_map={"": 0})
model.config.use_cache = False
model.gradient_checkpointing_enable()

# Hedef: dil modelindeki dikkat ve ileri besleme katmanlarının doğrusal katmanları.
hedefler = sorted(
    {
        ad.split(".")[-1]
        for ad, m in model.named_modules()
        if isinstance(m, torch.nn.Linear) and "visual" not in ad and "vision" not in ad and "lm_head" not in ad
    }
)
print("LoRA hedef katmanları:", hedefler)
model = get_peft_model(
    model,
    LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=hedefler,
        exclude_modules=r".*(visual|vision).*",
        task_type="CAUSAL_LM",
    ),
)
model.print_trainable_parameters()


def oku(ad):
    return [json.loads(satir) for satir in open(VERI / f"{ad}.jsonl", encoding="utf-8")]


def kodla(kayit):
    """İstem kısmı kayba katılmaz; model yalnızca cevabı yazmayı öğrenir."""
    mesajlar = kayit["messages"]
    kwargs = {"tokenize": False, "enable_thinking": False}
    try:
        istem = tok.apply_chat_template(mesajlar[:-1], add_generation_prompt=True, **kwargs)
    except TypeError:
        istem = tok.apply_chat_template(mesajlar[:-1], add_generation_prompt=True, tokenize=False)
    cevap = mesajlar[-1]["content"] + "<|im_end|>\n"
    a = tok(istem, add_special_tokens=False)["input_ids"]
    b = tok(cevap, add_special_tokens=False)["input_ids"]
    ids = (a + b)[:MAX_TOKEN]
    etiket = ([-100] * len(a) + b)[:MAX_TOKEN]
    return ids, etiket


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


egitim = [kodla(k) for k in oku("egitim")]
dogrulama = [kodla(k) for k in oku("dogrulama")]
print("örnek istem:\n", tok.decode(egitim[0][0]))


@torch.no_grad()
def dogrulama_kaybi():
    model.eval()
    toplam = 0.0
    parcalar = [dogrulama[i : i + BATCH] for i in range(0, len(dogrulama), BATCH)]
    for p in parcalar:
        ids, maske, etiket = yigin(p)
        toplam += model(input_ids=ids, attention_mask=maske, labels=etiket).loss.item()
    model.train()
    return toplam / len(parcalar)


adim_sayisi = math.ceil(len(egitim) * EPOCH / (BATCH * BIRIKIM))
opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=LR, weight_decay=0.0)
plan = get_cosine_schedule_with_warmup(opt, int(adim_sayisi * 0.05), adim_sayisi)
gen = torch.Generator().manual_seed(7)

print(f"{len(egitim)} örnek, {adim_sayisi} adım; başlangıç doğrulama kaybı: {dogrulama_kaybi():.4f}")
model.train()
gunluk = []
basla = time.time()
adim, sira, konum, kayip_toplam = 0, torch.randperm(len(egitim), generator=gen).tolist(), 0, 0.0
while adim < adim_sayisi:
    for _ in range(BIRIKIM):
        if konum + BATCH > len(sira):
            sira, konum = torch.randperm(len(egitim), generator=gen).tolist(), 0
        ids, maske, etiket = yigin([egitim[i] for i in sira[konum : konum + BATCH]])
        konum += BATCH
        kayip = model(input_ids=ids, attention_mask=maske, labels=etiket).loss / BIRIKIM
        kayip.backward()
        kayip_toplam += kayip.item()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    plan.step()
    opt.zero_grad(set_to_none=True)
    adim += 1
    if adim % 25 == 0:
        satir = {"adim": adim, "kayip": round(kayip_toplam / 25, 4), "dakika": round((time.time() - basla) / 60, 1)}
        kayip_toplam = 0.0
        if adim % 200 == 0 or adim == adim_sayisi:
            satir["dogrulama"] = round(dogrulama_kaybi(), 4)
        gunluk.append(satir)
        print(json.dumps(satir), flush=True)

son = dogrulama_kaybi()
print(f"bitti: doğrulama kaybı {son:.4f}, süre {(time.time() - basla) / 60:.1f} dk")
CIKTI.mkdir(parents=True, exist_ok=True)
model.save_pretrained(CIKTI / "lora")
tok.save_pretrained(CIKTI / "lora")
json.dump(
    {"taban": TABAN, "epoch": EPOCH, "ornek": len(egitim), "adim": adim_sayisi, "lr": LR, "r": 16, "son_dogrulama": son, "gunluk": gunluk},
    open(CIKTI / "egitim-gunlugu.json", "w", encoding="utf-8"),
    ensure_ascii=False,
    indent=1,
)
