#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="空崎日奈"
BUNDLE_ID="local.deskpet.hina"
SOURCE_APP="$PROJECT_ROOT/node_modules/electron/dist/Electron.app"
DIST_APP="$PROJECT_ROOT/dist/$APP_NAME.app"
INSTALL_DIR="$HOME/Applications"
INSTALL_APP="$INSTALL_DIR/$APP_NAME.app"
ICON_SOURCE="$PROJECT_ROOT/docs/acceptance/hina-app-icon-source.png"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This packaging script only supports macOS." >&2
  exit 1
fi

for required in "$SOURCE_APP" "$PROJECT_ROOT/out/main/index.js" "$PROJECT_ROOT/content" "$ICON_SOURCE"; do
  if [[ ! -e "$required" ]]; then
    echo "Missing required path: $required" >&2
    exit 1
  fi
done

VERSION="$(node -p "require('$PROJECT_ROOT/package.json').version")"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/deskpet-icon.XXXXXX")"
ICONSET="$TEMP_DIR/$APP_NAME.iconset"
MASTER_ICON="$TEMP_DIR/master.png"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

mkdir -p "$ICONSET" "$PROJECT_ROOT/dist"
# 先按比例缩放到「短边 = 1024」，再居中裁成正方形。
# 这样画面尽量填满，只裁掉长边多出来的部分（本图约 6%）。
SRC_W=$(sips -g pixelWidth "$ICON_SOURCE" | awk '/pixelWidth/{print $2}')
SRC_H=$(sips -g pixelHeight "$ICON_SOURCE" | awk '/pixelHeight/{print $2}')
if [[ "$SRC_W" -ge "$SRC_H" ]]; then
  FITTED_W=1024
  FITTED_H=$(( 1024 * SRC_H / SRC_W ))
else
  FITTED_H=1024
  FITTED_W=$(( 1024 * SRC_W / SRC_H ))
fi
sips -z "$FITTED_H" "$FITTED_W" "$ICON_SOURCE" --out "$TEMP_DIR/fitted.png" >/dev/null
sips -c 1024 1024 "$TEMP_DIR/fitted.png" --out "$MASTER_ICON" >/dev/null

for spec in \
  "16 icon_16x16.png" \
  "32 icon_16x16@2x.png" \
  "32 icon_32x32.png" \
  "64 icon_32x32@2x.png" \
  "128 icon_128x128.png" \
  "256 icon_128x128@2x.png" \
  "256 icon_256x256.png" \
  "512 icon_256x256@2x.png" \
  "512 icon_512x512.png" \
  "1024 icon_512x512@2x.png"; do
  size="${spec%% *}"
  filename="${spec#* }"
  sips -z "$size" "$size" "$MASTER_ICON" --out "$ICONSET/$filename" >/dev/null
done

iconutil -c icns "$ICONSET" -o "$TEMP_DIR/hina.icns"

rm -rf "$DIST_APP"
ditto "$SOURCE_APP" "$DIST_APP"

APP_RESOURCES="$DIST_APP/Contents/Resources/app"
mkdir -p \
  "$APP_RESOURCES/assets/characters/hina-swimsuit/private/3d" \
  "$APP_RESOURCES/assets/characters/hina-swimsuit/private/audio" \
  "$APP_RESOURCES/scripts"
ditto "$PROJECT_ROOT/out" "$APP_RESOURCES/out"
ditto "$PROJECT_ROOT/content" "$APP_RESOURCES/content"
ditto \
  "$PROJECT_ROOT/assets/characters/hina-swimsuit/private/3d/official" \
  "$APP_RESOURCES/assets/characters/hina-swimsuit/private/3d/official"
if [[ -d "$PROJECT_ROOT/assets/characters/hina-swimsuit/private/audio/official-denoise45" ]]; then
  ditto \
    "$PROJECT_ROOT/assets/characters/hina-swimsuit/private/audio/official-denoise45" \
    "$APP_RESOURCES/assets/characters/hina-swimsuit/private/audio/official-denoise45"
fi
if [[ -d "$PROJECT_ROOT/assets/characters/hina-swimsuit/private/audio/generated-dialogue" ]]; then
  ditto \
    "$PROJECT_ROOT/assets/characters/hina-swimsuit/private/audio/generated-dialogue" \
    "$APP_RESOURCES/assets/characters/hina-swimsuit/private/audio/generated-dialogue"
fi
# 本地嵌入模型依赖（向量召回）：Electron 主进程运行时装，需随包分发。
for dep in @huggingface @img transformers onnxruntime-node onnxruntime-common sharp detect-libc semver; do
  if [[ -d "$PROJECT_ROOT/node_modules/$dep" ]]; then
    mkdir -p "$APP_RESOURCES/node_modules/$(dirname "$dep")"
    ditto "$PROJECT_ROOT/node_modules/$dep" "$APP_RESOURCES/node_modules/$dep"
  fi
done

cp "$PROJECT_ROOT/package.json" "$APP_RESOURCES/package.json"
cp "$PROJECT_ROOT/scripts/start-hina-irodori-server.zsh" \
  "$APP_RESOURCES/scripts/start-hina-irodori-server.zsh"
cp "$PROJECT_ROOT/scripts/denoise-hina-audio.py" \
  "$APP_RESOURCES/scripts/denoise-hina-audio.py"
cp "$PROJECT_ROOT/scripts/denoise-worker.py" \
  "$APP_RESOURCES/scripts/denoise-worker.py"

cp "$TEMP_DIR/hina.icns" "$DIST_APP/Contents/Resources/hina.icns"
plutil -replace CFBundleDisplayName -string "$APP_NAME" "$DIST_APP/Contents/Info.plist"
plutil -replace CFBundleName -string "$APP_NAME" "$DIST_APP/Contents/Info.plist"
plutil -replace CFBundleIdentifier -string "$BUNDLE_ID" "$DIST_APP/Contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$DIST_APP/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$VERSION" "$DIST_APP/Contents/Info.plist"
plutil -replace CFBundleIconFile -string "hina.icns" "$DIST_APP/Contents/Info.plist"
plutil -replace LSApplicationCategoryType -string "public.app-category.entertainment" \
  "$DIST_APP/Contents/Info.plist"
plutil -replace NSAppleEventsUsageDescription \
  -string "日奈桌宠仅在你主动触发 AI 时读取前台窗口标题或选中文字。" \
  "$DIST_APP/Contents/Info.plist"

# 优先使用稳定的自签名身份：ad-hoc 的 CDHash 每次构建都会变，
# macOS 会把每次更新当成新应用，辅助功能与自动化授权需要重新授予。
# 自签名身份的 designated requirement 固定，TCC 授权可以跨版本保留。
SIGN_IDENTITY="${DESKPET_SIGN_IDENTITY:-Deskpet Local Signing}"
ENTITLEMENTS="$PROJECT_ROOT/scripts/deskpet.entitlements"
if security find-identity -v -p codesigning 2>/dev/null | grep -Fq "\"$SIGN_IDENTITY\""; then
  codesign --force --deep --entitlements "$ENTITLEMENTS" --sign "$SIGN_IDENTITY" "$DIST_APP" >/dev/null
  echo "Signed with identity: $SIGN_IDENTITY"
else
  echo "WARNING: signing identity '$SIGN_IDENTITY' not found; falling back to ad-hoc." >&2
  echo "         macOS will ask for Accessibility/Automation permission again after each rebuild." >&2
  codesign --force --deep --entitlements "$ENTITLEMENTS" --sign - "$DIST_APP" >/dev/null
fi
codesign --verify --deep --strict "$DIST_APP"

mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_APP"
ditto "$DIST_APP" "$INSTALL_APP"

echo "Packaged app: $DIST_APP"
echo "Installed app: $INSTALL_APP"
