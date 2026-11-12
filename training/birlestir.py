"""LoRA ağırlıklarını taban modele işler ve tek parça model olarak kaydeder.

Kullanım: python birlestir.py <taban klasörü> <lora klasörü> <çıktı klasörü>
"""

import shutil
import sys
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForImageTextToText, AutoTokenizer

taban, lora, cikti = sys.argv[1], sys.argv[2], Path(sys.argv[3])
model = AutoModelForImageTextToText.from_pretrained(taban, dtype=torch.bfloat16, device_map={"": "cpu"})
model = PeftModel.from_pretrained(model, lora).merge_and_unload()
cikti.mkdir(parents=True, exist_ok=True)
model.save_pretrained(cikti, safe_serialization=True)
AutoTokenizer.from_pretrained(taban).save_pretrained(cikti)
# Görsel ön işleme ve sohbet şablonu dosyaları tabandan aynen alınır.
for ad in ["preprocessor_config.json", "video_preprocessor_config.json", "chat_template.jinja", "LICENSE"]:
    kaynak = Path(taban) / ad
    if kaynak.exists():
        shutil.copy(kaynak, cikti / ad)
print("birleştirildi:", cikti)
