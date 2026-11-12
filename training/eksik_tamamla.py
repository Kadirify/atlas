"""Birleştirilmiş modelde eksik kalan ağırlıkları tabandan tamamlar.

transformers, modeli yüklerken kullanmadığı katmanları (ör. çoklu belirteç tahmini, "mtp") kaydetmez;
GGUF dönüştürücü ise bunları bekler. Bu betik tabanda olup birleşik modelde olmayan tensörleri aynen kopyalar.

Kullanım: python eksik_tamamla.py <taban klasörü> <birleşik klasör>
"""

import sys
from pathlib import Path

from safetensors import safe_open
from safetensors.torch import load_file, save_file

taban, birlesik = Path(sys.argv[1]), Path(sys.argv[2])
hedef_dosya = sorted(birlesik.glob("*.safetensors"))[0]
hedef = load_file(hedef_dosya)
eklenen = []
for dosya in sorted(taban.glob("*.safetensors")):
    with safe_open(dosya, framework="pt") as f:
        for ad in f.keys():
            if ad not in hedef:
                hedef[ad] = f.get_tensor(ad)
                eklenen.append(ad)
        farkli = [ad for ad in f.keys() if ad not in eklenen and tuple(f.get_slice(ad).get_shape()) != tuple(hedef[ad].shape)]
if farkli:
    raise SystemExit(f"biçimi uyuşmayan tensörler: {farkli[:5]}")
save_file(hedef, hedef_dosya, metadata={"format": "pt"})
print(f"{len(eklenen)} tensör tabandan eklendi; örnek: {eklenen[:4]}")
