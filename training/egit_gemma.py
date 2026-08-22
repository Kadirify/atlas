"""Atlas ikinci tur eğitimi: Gemma 4 tabanına QLoRA ile ince ayar.

Kullanım: python egit_gemma.py <taban klasörü> <çıktı klasörü> <veri klasörü> [epoch] [en fazla adım]

12 GB ekran kartına sığması için:
- dil modelinin doğrusal katmanları 4 bit yüklenir (QLoRA),
- katman başı gömme tablosu (yaklaşık 5,6 GB) ile ses ve görüntü kuleleri işlemci belleğinde tutulur.
Yalnızca dil modelinin dikkat ve ileri besleme katmanlarına LoRA eklenir; ses ve görüntü katmanlarına dokunulmaz.
"""

import json
import math
import sys
import time
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForImageTextToText, AutoTokenizer, BitsAndBytesConfig, get_cosine_schedule_with_warmup

TABAN = sys.argv[1]
CIKTI = Path(sys.argv[2])
VERI = Path(sys.argv[3])
EPOCH = float(sys.argv[4]) if len(sys.argv) > 4 else 1
EN_FAZLA_ADIM = int(sys.argv[5]) if len(sys.argv) > 5 else 0
BATCH, BIRIKIM, LR, MAX_TOKEN, R = 2, 8, 1e-4, 1024, 16
UZUN = 600  # bundan uzun örnekler belleğe sığsın diye tek başına işlenir

torch.manual_seed(7)
tok = AutoTokenizer.from_pretrained(TABAN)

model = AutoModelForImageTextToText.from_pretrained(
    TABAN,
    dtype=torch.bfloat16,
    quantization_config=BitsAndBytesConfig(
        load_in_4bit=True, llm_int8_enable_fp32_cpu_offload=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True
    ),
    device_map={
        "": 0,
        "model.language_model.embed_tokens_per_layer": "cpu",
        "model.audio_tower": "cpu",
        "model.vision_tower": "cpu",
        "model.embed_audio": "cpu",
        "model.embed_vision": "cpu",
    },
)
model.config.use_cache = False


class IslemcideGomme(torch.nn.Module):
    """Katman başı gömme tablosunu işlemci belleğinde tutar; yalnızca seçilen satırlar ekran kartına gider."""

    def __init__(self, ic):
        super().__init__()
        self.ic = ic

    def forward(self, ids, *args, **kwargs):
        return self.ic(ids.cpu(), *args, **kwargs).to(ids.device)


from accelerate.hooks import remove_hook_from_module  # noqa: E402

dil = model.model.language_model
remove_hook_from_module(dil.embed_tokens_per_layer, recurse=True)
dil.embed_tokens_per_layer = IslemcideGomme(dil.embed_tokens_per_layer.to("cpu", torch.bfloat16))
for p in model.parameters():
    p.requires_grad_(False)
model.gradient_checkpointing_enable()
model.enable_input_require_grads()
model = get_peft_model(
    model,
    LoraConfig(
        r=R,
        lora_alpha=2 * R,
        lora_dropout=0.05,
        target_modules=r".*language_model\.layers\.\d+\.(self_attn\.(q|k|v|o)_proj|mlp\.(gate|up|down)_proj)",
        task_type="CAUSAL_LM",
    ),
)
model.print_trainable_parameters()
print(f"ekran kartı belleği (yükleme sonrası): {torch.cuda.memory_allocated() / 1e9:.1f} GB", flush=True)


def oku(ad):
    return [json.loads(satir) for satir in open(VERI / f"{ad}.jsonl", encoding="utf-8")]


def kodla(kayit):
    """İstem kısmı kayba katılmaz; model yalnızca cevabı (ve tur bitişini) yazmayı öğrenir."""
    mesajlar = kayit["messages"]
    istem = tok.apply_chat_template(mesajlar[:-1], add_generation_prompt=True, tokenize=False)
    tam = tok.apply_chat_template(mesajlar, add_generation_prompt=False, tokenize=False)
    if not tam.startswith(istem):
        raise SystemExit("sohbet şablonu beklenen biçimde değil:\n" + istem + "\n---\n" + tam)
    a = tok(istem, add_special_tokens=False)["input_ids"]
    b = tok(tam[len(istem):], add_special_tokens=False)["input_ids"]
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


egitim, dogrulama = hazirla("egitim"), hazirla("dogrulama")
# Benzer uzunluktakiler aynı yığına düşsün diye uzunluğa göre gruplanır (dolgu azalır); grupların sırası karıştırılır.
print("örnek:\n", tok.decode(egitim[0][0]), flush=True)


def yiginlar(gen):
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
    toplam, parcalar = 0.0, [dogrulama[i : i + 1] for i in range(len(dogrulama))]
    for p in parcalar:
        ids, maske, etiket = yigin(p)
        toplam += model(input_ids=ids, attention_mask=maske, labels=etiket).loss.item()
    model.train()
    return toplam / len(parcalar)


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
    {"taban": TABAN, "epoch": EPOCH, "ornek": len(egitim), "adim": adim_sayisi, "lr": LR, "r": R, "ilk_dogrulama": ilk, "son_dogrulama": son, "gunluk": gunluk},
    open(CIKTI / "egitim-gunlugu.json", "w", encoding="utf-8"),
    ensure_ascii=False,
    indent=1,
)
