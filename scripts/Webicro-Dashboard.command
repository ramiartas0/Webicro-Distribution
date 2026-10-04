#!/usr/bin/env bash
# ==============================================================================
# Webicro Distribution - macOS Tek Tıkla Canlı Dashboard Başlatıcı
# Çift tıklandığında Terminal penceresi açılır ve web paneli tarayıcıda başlar.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "---------------------------------------------------------"
echo "  Webicro Distribution - Canlı Web Dashboard Başlatılıyor "
echo "---------------------------------------------------------"

cd "$ROOT_DIR"

if command -v webicro >/dev/null 2>&1; then
    webicro ui
elif [ -f "$ROOT_DIR/apps/cli/dist/index.js" ]; then
    node "$ROOT_DIR/apps/cli/dist/index.js" ui
else
    echo "Webicro CLI henüz derlenmemiş. Derleme başlatılıyor..."
    pnpm run build && node "$ROOT_DIR/apps/cli/dist/index.js" ui
fi
