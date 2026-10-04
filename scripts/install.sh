#!/usr/bin/env bash
# ==============================================================================
# Webicro Distribution - Universal One-Click Installer
# Desteklenen Ortamlar: macOS (Darwin) & Linux (x86_64, arm64)
# Paket Yöneticileri: Homebrew, pnpm, yarn, npm
# ==============================================================================

set -e

# Renk tanımları
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

log_info() {
    printf "${BLUE}ℹ${RESET} %s\n" "$1"
}

log_success() {
    printf "${GREEN}✔${RESET} %s\n" "$1"
}

log_warn() {
    printf "${YELLOW}⚠${RESET} %s\n" "$1"
}

log_error() {
    printf "${RED}✖${RESET} %s\n" "$1"
}

print_banner() {
    printf "\n${BOLD}${CYAN}"
    printf "=========================================================\n"
    printf "  Webicro Distribution - AI-Powered Flutter Release CLI   \n"
    printf "=========================================================\n"
    printf "${RESET}\n"
}

check_node() {
    log_info "Node.js sürümü kontrol ediliyor..."
    if ! command -v node >/dev/null 2>&1; then
        log_warn "Node.js bulunamadı!"
        if [[ "$OSTYPE" == "darwin"* ]] && command -v brew >/dev/null 2>&1; then
            log_info "Homebrew üzerinden Node.js kuruluyor..."
            brew install node
        else
            log_error "Lütfen Node.js v20 veya üzerini kurun: https://nodejs.org/"
            exit 1
        fi
    fi

    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

    if [ "$NODE_MAJOR" -lt 20 ]; then
        log_warn "Mevcut Node.js sürümü: v$NODE_VERSION (Önerilen: >= v20.0.0)"
        if [[ "$OSTYPE" == "darwin"* ]] && command -v brew >/dev/null 2>&1; then
            log_info "Homebrew ile Node.js güncelleniyor..."
            brew upgrade node || true
        fi
    else
        log_success "Node.js uyumlu: v$NODE_VERSION"
    fi
}

detect_package_manager() {
    if command -v pnpm >/dev/null 2>&1; then
        PKG_MGR="pnpm"
    elif command -v yarn >/dev/null 2>&1; then
        PKG_MGR="yarn"
    elif command -v npm >/dev/null 2>&1; then
        PKG_MGR="npm"
    else
        log_error "npm, pnpm veya yarn paket yöneticilerinden en az biri kurulu olmalıdır."
        exit 1
    fi
    log_info "Tespit edilen paket yöneticisi: ${BOLD}${PKG_MGR}${RESET}"
}

install_local_repo() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

    if [ -f "$REPO_DIR/package.json" ] && [ -d "$REPO_DIR/apps/cli" ]; then
        log_info "Depo dizini tespit edildi: $REPO_DIR"
        log_info "Bağımlılıklar yükleniyor ve derleniyor..."
        cd "$REPO_DIR"

        if [ "$PKG_MGR" = "pnpm" ]; then
            pnpm install --frozen-lockfile=false
            pnpm run build
            log_info "@webicro/cli global olarak bağlanıyor..."
            cd "$REPO_DIR/apps/cli"
            pnpm link --global || npm link
        elif [ "$PKG_MGR" = "yarn" ]; then
            yarn install
            yarn build
            cd "$REPO_DIR/apps/cli"
            yarn link || npm link
        else
            npm install
            npm run build
            cd "$REPO_DIR/apps/cli"
            npm link
        fi

        log_success "Yerel depodan global kurulum tamamlandı!"
        return 0
    fi
    return 1
}

install_global_package() {
    log_info "Webicro CLI global olarak kuruluyor..."
    case "$PKG_MGR" in
        pnpm)
            pnpm add -g @webicro/cli || npm install -g @webicro/cli
            ;;
        yarn)
            yarn global add @webicro/cli || npm install -g @webicro/cli
            ;;
        npm)
            npm install -g @webicro/cli
            ;;
    esac
}

verify_installation() {
    log_info "Kurulum doğrulanıyor..."
    if command -v webicro >/dev/null 2>&1; then
        CLI_PATH=$(command -v webicro)
        log_success "Webicro CLI başarıyla kuruldu: ${BOLD}$CLI_PATH${RESET}"
    elif command -v release >/dev/null 2>&1; then
        CLI_PATH=$(command -v release)
        log_success "Webicro CLI (release) başarıyla kuruldu: ${BOLD}$CLI_PATH${RESET}"
    else
        log_warn "'webicro' komutu doğrudan PATH içinde bulunamadı."
        log_warn "Lütfen terminalinizi yeniden başlatın veya PATH ortam değişkeninizi kontrol edin."
        log_info "npm global bin dizini: $(npm bin -g 2>/dev/null || echo '~/.npm-global/bin')"
    fi
}

main() {
    print_banner
    check_node
    detect_package_manager

    # Eğer yerel depo içerisinden çalıştırılıyorsa yerel build & link yap
    if ! install_local_repo; then
        # Aksi halde global npm/pnpm/yarn paketini kur
        install_global_package
    fi

    verify_installation

    printf "\n${BOLD}${GREEN}✔ Kurulum Tamamlandı!${RESET}\n\n"
    printf "Aşağıdaki komutları kullanarak başlayabilirsiniz:\n\n"
    printf "  ${BOLD}webicro ui${RESET}       -> Web Dashboard'u tarayıcınızda açar (GUI)\n"
    printf "  ${BOLD}webicro release${RESET}  -> Otomatik Flutter dağıtım sürecini başlatır (CLI)\n"
    printf "  ${BOLD}webicro --help${RESET}   -> Tüm komutları ve yardım seçeneklerini listeler\n\n"
}

main "$@"
