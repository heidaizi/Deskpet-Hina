#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
ARCH="$(uname -m)"
[[ "$(uname -s)" == "Darwin" && "$ARCH" == "arm64" ]] || {
  echo "Transfer bundle currently requires macOS arm64." >&2
  exit 1
}

TTS_SOURCE="${DESKPET_TTS_ROOT:-$HOME/.local/share/deskpet-tts}"
UV_SOURCE="${DESKPET_UV_BINARY:-$HOME/.codex/bin/uv}"
APP_SOURCE="$ROOT/dist/日奈桌宠.app"
APP_INSTALLED="$HOME/Applications/日奈桌宠.app"
STAMP="$(date +%Y%m%d-%H%M%S)"
BUNDLE_NAME="Deskpet-transfer-${VERSION}-macos-${ARCH}"
TEMP_ROOT="$(mktemp -d "$ROOT/dist/.deskpet-transfer.XXXXXX")"
STAGE="$TEMP_ROOT/$BUNDLE_NAME"
FINAL_DIR="$ROOT/dist/$BUNDLE_NAME"
FINAL_ZIP="$ROOT/dist/$BUNDLE_NAME.zip"

cleanup() {
  if [[ -d "$TEMP_ROOT" ]]; then
    rm -rf "$TEMP_ROOT"
  fi
}
trap cleanup EXIT

require_file() {
  [[ -f "$1" ]] || {
    echo "Missing required file: $1" >&2
    exit 1
  }
}

require_dir() {
  [[ -d "$1" ]] || {
    echo "Missing required directory: $1" >&2
    exit 1
  }
}

require_file "$TTS_SOURCE/models/Irodori-TTS-v4.1-Small/model.safetensors"
require_file "$TTS_SOURCE/models/Semantic-DACVAE-Japanese-32dim/weights.pth"
require_file "$TTS_SOURCE/outputs/hina-speaker-inversion-run3-multiform-emotion/checkpoint_0000450.speaker.safetensors"
require_file "$TTS_SOURCE/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275/adapter_model.safetensors"
require_file "$UV_SOURCE"

echo "重新构建并安装 $VERSION 应用……"
(
  cd "$ROOT"
  npm run package:app
)
require_dir "$APP_SOURCE"

mkdir -p \
  "$STAGE/app" \
  "$STAGE/source" \
  "$STAGE/support/bin" \
  "$STAGE/support/tts/models" \
  "$STAGE/support/tts/outputs" \
  "$STAGE/optional-user-data"

ditto "$APP_SOURCE" "$STAGE/app/日奈桌宠.app"
cp "$ROOT/docs/TRANSFER_GUIDE.md" "$STAGE/README.md"
cp "$ROOT/packaging/install-transfer-bundle.zsh" "$STAGE/install.command"
cp "$ROOT/packaging/verify-transfer-bundle.zsh" "$STAGE/verify.command"
chmod +x "$STAGE/install.command" "$STAGE/verify.command"

echo "复制源码快照……"
rsync -a \
  --exclude node_modules \
  --exclude dist \
  --exclude out \
  --exclude test-results \
  --exclude playwright-report \
  --exclude .obsidian \
  --exclude .DS_Store \
  --exclude 'assets/characters/*/private/audio/' \
  --exclude 'assets/characters/*/references/' \
  "$ROOT/" "$STAGE/source/Deskpet-source/"

mkdir -p \
  "$STAGE/source/Deskpet-source/assets/characters/hina-swimsuit/private/audio"
ditto \
  "$ROOT/assets/characters/hina-swimsuit/private/audio/official-denoise45" \
  "$STAGE/source/Deskpet-source/assets/characters/hina-swimsuit/private/audio/official-denoise45"
ditto \
  "$ROOT/assets/characters/hina-swimsuit/private/audio/generated-dialogue" \
  "$STAGE/source/Deskpet-source/assets/characters/hina-swimsuit/private/audio/generated-dialogue"

echo "复制 TTS 必需模型和源码……"
ditto \
  "$TTS_SOURCE/models/Irodori-TTS-v4.1-Small" \
  "$STAGE/support/tts/models/Irodori-TTS-v4.1-Small"
ditto \
  "$TTS_SOURCE/models/Semantic-DACVAE-Japanese-32dim" \
  "$STAGE/support/tts/models/Semantic-DACVAE-Japanese-32dim"
ditto \
  "$TTS_SOURCE/models/modernbert-ja-tokenizer" \
  "$STAGE/support/tts/models/modernbert-ja-tokenizer"

mkdir -p \
  "$STAGE/support/tts/outputs/hina-speaker-inversion-run3-multiform-emotion" \
  "$STAGE/support/tts/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275"
cp \
  "$TTS_SOURCE/outputs/hina-speaker-inversion-run3-multiform-emotion/checkpoint_0000450.speaker.safetensors" \
  "$STAGE/support/tts/outputs/hina-speaker-inversion-run3-multiform-emotion/"
for file in adapter_model.safetensors adapter_config.json config.json README.md irodori_lora_metadata.json; do
  cp \
    "$TTS_SOURCE/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275/$file" \
    "$STAGE/support/tts/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275/"
done

rsync -a \
  --exclude .git \
  --exclude .venv \
  --exclude __pycache__ \
  --exclude '*.pyc' \
  "$TTS_SOURCE/Irodori-TTS/" "$STAGE/support/tts/Irodori-TTS/"
rsync -a \
  --exclude .git \
  --exclude __pycache__ \
  --exclude '*.pyc' \
  "$TTS_SOURCE/Irodori-TTS-Server/" "$STAGE/support/tts/Irodori-TTS-Server/"
rsync -a \
  --exclude .git \
  --exclude __pycache__ \
  --exclude '*.pyc' \
  --exclude '*.egg-info' \
  "$TTS_SOURCE/dacvae/" "$STAGE/support/tts/dacvae/"
cp "$ROOT/scripts/start-hina-irodori-server.zsh" \
  "$STAGE/support/tts/start-hina-irodori-server.zsh"
cp "$UV_SOURCE" "$STAGE/support/bin/uv"
chmod +x "$STAGE/support/bin/uv"

"$UV_SOURCE" pip freeze \
  --python "$TTS_SOURCE/Irodori-TTS/.venv/bin/python" |
  awk '!/^-e file:/' >"$STAGE/support/tts/requirements-macos-arm64.txt"

for filename in \
  pet-state.json \
  settings.json \
  presence-session.json \
  presence-emotion.json \
  presence-memory.json; do
  source_file="$HOME/Library/Application Support/Deskpet/$filename"
  if [[ -f "$source_file" ]]; then
    cp "$source_file" "$STAGE/optional-user-data/$filename"
  fi
done

cat >"$STAGE/TRANSFER_MANIFEST.json" <<EOF
{
  "schemaVersion": 1,
  "product": "Deskpet",
  "version": "$VERSION",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platform": "macOS",
  "architecture": "$ARCH",
  "privateUseOnly": true,
  "excluded": [
    "DeepSeek API key",
    "Electron user data except optional pet state and settings",
    "TTS cache and logs",
    "training checkpoints and evaluation audio",
    "private reference artwork"
  ]
}
EOF

(
  cd "$STAGE"
  find . -type f -name '.DS_Store' -delete
  LC_ALL=C find . -type f ! -name 'FILE_MANIFEST.sha256' -print0 |
    sort -z |
    xargs -0 shasum -a 256 >FILE_MANIFEST.sha256
  du -sh . >BUNDLE_SIZE.txt
)

if find "$STAGE" -path '*/references/*' -print -quit | grep -q .; then
  echo "Transfer bundle unexpectedly contains reference artwork." >&2
  exit 1
fi
if find "$STAGE" -type f \( -name 'deepseek-key.enc' -o -name '*.log' \) -print -quit | grep -q .; then
  echo "Transfer bundle unexpectedly contains private runtime data." >&2
  exit 1
fi
if grep -q 'FILE_MANIFEST.sha256' "$STAGE/FILE_MANIFEST.sha256"; then
  echo "File manifest must not hash itself." >&2
  exit 1
fi

if [[ -e "$FINAL_DIR" ]]; then
  mv "$FINAL_DIR" "$FINAL_DIR.backup-$STAMP"
fi
mv "$STAGE" "$FINAL_DIR"

echo "制作 ZIP……"
TEMP_ZIP="$ROOT/dist/.$BUNDLE_NAME.$STAMP.zip"
ditto -c -k --sequesterRsrc --keepParent "$FINAL_DIR" "$TEMP_ZIP"
if [[ -e "$FINAL_ZIP" ]]; then
  mv "$FINAL_ZIP" "$FINAL_ZIP.backup-$STAMP"
fi
mv "$TEMP_ZIP" "$FINAL_ZIP"
shasum -a 256 "$FINAL_ZIP" >"$FINAL_ZIP.sha256"

echo "迁移目录：$FINAL_DIR"
echo "迁移压缩包：$FINAL_ZIP"
cat "$FINAL_ZIP.sha256"
