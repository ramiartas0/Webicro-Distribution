# 🚀 Webicro Distribution — Local-First Flutter Release Orchestrator

[![CI Pipeline](https://github.com/webicro/webicro_distribution/actions/workflows/ci.yml/badge.svg)](https://github.com/webicro/webicro_distribution/actions/workflows/ci.yml)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Webicro Distribution**, Flutter mobil uygulamalarınızın sürüm belirleme (SemVer), statik analiz, test, derleme (AAB & IPA), yapay zeka destekli çok dilli sürüm notu üretimi, Google Play ve App Store Connect yükleme, Git senkronizasyonu ve hata teşhisini tek bir merkezden yöneten **yerel öncelikli (local-first)** açık kaynak kodlu dağıtım orkestratörüdür.

---

## 🎯 Projenin Amacı ve Özellikleri

- 🔍 **Akıllı Proje Keşfi:** Çalışma alanındaki veya belirtilen dizinlerdeki Flutter projelerini otomatik tespit eder.
- 🏷️ **Konvansiyonel Sürümleme:** Git commit mesajlarını (`feat`, `fix`, `BREAKING CHANGE`) inceleyerek SemVer sürüm artışını (`patch`, `minor`, `major`) otomatik belirler.
- 🤖 **Yapay Zeka Destekli Sürüm Notları:** Gemini, OpenAI veya Claude modelleri ile commit geçmişine dayalı, halüsinasyonsuz ve çok dilli (TR/EN) mağaza sürüm notları üretir.
- 🛡️ **Fail-Closed Kalite Kapıları:** Flutter SDK eksikliği, kod analizi uyarıları veya test başarısızlıklarında sahte başarı üretmez; işlemi derhal durdurur.
- 📦 **Doğrulanabilir Dağıtım Paketleri:** Üretilen AAB ve IPA paketlerini SHA-256 sağlama toplamı ile mühürler ve saklar.
- ☁️ **Çift Mağaza Entegrasyonu:** Google Play Developer API (kademeli dağıtım, dahili/kapalı test) ve App Store Connect API (JWT ES256, TestFlight, inceleme gönderimi) ile doğrudan konuşur.
- 🖥️ **Minimalist Web Dashboard & CLI:** Hem terminalden hem de monokrom, erişilebilir yerel web kontrol panelinden yönetilebilir.

---

## 🖥️ Desteklenen İşletim Sistemleri Matrisi

| İşletim Sistemi | Android (AAB) Derleme | iOS (IPA) Derleme | Google Play Yükleme | App Store Connect Yükleme | Web & CLI Arayüzü |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **macOS (Apple Silicon & Intel)** | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Linux (Ubuntu, Debian, Fedora)** | :white_check_mark: | :x: *(macOS gerektirir)* | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Windows 10 / 11** | :white_check_mark: | :x: *(macOS gerektirir)* | :white_check_mark: | :white_check_mark: | :white_check_mark: |

---

## 🔒 Güvenlik Modeli ve Mimari

Webicro Distribution, kurumsal güvenlik denetimlerinden geçmiş sıkılaştırılmış bir güvenlik mimarisine sahiptir:

1. **Yalnızca Yerel Ağ İzolasyonu (Local Loopback 127.0.0.1):**
   Web sunucusu asla tüm ağ arayüzlerinde (`0.0.0.0`) dinlemez; yalnızca `127.0.0.1` adresine bağlanarak yerel ağdaki üçüncü taraf cihazların erişimini engeller.
2. **Kriptografik Oturum Tokenı (Cryptographic Session Token):**
   Web paneli başlatıldığında 24 baytlık rastgele bir token üretilir. Token uyuşmayan API veya SSE istekleri `401 Unauthorized` ile engellenir.
3. **DNS Rebinding ve Sıkı Origin Doğrulaması:**
   Host başlığı `localhost` ve `127.0.0.1` dışında olan istekler ile yabancı sitelerden gelen CSRF istekleri `403 Forbidden` ile reddedilir.
4. **0600 Kimlik Bilgisi Dosya İzinleri:**
   `.release/credentials.json` dosyası işletim sistemi seviyesinde yalnızca geçerli kullanıcı tarafından okunabilecek (`0600` / `-rw-------`) şekilde saklanır. Ortam değişkenlerindeki geçici anahtarlar diske izinsiz kopyalanmaz.
5. **Dizin Aşımı Koruması (Path Traversal Guard):**
   Tüm dosya ve proje yolları `isSafeProjectPath` filtresinden geçirilerek yetkisiz sistem dizinlerine erişim engellenir.
6. **Güvenli Dry-Run Modu:**
   `--dry-run` bayrağı ile mağazalara veya Git'e dokunmadan tüm boru hattı geçerli simüle edilmiş yapay paketlerle baştan sona test edilebilir.

---

## 📦 Paket Mimarisi (Monorepo)

```text
apps/
├── cli/                 # Terminal komutları (release, status, rollback, resume, ui)
└── web/                 # React 18, Vite, Tailwind tabanlı monokrom canlı kontrol paneli

packages/
├── core/                # 20 adımlı merkezi orchestrator, state machine, abort controller
├── config/              # YAML konfigürasyonu ve Zod şema doğrulaması (snake_case normalizer)
├── git/                 # Git log analizi, commit ayrıştırma, native değişiklik sezimi
├── versioning/          # SemVer çözümleyici, build numarası artırma, çakışma kontrolü
├── changelog/           # Otomatik CHANGELOG.md üretimi ve markdown formatlama
├── validation/          # Mağaza karakter limitleri, hassas veri ve yasaklı terim tarayıcıları
├── ai/                  # Gemini, OpenAI, Claude ve Conventional sürüm notu motorları
├── flutter/             # Flutter doctor, analyze, tester ve pubspec.yaml yöneticisi
├── android/             # Flutter Android AAB derleme motoru
├── ios/                 # Flutter iOS IPA derleme motoru (macOS korumalı)
├── artifacts/           # SHA-256 sağlama toplamı, checksums ve immutable artifact deposu
├── security/            # Hassas anahtar tarayıcısı (SecretScanner) ve risk motoru
├── google-play/         # Google Play Developer API v3 adaptörü
├── app-store/           # App Store Connect API adaptörü
├── notifications/       # Slack, Discord ve Webhook bildirimleri
├── database/            # SQLite (better-sqlite3), WAL mode, repository katmanı
└── shared/              # Hata hiyerarşisi, structured logger, retry mekanizması
```

---

## ⚡ Kurulum ve Kullanım

### 1. Kurulum

```bash
# Depoyu klonlayın
git clone https://github.com/webicro/webicro_distribution.git
cd webicro_distribution

# Bağımlılıkları yükleyin ve derleyin
pnpm install
pnpm build
```

### 2. CLI Komutları

```bash
# Boru hattını güvenli simülasyon modunda test edin (Önerilen ilk adım)
node apps/cli/dist/index.js release --dry-run

# Otomatik konvansiyonel analiz ile dağıtım başlatın
node apps/cli/dist/index.js release

# Belirli bir SemVer artışı ile dağıtım başlatın
node apps/cli/dist/index.js release minor
node apps/cli/dist/index.js release patch
node apps/cli/dist/index.js release major

# Testleri veya AI notlarını atlayarak dağıtım yapın
node apps/cli/dist/index.js release --skip-tests --skip-ai

# Son dağıtımın durumunu veya denetim günlüklerini inceleyin
node apps/cli/dist/index.js status
node apps/cli/dist/index.js logs

# Bir sürümü geri alın (Git tag silme ve pubspec geri alma desteğiyle)
node apps/cli/dist/index.js rollback <release-id> --delete-tag --revert-pubspec

# Yarıda kalan veya başarısız olan bir dağıtımı kaldığı adımdan devam ettirin
node apps/cli/dist/index.js resume <release-id>
```

### 3. Web Dashboard (Görsel Arayüz)

```bash
# Güvenli yerel web kontrol panelini başlatın (Token ile otomatik tarayıcı açılır)
node apps/cli/dist/index.js ui --port 3100
```

---

## 🧪 Kalite Güvencesi ve Testler

Tüm değişiklikler TypeScript Strict Mode ve ESLint kurallarına uygun olarak geliştirilir:

```bash
# Monorepo genelinde sıfır hata tip kontrolü
pnpm -r typecheck

# ESLint statik kod analizi
pnpm lint

# Vitest birim ve entegrasyon testleri
pnpm test

# Üretim derlemesi
pnpm build
```

---

## 📄 Lisans ve Katkı

- **Lisans:** Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır.
- **Güvenlik Politikası:** Güvenlik açıkları bildirim rehberi için [SECURITY.md](SECURITY.md) dosyasını inceleyin.
- **Katkı Sağlama:** Katkıda bulunmak için lütfen [CONTRIBUTING.md](CONTRIBUTING.md) rehberine göz atın.
