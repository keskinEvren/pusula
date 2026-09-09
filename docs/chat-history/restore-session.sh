#!/usr/bin/env bash
set -e

# Restore script for Antigravity Session a4db2f68-0ce6-413a-8015-b6c93a0f71ff
# Run this on another computer (Linux/macOS) where you want to continue this exact chat.

SESSION_ID="${1:-a4db2f68-0ce6-413a-8015-b6c93a0f71ff}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAR_FILE="${SCRIPT_DIR}/session-${SESSION_ID}.tar.gz"

if [ ! -f "$TAR_FILE" ]; then
  echo "Hata: Paket dosyasi bulunamadi: $TAR_FILE"
  exit 1
fi

DEST_DIR="${HOME}/.gemini/antigravity"
mkdir -p "${DEST_DIR}/conversations" "${DEST_DIR}/brain"

echo "=== Antigravity Chat Oturumu Geri Yukleniyor ==="
echo "Hedef Dizin: $DEST_DIR"
echo "Paket Dosyasi: $TAR_FILE"

tar -xzf "$TAR_FILE" -C "$DEST_DIR"

# Temizle
find "${DEST_DIR}/conversations" "${DEST_DIR}/brain/${SESSION_ID}" -name "._*" -delete 2>/dev/null || true

echo "Basariyla tamamlandi!"
echo "Oturum ID: ${SESSION_ID}"
echo "Antigravity IDE veya agy CLI acildiginda bu oturum otomatik olarak gecmiste gorunecektir."
