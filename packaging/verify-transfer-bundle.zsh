#!/bin/zsh
set -euo pipefail

BUNDLE_ROOT="$(cd "$(dirname "$0")" && pwd)"
INSTALL_APP="$HOME/Applications/空崎日奈.app"
TTS_ROOT="$HOME/.local/share/deskpet-tts"
START_TTS=0
[[ "${1:-}" == "--start-tts" ]] && START_TTS=1

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[[ "$(uname -m)" == "arm64" ]] || fail "目标机不是 Apple Silicon arm64。"

echo "[1/7] 校验迁移包文件"
(
  cd "$BUNDLE_ROOT"
  shasum -a 256 -c FILE_MANIFEST.sha256 >/tmp/deskpet-transfer-verify.log
)
if grep -q 'FILE_MANIFEST.sha256' "$BUNDLE_ROOT/FILE_MANIFEST.sha256"; then
  fail "FILE_MANIFEST 不应包含自身。"
fi
if find "$BUNDLE_ROOT" -path '*/references/*' -print -quit | grep -q .; then
  fail "迁移包包含不应分发的参考图。"
fi
if find "$BUNDLE_ROOT" -type f \( -name 'deepseek-key.enc' -o -name '*.log' \) -print -quit |
  grep -q .; then
  fail "迁移包包含密钥、缓存或日志。"
fi

echo "[2/7] 校验应用签名与架构"
codesign --verify --deep --strict "$INSTALL_APP"
file "$INSTALL_APP/Contents/MacOS/Electron" | grep -q "arm64"

echo "[3/7] 校验应用素材"
APP_RESOURCES="$INSTALL_APP/Contents/Resources/app"
[[ -f "$APP_RESOURCES/assets/characters/hina-swimsuit/private/3d/official/hina-swimsuit-official.glb" ]]
[[ "$(find "$APP_RESOURCES/assets/characters/hina-swimsuit/private/audio/official-denoise45" -type f -name '*.wav' | wc -l | tr -d ' ')" -ge 13 ]]
[[ "$(find "$APP_RESOURCES/assets/characters/hina-swimsuit/private/audio/generated-dialogue" -type f -name '*.wav' | wc -l | tr -d ' ')" -eq 41 ]]

echo "[4/7] 校验 TTS 模型"
[[ -f "$TTS_ROOT/models/Irodori-TTS-v4.1-Small/model.safetensors" ]]
[[ -f "$TTS_ROOT/models/Semantic-DACVAE-Japanese-32dim/weights.pth" ]]
[[ -f "$TTS_ROOT/outputs/hina-speaker-inversion-run3-multiform-emotion/checkpoint_0000450.speaker.safetensors" ]]
[[ -f "$TTS_ROOT/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275/adapter_model.safetensors" ]]

echo "[5/7] 校验 Python 环境"
PYTHON="$TTS_ROOT/Irodori-TTS/.venv/bin/python"
[[ -x "$PYTHON" ]] || fail "缺少 TTS Python 虚拟环境。"
"$PYTHON" - <<'PY'
import importlib.metadata as metadata
required = ["torch", "torchaudio", "fastapi", "uvicorn", "soundfile", "noisereduce"]
for package in required:
    version = metadata.version(package)
    print(f"{package}={version}")
PY

echo "[6/7] 校验源码快照"
[[ -f "$BUNDLE_ROOT/source/Deskpet-source/package.json" ]]
[[ -f "$BUNDLE_ROOT/source/Deskpet-source/src/main/index.ts" ]]

echo "[7/7] 可选 TTS 启动测试"
if [[ "$START_TTS" -eq 1 ]]; then
  LOG_FILE="$(mktemp -t deskpet-transfer-health).log"
  START_SCRIPT="$TTS_ROOT/start-hina-irodori-server.zsh"
  if [[ ! -f "$START_SCRIPT" ]]; then
    START_SCRIPT="$BUNDLE_ROOT/support/tts/start-hina-irodori-server.zsh"
  fi
  zsh "$START_SCRIPT" >"$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  cleanup_server() {
    kill "$SERVER_PID" 2>/dev/null || true
  }
  trap cleanup_server EXIT
  READY=0
  for _ in {1..60}; do
    if curl -fsS http://127.0.0.1:8788/health 2>/dev/null | grep -q '"loaded":true'; then
      READY=1
      break
    fi
    sleep 1
  done
  if [[ "$READY" -ne 1 ]]; then
    tail -n 80 "$LOG_FILE"
    fail "TTS 服务未在 60 秒内就绪。"
  fi
  echo "TTS health: OK"
else
  echo "跳过启动测试；使用 ./verify.command --start-tts 可执行完整检查。"
fi

echo "PASS: 迁移包与安装结果验证通过。"
