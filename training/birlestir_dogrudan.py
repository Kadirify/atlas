"""LoRA ağırlıklarını taban modelin dosyasına doğrudan işler (modeli belleğe yüklemeden).

Kullanım: python birlestir_dogrudan.py <taban klasörü> <lora klasörü> <çıktı klasörü>

Taban klasörü olduğu gibi kopyalanır; sonra yalnızca LoRA'nın dokunduğu tensörler dosyanın içinde,
yerlerinde güncellenir: W <- W + (alpha / r) * B @ A. Diğer bütün tensörler (ses, görüntü, gömmeler)
bayt bayt aynı kalır; böylece dönüştürücünün beklediği hiçbir katman eksilmez ve 16 GB'lık model için
16 GB bellek gerekmez.
"""

import json
import shutil
import struct
import sys
from pathlib import Path

import torch
from safetensors.torch import load_file

taban, lora, cikti = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
ayar = json.load(open(lora / "adapter_config.json", encoding="utf-8"))
olcek = ayar["lora_alpha"] / ayar["r"]
agirlik = load_file(lora / "adapter_model.safetensors")

ciftler = {}
for ad, t in agirlik.items():
    for tur in ("lora_A", "lora_B"):
        if f".{tur}." in ad:
            hedef = ad.replace("base_model.model.", "", 1).replace(f".{tur}.weight", ".weight").replace(f".{tur}.default.weight", ".weight")
            ciftler.setdefault(hedef, {})[tur] = t
print(f"{len(ciftler)} katman güncellenecek, ölçek {olcek}")

if cikti.exists():
    shutil.rmtree(cikti)
shutil.copytree(taban, cikti, ignore=shutil.ignore_patterns(".cache", "*.md", ".gitattributes", "*.tek"))

kalan = set(ciftler)
for dosya in sorted(cikti.glob("*.safetensors")):
    with open(dosya, "r+b") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        baslik = json.loads(f.read(n))
        for ad, bilgi in baslik.items():
            if ad not in ciftler:
                continue
            if bilgi["dtype"] != "BF16":
                raise SystemExit(f"{ad}: beklenmeyen veri türü {bilgi['dtype']}")
            bas, son = bilgi["data_offsets"]
            f.seek(8 + n + bas)
            w = torch.frombuffer(bytearray(f.read(son - bas)), dtype=torch.bfloat16).reshape(bilgi["shape"])
            a, b = ciftler[ad]["lora_A"].float().cuda(), ciftler[ad]["lora_B"].float().cuda()
            yeni = (w.float().cuda() + olcek * (b @ a)).to(torch.bfloat16).cpu().contiguous()
            f.seek(8 + n + bas)
            f.write(yeni.view(torch.uint8).numpy().tobytes())
            kalan.discard(ad)
if kalan:
    raise SystemExit(f"tabanda bulunamayan katmanlar: {sorted(kalan)[:5]}")
print("bitti:", cikti)
