"""Tek parça büyük bir model.safetensors dosyasını küçük parçalara böler.

Neden: Windows'ta 22 GB'lık tek dosya belleğe eşlenirken "disk belleği dosyası çok küçük" hatası verir.
Dosya belleğe eşlenmeden, başlığı okunup tensörler sırayla okunarak bölünür.

Kullanım: python parcala.py <model klasörü> [parça boyutu GB]
Özgün dosya model.safetensors.tek adıyla kalır; isteyen sonra siler.
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
import torch
from safetensors.torch import save_file

klasor = Path(sys.argv[1])
sinir = float(sys.argv[2]) * 1024**3 if len(sys.argv) > 2 else 3 * 1024**3
kaynak = klasor / "model.safetensors"
TUR = {"F32": np.float32, "F16": np.float16, "BF16": None, "I64": np.int64, "I32": np.int32, "U8": np.uint8, "BOOL": np.bool_, "F64": np.float64}

with open(kaynak, "rb") as f:
    n = struct.unpack("<Q", f.read(8))[0]
    baslik = json.loads(f.read(n))
    veri_basi = 8 + n
    meta = baslik.pop("__metadata__", {}) or {}
    adlar = sorted(baslik, key=lambda a: baslik[a]["data_offsets"][0])

    gruplar, grup, boyut = [], [], 0
    for ad in adlar:
        b = baslik[ad]["data_offsets"][1] - baslik[ad]["data_offsets"][0]
        if grup and boyut + b > sinir:
            gruplar.append(grup)
            grup, boyut = [], 0
        grup.append(ad)
        boyut += b
    gruplar.append(grup)

    harita = {}
    for i, grup in enumerate(gruplar, 1):
        dosya = f"model-{i:05d}-of-{len(gruplar):05d}.safetensors"
        tensorler = {}
        for ad in grup:
            bilgi = baslik[ad]
            bas, son = bilgi["data_offsets"]
            f.seek(veri_basi + bas)
            ham = f.read(son - bas)
            if bilgi["dtype"] == "BF16":
                t = torch.frombuffer(bytearray(ham), dtype=torch.bfloat16)
            else:
                t = torch.from_numpy(np.frombuffer(ham, dtype=TUR[bilgi["dtype"]]).copy())
            tensorler[ad] = t.reshape(bilgi["shape"])
            harita[ad] = dosya
        save_file(tensorler, str(klasor / dosya), metadata={"format": "pt"})
        print(dosya, len(grup), "tensör", flush=True)
        del tensorler

json.dump({"metadata": meta, "weight_map": harita}, open(klasor / "model.safetensors.index.json", "w", encoding="utf-8"), indent=1)
kaynak.rename(klasor / "model.safetensors.tek")
print("bitti", len(gruplar), "parça")
