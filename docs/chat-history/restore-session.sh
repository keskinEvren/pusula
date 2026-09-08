#!/usr/bin/env bash
set -e

# Restore script for Antigravity Session 4f656576-acae-42f2-8392-9de76f24d183
# Run this on another computer where you want to continue this exact chat.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAR_FILE="${SCRIPT_DIR}/session-4f656576-acae-42f2-8392-9de76f24d183.tar.gz"

if [ ! -f "$TAR_FILE" ]; then
  echo "Hata: Paket dosyasi bulunamadi: $TAR_FILE"
  exit 1
fi

DEST_DIR="${HOME}/.gemini/antigravity"
mkdir -p "${DEST_DIR}/conversations" "${DEST_DIR}/brain"

echo "=== Antigravity Chat Oturumu Geri Yukleniyor ==="
echo "Hedef Dizin: $DEST_DIR"

tar -xzf "$TAR_FILE" -C "$DEST_DIR"

echo "Basariyla tamamlandi!"
echo "Oturum ID: 4f656576-acae-42f2-8392-9de76f24d183"
echo "Antigravity IDE veya agy CLI acildiginda bu oturum otomatik olarak gecmiste gorunecektir."
