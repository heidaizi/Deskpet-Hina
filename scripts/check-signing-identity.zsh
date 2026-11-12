#!/bin/zsh
set -euo pipefail

# 检查打包使用的自签名身份是否稳定。
# TCC 的 designated requirement 会锁到证书叶指纹；只要这张证书不变，
# 重新 build 不需要重新授予屏幕录制/辅助功能/自动化权限。

IDENTITY="${DESKPET_SIGN_IDENTITY:-Deskpet Local Signing}"

if ! security find-identity -v -p codesigning 2>/dev/null | grep -Fq "\"$IDENTITY\""; then
  echo "ERROR: code-signing identity '$IDENTITY' not found in the keychain." >&2
  echo "Do not fall back to ad-hoc: its cdhash changes on every build and TCC will reset." >&2
  exit 1
fi

CERT_PEM="$(security find-certificate -c "$IDENTITY" -p 2>/dev/null || true)"
if [[ -z "$CERT_PEM" ]]; then
  echo "ERROR: cannot read certificate '$IDENTITY'." >&2
  exit 1
fi

print -r -- "Identity: $IDENTITY"
print -r -- "$CERT_PEM" | openssl x509 -noout -subject -issuer -dates -fingerprint -sha1
if ! print -r -- "$CERT_PEM" | openssl x509 -checkend 31536000 -noout 2>/dev/null; then
  echo "WARNING: certificate expires within one year; renewing it will change the TCC requirement." >&2
fi

echo "OK: this identity is suitable for stable local builds."
