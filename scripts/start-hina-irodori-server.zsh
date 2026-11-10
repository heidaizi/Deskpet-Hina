#!/bin/zsh
set -euo pipefail

TTS_ROOT="$HOME/.local/share/deskpet-tts"
IRODORI_ROOT="$TTS_ROOT/Irodori-TTS"
SERVER_ROOT="$TTS_ROOT/Irodori-TTS-Server"
MODEL_ROOT="$TTS_ROOT/models"
CHECKPOINT="$TTS_ROOT/outputs/hina-speaker-inversion-run3-multiform-emotion/checkpoint_0000450.speaker.safetensors"
LORA_ADAPTER="$TTS_ROOT/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275"
VOICES_DIR="$TTS_ROOT/voices/hina"

if [[ ! -x "$IRODORI_ROOT/.venv/bin/python" ]]; then
  echo "Irodori Python environment is missing: $IRODORI_ROOT/.venv" >&2
  exit 1
fi
if [[ ! -f "$CHECKPOINT" ]]; then
  echo "Hina speaker embedding is missing: $CHECKPOINT" >&2
  exit 1
fi
if [[ ! -d "$LORA_ADAPTER" ]]; then
  echo "Hina emotion LoRA adapter is missing: $LORA_ADAPTER" >&2
  exit 1
fi

mkdir -p "$VOICES_DIR"
ln -sfn "$CHECKPOINT" "$VOICES_DIR/hina-swimsuit.speaker.safetensors"

export PYTHONPATH="$SERVER_ROOT/src:$IRODORI_ROOT"
export HF_ENDPOINT="https://hf-mirror.com"
export HF_HUB_OFFLINE="1"
export TOKENIZERS_PARALLELISM="false"

export IRODORI_HOST="127.0.0.1"
export IRODORI_PORT="8788"
export IRODORI_CHECKPOINT="$MODEL_ROOT/Irodori-TTS-v4.1-Small/model.safetensors"
export IRODORI_CODEC_REPO="$MODEL_ROOT/Semantic-DACVAE-Japanese-32dim/weights.pth"
export IRODORI_MODEL_DEVICE="mps"
export IRODORI_CODEC_DEVICE="mps"
export IRODORI_MODEL_PRECISION="fp32"
export IRODORI_CODEC_PRECISION="fp32"
export IRODORI_COMPILE_MODEL="false"
export IRODORI_PRELOAD="true"
export IRODORI_MODEL_LOAD_TIMEOUT="300"
export IRODORI_MAX_CONCURRENT_SYNTHESIS="1"
export IRODORI_SYNTHESIS_WAIT_TIMEOUT="300"
export IRODORI_VOICES_DIR="$VOICES_DIR"
export IRODORI_DEFAULT_VOICE="hina-swimsuit"
export IRODORI_DEFAULT_RESPONSE_FORMAT="wav"
export IRODORI_DEFAULT_NUM_STEPS="24"
export IRODORI_DEFAULT_T_SCHEDULE_MODE="sway"
export IRODORI_DEFAULT_SWAY_COEFF="-1.0"
export IRODORI_DEFAULT_CFG_SCALE_TEXT="3.0"
export IRODORI_DEFAULT_CFG_SCALE_SPEAKER="5.0"
export IRODORI_DEFAULT_CFG_GUIDANCE_MODE="independent"
export IRODORI_DEFAULT_CHUNKING_ENABLED="true"

cd "$IRODORI_ROOT"
exec "$IRODORI_ROOT/.venv/bin/python" -m irodori_openai_tts \
  --host "$IRODORI_HOST" \
  --port "$IRODORI_PORT"
