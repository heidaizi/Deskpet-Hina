#!/bin/zsh
set -euo pipefail

BUNDLE_ROOT="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/Applications"
INSTALL_APP="$INSTALL_DIR/空崎日奈.app"
TTS_ROOT="$HOME/.local/share/deskpet-tts"
USER_DATA_ROOT="$HOME/Library/Application Support/Deskpet"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "Deskpet 迁移安装"
echo "包目录：$BUNDLE_ROOT"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "此迁移包仅支持 Apple Silicon macOS（arm64）。" >&2
  exit 1
fi

if pgrep -f "/Applications/空崎日奈.app/Contents/MacOS/Electron" >/dev/null ||
  pgrep -f "$INSTALL_APP/Contents/MacOS/Electron" >/dev/null; then
  echo "请先退出正在运行的日奈桌宠，再重新执行安装。" >&2
  exit 1
fi

echo "校验迁移包文件……"
(
  cd "$BUNDLE_ROOT"
  shasum -a 256 -c FILE_MANIFEST.sha256 >/tmp/deskpet-transfer-verify.log
)
echo "校验通过。"

mkdir -p "$INSTALL_DIR"
if [[ -d "$INSTALL_APP" ]]; then
  mv "$INSTALL_APP" "$INSTALL_APP.backup-$STAMP"
fi
ditto "$BUNDLE_ROOT/app/空崎日奈.app" "$INSTALL_APP"
codesign --verify --deep --strict "$INSTALL_APP"

mkdir -p \
  "$TTS_ROOT/models" \
  "$TTS_ROOT/outputs" \
  "$TTS_ROOT/bin"

echo "恢复 TTS 源码和模型……"
ditto "$BUNDLE_ROOT/support/tts/models/." "$TTS_ROOT/models/"
ditto "$BUNDLE_ROOT/support/tts/outputs/." "$TTS_ROOT/outputs/"
ditto "$BUNDLE_ROOT/support/tts/dacvae" "$TTS_ROOT/dacvae"
ditto "$BUNDLE_ROOT/support/tts/Irodori-TTS" "$TTS_ROOT/Irodori-TTS.setup"
ditto "$BUNDLE_ROOT/support/tts/Irodori-TTS-Server" "$TTS_ROOT/Irodori-TTS-Server"
cp "$BUNDLE_ROOT/support/bin/uv" "$TTS_ROOT/bin/uv"
chmod +x "$TTS_ROOT/bin/uv"
cp "$BUNDLE_ROOT/support/tts/start-hina-irodori-server.zsh" \
  "$TTS_ROOT/start-hina-irodori-server.zsh"
chmod +x "$TTS_ROOT/start-hina-irodori-server.zsh"

if [[ -d "$TTS_ROOT/Irodori-TTS" ]]; then
  mv "$TTS_ROOT/Irodori-TTS" "$TTS_ROOT/Irodori-TTS.backup-$STAMP"
fi
mv "$TTS_ROOT/Irodori-TTS.setup" "$TTS_ROOT/Irodori-TTS"

echo "恢复 Python 3.12 和推理依赖；此步骤需要联网……"
export UV_PYTHON_INSTALL_DIR="${DESKPET_PYTHON_INSTALL_DIR:-$TTS_ROOT/python}"
export UV_CACHE_DIR="${DESKPET_UV_CACHE_DIR:-$TTS_ROOT/uv-cache}"
"$TTS_ROOT/bin/uv" python install 3.12

VENV_PATH="$TTS_ROOT/Irodori-TTS/.venv"
NEW_VENV="$TTS_ROOT/Irodori-TTS/.venv-transfer-$STAMP"
"$TTS_ROOT/bin/uv" venv --python 3.12 "$NEW_VENV"
"$TTS_ROOT/bin/uv" pip install \
  --python "$NEW_VENV/bin/python" \
  --link-mode copy \
  -r "$BUNDLE_ROOT/support/tts/requirements-macos-arm64.txt"
"$TTS_ROOT/bin/uv" pip install \
  --python "$NEW_VENV/bin/python" \
  --link-mode copy \
  --no-deps \
  -e "$TTS_ROOT/dacvae"

if [[ -d "$VENV_PATH" ]]; then
  mv "$VENV_PATH" "$TTS_ROOT/Irodori-TTS/.venv.backup-$STAMP"
fi
mv "$NEW_VENV" "$VENV_PATH"

mkdir -p "$USER_DATA_ROOT"
for filename in \
  pet-state.json \
  settings.json \
  presence-session.json \
  presence-emotion.json \
  presence-memory.json; do
  source_file="$BUNDLE_ROOT/optional-user-data/$filename"
  target_file="$USER_DATA_ROOT/$filename"
  if [[ -f "$source_file" && ! -e "$target_file" ]]; then
    cp "$source_file" "$target_file"
  fi
done

echo
echo "安装完成：$INSTALL_APP"
echo "TTS 运行时：$TTS_ROOT"
echo "下一步："
echo "1. 打开日奈桌宠设置，重新填写 DeepSeek API Key。"
echo "2. 在系统设置 → 隐私与安全性 → 辅助功能中重新授权。"
echo "3. 运行 ./verify.command --start-tts 完成最终验收。"
