# 🚀 Webicro Distribution — AI-Powered Flutter Release Orchestrator

Flutter mobil uygulamalarını tek bir komutla analiz eden, sürüm numarasını yöneten, yapay zeka ile sürüm notları (release notes) oluşturan, Android/iOS derlemelerini alan, Google Play ve App Store Connect'e yükleyen, doğrulama yapan ve kontrollü şekilde yayına alan otomatik release otomasyon platformu.

---

## 📦 Mimari ve Paket Yapısı

Sistem, `pnpm workspaces` ile yönetilen modüler bir TypeScript monorepo olarak tasarlanmıştır:

```text
apps/
└── cli/                 # Commander.js, Clack & Ora tabanlı modern CLI arayüzü

packages/
├── shared/              # Hata hiyerarşisi, structured logger, retry mekanizması, process runner
├── database/            # SQLite (better-sqlite3), WAL mode, migrationlar ve repository pattern
├── audit/               # WHO/WHAT/WHEN/WHERE/RESULT formatında denetim günlüğü servisi
├── config/              # YAML konfigürasyonu ve Zod 3 şema doğrulaması
├── git/                 # Git analizi, conventional commit ayrıştırma, native değişiklik sezimi
├── versioning/          # SemVer çözümleyici, build numarası artırma, çakışma kontrolü
├── changelog/           # Otomatik CHANGELOG.md üretimi ve markdown formatlama
├── validation/          # Mağaza karakter limitleri, hassas veri ve yasaklı terim tarayıcıları
├── ai/                  # AI sağlayıcı soyutlaması (Gemini, OpenAI, Mock), halüsinasyon koruması
├── flutter/             # Flutter doctor, analyze, tester ve pubspec.yaml versiyon yöneticisi
├── android/             # Flutter Android AAB derleme motoru
├── ios/                 # Flutter iOS IPA derleme motoru (macOS korumalı)
├── artifacts/           # SHA-256 hash doğrulama, checksums ve immutable artifact deposu
├── security/            # Güvenlik ve gizli anahtar tarayıcısı (secret scanner), risk motoru
├── google-play/         # Google Play Developer API v3 adaptörü
├── app-store/           # App Store Connect API (JWT ES256, polling, inceleme gönderimi)
├── notifications/       # Slack, Discord ve Webhook bildirimleri
└── core/                # 20 adımlı merkezi orchestrator, state machine, planlayıcı
```

---

## ⚡ Hızlı Başlangıç

### 1. Kurulum

```bash
pnpm install
pnpm build
```

### 2. Komutlar

```bash
# Otomatik analiz ve sürümleme ile release başlat (Dry-run)
pnpm --filter @webicro/cli dev release --dry-run

# Manuel sürüm artırma
pnpm --filter @webicro/cli dev release minor
pnpm --filter @webicro/cli dev release patch
pnpm --filter @webicro/cli dev release major

# Testleri veya platformları atlayarak çalıştırma
pnpm --filter @webicro/cli dev release --skip-tests --skip-ai

# Durum ve günlükleri görüntüleme
pnpm --filter @webicro/cli dev status
pnpm --filter @webicro/cli dev logs

# İptal veya geri alma
pnpm --filter @webicro/cli dev rollback <release-id>

# Kaldığı yerden devam etme (Idempotent resume)
pnpm --filter @webicro/cli dev resume <release-id>
```

---

## 🧪 Testler ve Tip Kontrolü

```bash
# Tüm birim testleri çalıştırın
pnpm test

# Tüm paketlerde TypeScript strict mode tip kontrolü
pnpm typecheck
```

---

## 🛡️ Temel Tasarım İlkeleri

1. **Deterministic Core:** AI asla kritik kararları tek başına alamaz. AI önerir, kurallar ve şemalar doğrular, orchestrator yürütür.
2. **Idempotent Execution:** Ağ kesintisi veya hata durumunda `resume` ile kalınan adımdan güvenle devam edilir; mükerrer sürüm veya artefakt oluşturulmaz.
3. **Multi-Store Independence:** Android ve iOS süreçleri birbirinden izole çalışır; bir mağazadaki aksaklık diğerini etkilemez.
4. **Secret-Free:** Gizli anahtarlar kod deposunda tutulmaz; ortamsal değişkenler ve güvenli sağlayıcılar kullanılır.
