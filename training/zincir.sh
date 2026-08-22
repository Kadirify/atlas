#!/usr/bin/env bash
# Bir Atlas modelini baştan sona üretir: eğitim, birleştirme, GGUF, sıkıştırma, Ollama, ölçüm.
#
# Kullanım: bash zincir.sh <ad> <taban klasörü> <Ollama taban adı> <veri klasörü> [sıkıştırma] [epoch]
# Örnek:    bash zincir.sh mini taban/Qwen3.5-2B qwen3.5:2b veri3 Q4_K_M 1
#
# Eğitim betiği EGIT değişkeniyle seçilir (varsayılan egit_genel.py); DORT_BIT, METIN, MAX_TOKEN, BATCH
# değişkenleri ona aynen geçer. Modeller ölçüm Ollama'sına (11435) kurulur; kullanıcının Ollama'sına dokunulmaz.
set -u
AD="$1"; TABAN="$2"; OLLAMA_TABAN="$3"; VERI="$4"; NICEM="${5:-Q4_K_M}"; EPOCH="${6:-1}"
# Çalışma klasörü (taban/, veri/, cikti/, venv/) ve depo yolu değişkenlerle değiştirilebilir.
KOK="${ATLAS_EGITIM:-$PWD}"; cd "$KOK"
DEPO="${ATLAS_DEPO:-$(cd "$(dirname "$0")/.." && pwd)}"
OLCUM="${ATLAS_OLCUM:-$KOK/olcum}"
export HF_HOME="$KOK/hf" PYTHONIOENCODING=utf-8 OLLAMA_HOST=127.0.0.1:11435
PY="$KOK/venv/Scripts/python"
CIKTI="cikti/atlas-$AD"; mkdir -p "$CIKTI"
MODEL="atlas-$AD-deneme:$(echo "$NICEM" | tr 'A-Z_' 'a-z-')"
HOST="http://127.0.0.1:11435"
adim() { echo "=== $(date +%H:%M) $*"; }
bitir() { echo "ZINCIR HATASI ($AD): $*"; exit 1; }

# Ekran kartı boş olsun: iki Ollama'daki yüklü modeller bellekten çıkarılır.
bosalt() {
  for h in 127.0.0.1:11434 127.0.0.1:11435; do
    for m in $(curl -s -m 5 "http://$h/api/ps" | "$PY" -c "import sys,json;print(' '.join(m['name'] for m in json.load(sys.stdin).get('models',[])))" 2>/dev/null); do
      OLLAMA_HOST=$h ollama stop "$m" >/dev/null 2>&1
    done
  done
}

if [ ! -f "$CIKTI/lora/adapter_model.safetensors" ] || [ ! -f "$CIKTI/egitim-gunlugu.json" ]; then
  adim "eğitim"; bosalt
  "$PY" "${EGIT:-egit_genel.py}" "$TABAN" "$CIKTI" "$VERI" "$EPOCH" > "$CIKTI/egitim.log" 2>&1 || bitir "eğitim (bkz. $CIKTI/egitim.log)"
fi

GGUF="$CIKTI/atlas-$AD-$NICEM.gguf"
if [ ! -f "$GGUF" ]; then
  if [ ! -f "$CIKTI/atlas-$AD-f16.gguf" ]; then
    adim "birleştirme"
    if ! "$PY" birlestir_dogrudan.py "$TABAN" "$CIKTI/lora" "$CIKTI/birlesik" > "$CIKTI/birlestir.log" 2>&1; then
      adim "doğrudan birleştirme olmadı, modeli yükleyerek birleştiriliyor"
      rm -rf "$CIKTI/birlesik"
      "$PY" birlestir.py "$TABAN" "$CIKTI/lora" "$CIKTI/birlesik" >> "$CIKTI/birlestir.log" 2>&1 || bitir "birleştirme"
      "$PY" eksik_tamamla.py "$TABAN" "$CIKTI/birlesik" >> "$CIKTI/birlestir.log" 2>&1 || bitir "eksik katmanlar"
    fi
    adim "GGUF dönüşümü"
    "$PY" llama.cpp/convert_hf_to_gguf.py "$CIKTI/birlesik" --outfile "$CIKTI/atlas-$AD-f16.gguf" --outtype f16 > "$CIKTI/donustur.log" 2>&1 || bitir "dönüşüm"
    rm -rf "$CIKTI/birlesik"
  fi
  adim "sıkıştırma ($NICEM)"
  llama-bin/llama-quantize.exe "$CIKTI/atlas-$AD-f16.gguf" "$GGUF" "$NICEM" > "$CIKTI/nicemle.log" 2>&1 || bitir "sıkıştırma"
fi

adim "Ollama modeli: $MODEL"
# Tarif tabanınkiyle aynıdır; yalnızca ilk FROM satırı yeni dosyayı gösterir.
ollama show "$OLLAMA_TABAN" --modelfile | "$PY" -c "
import sys
ilk = True
for satir in sys.stdin.read().splitlines():
    if satir.startswith('#'):
        continue
    if ilk and satir.startswith('FROM '):
        print('FROM ./atlas-$AD-$NICEM.gguf'); ilk = False
    else:
        print(satir)
" > "$CIKTI/Modelfile-$NICEM"
(cd "$CIKTI" && ollama create "$MODEL" -f "Modelfile-$NICEM" > "olustur.log" 2>&1) || bitir "ollama create"

adim "yazım testleri"; bosalt
for m in "$OLLAMA_TABAN" "$MODEL"; do
  dosya="sonuc/$(echo "$m" | tr ':/' '__')"
  [ -f "$dosya.json" ] || "$PY" olc_yazim.py "$m" "$HOST" test > "$CIKTI/yazim.log" 2>&1
  [ -f "$dosya-test2.json" ] || "$PY" olc_yazim.py "$m" "$HOST" test2 >> "$CIKTI/yazim.log" 2>&1
done

adim "Atlas-TR ölçümü"
mkdir -p "$OLCUM/$AD"
# run.mjs depodaki tabloyu yalnızca bu modellerle yeniden yazar; asıl tablo ölçümden sonra geri konur.
cp "$DEPO/eval/RESULTS.md" "$KOK/$CIKTI/RESULTS-onceki.md"
(cd "$DEPO" && node eval/run.mjs --models "$OLLAMA_TABAN,$MODEL" --host "$HOST" --out "$OLCUM/$AD" > "$KOK/$CIKTI/olcum.log" 2>&1)
cp "$DEPO/eval/RESULTS.md" "$KOK/$CIKTI/olcum-tablo.md"
cp "$KOK/$CIKTI/RESULTS-onceki.md" "$DEPO/eval/RESULTS.md"
bosalt

adim "özet"
"$PY" - "$AD" "$OLLAMA_TABAN" "$MODEL" <<'EOF'
import json, sys, pathlib
ad, taban, model = sys.argv[1:4]
def yazim(m, ek=""):
    p = pathlib.Path("sonuc") / (m.replace(":", "_").replace("/", "_") + ek + ".json")
    return json.load(open(p, encoding="utf-8")).get("ozet") if p.exists() else None
for m in (taban, model):
    print("SONUC", ad, m, "| yazım:", json.dumps(yazim(m), ensure_ascii=False), "| zor yazım:", json.dumps(yazim(m, "-test2"), ensure_ascii=False))
EOF
grep "^|" "$CIKTI/olcum-tablo.md"
ls -la "$CIKTI"/*.gguf | awk '{print $5, $9}'
adim "bitti"
