#!/usr/bin/env bash
# Webicro Distribution - Universal macOS & Linux One-Click Installer
set -e

echo ""
echo "Webicro Distribution - Kurulum Başlatılıyor..."
echo "================================================"

# 1. Node.js Kontrolü
if ! command -v node >/dev/null 2>&1; then
    echo "[WARN] Node.js bulunamadı. Kurulum hazırlanıyor..."
    if command -v brew >/dev/null 2>&1; then
        echo "[INFO] Homebrew üzerinden Node.js kuruluyor..."
        brew install node
    else
        echo "[ERROR] Lütfen önce Node.js (v20+) kurun: https://nodejs.org/"
        exit 1
    fi
fi

NODE_VERSION=$(node -v)
echo "[OK] Node.js tespit edildi: $NODE_VERSION"

# 2. Webicro Kurulumu
echo "[INFO] Webicro CLI kuruluyor..."
if command -v npm >/dev/null 2>&1; then
    npm install -g @webicro/cli || {
        echo "[WARN] Global npm kurulumu sudo gerektirebilir veya npx ile başlatılıyor..."
    }
fi

echo ""
echo "[OK] Kurulum Başarıyla Tamamlandı!"
echo "================================================"
echo "Başlatmak için terminale şu komutu yazabilirsiniz:"
echo "webicro ui"
echo ""
