# Contributing to Webicro Distribution

Thank you for your interest in contributing to **Webicro Distribution**! We welcome contributions from developers worldwide. To maintain high engineering standards, security, and traceability, please read and follow these contribution guidelines.

---

## Language Selection / Dil Secimi
- [English Guidelines](#english-guidelines)
- [Turkce Rehber](#turkce-rehber)

---

# English Guidelines

## 1. Branch Strategy (Git Flow)

We use an enterprise branching model centered on two permanent branches:

- **`main`**: Production-ready, stable releases only. Direct commits and pushes are strictly disabled. All releases are tagged (`vX.Y.Z`).
- **`develop`**: The primary integration branch. All active development, feature branches, and bug fixes must target `develop`.

### Working Branch Naming Conventions
When contributing, create a branch from `develop` using one of the following prefixes:

| Branch Prefix | Purpose | Example |
|---|---|---|
| `feat/<name>` | New features or capabilities | `feat/huawei-appgallery` |
| `fix/<name>` | Bug fixes and patches | `fix/google-play-timeout` |
| `docs/<name>` | Documentation updates | `docs/cli-reference` |
| `refactor/<name>` | Refactoring without changing behavior | `refactor/state-machine` |
| `perf/<name>` | Performance optimizations | `perf/git-log-parser` |
| `test/<name>` | Adding or refactoring tests | `test/signing-matrix` |
| `hotfix/<name>` | Urgent production fixes (branched from `main`) | `hotfix/v1.0.2-auth-patch` |

---

## 2. Development Setup

### Prerequisites
- **Node.js**: v20+ or v22 LTS (Recommended: Node 22)
- **pnpm**: v9+ (Installed via `npm i -g pnpm` or `corepack enable`)
- **Git**: v2.30+

### Getting Started
```bash
# 1. Fork the repository on GitHub and clone your fork
git clone https://github.com/<your-username>/Webicro-Distribution.git
cd Webicro-Distribution

# 2. Add upstream remote
git remote add upstream https://github.com/ramiartas0/Webicro-Distribution.git

# 3. Create a feature branch from develop
git checkout develop
git pull upstream develop
git checkout -b feat/my-new-feature

# 4. Install dependencies
pnpm install

# 5. Build all packages
pnpm build
```

---

## 3. Code Quality & Standards

All contributions must adhere to our strict engineering rules:

- **TypeScript Strict Mode**: Zero `any` types. Zero `@ts-ignore` or `@ts-nocheck`. Use interfaces, generics, or `unknown` with type narrowing.
- **ESLint & Prettier**: Code must produce 0 lint errors (`pnpm lint`).
- **Unit & Integration Tests**: All changes must be backed by tests in `tests/`. All 35+ existing tests must pass (`pnpm test`).
- **Zero Emojis**: Emojis are strictly disallowed in code, CLI outputs, and documentation. Use clean text tags (`[INFO]`, `[OK]`, `[WARN]`, `[ERROR]`, `[STATUS]`) or SVG/Lucide icons.

---

## 4. Commit Message Convention

We follow the **Conventional Commits** specification:

```
type(scope): description
```

### Examples
- `feat(google-play): add support for custom rollout fractions`
- `fix(cli): resolve windows path separator issue in discovery`
- `docs(readme): clarify app store connect api key setup`
- `test(core): add edge cases for fail-closed verification`

---

## 5. Pull Request (PR) Workflow

1. Ensure your local branch is rebased on top of `upstream/develop`:
   ```bash
   git fetch upstream
   git rebase upstream/develop
   ```
2. Verify quality gates locally:
   ```bash
   pnpm build
   pnpm -r typecheck
   pnpm test
   pnpm lint
   ```
3. Push your branch to your fork:
   ```bash
   git push origin feat/my-new-feature
   ```
4. Open a Pull Request targeting **`develop`** on `ramiartas0/Webicro-Distribution`.
5. Fill out the PR template checklist completely.
6. A maintainer will review your PR. All GitHub Actions CI checks must pass before merging.

---

# Turkce Rehber

## 1. Dal (Branch) Stratejisi

Webicro Distribution, iki ana kalici dal etrafinda sekillenen kurumsal bir Git akisi kullanir:

- **`main`**: Yalnizca yayina hazir, kararlı surumleri barindirir. Dogrudan push yapilamaz.
- **`develop`**: Tum gelistirmelerin birlestigi ana entegrasyon dalidir. PR'lar varsayilan olarak buraya acilir.

### Dal Isimlendirme Kurallari
`develop` dalindan yeni bir dal acarken su kurallara uyunuz:

| Dal Oneki | Amac | Ornek |
|---|---|---|
| `feat/<isim>` | Yeni ozellikler | `feat/huawei-appgallery` |
| `fix/<isim>` | Hata duzeltmeleri | `fix/google-play-timeout` |
| `docs/<isim>` | Dokumantasyon guncellemeleri | `docs/cli-rehberi` |
| `refactor/<isim>` | Davranis degistirmeyen refactor | `refactor/state-machine` |
| `perf/<isim>` | Performans optimizasyonu | `perf/git-hizlandirma` |
| `test/<isim>` | Test ekleme ve iyilestirme | `test/muhurleme-testi` |
| `hotfix/<isim>` | Canli ortam acil yamalari (`main`'den dallanir) | `hotfix/v1.0.2-guvenlik` |

---

## 2. Yerel Gelistirme Ortami

```bash
# 1. Repoyu fork edin ve klonlayin
git clone https://github.com/<kullanici-adiniz>/Webicro-Distribution.git
cd Webicro-Distribution

# 2. Upstream remote baglantisini ekleyin
git remote add upstream https://github.com/ramiartas0/Webicro-Distribution.git

# 3. develop dalindan calisma dali olusturun
git checkout develop
git pull upstream develop
git checkout -b feat/yeni-ozellik

# 4. Bagimliliklari yukleyin ve derleyin
pnpm install
pnpm build
```

---

## 3. Kod Kalite Kurallari

- **TypeScript Strict**: Asla `any`, `@ts-ignore` veya `eslint-disable` kullanmayiniz.
- **ESLint & Prettier**: 0 lint hatasi (`pnpm lint`).
- **Testler**: Yeni ozellikler birim testleri ile desteklenmeli, tum testler gecmelidir (`pnpm test`).
- **Sifir Emoji Standarti**: Kodda, CLI ciktilarinda veya dokumantasyonda emoji kullanilmaz. Kurumsal log etiketleri (`[INFO]`, `[OK]`, `[WARN]`, `[ERROR]`) veya SVG/Lucide ikonlari kullanilir.

---

## 4. Commit Formati

```
type(scope): aciklama
```
Ornek: `feat(api): huawei store entegrasyonu eklendi`

---

## 5. Pull Request Gonderimi

1. `pnpm build && pnpm -r typecheck && pnpm test && pnpm lint` kontrollerini calistirin.
2. Degisikliklerinizi push edin ve GitHub uzerinden **`develop`** dalina Pull Request acin.
3. PR sablonunu eksiksiz doldurun.
