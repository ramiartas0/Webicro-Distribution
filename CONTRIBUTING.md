# Contributing to Webicro Distribution / Katkı Sağlama Rehberi

Webicro Distribution projesine katkıda bulunmak istediğiniz için teşekkür ederiz! Kurumsal seviyede güvenilir, kararlı ve açık kaynak bir mobil yayın orkestratörü inşa ediyoruz.

Tüm katkıların aşağıdaki kalite, güvenlik ve mühendislik kurallarına uyması beklenmektedir.

---

## 1. Geliştirme Ortamı Kurulumu

Proje, **pnpm workspace** kullanan modern bir TypeScript monorepo yapısına sahiptir.

### Önkoşullar
- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 9.0.0`
- **Flutter SDK**: `>= 3.19.0` (Android/iOS derlemeleri için)
- **Xcode & CocoaPods** (Yalnızca macOS ve iOS derlemeleri için)

### Depoyu Klonlama ve Bağımlılıkları Yükleme
```bash
git clone https://github.com/webicro/webicro_distribution.git
cd webicro_distribution

# Bağımlılıkları yükle
pnpm install

# Tüm paketleri derle
pnpm build
```

---

## 2. Mimari Yapı (Monorepo Packages)

| Paket / Uygulama | Açıklama |
| :--- | :--- |
| `apps/cli` | Commander.js ve Clack tabanlı ana CLI uygulaması ve yerel Web API sunucusu |
| `apps/web` | React 18, Vite ve Tailwind CSS tabanlı canlı kontrol paneli |
| `packages/core` | 20 adımlı durum makinesi (State Machine) ve dağıtım orkestratörü |
| `packages/config` | YAML konfigürasyon yükleyici ve Zod şema doğrulayıcı |
| `packages/git` | Conventional commits ayrıştırıcı ve Git analiz motoru |
| `packages/versioning` | SemVer sürüm çözümleyici ve çakışma denetleyicisi |
| `packages/flutter` | Flutter Doctor, Analyze, Test ve pubspec.yaml yöneticisi |
| `packages/android` | Android Gradle ve AAB paketleme motoru |
| `packages/ios` | iOS Xcodebuild ve IPA paketleme motoru |
| `packages/artifacts` | SHA-256 sağlama toplamı, saklama ve doğrulama motoru |
| `packages/google-play` | Google Play Developer API v3 adaptörü |
| `packages/app-store` | App Store Connect API adaptörü |
| `packages/ai` | Gemini, OpenAI, Claude ve Conventional sürüm notu üreticileri |
| `packages/security` | Hassas anahtar tarayıcısı (SecretScanner) ve risk motoru |
| `packages/database` | SQLite (better-sqlite3) veritabanı ve repository katmanı |
| `packages/shared` | Ortak hata hiyerarşisi, loglayıcı ve yardımcı araçlar |

---

## 3. Kod Kalitesi ve Mühendislik Kuralları

Tüm kod değişikliklerinde Antigravity Engineering standartları zorunludur:

1. **TypeScript Strict Mode:**
   - Asla `any` türü kullanmayın. Bilinmeyen tipler için `unknown` kullanın ve güvenli tür daraltması (type narrowing) yapın.
   - Asla `@ts-ignore` veya `@ts-nocheck` kullanmayın.
   - Tip bilinmiyorsa önce tip veya interface oluşturun.

2. **Linter ve Kod Tarzı:**
   - Asla `eslint-disable` veya `eslint-disable-next-line` kullanmayın. Kodun kuralını kapatarak değil, doğru yazarak çözün.
   - Üretilen tüm kodlar ESLint ve Prettier kurallarıyla tam uyumlu olmalıdır.

3. **Fail-Closed İlkesi:**
   - Hataları sessizce yutup olumlu durum (`SUCCESS`) dönmeyin.
   - Flutter SDK yoksa, analiz hatalıysa, testler başarısızsa veya Git push hata verirse süreç derhal `FAILED` ile durdurulmalıdır.

4. **Monokrom UI ve Erişilebilirlik Standartları:**
   - Web arayüzünde rastgele renkli butonlar veya emoji kullanılmaz.
   - Lucide ikonları ve OKLCH tabanlı monokrom minimalist tasarım sistemi korunmalıdır.

---

## 4. Git Commit Standartları (Conventional Commits)

Commit mesajları daima **Conventional Commits** standardına uygun ve açıklayıcı olmalıdır:

```
<type>(<scope>): <açıklama>
```

Örnekler:
- `feat(google-play): kademeli dağıtım (rollout) yüzdesi desteği eklendi`
- `fix(orchestrator): dry-run modunda mock artifact üretimi düzeltildi`
- `refactor(config): snake_case anahtarların camelCase normalizasyonu sadeleştirildi`
- `test(security): path traversal engelleme testleri eklendi`
- `docs(readme): yerel loopback güvenlik mimarisi belgelendi`

---

## 5. Kalite Kapılarını Doğrulama (Verification)

Değişikliklerinizi commit etmeden önce aşağıdaki kontrollerin tamamının başarıyla geçtiğinden emin olun:

```bash
# 1. TypeScript Strict Kontrolü (Sıfır Hata)
pnpm -r typecheck

# 2. ESLint Kontrolü (Sıfır Hata)
pnpm lint

# 3. Birim ve Entegrasyon Testleri
pnpm test

# 4. Üretim Derlemesi
pnpm build
```

---

## 6. Pull Request (PR) Süreci

1. Depoyu forklayın ve ana daldan (`main`) yeni bir özellik dalı oluşturun: `git checkout -b feat/harika-ozellik`.
2. Yapılan değişiklikleri küçük, izlenebilir ve anlamlı commit'lere bölün.
3. Testlerinizi yazın ve tüm kalite kapılarını (`pnpm -r typecheck`, `pnpm lint`, `pnpm test`) çalıştırın.
4. Dalınızı GitHub'a push edin ve `main` dalına doğru bir Pull Request açın.
5. PR açıklamasında değişikliğin gerekçesini, çözülen problemi ve nasıl test edildiğini net bir şekilde belirtin.
