#!/bin/zsh
set -euo pipefail

TTS_ROOT="$HOME/.local/share/deskpet-tts"
IRODORI_ROOT="$TTS_ROOT/Irodori-TTS"
MODEL_ROOT="$TTS_ROOT/models"
DATA_ROOT="$TTS_ROOT/data/hina-multiform"
INIT_EMBED="$TTS_ROOT/outputs/hina-speaker-inversion-run2-expanded/checkpoint_0000300.speaker.safetensors"
OUTPUT_DIR="$TTS_ROOT/outputs/hina-speaker-inversion-run3-multiform-emotion"

cd "$IRODORI_ROOT"

caffeinate -dimsu "$IRODORI_ROOT/.venv/bin/python" train.py \
  --config "$IRODORI_ROOT/configs/train_hina_multiform_emotion.yaml" \
  --manifest "$DATA_ROOT/hina-multiform-balanced-manifest.jsonl" \
  --init-checkpoint "$MODEL_ROOT/Irodori-TTS-v4.1-Small/model.safetensors" \
  --speaker-inversion-init-embedding "$INIT_EMBED" \
  --output-dir "$OUTPUT_DIR" \
  --device mps \
  --precision fp32 \
  --max-steps 450 \
  --save-every 25 \
  --log-every 5 \
  --batch-size 1 \
  --num-workers 0 \
  --gradient-checkpointing
