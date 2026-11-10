#!/bin/zsh
set -euo pipefail

TTS_ROOT="$HOME/.local/share/deskpet-tts"
IRODORI_ROOT="$TTS_ROOT/Irodori-TTS"
MODEL_ROOT="$TTS_ROOT/models"
DATA_ROOT="$TTS_ROOT/data/hina-multiform"
OUTPUT_DIR="${HINA_LORA_OUTPUT_DIR:-$TTS_ROOT/outputs/hina-emotion-lora-run1}"
MAX_STEPS="${HINA_LORA_MAX_STEPS:-300}"
SAVE_EVERY="${HINA_LORA_SAVE_EVERY:-25}"
ACCUMULATION_STEPS="${HINA_LORA_ACCUMULATION_STEPS:-4}"
LORA_TARGET_MODULES="${HINA_LORA_TARGET_MODULES:-diffusion_attn_mlp}"

if [[ ! -f "$DATA_ROOT/hina-emotion-lora-manifest.jsonl" ]]; then
  echo "Emotion LoRA manifest is missing. Run the build command first." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
cd "$IRODORI_ROOT"

caffeinate -dimsu "$IRODORI_ROOT/.venv/bin/python" train.py \
  --config "$IRODORI_ROOT/configs/train_v4_small_lora.yaml" \
  --manifest "$DATA_ROOT/hina-emotion-lora-manifest.jsonl" \
  --init-checkpoint "$MODEL_ROOT/Irodori-TTS-v4.1-Small/model.safetensors" \
  --output-dir "$OUTPUT_DIR" \
  --device mps \
  --precision fp32 \
  --max-steps "$MAX_STEPS" \
  --save-every "$SAVE_EVERY" \
  --log-every 10 \
  --batch-size 1 \
  --gradient-accumulation-steps "$ACCUMULATION_STEPS" \
  --num-workers 0 \
  --gradient-checkpointing \
  --lora \
  --lora-r 16 \
  --lora-alpha 32 \
  --lora-dropout 0.1 \
  --lora-target-modules "$LORA_TARGET_MODULES" \
  --lora-modules-to-save auto \
  --optimizer adamw \
  --lr 0.0001 \
  --weight-decay 0.01 \
  --lr-scheduler wsd \
  --warmup-steps 20 \
  --stable-steps 200 \
  --min-lr-scale 0.2 \
  --duration-loss-weight 0.2 \
  --text-condition-dropout 0.05 \
  --caption-condition-dropout 0.05 \
  --speaker-condition-dropout 0.05 \
  --valid-ratio 0 \
  --seed 20261024 2>&1 | tee "$OUTPUT_DIR/train.log"
