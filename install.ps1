# Webicro Distribution - Universal Windows PowerShell One-Click Installer
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🚀 Webicro Distribution - Windows Kurulum Başlatılıyor..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Node.js Kontrolü
try {
    $nodeVer = node -v 2>$null
    Write-Host "✓ Node.js tespit edildi: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Node.js bulunamadı. Winget üzerinden kuruluyor..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "❌ Lütfen Node.js (v20+) kurun: https://nodejs.org/" -ForegroundColor Red
        Exit 1
    }
}

# 2. Webicro Kurulumu
Write-Host "📦 Webicro CLI kuruluyor..." -ForegroundColor Yellow
try {
    npm install -g @webicro/cli
    Write-Host "✓ Webicro başarıyla kuruldu!" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Kurulum tamamlanamadı, npx ile başlatılabilir." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✨ Kurulum Tamamlandı!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Webicro'yu başlatmak için PowerShell veya Komut İstemi'ne:" -ForegroundColor White
Write-Host "👉 webicro ui" -ForegroundColor Yellow
Write-Host ""
