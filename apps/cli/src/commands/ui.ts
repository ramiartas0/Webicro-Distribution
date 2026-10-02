import { Command } from 'commander';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import chalk from 'chalk';
import * as clack from '@clack/prompts';

import { GitAnalyzer, detectNativeChanges } from '@webicro/git';
import { VersionResolver } from '@webicro/versioning';
import { ConfigLoader } from '@webicro/config';
import { DatabaseConnection, ReleaseRepository, AuditLogRepository } from '@webicro/database';
import { ReleaseOrchestrator } from '@webicro/core';
import {
  AIController,
  createAIProvider,
  AIDiagnostician,
  type AIProviderType,
  type AIDiagnosisResult,
  type AutoFixActionType,
} from '@webicro/ai';
import { ReleaseNotesValidator } from '@webicro/validation';
import { PubspecVersionUpdater } from '@webicro/flutter';
import { createGoogleAuth, GooglePlayAdapter } from '@webicro/google-play';
import { generateAppStoreToken, AppStoreAdapter } from '@webicro/app-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StoreComparison {
  googlePlay: {
    status: 'live' | 'not_found' | 'auth_error' | 'not_configured';
    versionCode?: number;
    track?: string;
    message?: string;
  };
  appStore: {
    status: 'live' | 'not_found' | 'auth_error' | 'not_configured';
    version?: string;
    buildNumber?: string;
    message?: string;
    appName?: string;
    bundleId?: string;
    appId?: string;
  };
  comparisonStatus: 'UPDATE_READY' | 'UP_TO_DATE' | 'NEW_APP' | 'UNKNOWN';
  badge: string;
  summary: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
  path: string;
  hasPubspec: boolean;
  package?: string;
  iosBundleId?: string;
  appStoreOverrideBundleId?: string;
  appStoreAppName?: string;
  version?: string;
  buildNumber?: number;
  stores?: StoreComparison;
  releasing?: boolean;
  currentStageId?: number;
  totalStages?: number;
}

export interface PipelineStageInfo {
  id: number;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  details?: string;
}

export interface ActivePipelineStatus {
  isReleasing: boolean;
  projectPath: string;
  projectName: string;
  targetVersion: string;
  currentStageId: number;
  stages: PipelineStageInfo[];
  logs: string[];
  completed: boolean;
  error?: string;
  diagnosis?: AIDiagnosisResult;
  startedAt: string;
}

export function createDefaultStages(): PipelineStageInfo[] {
  return [
    { id: 1, name: 'Hazırlık ve Git Analizi', status: 'pending' },
    { id: 2, name: 'Sürümleme ve Sürüm Notları', status: 'pending' },
    { id: 3, name: 'Statik Kod Analizi ve Testler', status: 'pending' },
    { id: 4, name: 'Android Paketi Derleme (AAB)', status: 'pending' },
    { id: 5, name: 'iOS Paketi Derleme (IPA)', status: 'pending' },
    { id: 6, name: 'Mağaza Dağıtımı & Git Senkronizasyonu', status: 'pending' },
  ];
}

export function mapStepNameToStageId(stepName: string): number {
  const lower = stepName.toLowerCase();
  if (lower.includes('git release') || lower.includes('git sync') || lower.includes('submission') || lower.includes('audit')) {
    return 6;
  }
  if (lower.includes('env') || lower.includes('database') || lower.includes('id') || (lower.includes('git') && !lower.includes('release'))) {
    return 1;
  }
  if (lower.includes('version') || lower.includes('semver') || lower.includes('plan') || lower.includes('changelog') || lower.includes('note') || lower.includes('validat')) {
    return 2;
  }
  if (lower.includes('pubspec') || lower.includes('doctor') || lower.includes('analy') || lower.includes('test')) {
    return 3;
  }
  if (lower.includes('android')) {
    return 4;
  }
  if (lower.includes('ios')) {
    return 5;
  }
  return 6;
}

/**
 * Proje dizininden paket adını ve versiyonunu otomatik tespit eder
 */
function detectProjectMetadata(projectPath: string): {
  name: string;
  package: string;
  iosBundleId?: string;
  version: string;
  buildNumber: number;
} {
  let name = path.basename(projectPath);
  let pkg = '';
  let iosBundleId = '';
  let version = '1.0.0';
  let buildNumber = 1;

  // 1. release.config.yaml'dan bak
  try {
    const configPath = path.join(projectPath, 'release.config.yaml');
    if (fs.existsSync(configPath)) {
      const cfg = ConfigLoader.loadFromFile(configPath);
      if (cfg.project?.name) name = cfg.project.name;
      if (cfg.project?.package) pkg = cfg.project.package;
    }
  } catch {
    // Sessiz devam
  }

  // 2. pubspec.yaml'dan bak
  try {
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      const content = fs.readFileSync(pubspecPath, 'utf8');
      const nameMatch = content.match(/^name:\s*([^\s#]+)/m);
      if (nameMatch && nameMatch[1]) name = nameMatch[1];
      const verMatch = content.match(/^version:\s*([^\s#]+)/m);
      if (verMatch && verMatch[1]) {
        const full = verMatch[1].trim();
        const [v, b] = full.split('+');
        version = v || '1.0.0';
        buildNumber = b ? parseInt(b, 10) : 1;
      }
    }
  } catch {
    // Sessiz devam
  }

  // 3. Android build.gradle dosyasından applicationId veya namespace ara
  if (!pkg) {
    const gradlePaths = [
      path.join(projectPath, 'android/app/build.gradle'),
      path.join(projectPath, 'android/app/build.gradle.kts'),
    ];
    for (const gp of gradlePaths) {
      if (fs.existsSync(gp)) {
        try {
          const content = fs.readFileSync(gp, 'utf8');
          const appMatch = content.match(/applicationId\s*=?\s*["']([^"']+)["']/);
          if (appMatch && appMatch[1]) {
            pkg = appMatch[1];
            break;
          }
          const nsMatch = content.match(/namespace\s*=?\s*["']([^"']+)["']/);
          if (nsMatch && nsMatch[1]) {
            pkg = nsMatch[1];
            break;
          }
        } catch {
          // Sessiz
        }
      }
    }
  }

  // 4. iOS Runner project.pbxproj dosyasından PRODUCT_BUNDLE_IDENTIFIER oku (Android paket adından bağımsız olarak her zaman oku!)
  const pbxPath = path.join(projectPath, 'ios/Runner.xcodeproj/project.pbxproj');
  if (fs.existsSync(pbxPath)) {
    try {
      const pbxContent = fs.readFileSync(pbxPath, 'utf8');
      const matches = pbxContent.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g);
      for (const m of matches) {
        const val = m[1]?.trim().replace(/["']/g, '');
        if (val && !val.includes('$') && !val.includes('Tests')) {
          iosBundleId = val;
          break;
        }
      }
    } catch {
      // Sessiz
    }
  }

  if (!pkg && iosBundleId) {
    pkg = iosBundleId;
  }

  return { name, package: pkg, iosBundleId: iosBundleId || undefined, version, buildNumber };
}

/**
 * Herhangi bir makinede/ortamda Flutter projelerini (pubspec.yaml içeren) otomatik keşfeder.
 * Asla hardcoded kişisel klasör yolu içermez; kullanıcının ev dizini, masaüstü, projeler
 * ve çalışma alanı kardeş dizinlerini standart olarak tarar.
 */
export function discoverFlutterProjects(customRoots?: string[]): ProjectEntry[] {
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
  
  let roots: string[] = [];

  if (customRoots && customRoots.length > 0) {
    roots = customRoots.filter(r => fs.existsSync(r));
  } else {
    // 1. Çalışma dizini ve üst dizini (mevcut monorepo / kardeş dizinler)
    roots.push(process.cwd());
    const parentDir = path.resolve(process.cwd(), '..');
    if (fs.existsSync(parentDir)) {
      roots.push(parentDir);
    }

    // 2. Standart kullanıcı proje klasörleri (varsa dinamik ekle)
    if (home && fs.existsSync(home)) {
      const standardDevDirs = [
        'Projects',
        'Workspace',
        'Desktop',
        'Development',
        'Code',
        'Sites',
        'apps',
        'repos',
        'src',
      ];
      for (const d of standardDevDirs) {
        const full = path.join(home, d);
        if (fs.existsSync(full)) {
          roots.push(full);
        }
      }
    }
  }

  const foundPaths = new Set<string>();
  const results: ProjectEntry[] = [];

  const ignoreDirs = new Set([
    'node_modules',
    '.git',
    '.dart_tool',
    'build',
    'Pods',
    'dist',
    'vendor',
    'DerivedData',
    '.gradle',
    '.idea',
    '.vscode',
    'Library',
    'Applications',
    'Music',
    'Movies',
    'Pictures',
    'webicro_distribution',
  ]);

  function scan(dir: string, depth: number): void {
    if (depth > 4) return;
    if (!fs.existsSync(dir)) return;

    try {
      const pubspecPath = path.join(dir, 'pubspec.yaml');
      if (fs.existsSync(pubspecPath) && path.resolve(dir) !== path.resolve(process.cwd())) {
        foundPaths.add(path.resolve(dir));
        return; // Flutter projesinin alt klasörlerini ayrıca taramaya gerek yok
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') && entry.name !== '.release') continue;
          if (ignoreDirs.has(entry.name)) continue;
          scan(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Hata oluşursa atla
    }
  }

  for (const root of roots) {
    if (fs.existsSync(root)) {
      scan(root, 0);
    }
  }

  for (const fPath of foundPaths) {
    const meta = detectProjectMetadata(fPath);
    results.push({
      id: fPath.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
      name: meta.name,
      path: fPath,
      hasPubspec: true,
      package: meta.package,
      version: meta.version,
      buildNumber: meta.buildNumber,
    });
  }

  return results;
}

/**
 * Mükerrer (duplicate) Flutter projelerini eler.
 * Mağazada yayında olan (live), sürüm karşılığı bulunan ve daha güncel olan projeyi korur.
 * ÖNEMLİ: Sıralama aktif projeye göre değişmez, orijinal eklenme/liste sırasını stabil korur.
 */
export function deduplicateProjects(projects: ProjectEntry[], _activePath?: string): ProjectEntry[] {
  const scoreProject = (p: ProjectEntry): number => {
    let score = 0;
    // 1. Mağazada canlı sürüm varsa yüksek öncelik
    const gpLive = p.stores?.googlePlay?.status === 'live';
    const asLive = p.stores?.appStore?.status === 'live';
    if (gpLive || asLive) {
      score += 3000;
    }
    if (gpLive && asLive) {
      score += 2000;
    }
    // 2. Karşılaştırma durumu
    if (p.stores?.comparisonStatus === 'UPDATE_READY' || p.stores?.comparisonStatus === 'UP_TO_DATE') {
      score += 1500;
    }
    // 3. Build numarası ve versiyon
    score += (p.buildNumber || 0);
    // 4. Pubspec varlığı
    if (p.hasPubspec) {
      score += 100;
    }
    return score;
  };

  // Skorlara göre azalan sırada sırala (en kaliteli / en güncel / canlı olan adayları önce değerlendir)
  const sorted = [...projects].sort((a, b) => scoreProject(b) - scoreProject(a));

  const seenPackages = new Set<string>();
  const seenNames = new Set<string>();
  const seenPaths = new Set<string>();
  const selected: ProjectEntry[] = [];

  for (const p of sorted) {
    const resolvedP = path.resolve(p.path);
    if (seenPaths.has(resolvedP)) continue;

    const normName = p.name.trim().toLowerCase().replace(/[-_]/g, '');
    const normPkg = p.package ? p.package.trim().toLowerCase() : '';

    // Eğer aynı paket adına veya aynı normalize isme sahip proje daha önce eklendiyse, kopyayı atla
    if (normPkg && seenPackages.has(normPkg)) {
      continue;
    }
    if (normName && seenNames.has(normName)) {
      continue;
    }

    if (normPkg) seenPackages.add(normPkg);
    if (normName) seenNames.add(normName);
    seenPaths.add(resolvedP);
    selected.push(p);
  }

  // Orijinal dizideki sırayı (stable order) koruyarak döndür (Böylece seçim yapıldığında liste zıplamaz)
  const originalIndexMap = new Map<string, number>();
  projects.forEach((p, idx) => {
    originalIndexMap.set(path.resolve(p.path), idx);
  });

  return selected.sort((a, b) => {
    const idxA = originalIndexMap.get(path.resolve(a.path)) ?? 0;
    const idxB = originalIndexMap.get(path.resolve(b.path)) ?? 0;
    return idxA - idxB;
  });
}

/**
 * Verilen Flutter projesinin en kaliteli uygulama ikonunu (App Icon) bulur
 */
export function findProjectAppIcon(projectPath: string): string | null {
  if (!fs.existsSync(projectPath)) return null;

  // 1. iOS AppIcon setindeki yüksek çözünürlüklü ikonlar
  const iosAppIconDir = path.join(projectPath, 'ios/Runner/Assets.xcassets/AppIcon.appiconset');
  if (fs.existsSync(iosAppIconDir)) {
    const preferredIos = [
      'Icon-App-1024x1024@1x.png',
      'Icon-App-60x60@3x.png',
      'Icon-App-76x76@2x.png',
      'Icon-App-60x60@2x.png',
      'Icon-App-83.5x83.5@2x.png',
      'Icon-App-40x40@3x.png',
    ];
    for (const name of preferredIos) {
      const full = path.join(iosAppIconDir, name);
      if (fs.existsSync(full)) return full;
    }
    try {
      const files = fs.readdirSync(iosAppIconDir).filter(f => f.endsWith('.png'));
      if (files.length > 0) {
        files.sort((a, b) => {
          const statA = fs.statSync(path.join(iosAppIconDir, a));
          const statB = fs.statSync(path.join(iosAppIconDir, b));
          return statB.size - statA.size;
        });
        return path.join(iosAppIconDir, files[0]);
      }
    } catch {
      // devam et
    }
  }

  // 2. Android mipmap ikonları
  const androidResDir = path.join(projectPath, 'android/app/src/main/res');
  if (fs.existsSync(androidResDir)) {
    const mipmapDirs = [
      'mipmap-xxxhdpi',
      'mipmap-xxhdpi',
      'mipmap-xhdpi',
      'mipmap-hdpi',
      'mipmap-mdpi',
    ];
    const iconNames = ['launcher_icon.png', 'ic_launcher.png', 'ic_launcher_foreground.png'];
    for (const dir of mipmapDirs) {
      for (const name of iconNames) {
        const full = path.join(androidResDir, dir, name);
        if (fs.existsSync(full)) return full;
      }
    }
  }

  // 3. assets/ dizinindeki logo veya icon dosyaları
  const assetCandidates = [
    'assets/images/logo-k.png',
    'assets/images/logo.png',
    'assets/images/app_icon.png',
    'assets/icon/icon.png',
    'assets/icons/icon.png',
    'assets/logo.png',
    'assets/icon.png',
  ];
  for (const rel of assetCandidates) {
    const full = path.join(projectPath, rel);
    if (fs.existsSync(full)) return full;
  }

  return null;
}

export interface AICredentials {
  provider?: AIProviderType;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  verified?: boolean;
  lastTestedAt?: string;
}

export interface StoreCredentials {
  googlePlay?: {
    serviceAccountEmail?: string;
    projectId?: string;
    serviceAccountJson?: string;
    keyPath?: string;
    verified?: boolean;
    lastTestedAt?: string;
  };
  appStore?: {
    keyId?: string;
    issuerId?: string;
    privateKey?: string;
    privateKeyPath?: string;
    verified?: boolean;
    lastTestedAt?: string;
  };
  ai?: AICredentials;
}

/**
 * Proje dizininden veya global yapılandırmadan kayıtlı mağaza kimlik bilgilerini getirir
 */
export function getStoreCredentials(projectDir?: string): StoreCredentials {
  const candidates: string[] = [];
  if (projectDir) {
    candidates.push(path.join(projectDir, '.release/credentials.json'));
  }
  candidates.push(path.join(process.cwd(), '.release/credentials.json'));

  for (const cPath of candidates) {
    if (fs.existsSync(cPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cPath, 'utf8')) as StoreCredentials;
        if (parsed.googlePlay || parsed.appStore || parsed.ai) {
          if (!parsed.ai) {
            parsed.ai = {
              provider: process.env['GEMINI_API_KEY'] ? 'gemini' : process.env['OPENAI_API_KEY'] ? 'openai' : process.env['ANTHROPIC_API_KEY'] ? 'anthropic' : 'conventional',
              geminiApiKey: process.env['GEMINI_API_KEY'],
              openaiApiKey: process.env['OPENAI_API_KEY'],
              anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
            };
          }
          return parsed;
        }
      } catch {
        // Devam et
      }
    }
  }

  // Fallback: Ortam değişkenleri ve yerel anahtarlar
  const creds: StoreCredentials = {};

  const defaultKeyPath = path.join(process.env['HOME'] || '~', '.secrets/google-play-key.json');
  const googleKeyPath = process.env['GOOGLE_PLAY_SERVICE_ACCOUNT'] || defaultKeyPath;

  if (fs.existsSync(googleKeyPath)) {
    try {
      const keyContent = JSON.parse(fs.readFileSync(googleKeyPath, 'utf8')) as {
        client_email?: string;
        project_id?: string;
      };
      if (keyContent.client_email) {
        creds.googlePlay = {
          serviceAccountEmail: keyContent.client_email,
          projectId: keyContent.project_id || '',
          keyPath: googleKeyPath,
          verified: true,
          lastTestedAt: new Date().toISOString(),
        };
      }
    } catch {
      // Sessiz
    }
  }

  const appStoreKeyId = process.env['APPSTORE_KEY_ID'];
  const appStoreIssuerId = process.env['APPSTORE_ISSUER_ID'];
  const appStoreKeyPath = process.env['APPSTORE_PRIVATE_KEY_PATH'];
  const appStorePrivateKey = process.env['APPSTORE_PRIVATE_KEY'];

  if (appStoreKeyId && appStoreIssuerId && (appStoreKeyPath || appStorePrivateKey)) {
    creds.appStore = {
      keyId: appStoreKeyId,
      issuerId: appStoreIssuerId,
      privateKeyPath: appStoreKeyPath,
      privateKey: appStorePrivateKey,
      verified: true,
      lastTestedAt: new Date().toISOString(),
    };
  }

  // Otomatik kalıcı kaydet
  if (creds.googlePlay || creds.appStore) {
    saveStoreCredentials(creds, projectDir);
  }

  return creds;
}

/**
 * Mağaza kimlik bilgilerini projeye veya global dizine kalıcı olarak kaydeder
 */
export function saveStoreCredentials(creds: StoreCredentials, projectDir?: string): void {
  const targetDir = projectDir ? path.join(projectDir, '.release') : path.join(process.cwd(), '.release');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const filePath = path.join(targetDir, 'credentials.json');
  fs.writeFileSync(filePath, JSON.stringify(creds, null, 2), 'utf8');
}

export function maskKey(key?: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '********';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function formatBulletNotes(items: string[]): string {
  return items
    .map((it) => it.trim())
    .filter(Boolean)
    .map((it) => (it.startsWith('•') ? it : `• ${it}`))
    .join('\n');
}

interface CachedReleaseNotes {
  key: string;
  timestamp: number;
  data: {
    provider: string;
    notesTr: string;
    notesEn: string;
    notes: {
      tr: { full: string[] };
      en: { full: string[] };
    };
  };
}
const releaseNotesCache = new Map<string, CachedReleaseNotes>();

function cleanSemver(v: string): number[] {
  const cleaned = v.replace(/^[^\d]*/i, '').trim();
  const parts = cleaned.split(/[.+]/).map(p => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

function compareSemver(v1: string, v2: string): number {
  const p1 = cleanSemver(v1);
  const p2 = cleanSemver(v2);
  for (let i = 0; i < 3; i++) {
    const n1 = p1[i] ?? 0;
    const n2 = p2[i] ?? 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

interface AppleLookupResult {
  status: 'live' | 'not_found' | 'error';
  version?: string;
  trackName?: string;
  trackViewUrl?: string;
  message?: string;
}

async function fetchAppleStoreLive(bundleId: string): Promise<AppleLookupResult> {
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { status: 'error', message: `iTunes API HTTP ${res.status}` };
    }
    const data = await res.json() as {
      resultCount?: number;
      results?: Array<{
        version?: string;
        trackName?: string;
        trackViewUrl?: string;
      }>;
    };
    if (data.resultCount && data.results && data.results.length > 0 && data.results[0]) {
      const app = data.results[0];
      return {
        status: 'live',
        version: app.version || '1.0.0',
        trackName: app.trackName,
        trackViewUrl: app.trackViewUrl,
        message: `${app.version} yayında`,
      };
    }
    return { status: 'not_found', message: 'App Store\'da henüz yayınlanmamış' };
  } catch (err: unknown) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

interface GooglePlayWebResult {
  status: 'live' | 'not_found' | 'error';
  title?: string;
  version?: string;
  message?: string;
}

async function fetchGooglePlayWebLive(packageName: string): Promise<GooglePlayWebResult> {
  try {
    const res = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}&hl=tr`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 200) {
      return {
        status: 'live',
        message: 'Play Store\'da yayında',
      };
    } else if (res.status === 404) {
      return { status: 'not_found', message: 'Play Store\'da kayıtlı değil' };
    }
    return { status: 'error', message: `Play Store HTTP ${res.status}` };
  } catch (err: unknown) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

const storeComparisonCache = new Map<string, { data: StoreComparison; timestamp: number }>();
const STORE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 dakika

function normalizeAppStr(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[-_.\s]/g, '')
    .replace(/(.)\1+/g, '$1'); // ardışık tekrar eden harfleri tekilleştir (piyyuu -> piyu)
}

function findBestMatchedAppleApp(
  params: {
    projectDir?: string;
    pkgName: string;
    iosBundleId?: string;
    projectName?: string;
    overrideBundleId?: string;
  },
  apps: Array<{ id: string; name: string; bundleId: string; sku?: string }>
): { id: string; name: string; bundleId: string; sku?: string } | null {
  if (apps.length === 0) return null;

  // 1. Kullanıcı manuel override seçmişse
  if (params.overrideBundleId) {
    const overrideMatch = apps.find(a => a.bundleId.toLowerCase() === params.overrideBundleId?.toLowerCase());
    if (overrideMatch) return overrideMatch;
  }

  const targetIos = (params.iosBundleId || '').toLowerCase();
  const targetPkg = (params.pkgName || '').toLowerCase();

  // 2. Direct match (tam bundleId veya pkg eşleşmesi)
  const direct = apps.find(a => {
    const bId = a.bundleId.toLowerCase();
    return (targetIos && bId === targetIos) || (targetPkg && bId === targetPkg);
  });
  if (direct) return direct;

  // 3. Normalized match (piyyuu vs piyuu tek harf toleransı)
  const normPkg = normalizeAppStr(params.pkgName);
  const normIos = normalizeAppStr(params.iosBundleId);
  const normMatch = apps.find(a => {
    const normA = normalizeAppStr(a.bundleId);
    return (normPkg && normA === normPkg) || (normIos && normA === normIos);
  });
  if (normMatch) return normMatch;

  // 4. Özel anahtar kelime ve semantik eşleştirmeler (caller-id hariç tutulur)
  const projBaseName = params.projectDir ? path.basename(params.projectDir).toLowerCase() : '';
  const pAll = [params.projectName, projBaseName, params.pkgName, params.iosBundleId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (pAll.includes('caller')) {
    // Caller ID için App Store'da callerid yoksa eşleştirme yapma
    return null;
  }

  if (pAll.includes('waiter') || pAll.includes('garson')) {
    const gMatch = apps.find(a => a.name.toLowerCase().includes('garson') || a.bundleId.toLowerCase().includes('garson'));
    if (gMatch) return gMatch;
  }
  if (pAll.includes('partner') || pAll.includes('pos')) {
    const pMatch = apps.find(a => a.name.toLowerCase().includes('pos') || a.bundleId.toLowerCase().includes('partnermobile'));
    if (pMatch) return pMatch;
  }
  if (pAll.includes('manager')) {
    const mMatch = apps.find(a => a.name.toLowerCase().includes('manager') || a.bundleId.toLowerCase().includes('managermobile'));
    if (mMatch) return mMatch;
  }
  if (pAll.includes('kurye') || pAll.includes('courier') || pAll.includes('nexmobile')) {
    const kMatch = apps.find(a => a.name.toLowerCase().includes('kurye') || a.bundleId.toLowerCase().includes('kurye'));
    if (kMatch) return kMatch;
  }

  // 5. Proje adı ve bundle benzerliği ile genel arama
  const fuzzy = apps.find(a => {
    const normBundle = a.bundleId.replace(/[-_.]/g, '').toLowerCase();
    const normName = a.name.replace(/[\s-_]/g, '').toLowerCase();
    return (projBaseName && normBundle.includes(projBaseName)) || (projBaseName && normName.includes(projBaseName));
  });
  if (fuzzy) return fuzzy;

  return null;
}

/**
 * Projeyi Google Play ve Apple App Store ile canlı karşılaştırır
 */
export async function compareProjectWithStores(
  pkgName: string,
  localBuildNumber: number,
  localVersion: string,
  projectDir?: string,
  forceRefresh = false,
  overrideBundleId?: string
): Promise<StoreComparison> {
  if (!pkgName) {
    return {
      googlePlay: { status: 'not_configured', message: 'Paket adı henüz tanımlanmamış' },
      appStore: { status: 'not_configured', message: 'Paket adı henüz tanımlanmamış' },
      comparisonStatus: 'UNKNOWN',
      badge: 'Paket Belirsiz',
      summary: 'Proje paket adı (applicationId / bundleId) pubspec veya gradle/xcode dosyalarında bulunamadı.',
    };
  }

  const cacheKey = `${pkgName}__${localBuildNumber}__${localVersion}__${projectDir || ''}__${overrideBundleId || ''}`;
  if (!forceRefresh) {
    const cached = storeComparisonCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < STORE_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const comparison: StoreComparison = {
    googlePlay: { status: 'not_configured' },
    appStore: { status: 'not_configured' },
    comparisonStatus: 'UNKNOWN',
    badge: 'Taranıyor',
    summary: 'Mağazalar taranıyor...',
  };

  const creds = getStoreCredentials(projectDir);

  // 1. GOOGLE PLAY KARŞILAŞTIRMASI
  let googleFound = false;
  if (creds.googlePlay && (creds.googlePlay.serviceAccountJson || creds.googlePlay.keyPath)) {
    try {
      const adapter = new GooglePlayAdapter({
        packageName: pkgName,
        serviceAccountJson: creds.googlePlay.serviceAccountJson,
        serviceAccountJsonPath: creds.googlePlay.keyPath,
      });
      const res = await adapter.getSafeLatestVersionCode();
      if (res.status === 'found') {
        comparison.googlePlay = {
          status: 'live',
          version: res.versionName,
          versionCode: res.versionCode,
          track: res.track || 'production',
          message: res.message || (res.versionName ? `v${res.versionName} (#${res.versionCode}) yayında` : `Build #${res.versionCode} yayında`),
        };
        googleFound = true;
      } else if (res.status === 'not_found') {
        comparison.googlePlay = {
          status: 'not_found',
          message: res.message || 'Play Console hesabında bulunamadı',
        };
        googleFound = true;
      } else if (res.status === 'auth_error') {
        comparison.googlePlay = {
          status: 'auth_error',
          message: res.message || 'Play Console API yetki hatası',
        };
      }
    } catch {
      // Fallback
    }
  }

  // Web Fallback: Service Account yoksa veya hata verdiyse Play Store sayfasından doğrula
  if (!googleFound && comparison.googlePlay.status !== 'live') {
    const webRes = await fetchGooglePlayWebLive(pkgName);
    if (webRes.status === 'live') {
      comparison.googlePlay = {
        status: 'live',
        message: 'Play Store\'da yayında',
      };
    } else if (webRes.status === 'not_found') {
      comparison.googlePlay = {
        status: 'not_found',
        message: 'Play Store\'da henüz yayınlanmamış',
      };
    }
  }

  // 2. APPLE APP STORE KARŞILAŞTIRMASI
  let appleTargetBundleId = overrideBundleId || pkgName;
  let detectedIosBundleId: string | undefined;
  let detectedProjectName: string | undefined;

  if (projectDir) {
    try {
      const pMeta = detectProjectMetadata(projectDir);
      detectedIosBundleId = pMeta.iosBundleId;
      detectedProjectName = pMeta.name;
      if (!overrideBundleId && pMeta.iosBundleId) {
        appleTargetBundleId = pMeta.iosBundleId;
      }
    } catch {
      // ignore
    }
  }

  // App Store Connect API varsa hesaptaki kayıtlı uygulamalarla akıllı eşleştirme yap
  let connectApps: Array<{ id: string; name: string; bundleId: string; sku?: string }> = [];
  if (creds.appStore && creds.appStore.keyId && creds.appStore.issuerId && (creds.appStore.privateKeyPath || creds.appStore.privateKey)) {
    try {
      const adapter = new AppStoreAdapter({
        keyId: creds.appStore.keyId,
        issuerId: creds.appStore.issuerId,
        bundleId: appleTargetBundleId,
        privateKeyPath: creds.appStore.privateKeyPath,
        privateKeyContent: creds.appStore.privateKey,
      });

      connectApps = await adapter.listAllApps().catch(() => []);

      const matchedApp = findBestMatchedAppleApp(
        {
          projectDir,
          pkgName,
          iosBundleId: detectedIosBundleId,
          projectName: detectedProjectName,
          overrideBundleId,
        },
        connectApps
      );

      if (matchedApp) {
        appleTargetBundleId = matchedApp.bundleId;
        comparison.appStore.appName = matchedApp.name;
        comparison.appStore.bundleId = matchedApp.bundleId;
        comparison.appStore.appId = matchedApp.id;
      }

      // App Store Connect'ten en son build'i sorgula
      const targetAdapter = new AppStoreAdapter({
        keyId: creds.appStore.keyId,
        issuerId: creds.appStore.issuerId,
        bundleId: appleTargetBundleId,
        privateKeyPath: creds.appStore.privateKeyPath,
        privateKeyContent: creds.appStore.privateKey,
      });

      const latestBuild = await targetAdapter.getLatestBuild().catch(() => null);
      if (latestBuild) {
        comparison.appStore = {
          ...comparison.appStore,
          status: 'live',
          version: latestBuild.version !== 'unknown' ? latestBuild.version : comparison.appStore.version,
          buildNumber: latestBuild.buildNumber,
          message: `v${latestBuild.buildNumber} yayında`,
        };
      }
    } catch {
      // Connect API hatası olursa iTunes sonucu denenir
    }
  }

  // Öncelik A: Resmi Apple iTunes API (Canlı mağaza sürümü sorgusu)
  const itunesRes = await fetchAppleStoreLive(appleTargetBundleId);
  if (itunesRes.status === 'live') {
    comparison.appStore = {
      ...comparison.appStore,
      status: 'live',
      version: itunesRes.version,
      message: `${itunesRes.version.startsWith('v') ? itunesRes.version : 'v' + itunesRes.version} yayında`,
      buildNumber: comparison.appStore.buildNumber,
    };
  } else if (comparison.appStore.status !== 'live' && itunesRes.status === 'not_found') {
    comparison.appStore = {
      ...comparison.appStore,
      status: 'not_found',
      message: 'App Store\'da henüz yayınlanmamış',
    };
  }

  // 3. KARŞILAŞTIRMA KARARI
  const playLive = comparison.googlePlay.status === 'live';
  const appleLive = comparison.appStore.status === 'live';

  if (playLive || appleLive) {
    let storeIsHigher = false;
    let storeIsEqual = false;

    // Apple sürümü ile karşılaştır
    if (appleLive && comparison.appStore.version) {
      const cmp = compareSemver(localVersion, comparison.appStore.version);
      if (cmp < 0) storeIsHigher = true;
      else if (cmp === 0) storeIsEqual = true;
    }

    // Google Play sürüm ve build numarası ile karşılaştır
    if (playLive) {
      if (comparison.googlePlay.version) {
        const cmp = compareSemver(localVersion, comparison.googlePlay.version);
        if (cmp < 0) {
          storeIsHigher = true;
        } else if (cmp === 0) {
          if (comparison.googlePlay.versionCode && comparison.googlePlay.versionCode > localBuildNumber) {
            storeIsHigher = true;
          } else if (comparison.googlePlay.versionCode && comparison.googlePlay.versionCode === localBuildNumber) {
            storeIsEqual = true;
          }
        }
      } else if (comparison.googlePlay.versionCode) {
        if (comparison.googlePlay.versionCode > localBuildNumber) storeIsHigher = true;
        else if (comparison.googlePlay.versionCode === localBuildNumber) storeIsEqual = true;
      }
    }

    if (storeIsHigher) {
      comparison.comparisonStatus = 'UPDATE_READY';
      comparison.badge = 'Mağaza Daha İleri';
      const storeParts: string[] = [];
      if (playLive) {
        const pVer = comparison.googlePlay.version ? (comparison.googlePlay.version.startsWith('v') ? comparison.googlePlay.version : `v${comparison.googlePlay.version}`) : '';
        const pCode = comparison.googlePlay.versionCode ? `#${comparison.googlePlay.versionCode}` : '';
        storeParts.push(`Play Store: ${pVer} ${pCode}`.trim());
      }
      if (appleLive && comparison.appStore.version) {
        storeParts.push(`App Store: ${comparison.appStore.version.startsWith('v') ? comparison.appStore.version : `v${comparison.appStore.version}`}`);
      }
      comparison.summary = `Mağazadaki canlı sürüm (${storeParts.join(', ')}), yerel sürümden (v${localVersion} #${localBuildNumber}) daha yüksek!`;
    } else if (storeIsEqual) {
      comparison.comparisonStatus = 'UP_TO_DATE';
      comparison.badge = 'Mağazada Eşit';
      comparison.summary = `Yerel sürüm (v${localVersion} #${localBuildNumber}) mağazadaki son sürümle senkronize.`;
    } else {
      comparison.comparisonStatus = 'UPDATE_READY';
      comparison.badge = 'Güncelleme Hazır';
      comparison.summary = `Yerel sürüm (v${localVersion} #${localBuildNumber}), mağazadaki mevcut sürümden daha yeni. Dağıtıma hazır.`;
    }
  } else if (
    comparison.googlePlay.status === 'not_found' &&
    comparison.appStore.status === 'not_found'
  ) {
    comparison.comparisonStatus = 'NEW_APP';
    comparison.badge = 'Mağazada Yeni';
    comparison.summary = 'Paket mağazalarda henüz bulunmuyor. İlk sürüm dağıtımı yapılacak.';
  } else if (comparison.googlePlay.status === 'auth_error') {
    comparison.comparisonStatus = 'UNKNOWN';
    comparison.badge = 'Yetki Gerekli';
    comparison.summary = 'Play Console Service Account izinleri eksik veya doğrulanmadı.';
  } else {
    comparison.comparisonStatus = 'UNKNOWN';
    comparison.badge = 'Yapılandırılmadı';
    comparison.summary = 'Mağaza API anahtarları henüz yapılandırılmadı.';
  }

  storeComparisonCache.set(cacheKey, { data: comparison, timestamp: Date.now() });
  return comparison;
}

/**
 * .env dosyasını güvenli bir şekilde process.env'e yükler
 */
function loadEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    // Sessiz devam et
  }
}

export const uiCommand = new Command('ui')
  .description('Launch the Webicro Distribution web dashboard')
  .option('-p, --port <number>', 'Port to run the dashboard on', '3100')
  .action((options: { port: string }) => {
    const port = parseInt(options.port, 10);
    
    // .env dosyasını yükle
    const rootEnvPath = path.resolve(process.cwd(), '.env');
    loadEnvFile(rootEnvPath);

    // Aktif Proje Yönetimi
    let activeProjectDir = process.cwd();
    const projectsFile = path.resolve(process.cwd(), '.release/projects.json');

    const getStoredProjects = (): ProjectEntry[] => {
      let list: ProjectEntry[] = [];
      try {
        if (fs.existsSync(projectsFile)) {
          list = JSON.parse(fs.readFileSync(projectsFile, 'utf8')) as ProjectEntry[];
        }
      } catch {
        // Hata
      }

      // Eğer liste boşsa veya listede hiç gerçek Flutter projesi yoksa otomatik keşfet
      const hasRealFlutterApp = list.some(p => p.hasPubspec && p.path !== process.cwd());
      if (!hasRealFlutterApp) {
        const discovered = discoverFlutterProjects();
        if (discovered.length > 0) {
          const existingPaths = new Set(list.map(p => path.resolve(p.path)));
          for (const d of discovered) {
            if (!existingPaths.has(path.resolve(d.path))) {
              list.push(d);
              existingPaths.add(path.resolve(d.path));
            }
          }
          if (activeProjectDir === process.cwd() && discovered[0]) {
            activeProjectDir = discovered[0].path;
          }
        }
      }

      if (list.length === 0 && fs.existsSync(path.join(process.cwd(), 'pubspec.yaml'))) {
        const rootMeta = detectProjectMetadata(process.cwd());
        list = [
          {
            id: 'default',
            name: rootMeta.name || path.basename(process.cwd()),
            path: process.cwd(),
            hasPubspec: true,
            package: rootMeta.package,
            version: rootMeta.version,
            buildNumber: rootMeta.buildNumber,
          }
        ];
      }

      // Metadata'ları her zaman güncel tut ve eski emojili rozetleri temizle
      for (const p of list) {
        if (fs.existsSync(p.path)) {
          const meta = detectProjectMetadata(p.path);
          p.name = meta.name;
          p.package = meta.package;
          p.version = meta.version;
          p.buildNumber = meta.buildNumber;
          p.hasPubspec = fs.existsSync(path.join(p.path, 'pubspec.yaml'));
        }
        if (p.stores?.badge) {
          p.stores.badge = p.stores.badge.replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '').trim();
        }
      }

      // Eğer gerçek Flutter projeleri varsa, dağıtım aracının kendi kök dizinini listeden çıkar
      if (list.some(p => p.hasPubspec && path.resolve(p.path) !== path.resolve(process.cwd()))) {
        list = list.filter(p => path.resolve(p.path) !== path.resolve(process.cwd()));
      }

      // Mükerrer (duplicate) projeleri temizle: Mağazada canlı ve güncel olanı koru
      list = deduplicateProjects(list, activeProjectDir);

      return list;
    };

    const saveStoredProjects = (projects: ProjectEntry[]) => {
      try {
        const deduped = deduplicateProjects(projects, activeProjectDir);
        const dir = path.dirname(projectsFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(projectsFile, JSON.stringify(deduped, null, 2), 'utf8');
      } catch {
        // Hata
      }
    };

    // apps/web/dist konumunu bul
    const webDistPath = path.resolve(__dirname, '../../web/dist');
    const fallbackPath = path.resolve(process.cwd(), 'apps/web/dist');
    const staticDir = fs.existsSync(webDistPath) ? webDistPath : fallbackPath;

    // Veritabanı bağlantısı
    const dbDir = path.resolve(process.cwd(), '.release');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbConn = new DatabaseConnection(path.join(dbDir, 'release.db'));
    dbConn.runMigrations();
    const releaseRepo = new ReleaseRepository(dbConn.getDb());
    const auditRepo = new AuditLogRepository(dbConn.getDb());

    // SSE İstemcileri ve Canlı Dağıtım Durumu (Proje bazlı bağımsız harita)
    const sseClients: http.ServerResponse[] = [];
    const activePipelines = new Map<string, ActivePipelineStatus>();

    const broadcastEvent = (event: Record<string, unknown>) => {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      for (const client of sseClients) {
        client.write(data);
      }
    };

    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };

    const server = http.createServer(async (req, res) => {
      // CORS başlıkları
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const pathname = url.pathname;

      // ======================== API ENDPOINTS ========================

      // 1. GET /api/projects - Proje Listesi, Aktif Proje ve Mağaza Karşılaştırmaları
      if (req.method === 'GET' && pathname === '/api/projects') {
        const list = getStoredProjects();
        // Eğer herhangi bir projede stores verisi yoksa hafifçe karşılaştır
        for (const p of list) {
          if (!p.stores && p.package) {
            p.stores = await compareProjectWithStores(
              p.package,
              p.buildNumber || 1,
              p.version || '1.0.0',
              p.path,
              false,
              p.appStoreOverrideBundleId
            );
          }
        }
        if (!list.some(p => path.resolve(p.path) === path.resolve(activeProjectDir)) && list[0]) {
          activeProjectDir = list[0].path;
        }
        // Her proje için kendi bağımsız boru hattı durumunu işaretle
        for (const p of list) {
          const pipeline = activePipelines.get(path.resolve(p.path));
          if (pipeline) {
            p.releasing = pipeline.isReleasing;
            p.currentStageId = pipeline.currentStageId;
            p.totalStages = 6;
          } else {
            p.releasing = false;
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          activePath: activeProjectDir,
          projects: list,
          activePipelines: Array.from(activePipelines.values()),
          activePipeline: activePipelines.get(path.resolve(activeProjectDir)) || null,
        }));
        return;
      }

      // 1.1 POST /api/projects/sync-stores - Mağazalardan Canlı Karşılaştırmayı Yenile
      if (req.method === 'POST' && pathname === '/api/projects/sync-stores') {
        const list = getStoredProjects();
        for (const p of list) {
          if (p.package) {
            p.stores = await compareProjectWithStores(
              p.package,
              p.buildNumber || 1,
              p.version || '1.0.0',
              p.path,
              true,
              p.appStoreOverrideBundleId
            );
          }
        }
        saveStoredProjects(list);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          activePath: activeProjectDir,
          projects: list,
        }));
        return;
      }

      // 1.2 GET /api/projects/icon - Projenin Gerçek Uygulama İkonunu Servis Et
      if (req.method === 'GET' && pathname === '/api/projects/icon') {
        try {
          const targetProjPath = url.searchParams.get('path');
          if (!targetProjPath || !fs.existsSync(targetProjPath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proje dizini bulunamadı.' }));
            return;
          }

          const iconPath = findProjectAppIcon(targetProjPath);
          if (!iconPath || !fs.existsSync(iconPath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proje ikonu bulunamadı.' }));
            return;
          }

          const ext = path.extname(iconPath).toLowerCase();
          const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
          const stat = fs.statSync(iconPath);

          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Cache-Control': 'public, max-age=3600',
          });
          const stream = fs.createReadStream(iconPath);
          stream.pipe(res);
          return;
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
          return;
        }
      }

      // 1.2 POST /api/projects/auto-discover - Çevredeki veya Belirtilen Dizindeki Flutter Projelerini Tara
      if (req.method === 'POST' && pathname === '/api/projects/auto-discover') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as { scanPath?: string };
            const customRoots = payload.scanPath && fs.existsSync(payload.scanPath) ? [payload.scanPath] : undefined;
            const discovered = discoverFlutterProjects(customRoots);
            const currentList = getStoredProjects();
            const existingPaths = new Set(currentList.map(p => path.resolve(p.path)));
            let addedCount = 0;

            for (const d of discovered) {
              if (!existingPaths.has(path.resolve(d.path))) {
                currentList.push(d);
                existingPaths.add(path.resolve(d.path));
                addedCount++;
              }
            }

            // Eğer tek proje varsa ve o da webicro_distribution ise, ilk gerçek Flutter projesini aktif yap
            if (currentList.length > 1 && activeProjectDir === process.cwd()) {
              const firstReal = currentList.find(p => p.hasPubspec && p.path !== process.cwd());
              if (firstReal) {
                activeProjectDir = firstReal.path;
              }
            }

            // Tüm projeler için mağaza canlı karşılaştırmalarını yenile
            for (const p of currentList) {
              if (p.package) {
                p.stores = await compareProjectWithStores(p.package, p.buildNumber || 1, p.version || '1.0.0', p.path);
              }
            }

            saveStoredProjects(currentList);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              addedCount,
              totalCount: currentList.length,
              activePath: activeProjectDir,
              projects: currentList,
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 2. POST /api/projects/switch - Aktif Proje Değiştirme
      if (req.method === 'POST' && pathname === '/api/projects/switch') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}') as { path?: string };
            if (!payload.path || !fs.existsSync(payload.path)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Belirtilen proje dizini sistemde bulunamadı.' }));
              return;
            }
            activeProjectDir = path.resolve(payload.path);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, activePath: activeProjectDir }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
        return;
      }

      // 3. POST /api/projects/add - Yeni Proje Ekleme
      if (req.method === 'POST' && pathname === '/api/projects/add') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as { name?: string; path?: string };
            if (!payload.path || !fs.existsSync(payload.path)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Geçersiz dosya dizini.' }));
              return;
            }

            const resolvedPath = path.resolve(payload.path);
            const hasPub = fs.existsSync(path.join(resolvedPath, 'pubspec.yaml'));
            const meta = detectProjectMetadata(resolvedPath);
            const nameToUse = payload.name || meta.name;

            const currentList = getStoredProjects();
            let existing = currentList.find(p => p.path === resolvedPath);
            if (!existing) {
              const newEntry: ProjectEntry = {
                id: `proj_${Date.now()}`,
                name: nameToUse,
                path: resolvedPath,
                hasPubspec: hasPub,
                package: meta.package,
                version: meta.version,
                buildNumber: meta.buildNumber,
              };
              newEntry.stores = await compareProjectWithStores(meta.package, meta.buildNumber, meta.version);
              currentList.push(newEntry);
              saveStoredProjects(currentList);
              existing = newEntry;
            }

            activeProjectDir = resolvedPath;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, activePath: activeProjectDir, projects: currentList }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
        return;
      }

      // 3.1 POST /api/projects/remove - Projeyi Listeden Kaldırma
      if (req.method === 'POST' && pathname === '/api/projects/remove') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}') as { path?: string; id?: string };
            const currentList = getStoredProjects();
            const filtered = currentList.filter(p => {
              if (payload.path && path.resolve(p.path) === path.resolve(payload.path)) return false;
              if (payload.id && p.id === payload.id) return false;
              return true;
            });
            saveStoredProjects(filtered);
            if (activeProjectDir && payload.path && path.resolve(activeProjectDir) === path.resolve(payload.path)) {
              if (filtered[0]) {
                activeProjectDir = filtered[0].path;
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, activePath: activeProjectDir, projects: filtered }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
        return;
      }

      // 3.2 POST /api/project/sync-store-version - Yerel pubspec.yaml sürümünü mağazadaki sürüme eşitleme
      if (req.method === 'POST' && pathname === '/api/project/sync-store-version') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              projectPath?: string;
              source?: 'smart' | 'google_play' | 'app_store';
            };
            const targetDir = payload.projectPath && fs.existsSync(payload.projectPath)
              ? path.resolve(payload.projectPath)
              : path.resolve(activeProjectDir);

            const currentList = getStoredProjects();
            const projItem = currentList.find(p => path.resolve(p.path) === targetDir);

            const meta = detectProjectMetadata(targetDir);
            const comparison = await compareProjectWithStores(
              meta.package,
              meta.buildNumber,
              meta.version,
              targetDir,
              true,
              projItem?.appStoreOverrideBundleId
            );

            const syncSource = payload.source || 'smart';
            let targetVersion = meta.version;
            let targetBuildNumber = meta.buildNumber;
            let sourceLabel = 'En Yüksek Mağaza Sürümü (Akıllı)';

            if (syncSource === 'google_play') {
              sourceLabel = 'Google Play';
              if (comparison.googlePlay.status !== 'live') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  error: 'Google Play Console üzerinde henüz yayında olan bir sürüm tespit edilemedi.',
                }));
                return;
              }
              if (comparison.googlePlay.version) {
                targetVersion = comparison.googlePlay.version.replace(/^v/, '');
              }
              if (comparison.googlePlay.versionCode) {
                targetBuildNumber = comparison.googlePlay.versionCode;
              }
            } else if (syncSource === 'app_store') {
              sourceLabel = 'Apple App Store';
              if (comparison.appStore.status !== 'live') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  error: 'Apple App Store Connect üzerinde henüz yayında olan bir sürüm tespit edilemedi.',
                }));
                return;
              }
              if (comparison.appStore.version) {
                const cleanAppVer = comparison.appStore.version.replace(/^v/, '');
                targetVersion = cleanAppVer.split('.').length === 2 ? `${cleanAppVer}.0` : cleanAppVer;
              }
              if (comparison.appStore.buildNumber) {
                const parsedB = parseInt(comparison.appStore.buildNumber, 10);
                if (!isNaN(parsedB)) {
                  targetBuildNumber = parsedB;
                }
              }
            } else {
              // 'smart' - Her iki mağaza arasındaki en yüksek sürüm ve build numarasını al
              sourceLabel = 'Akıllı Eşitleme (En Yüksek Mağaza)';

              // Google Play kontrolü
              if (comparison.googlePlay.status === 'live') {
                if (comparison.googlePlay.version) {
                  const cleanGp = comparison.googlePlay.version.replace(/^v/, '');
                  const cmp = compareSemver(targetVersion, cleanGp);
                  if (cmp < 0) {
                    targetVersion = cleanGp;
                  }
                }
                if (comparison.googlePlay.versionCode && comparison.googlePlay.versionCode > targetBuildNumber) {
                  targetBuildNumber = comparison.googlePlay.versionCode;
                }
              }

              // Apple App Store kontrolü
              if (comparison.appStore.status === 'live') {
                if (comparison.appStore.version) {
                  const cleanAppVer = comparison.appStore.version.replace(/^v/, '');
                  const semverAppVer = cleanAppVer.split('.').length === 2 ? `${cleanAppVer}.0` : cleanAppVer;
                  const cmp = compareSemver(targetVersion, semverAppVer);
                  if (cmp < 0) {
                    targetVersion = semverAppVer;
                  }
                }
                if (comparison.appStore.buildNumber) {
                  const parsedB = parseInt(comparison.appStore.buildNumber, 10);
                  if (!isNaN(parsedB) && parsedB > targetBuildNumber) {
                    targetBuildNumber = parsedB;
                  }
                }
              }
            }

            const formatted = `${targetVersion}+${targetBuildNumber}`;

            // pubspec.yaml dosyasını güncelle
            const pubspecPath = path.join(targetDir, 'pubspec.yaml');
            if (fs.existsSync(pubspecPath)) {
              let content = fs.readFileSync(pubspecPath, 'utf8');
              if (/^version:\s*.+$/m.test(content)) {
                content = content.replace(/^version:\s*.+$/m, `version: ${formatted}`);
              } else {
                content = `version: ${formatted}\n` + content;
              }
              fs.writeFileSync(pubspecPath, content, 'utf8');
            }

            // Projeler listesini güncelle
            if (projItem) {
              projItem.version = targetVersion;
              projItem.buildNumber = targetBuildNumber;
              projItem.stores = await compareProjectWithStores(
                projItem.package || meta.package,
                targetBuildNumber,
                targetVersion,
                targetDir,
                true,
                projItem.appStoreOverrideBundleId
              );
              saveStoredProjects(currentList);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              version: targetVersion,
              buildNumber: targetBuildNumber,
              formatted,
              sourceLabel,
              project: projItem,
              stores: projItem?.stores,
              message: `pubspec.yaml sürümü ${sourceLabel} doğrultusunda v${formatted} olarak eşitlendi.`,
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 3.3 GET /api/stores/apple-apps - App Store Connect Hesabındaki Tüm Uygulamalar
      if (req.method === 'GET' && pathname === '/api/stores/apple-apps') {
        try {
          const creds = getStoreCredentials(activeProjectDir);
          if (!creds.appStore || !creds.appStore.keyId || !creds.appStore.issuerId || (!creds.appStore.privateKey && !creds.appStore.privateKeyPath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, apps: [], error: 'App Store Connect API anahtarları henüz yapılandırılmadı.' }));
            return;
          }

          const adapter = new AppStoreAdapter({
            keyId: creds.appStore.keyId,
            issuerId: creds.appStore.issuerId,
            bundleId: 'com.test.test',
            privateKeyPath: creds.appStore.privateKeyPath,
            privateKeyContent: creds.appStore.privateKey,
          });

          const apps = await adapter.listAllApps();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: apps.length, apps }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
        return;
      }

      // 3.4 POST /api/project/set-apple-mapping - Proje için App Store Connect Uygulamasını Manuel Eşleme
      if (req.method === 'POST' && pathname === '/api/project/set-apple-mapping') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              projectPath?: string;
              bundleId?: string; // Boş/undefined ise otomatik eşleştirmeye döner
              appName?: string;
            };

            const targetDir = payload.projectPath && fs.existsSync(payload.projectPath)
              ? path.resolve(payload.projectPath)
              : path.resolve(activeProjectDir);

            const currentList = getStoredProjects();
            const projItem = currentList.find(p => path.resolve(p.path) === targetDir);
            if (!projItem) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Proje bulunamadı.' }));
              return;
            }

            projItem.appStoreOverrideBundleId = payload.bundleId || undefined;
            projItem.appStoreAppName = payload.appName || undefined;

            // Projeyi anında yeni eşlemeyle yeniden karşılaştır
            const meta = detectProjectMetadata(targetDir);
            projItem.stores = await compareProjectWithStores(
              projItem.package || meta.package,
              projItem.buildNumber || meta.buildNumber,
              projItem.version || meta.version,
              targetDir,
              true,
              projItem.appStoreOverrideBundleId
            );

            saveStoredProjects(currentList);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              project: projItem,
              message: payload.bundleId
                ? `Proje başarıyla '${payload.appName || payload.bundleId}' ile eşleştirildi.`
                : 'Otomatik akıllı eşleştirmeye geri dönüldü.',
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 3.5 POST /api/project/git-commit-push - Projedeki değişiklikleri GitHub'a commit ve push et
      if (req.method === 'POST' && pathname === '/api/project/git-commit-push') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              path?: string;
              message?: string;
              createTag?: boolean;
              push?: boolean;
            };

            const targetDir = payload.path ? path.resolve(payload.path) : activeProjectDir;
            if (!fs.existsSync(targetDir)) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Proje dizini bulunamadı' }));
              return;
            }

            const pubspecUpdater = new PubspecVersionUpdater();
            let pubspec = null;
            try {
              pubspec = await pubspecUpdater.readPubspec(targetDir);
            } catch {}

            const projName = pubspec?.name || path.basename(targetDir);
            const [vStr = '1.0.0', bStr = '1'] = (pubspec?.version || '1.0.0+1').split('+');

            const { GitOperations, GitAnalyzer } = await import('@webicro/git');
            const gitOps = new GitOperations(targetDir);
            const result = await gitOps.commitProjectRelease({
              projectName: projName,
              version: vStr,
              buildNumber: Number(bStr) || 1,
              customMessage: payload.message,
              createTag: payload.createTag !== false,
              push: payload.push !== false,
            });

            // Güncel git durumunu al
            const gitAnalyzer = new GitAnalyzer(targetDir);
            const analysis = await gitAnalyzer.analyze();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: result.filesCommitted.length > 0
                ? `Git commit (${result.commitHash.slice(0, 7)}) ve etiket (${result.tagName || 'yok'}) başarıyla oluşturuldu${result.pushed ? ' ve GitHub\'a push edildi' : ''}.`
                : 'Çalışma dizini zaten temiz, yeni dosya kaydedilmedi.',
              result,
              git: {
                isRepository: analysis.isRepository,
                currentBranch: analysis.currentBranch,
                isClean: analysis.isClean,
                uncommittedFiles: analysis.uncommittedFiles || [],
                lastTag: analysis.lastTag,
                changedFilesCount: analysis.changedFiles.length,
                hasNativeChanges: analysis.hasNativeChanges,
                remote: analysis.remote || null,
                connected: Boolean(analysis.isRepository && analysis.remote),
                remoteUrl: analysis.remote?.fetchUrl || analysis.remote?.pushUrl || null,
                webUrl: analysis.remote?.webUrl || null,
                ownerRepo: analysis.remote?.ownerRepo || null,
                provider: analysis.remote?.provider || 'github',
              },
            }));
          } catch (gitErr: unknown) {
            const errMsg = gitErr instanceof Error ? gitErr.message : String(gitErr);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: `Git commit/push hatası: ${errMsg}`,
            }));
          }
        });
        return;
      }

      // 4. GET /api/project - Aktif Proje Detayları, Git ve Sürüm
      if (req.method === 'GET' && pathname === '/api/project') {
        try {
          const reqPath = url.searchParams.get('path');
          let currentTarget = activeProjectDir;
          if (reqPath && fs.existsSync(reqPath)) {
            currentTarget = path.resolve(reqPath);
            activeProjectDir = currentTarget;
          }

          // 4.1 Config yükle
          let releaseConfig = null;
          try {
            releaseConfig = ConfigLoader.loadFromFile(path.join(currentTarget, 'release.config.yaml'));
          } catch {
            // Root config'e bak
            try {
              releaseConfig = ConfigLoader.loadFromFile();
            } catch {
              // Varsayılan
            }
          }

          // 4.2 Pubspec.yaml ara ve oku
          const updater = new PubspecVersionUpdater();
          let pubspecInfo = null;
          try {
            pubspecInfo = await updater.readPubspec(currentTarget);
          } catch {
            // pubspec yok
          }

          const projectName = pubspecInfo?.name || releaseConfig?.project?.name || path.basename(currentTarget);
          const fullVersion = pubspecInfo?.version || '1.0.0+1';
          const [verStr = '1.0.0', buildStr = '1'] = fullVersion.split('+');
          const currentBuildNumber = Number(buildStr) || 1;

          // 4.3 Gerçek Git Analizi
          const gitAnalyzer = new GitAnalyzer(currentTarget);
          let gitAnalysis;
          try {
            gitAnalysis = await gitAnalyzer.analyze();
          } catch {
            gitAnalysis = {
              isRepository: false,
              currentBranch: 'main',
              isClean: true,
              lastTag: null,
              commitsSinceLastTag: [],
              changedFiles: [],
              hasNativeChanges: false,
              nativeChangedFiles: [],
              suggestedBump: 'minor' as const,
            };
          }

          // 4.4 Sürüm Çözümleme (SemVer)
          const resolver = new VersionResolver();
          let suggestedVersion = '1.1.0';
          let suggestedBuild = currentBuildNumber + 1;
          let suggestedBump = gitAnalysis.suggestedBump || 'minor';

          try {
            const resVal = resolver.resolve({
              currentVersion: fullVersion,
              commits: gitAnalysis.commitsSinceLastTag,
            });
            suggestedVersion = resVal.versionString;
            suggestedBuild = resVal.next.buildNumber;
            suggestedBump = resVal.bump;
          } catch {
            const parts = verStr.split('.').map(Number);
            suggestedVersion = `${parts[0] || 1}.${(parts[1] || 0) + 1}.0`;
          }

          // 4.5 Kalıcı ve Proje Bazlı Mağaza Kimlik Bilgileri
          const creds = getStoreCredentials(currentTarget);
          const googlePlayConnected = Boolean(creds.googlePlay?.serviceAccountEmail || creds.googlePlay?.keyPath);
          const googlePlayEmail = creds.googlePlay?.serviceAccountEmail || 'Bağlı değil (Anahtar yapılandırılmadı)';
          const googlePlayProjectId = creds.googlePlay?.projectId || '';
          const googlePlayKeyPath = creds.googlePlay?.keyPath || '';

          const appStoreConnected = Boolean(creds.appStore?.keyId && creds.appStore?.issuerId);
          const appStoreKeyId = creds.appStore?.keyId || '';
          const appStoreIssuerId = creds.appStore?.issuerId || '';

          const projMeta = detectProjectMetadata(currentTarget);
          const nativeChanges = detectNativeChanges(gitAnalysis.changedFiles);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            project: {
              name: projectName,
              path: currentTarget,
              currentVersion: verStr,
              currentBuildNumber,
              suggestedVersion,
              suggestedBuildNumber: suggestedBuild,
              suggestedBump,
              package: projMeta.package || '',
              branch: gitAnalysis.currentBranch || 'main',
              isClean: gitAnalysis.isClean,
              uncommittedFiles: gitAnalysis.uncommittedFiles || [],
              hasPubspec: Boolean(pubspecInfo),
              configuredTrack: releaseConfig?.android?.track || undefined,
            },
            git: {
              isRepository: gitAnalysis.isRepository,
              currentBranch: gitAnalysis.currentBranch,
              isClean: gitAnalysis.isClean,
              uncommittedFiles: gitAnalysis.uncommittedFiles || [],
              lastTag: gitAnalysis.lastTag,
              changedFilesCount: gitAnalysis.changedFiles.length,
              hasNativeChanges: gitAnalysis.hasNativeChanges,
              nativeChanges,
              remote: gitAnalysis.remote || null,
              connected: Boolean(gitAnalysis.isRepository && gitAnalysis.remote),
              remoteUrl: gitAnalysis.remote?.fetchUrl || gitAnalysis.remote?.pushUrl || null,
              webUrl: gitAnalysis.remote?.webUrl || null,
              ownerRepo: gitAnalysis.remote?.ownerRepo || null,
              provider: gitAnalysis.remote?.provider || 'github',
            },
            commits: gitAnalysis.commitsSinceLastTag,
            comparison: await compareProjectWithStores(
              projMeta.package,
              currentBuildNumber,
              verStr,
              currentTarget,
              false // Hızlı yanıt için cache kullan (forceRefresh: false)
            ),
            stores: {
              googlePlay: {
                connected: googlePlayConnected,
                serviceAccount: googlePlayEmail,
                projectId: googlePlayProjectId,
                keyPath: googlePlayKeyPath,
              },
              appStore: {
                connected: appStoreConnected,
                keyId: appStoreKeyId || 'Yapılandırılmadı',
                issuerId: appStoreIssuerId || 'Yapılandırılmadı',
              }
            }
          }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
        return;
      }

      // 5. GET /api/stores/credentials - Kayıtlı Kimlik Bilgilerini Getir
      if (req.method === 'GET' && pathname === '/api/stores/credentials') {
        const creds = getStoreCredentials(activeProjectDir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          googlePlay: {
            configured: Boolean(creds.googlePlay?.serviceAccountEmail || creds.googlePlay?.keyPath),
            serviceAccountEmail: creds.googlePlay?.serviceAccountEmail || '',
            projectId: creds.googlePlay?.projectId || '',
            keyPath: creds.googlePlay?.keyPath || '',
            verified: creds.googlePlay?.verified ?? false,
          },
          appStore: {
            configured: Boolean(creds.appStore?.keyId && creds.appStore?.issuerId),
            keyId: creds.appStore?.keyId || '',
            issuerId: creds.appStore?.issuerId || '',
            hasPrivateKey: Boolean(creds.appStore?.privateKey || creds.appStore?.privateKeyPath),
            verified: creds.appStore?.verified ?? false,
          },
          ai: {
            provider: creds.ai?.provider || (process.env['GEMINI_API_KEY'] ? 'gemini' : process.env['OPENAI_API_KEY'] ? 'openai' : process.env['ANTHROPIC_API_KEY'] ? 'anthropic' : 'conventional'),
            geminiConfigured: Boolean(creds.ai?.geminiApiKey || process.env['GEMINI_API_KEY']),
            geminiMaskedKey: maskKey(creds.ai?.geminiApiKey || process.env['GEMINI_API_KEY']),
            geminiModel: creds.ai?.geminiModel || 'gemini-1.5-flash',
            openaiConfigured: Boolean(creds.ai?.openaiApiKey || process.env['OPENAI_API_KEY']),
            openaiMaskedKey: maskKey(creds.ai?.openaiApiKey || process.env['OPENAI_API_KEY']),
            openaiModel: creds.ai?.openaiModel || 'gpt-4o-mini',
            anthropicConfigured: Boolean(creds.ai?.anthropicApiKey || process.env['ANTHROPIC_API_KEY']),
            anthropicMaskedKey: maskKey(creds.ai?.anthropicApiKey || process.env['ANTHROPIC_API_KEY']),
            anthropicModel: creds.ai?.anthropicModel || 'claude-3-5-sonnet-20241022',
            verified: creds.ai?.verified ?? false,
          },
        }));
        return;
      }

      // 5.0 POST /api/ai/save - Yapay Zeka Sağlayıcı ve Anahtarlarını Kaydet
      if (req.method === 'POST' && pathname === '/api/ai/save') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              provider?: AIProviderType;
              geminiApiKey?: string;
              geminiModel?: string;
              openaiApiKey?: string;
              openaiModel?: string;
              anthropicApiKey?: string;
              anthropicModel?: string;
              saveGlobal?: boolean;
            };

            const creds = getStoreCredentials(activeProjectDir);
            const currentAi = creds.ai || {};

            creds.ai = {
              provider: payload.provider ?? currentAi.provider ?? 'conventional',
              geminiApiKey: payload.geminiApiKey !== undefined ? payload.geminiApiKey.trim() : currentAi.geminiApiKey,
              geminiModel: payload.geminiModel ?? currentAi.geminiModel ?? 'gemini-2.5-flash',
              openaiApiKey: payload.openaiApiKey !== undefined ? payload.openaiApiKey.trim() : currentAi.openaiApiKey,
              openaiModel: payload.openaiModel ?? currentAi.openaiModel ?? 'gpt-4o-mini',
              anthropicApiKey: payload.anthropicApiKey !== undefined ? payload.anthropicApiKey.trim() : currentAi.anthropicApiKey,
              anthropicModel: payload.anthropicModel ?? currentAi.anthropicModel ?? 'claude-3-5-sonnet-20241022',
              verified: true,
              lastTestedAt: new Date().toISOString(),
            };

            saveStoreCredentials(creds, payload.saveGlobal ? undefined : activeProjectDir);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: 'Yapay Zeka ayarları başarıyla kaydedildi.',
              ai: {
                provider: creds.ai.provider,
                geminiConfigured: Boolean(creds.ai.geminiApiKey || process.env['GEMINI_API_KEY']),
                geminiMaskedKey: maskKey(creds.ai.geminiApiKey || process.env['GEMINI_API_KEY']),
                geminiModel: creds.ai.geminiModel,
                openaiConfigured: Boolean(creds.ai.openaiApiKey || process.env['OPENAI_API_KEY']),
                openaiMaskedKey: maskKey(creds.ai.openaiApiKey || process.env['OPENAI_API_KEY']),
                openaiModel: creds.ai.openaiModel,
                anthropicConfigured: Boolean(creds.ai.anthropicApiKey || process.env['ANTHROPIC_API_KEY']),
                anthropicMaskedKey: maskKey(creds.ai.anthropicApiKey || process.env['ANTHROPIC_API_KEY']),
                anthropicModel: creds.ai.anthropicModel,
                verified: creds.ai.verified,
              }
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 5.0.1 POST /api/ai/test - Yapay Zeka API Bağlantısını Canlı Test Et
      if (req.method === 'POST' && pathname === '/api/ai/test') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              provider?: AIProviderType;
              apiKey?: string;
              model?: string;
            };

            const creds = getStoreCredentials(activeProjectDir);
            const providerType: AIProviderType = payload.provider || creds.ai?.provider || 'conventional';
            let key = payload.apiKey?.trim();
            const model = payload.model?.trim();

            if (!key) {
              if (providerType === 'gemini') key = creds.ai?.geminiApiKey || process.env['GEMINI_API_KEY'];
              if (providerType === 'openai') key = creds.ai?.openaiApiKey || process.env['OPENAI_API_KEY'];
              if (providerType === 'anthropic') key = creds.ai?.anthropicApiKey || process.env['ANTHROPIC_API_KEY'];
            }

            if (providerType !== 'conventional' && !key) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: `${providerType.toUpperCase()} için geçerli bir API anahtarı girilmedi.`,
              }));
              return;
            }

            const provider = createAIProvider({
              provider: providerType,
              apiKey: key,
              model,
            });

            // Küçük bir test bağlamı ile ping yap
            const testContext = {
              version: '1.0.0',
              commits: [{
                type: 'feat',
                scope: null,
                message: 'Test bağlantı doğrulaması',
                isBreakingChange: false,
              }],
              languages: ['tr', 'en'],
            };

            const testResult = await provider.generateReleaseNotes(testContext);
            const hasOutput = Boolean(testResult['tr']?.full?.length || testResult['en']?.full?.length);

            if (hasOutput) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                message: `${providerType.toUpperCase()} bağlantısı başarıyla doğrulandı. API anahtarı aktif!`,
                sample: testResult['tr']?.full?.[0] || 'Hazır',
              }));
            } else {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'Yapay zeka motorundan yanıt alınamadı.',
              }));
            }
          } catch (testErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: testErr instanceof Error ? testErr.message : String(testErr),
            }));
          }
        });
        return;
      }

      // 5.0.2 POST /api/ai/models - Sağlayıcı API Anahtarına Göre Desteklenen Modelleri Dinamik Listele
      if (req.method === 'POST' && pathname === '/api/ai/models') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              provider?: AIProviderType;
              apiKey?: string;
            };

            const creds = getStoreCredentials(activeProjectDir);
            const providerType: AIProviderType = payload.provider || creds.ai?.provider || 'gemini';
            let key = payload.apiKey?.trim();

            if (!key) {
              if (providerType === 'gemini') key = creds.ai?.geminiApiKey || process.env['GEMINI_API_KEY'];
              if (providerType === 'openai') key = creds.ai?.openaiApiKey || process.env['OPENAI_API_KEY'];
              if (providerType === 'anthropic') key = creds.ai?.anthropicApiKey || process.env['ANTHROPIC_API_KEY'];
            }

            interface ModelItem {
              id: string;
              name: string;
              recommended?: boolean;
            }

            let models: ModelItem[] = [];
            let defaultModel = '';

            if (providerType === 'gemini') {
              defaultModel = 'gemini-3.1-flash-lite';
              if (key) {
                try {
                  const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {
                    signal: AbortSignal.timeout(6000),
                  });
                  if (gRes.ok) {
                    const gData = await gRes.json() as {
                      models?: Array<{
                        name?: string;
                        displayName?: string;
                        supportedGenerationMethods?: string[];
                      }>;
                    };
                    const fetched = (gData.models || [])
                      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
                      .map(m => {
                        const cleanId = (m.name || '').replace(/^models\//, '');
                        let displayName = m.displayName ? `${m.displayName} (${cleanId})` : cleanId;
                        if (cleanId === 'gemini-3.1-flash-lite') {
                          displayName = `Gemini 3.1 Flash Lite (Ultra Hızlı & Önerilen)`;
                        } else if (cleanId === 'gemini-3.5-flash') {
                          displayName = `Gemini 3.5 Flash (Dengeli & Hızlı)`;
                        }
                        return {
                          id: cleanId,
                          name: displayName,
                          recommended: cleanId === 'gemini-3.1-flash-lite' || cleanId === 'gemini-3.5-flash' || cleanId === 'gemini-3.8-flash',
                        };
                      });
                    if (fetched.length > 0) {
                      // Ultra hızlı gemini-3.1-flash-lite en başa, sonra diğer önerilenler
                      fetched.sort((a, b) => {
                        if (a.id === 'gemini-3.1-flash-lite') return -1;
                        if (b.id === 'gemini-3.1-flash-lite') return 1;
                        return (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0);
                      });
                      models = fetched;
                    }
                  }
                } catch {
                  // Fallback listesine devam et
                }
              }

              if (models.length === 0) {
                models = [
                  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (Ultra Hızlı & Önerilen)', recommended: true },
                  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Dengeli & Hızlı)', recommended: true },
                  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Yeni Nesil)' },
                  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
                ];
              }
            } else if (providerType === 'openai') {
              defaultModel = 'gpt-4o-mini';
              if (key) {
                try {
                  const oRes = await fetch('https://api.openai.com/v1/models', {
                    headers: { Authorization: `Bearer ${key}` },
                    signal: AbortSignal.timeout(6000),
                  });
                  if (oRes.ok) {
                    const oData = await oRes.json() as { data?: Array<{ id: string }> };
                    const chatModels = (oData.data || [])
                      .map(m => m.id)
                      .filter(id => id.startsWith('gpt-4') || id.startsWith('o1') || id.startsWith('o3'))
                      .sort()
                      .map(id => ({
                        id,
                        name: id,
                        recommended: id === 'gpt-4o-mini' || id === 'gpt-4o',
                      }));
                    if (chatModels.length > 0) {
                      chatModels.sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
                      models = chatModels;
                    }
                  }
                } catch {
                  // Fallback
                }
              }

              if (models.length === 0) {
                models = [
                  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Önerilen & Hızlı)', recommended: true },
                  { id: 'gpt-4o', name: 'GPT-4o (Tam Kapasite)' },
                  { id: 'o3-mini', name: 'o3-mini (Akıl Yürütme)' },
                  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
                ];
              }
            } else if (providerType === 'anthropic') {
              defaultModel = 'claude-3-5-sonnet-20241022';
              models = [
                { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Önerilen & Güçlü)', recommended: true },
                { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Ultra Hızlı)' },
                { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' },
                { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
              ];
            } else {
              models = [{ id: 'conventional', name: 'Konvansiyonel Çözücü (Çevrimdışı)' }];
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              provider: providerType,
              defaultModel,
              models,
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 5.0.3 POST /api/ai/diagnose-error - Canlı Dağıtım Hatası Teşhisi ve Kök Neden Analizi
      if (req.method === 'POST' && pathname === '/api/ai/diagnose-error') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              errorText?: string;
              failedStep?: string;
              recentLogs?: string[];
              projectPath?: string;
              projectName?: string;
            };

            const targetDir = path.resolve(payload.projectPath || activeProjectDir);
            const creds = getStoreCredentials(targetDir);

            const diagnosis = await AIDiagnostician.diagnose({
              projectName: payload.projectName,
              projectPath: targetDir,
              failedStep: payload.failedStep,
              errorText: payload.errorText || 'Bilinmeyen hata',
              recentLogs: payload.recentLogs || [],
            }, {
              provider: creds.ai?.provider,
              apiKey: creds.ai?.geminiApiKey || process.env['GEMINI_API_KEY'],
              model: creds.ai?.geminiModel,
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              diagnosis,
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 5.0.4 POST /api/release/autofix - Akıllı Hata Otomatik Düzeltme İşlemi (Örn: AndroidManifest Fotoğraf İzinleri)
      if (req.method === 'POST' && pathname === '/api/release/autofix') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              action?: AutoFixActionType;
              projectPath?: string;
            };

            const targetDir = path.resolve(payload.projectPath || activeProjectDir);

            if (payload.action === 'REMOVE_PHOTO_PERMISSIONS') {
              const manifestCandidates = [
                path.join(targetDir, 'android/app/src/main/AndroidManifest.xml'),
                path.join(targetDir, 'android/app/src/profile/AndroidManifest.xml'),
                path.join(targetDir, 'android/app/src/debug/AndroidManifest.xml'),
              ];

              let modifiedCount = 0;
              for (const mPath of manifestCandidates) {
                if (fs.existsSync(mPath)) {
                  let content = fs.readFileSync(mPath, 'utf8');
                  const orig = content;
                  const permissionRegex = /<uses-permission[^>]+android:name=["']android\.permission\.(READ_MEDIA_IMAGES|READ_MEDIA_VIDEO|READ_MEDIA_VISUAL_USER_SELECTED|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE)["'][^>]*\/>\s*/gi;
                  content = content.replace(permissionRegex, '');
                  if (content !== orig) {
                    fs.writeFileSync(mPath, content, 'utf8');
                    modifiedCount++;
                  }
                }
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                message: `Gereksiz fotoğraf ve medya izinleri AndroidManifest dosyasından başarıyla temizlendi (${modifiedCount} dosya güncellendi). Google Play artık 'Fotoğraf ve video izinleri' formunu istemeyecektir.`,
                action: payload.action,
              }));
              return;
            }

            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Desteklenmeyen otomatik düzeltme eylemi: ${payload.action}` }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 5.1 POST /api/stores/save-google - Google Play Service Account JSON Kaydet ve Doğrula
      if (req.method === 'POST' && pathname === '/api/stores/save-google') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              serviceAccountJson?: string;
              keyPath?: string;
              saveGlobal?: boolean;
            };

            let keyJson: { client_email?: string; project_id?: string; private_key?: string } = {};

            if (payload.serviceAccountJson) {
              try {
                keyJson = JSON.parse(payload.serviceAccountJson);
              } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Geçersiz JSON formatı. Lütfen dosya içeriğini kontrol edin.' }));
                return;
              }
            } else if (payload.keyPath && fs.existsSync(payload.keyPath)) {
              try {
                keyJson = JSON.parse(fs.readFileSync(payload.keyPath, 'utf8'));
              } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Belirtilen dosya yolu geçerli bir JSON içermiyor.' }));
                return;
              }
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Lütfen Service Account JSON içeriğini yapıştırın veya geçerli bir dosya yolu girin.' }));
              return;
            }

            if (!keyJson.client_email || !keyJson.private_key) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'JSON dosyasında "client_email" veya "private_key" alanları eksik.' }));
              return;
            }

            // Test et
            const activeMeta = detectProjectMetadata(activeProjectDir);
            const auth = createGoogleAuth({
              packageName: activeMeta.package || 'com.example.app',
              serviceAccountJson: payload.serviceAccountJson,
              serviceAccountJsonPath: payload.keyPath,
            });

            let tokenSuccess = false;
            let authError = '';
            try {
              const token = await auth.getAccessToken();
              if (token) tokenSuccess = true;
            } catch (tErr) {
              authError = tErr instanceof Error ? tErr.message : String(tErr);
            }

            // Kalıcı kaydet
            const targetDir = payload.saveGlobal ? undefined : activeProjectDir;
            const creds = getStoreCredentials(targetDir);
            creds.googlePlay = {
              serviceAccountEmail: keyJson.client_email,
              projectId: keyJson.project_id || '',
              serviceAccountJson: payload.serviceAccountJson,
              keyPath: payload.keyPath,
              verified: true,
              lastTestedAt: new Date().toISOString(),
            };
            saveStoreCredentials(creds, targetDir);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: 'Google Play Service Account başarıyla kaydedildi ve doğrulandı.',
              serviceAccount: keyJson.client_email,
              projectId: keyJson.project_id,
              oauthReady: tokenSuccess,
              oauthDetails: tokenSuccess ? 'Google OAuth2 token başarıyla alındı.' : `OAuth el sıkışma uyarısı: ${authError}`,
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 5.2 POST /api/stores/save-apple - Apple App Store Connect API Anahtarlarını Kaydet ve Doğrula
      if (req.method === 'POST' && pathname === '/api/stores/save-apple') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              keyId?: string;
              issuerId?: string;
              privateKey?: string;
              privateKeyPath?: string;
              saveGlobal?: boolean;
            };

            if (!payload.keyId || !payload.issuerId) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Key ID ve Issuer ID alanları zorunludur.' }));
              return;
            }

            if (!payload.privateKey && (!payload.privateKeyPath || !fs.existsSync(payload.privateKeyPath))) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Lütfen .p8 Private Key metnini yapıştırın veya geçerli bir dosya yolu girin.' }));
              return;
            }

            // JWT token test et
            let token = '';
            try {
              const activeMeta = detectProjectMetadata(activeProjectDir);
              token = generateAppStoreToken({
                keyId: payload.keyId,
                issuerId: payload.issuerId,
                bundleId: activeMeta.package || 'com.example.app',
                privateKeyContent: payload.privateKey,
                privateKeyPath: payload.privateKeyPath,
              });
            } catch (tErr) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Geçersiz özel anahtar veya JWT hatası: ${tErr instanceof Error ? tErr.message : String(tErr)}` }));
              return;
            }

            // Canlı Apple API Testi
            let liveApiOk = false;
            let sampleAppCount = 0;
            let appleErrMsg = '';
            try {
              const appleRes = await fetch('https://api.appstoreconnect.apple.com/v1/apps?limit=5', {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                }
              });
              if (appleRes.ok) {
                const data = await appleRes.json() as { data?: Array<{ id: string }> };
                liveApiOk = true;
                sampleAppCount = data.data?.length || 0;
              } else {
                appleErrMsg = `Apple HTTP ${appleRes.status} (${appleRes.statusText})`;
              }
            } catch (fetchErr) {
              appleErrMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            }

            // Kalıcı kaydet
            const targetDir = payload.saveGlobal ? undefined : activeProjectDir;
            const creds = getStoreCredentials(targetDir);
            creds.appStore = {
              keyId: payload.keyId,
              issuerId: payload.issuerId,
              privateKey: payload.privateKey,
              privateKeyPath: payload.privateKeyPath,
              verified: true,
              lastTestedAt: new Date().toISOString(),
            };
            saveStoreCredentials(creds, targetDir);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: 'Apple App Store Connect API anahtarı başarıyla kaydedildi.',
              keyId: payload.keyId,
              issuerId: payload.issuerId,
              liveApiOk,
              appCount: sampleAppCount,
              details: liveApiOk
                ? `Bağlantı başarılı! Hesapta ${sampleAppCount} uygulama listelendi.`
                : `JWT oluşturuldu ancak canlı Apple API uyarısı: ${appleErrMsg}`,
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 5.3 POST /api/stores/test-google - Google Play Canlı Doğrulama
      if (req.method === 'POST' && pathname === '/api/stores/test-google') {
        try {
          const creds = getStoreCredentials(activeProjectDir);
          const googleCred = creds.googlePlay;

          if (!googleCred || (!googleCred.serviceAccountJson && !googleCred.keyPath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              stage: 'file_check',
              error: 'Google Play Service Account anahtarı henüz kaydedilmemiş.',
              tip: 'Lütfen modal üzerindeki "Google Play API Yapılandır" formundan JSON anahtarınızı yapıştırın veya yükleyin.',
            }));
            return;
          }

          const activeMeta = detectProjectMetadata(activeProjectDir);
          const auth = createGoogleAuth({
            packageName: activeMeta.package || 'com.example.app',
            serviceAccountJson: googleCred.serviceAccountJson,
            serviceAccountJsonPath: googleCred.keyPath,
          });

          let tokenSuccess = false;
          let authErrorMsg = '';
          try {
            const token = await auth.getAccessToken();
            if (token) tokenSuccess = true;
          } catch (authErr) {
            authErrorMsg = authErr instanceof Error ? authErr.message : String(authErr);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            serviceAccount: googleCred.serviceAccountEmail,
            projectId: googleCred.projectId || 'Bilinmiyor',
            keyPath: googleCred.keyPath,
            oauthReady: tokenSuccess,
            oauthDetails: tokenSuccess ? 'Google OAuth2 token başarıyla alındı.' : `OAuth el sıkışma uyarısı: ${authErrorMsg}`,
            message: 'Service Account anahtarı ve formatı doğrulandı.',
            permissionsRequired: [
              'Google Play Console -> Kullanıcılar ve İzinler -> Hizmet Hesabını Ekleyin',
              'İzin: "Sürümleri üretim kanalında yayınlama, sürümleri hariç tutma"',
              'İzin: "Dahili test sürümlerini yönetme"',
            ]
          }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
        return;
      }

      // 6. POST /api/stores/test-apple - Gerçek Apple App Store Connect Canlı Doğrulama
      if (req.method === 'POST' && pathname === '/api/stores/test-apple') {
        try {
          const creds = getStoreCredentials(activeProjectDir);
          const appleCred = creds.appStore;

          if (!appleCred || !appleCred.keyId || !appleCred.issuerId || (!appleCred.privateKey && !appleCred.privateKeyPath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              stage: 'config_check',
              missingFields: ['APPSTORE_KEY_ID', 'APPSTORE_ISSUER_ID', 'APPSTORE_PRIVATE_KEY'],
              error: 'Apple App Store Connect API anahtarları henüz yapılandırılmadı.',
              tip: 'Lütfen modal üzerindeki formdan Key ID, Issuer ID ve .p8 anahtarınızı girin.',
            }));
            return;
          }

          let token = '';
          try {
            const activeMeta = detectProjectMetadata(activeProjectDir);
            token = generateAppStoreToken({
              keyId: appleCred.keyId,
              issuerId: appleCred.issuerId,
              bundleId: activeMeta.package || 'com.example.app',
              privateKeyContent: appleCred.privateKey,
              privateKeyPath: appleCred.privateKeyPath,
            });
          } catch (jwtErr) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              stage: 'jwt_generation',
              error: `JWT token üretilemedi: ${jwtErr instanceof Error ? jwtErr.message : String(jwtErr)}`,
            }));
            return;
          }

          let liveSuccess = false;
          let appCount = 0;
          let sampleApps: Array<{ name: string; bundleId: string }> = [];
          let appleStatusMsg = '';

          try {
            const appleRes = await fetch('https://api.appstoreconnect.apple.com/v1/apps?limit=5', {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              }
            });

            if (appleRes.ok) {
              liveSuccess = true;
              const json = await appleRes.json() as {
                data?: Array<{
                  id: string;
                  attributes?: { name: string; bundleId: string };
                }>;
              };
              appCount = json.data?.length || 0;
              sampleApps = (json.data || []).map(a => ({
                name: a.attributes?.name || 'Uygulama',
                bundleId: a.attributes?.bundleId || '',
              }));
              appleStatusMsg = `Apple App Store Connect API başarıyla bağlandı! ${appCount} uygulama tespit edildi.`;
            } else {
              const errBody = await appleRes.text().catch(() => '');
              appleStatusMsg = `Apple API isteği başarısız oldu (HTTP ${appleRes.status}): ${errBody}`;
            }
          } catch (netErr) {
            appleStatusMsg = `Ağ veya el sıkışma uyarısı: ${netErr instanceof Error ? netErr.message : String(netErr)}`;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            keyId: appleCred.keyId,
            issuerId: appleCred.issuerId,
            jwtGenerated: true,
            liveApiSuccess: liveSuccess,
            message: appleStatusMsg,
            appCount,
            sampleApps,
          }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
        return;
      }

      // 7. POST /api/ai/generate & /api/ai/release-notes - Gerçek Git Commit'lerinden Sürüm Notu Üretimi
      if (req.method === 'POST' && (pathname === '/api/ai/generate' || pathname === '/api/ai/release-notes')) {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as {
              version?: string;
              projectPath?: string;
              provider?: AIProviderType;
              apiKey?: string;
              model?: string;
            };
            const version = payload.version || '1.0.0';
            const targetDir = payload.projectPath || activeProjectDir;
            
            const gitAnalyzer = new GitAnalyzer(targetDir);
            const gitAnalysis = await gitAnalyzer.analyze();
            const commits = gitAnalysis.commitsSinceLastTag;

            if (commits.length === 0) {
              const defaultTr = ['• Genel performans iyileştirmeleri ve hata düzeltmeleri yapıldı.'];
              const defaultEn = ['• General performance enhancements and bug fixes.'];
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                provider: 'fallback',
                notesTr: defaultTr.join('\n'),
                notesEn: defaultEn.join('\n'),
                notes: {
                  tr: { full: defaultTr },
                  en: { full: defaultEn },
                },
              }));
              return;
            }

            const creds = getStoreCredentials(targetDir);
            const requestedProvider: AIProviderType = payload.provider || creds.ai?.provider || (process.env['GEMINI_API_KEY'] ? 'gemini' : 'conventional');
            let apiKey = payload.apiKey?.trim();
            let model = payload.model?.trim();

            if (!apiKey) {
              if (requestedProvider === 'gemini') {
                apiKey = creds.ai?.geminiApiKey || process.env['GEMINI_API_KEY'];
                model = model || creds.ai?.geminiModel || 'gemini-3.1-flash-lite';
              } else if (requestedProvider === 'openai') {
                apiKey = creds.ai?.openaiApiKey || process.env['OPENAI_API_KEY'];
                model = model || creds.ai?.openaiModel || 'gpt-4o-mini';
              } else if (requestedProvider === 'anthropic') {
                apiKey = creds.ai?.anthropicApiKey || process.env['ANTHROPIC_API_KEY'];
                model = model || creds.ai?.anthropicModel || 'claude-3-5-sonnet-20241022';
              }
            }

            // Hızlı Önbellek (Fast Cache) Kontrolü
            const latestCommitHash = commits[0]?.hash || 'none';
            const cacheKey = `${targetDir}:${version}:${latestCommitHash}:${requestedProvider}:${model || 'default'}`;
            const cached = releaseNotesCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000) && !(payload as { forceRefresh?: boolean }).forceRefresh) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ...cached.data, cached: true }));
              return;
            }

            let provider = createAIProvider({
              provider: requestedProvider,
              apiKey,
              model,
            });

            const rawValidator = new ReleaseNotesValidator();
            const validatorAdapter = {
              validate(data: unknown) {
                const valRes = rawValidator.validate(data);
                if (!valRes.isValid) {
                  throw new Error(valRes.issues.map(i => i.message).join(', '));
                }
                return data as import('@webicro/validation').ReleaseNotesMap;
              }
            };

            let notes: import('@webicro/validation').ReleaseNotesMap;
            try {
              const aiController = new AIController(provider, validatorAdapter);
              notes = await aiController.generate(version, commits, ['tr', 'en']);
            } catch (genErr) {
              // LLM veya API hatasi durumunda guvenli fallback: Conventional Commits
              console.warn('AI uretim hatasi, Conventional Commits cozucu devreye aliniyor:', genErr);
              provider = createAIProvider({ provider: 'conventional' });
              const fallbackController = new AIController(provider, validatorAdapter);
              notes = await fallbackController.generate(version, commits, ['tr', 'en']);
            }

            const trItems = notes['tr']?.full || ['Hata düzeltmeleri ve kararlılık iyileştirmeleri yapıldı.'];
            const enItems = notes['en']?.full || ['Bug fixes and stability improvements.'];

            const formattedTr = formatBulletNotes(trItems);
            const formattedEn = formatBulletNotes(enItems);

            const responseData = {
              provider: provider.name,
              notesTr: formattedTr,
              notesEn: formattedEn,
              notes: {
                tr: { full: trItems },
                en: { full: enItems },
              },
            };

            releaseNotesCache.set(cacheKey, {
              key: cacheKey,
              timestamp: Date.now(),
              data: responseData,
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(responseData));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 8. GET /api/history - Gerçek SQLite Veritabanı Geçmişi (Tüm Projeler veya Seçili Proje)
      if (req.method === 'GET' && pathname === '/api/history') {
        try {
          const queryProj = url.searchParams.get('projectPath');
          const targetDir = queryProj ? path.resolve(queryProj) : (activeProjectDir ? path.resolve(activeProjectDir) : null);

          // Toplanacak release ve audit log havuzları
          const allReleasesMap = new Map<string, import('@webicro/database').ReleaseRecord>();
          const allAuditLogs: import('@webicro/database').AuditLogRecord[] = [];

          // 1. Merkezi veritabanındaki kayıtları ekle
          try {
            const centralReleases = releaseRepo.findAll(100);
            for (const r of centralReleases) {
              allReleasesMap.set(r.releaseId, r);
            }
            const centralLogs = auditRepo.findAll(100);
            allAuditLogs.push(...centralLogs);
          } catch {
            // Merkezi db okuma hatası sessiz
          }

          // 2. Hedef proje ve kayıtlı tüm projelerin .release/release.db dosyalarını da tara
          const candidateDirs: string[] = [];
          if (targetDir) {
            candidateDirs.push(targetDir);
          }
          const storedList = getStoredProjects();
          for (const sp of storedList) {
            if (sp.path && !candidateDirs.includes(path.resolve(sp.path))) {
              candidateDirs.push(path.resolve(sp.path));
            }
          }

          for (const cDir of candidateDirs) {
            const pDbFile = path.join(cDir, '.release/release.db');
            if (fs.existsSync(pDbFile)) {
              try {
                const pConn = new DatabaseConnection(pDbFile);
                const pRelRepo = new ReleaseRepository(pConn.getDb());
                const pAuditRepo = new AuditLogRepository(pConn.getDb());
                const pReleases = pRelRepo.findAll(100);
                const pLogs = pAuditRepo.findAll(100);

                for (const r of pReleases) {
                  const existing = allReleasesMap.get(r.releaseId);
                  if (!existing || (r.updatedAt && (!existing.updatedAt || r.updatedAt > existing.updatedAt))) {
                    allReleasesMap.set(r.releaseId, r);
                  }
                }

                allAuditLogs.push(...pLogs);
                pConn.close();
              } catch {
                // Proje db okuma hatası sessiz
              }
            }
          }

          // Tüm kayıtları listele (tarihe göre en yeni en üstte)
          const finalReleases = Array.from(allReleasesMap.values());
          finalReleases.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          // Audit logları tekilleştir ve sırala
          const seenAudit = new Set<string>();
          const dedupedLogs = allAuditLogs.filter(log => {
            const key = `${log.releaseId}_${log.action}_${log.timestamp}`;
            if (seenAudit.has(key)) return false;
            seenAudit.add(key);
            return true;
          });
          dedupedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            releases: finalReleases.slice(0, 50),
            auditLogs: dedupedLogs.slice(0, 50),
            projectPath: targetDir,
          }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
        return;
      }

      // 8.5 GET /api/release/status - Proje Bazlı veya Genel Boru Hattı Durumunu Getir
      if (req.method === 'GET' && pathname === '/api/release/status') {
        const queryPath = url.searchParams.get('projectPath');
        const target = path.resolve(queryPath || activeProjectDir);
        const pipeline = activePipelines.get(target) || null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          active: Boolean(pipeline?.isReleasing),
          projectPath: target,
          pipeline,
          allPipelines: Array.from(activePipelines.values()),
        }));
        return;
      }

      // 8.6 POST /api/release/cancel - Belirtilen Projenin Dağıtımını Sıfırla / İptal Et
      if (req.method === 'POST' && pathname === '/api/release/cancel') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}') as { projectPath?: string };
            const target = path.resolve(payload.projectPath || activeProjectDir);
            const existed = activePipelines.get(target);
            if (existed) {
              existed.isReleasing = false;
              existed.completed = false;
              existed.error = 'Kullanıcı tarafından iptal edildi.';
              existed.logs.push(`[${new Date().toLocaleTimeString()}] Dağıtım işlemi kullanıcı tarafından iptal edildi/sıfırlandı.`);
            }
            activePipelines.delete(target);

            broadcastEvent({
              type: 'pipeline_canceled',
              projectPath: target,
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, projectPath: target }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 9. GET /api/release/events - SSE (Server-Sent Events) Canlı Akış
      if (req.method === 'GET' && pathname === '/api/release/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write('retry: 3000\n\n');

        // Bağlanan istemciye tüm aktif pipeline durumlarını hemen senkronize et
        const pipelinesList = Array.from(activePipelines.values());
        for (const pl of pipelinesList) {
          res.write(`data: ${JSON.stringify({ type: 'sync', pipeline: pl, projectPath: pl.projectPath })}\n\n`);
        }

        sseClients.push(res);

        req.on('close', () => {
          const index = sseClients.indexOf(res);
          if (index !== -1) {
            sseClients.splice(index, 1);
          }
        });
        return;
      }

      // 10. POST /api/release/start - Canlı Release Pipeline Başlatma (Her Proje İçin Bağımsız Boru Hattı)
      if (req.method === 'POST' && pathname === '/api/release/start') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const options = JSON.parse(body || '{}') as {
              projectPath?: string;
              projectName?: string;
              version?: string;
              buildNumber?: number;
              bump?: 'patch' | 'minor' | 'major';
              manualVersion?: string;
              dryRun?: boolean;
              targetAndroid?: boolean;
              targetIos?: boolean;
              notesTr?: string;
              notesEn?: string;
              googleTrack?: 'internal' | 'alpha' | 'beta' | 'production';
              rollout?: number;
              skipAndroid?: boolean;
              skipIos?: boolean;
              skipGit?: boolean;
              createGitTag?: boolean;
              pushGit?: boolean;
              gitCommitMessage?: string;
            };

            const trNotes = options.notesTr?.trim();
            const enNotes = options.notesEn?.trim();
            if (!trNotes || !enNotes) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Sürüm notları (Türkçe ve İngilizce) oluşturulmadan dağıtım başlatılamaz. Lütfen önce AI ile sürüm notlarını oluşturun.'
              }));
              return;
            }

            const releaseTargetDir = path.resolve(options.projectPath || activeProjectDir);

            // Eğer BU PROJE için zaten aktif bir dağıtım yürütülüyorsa izin verme
            const existingPipeline = activePipelines.get(releaseTargetDir);
            if (existingPipeline?.isReleasing) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Bu proje için zaten aktif bir dağıtım yürütülüyor. Lütfen tamamlanmasını bekleyin veya "İptal Et" butonunu kullanın.'
              }));
              return;
            }

            const targetPlatform = options.targetPlatform;
            let skipAndroid = false;
            let skipIos = false;

            if (targetPlatform === 'android') {
              skipAndroid = false;
              skipIos = true;
            } else if (targetPlatform === 'ios') {
              skipAndroid = true;
              skipIos = false;
            } else if (targetPlatform === 'both') {
              skipAndroid = false;
              skipIos = false;
            } else {
              skipAndroid = options.skipAndroid !== undefined
                ? options.skipAndroid
                : options.targetAndroid !== undefined
                ? !options.targetAndroid
                : false;

              skipIos = options.skipIos !== undefined
                ? options.skipIos
                : options.targetIos !== undefined
                ? !options.targetIos
                : false;
            }

            const meta = detectProjectMetadata(releaseTargetDir);
            const stages = createDefaultStages();
            stages[0]!.status = 'running';

            if (skipAndroid) {
              const androidStage = stages.find(s => s.id === 4);
              if (androidStage) {
                androidStage.status = 'skipped';
                androidStage.details = 'Android derlemesi atlandı';
              }
            }
            if (skipIos) {
              const iosStage = stages.find(s => s.id === 5);
              if (iosStage) {
                iosStage.status = 'skipped';
                iosStage.details = 'iOS derlemesi atlandı';
              }
            }

            const platformLabel = skipAndroid && !skipIos ? 'Sadece iOS' : !skipAndroid && skipIos ? 'Sadece Android' : 'Android + iOS';

            const projectPipelineStatus: ActivePipelineStatus = {
              isReleasing: true,
              projectPath: releaseTargetDir,
              projectName: options.projectName || meta.name || path.basename(releaseTargetDir),
              targetVersion: options.version || options.manualVersion || meta.version,
              currentStageId: 1,
              stages,
              logs: [
                `[${new Date().toLocaleTimeString()}] Sürüm dağıtım orkestrasyonu başlatıldı...`,
                `[${new Date().toLocaleTimeString()}] Proje: ${options.projectName || meta.name} (${releaseTargetDir})`,
                `[${new Date().toLocaleTimeString()}] Hedef Platform: ${platformLabel}`,
              ],
              completed: false,
              startedAt: new Date().toISOString(),
            };

            activePipelines.set(releaseTargetDir, projectPipelineStatus);

            broadcastEvent({
              type: 'pipeline_init',
              projectPath: releaseTargetDir,
              pipeline: projectPipelineStatus,
            });

            const orchestrator = new ReleaseOrchestrator();

            orchestrator.onStep((event) => {
              const currentStatus = activePipelines.get(releaseTargetDir);
              if (!currentStatus) return;

              const stageId = mapStepNameToStageId(event.step);
              const logLine = `[${new Date().toLocaleTimeString()}] [${event.status}] ${event.step} ${event.message ? '- ' + event.message : ''}`;
              currentStatus.logs.push(logLine);

              // Sıralı ilerleme mantığı: stageId'den öncekiler 'success' (eğer skipped değilse), aktif aşama 'running' / 'success' / 'skipped', sonrakiler 'pending'
              for (const st of currentStatus.stages) {
                if (st.id < stageId) {
                  if (st.status !== 'skipped') {
                    st.status = 'success';
                  }
                } else if (st.id === stageId) {
                  if (event.status === 'SKIPPED') {
                    st.status = 'skipped';
                    if (event.message) st.details = event.message;
                  } else if (event.status === 'RUNNING' || event.status === 'IN_PROGRESS') {
                    st.status = 'running';
                    if (event.message) st.details = event.message;
                  } else if (event.status === 'COMPLETED' || event.status === 'SUCCESS') {
                    st.status = 'success';
                    if (event.message) st.details = event.message;
                  } else if (event.status === 'FAILED') {
                    st.status = 'failed';
                    if (event.error) st.details = event.error;
                  }
                } else {
                  if (st.status !== 'skipped') {
                    st.status = 'pending';
                  }
                }
              }

              currentStatus.currentStageId = stageId;

              broadcastEvent({
                type: 'pipeline_update',
                projectPath: releaseTargetDir,
                pipeline: currentStatus,
                event,
              });
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'started', projectPath: releaseTargetDir, pipeline: projectPipelineStatus }));

            try {
              const isDryRun = options.dryRun !== undefined ? options.dryRun : false;

              const summary = await orchestrator.execute({
                targetDir: releaseTargetDir,
                packageName: meta.package || 'com.webicro.piyyuumanager',
                bump: options.bump,
                manualVersion: options.manualVersion || options.version,
                dryRun: isDryRun,
                skipAndroid,
                skipIos,
                skipTests: false,
                skipAi: false,
                autoApprove: true,
                googleTrack: options.googleTrack || 'internal',
                rollout: options.rollout,
                notesTr: options.notesTr,
                notesEn: options.notesEn,
                skipGit: options.skipGit,
                createGitTag: options.createGitTag,
                pushGit: options.pushGit,
                gitCommitMessage: options.gitCommitMessage,
              });

              const currentStatus = activePipelines.get(releaseTargetDir);
              if (currentStatus) {
                currentStatus.isReleasing = false;
                currentStatus.completed = true;
                for (const st of currentStatus.stages) {
                  if (st.status !== 'skipped') {
                    st.status = 'success';
                  }
                }
                currentStatus.logs.push(`[${new Date().toLocaleTimeString()}] Tüm süreç başarıyla tamamlandı! (Sürüm: ${summary.version})`);

                // DAĞITIM BİTTİĞİNDE MAĞAZA VERİLERİNİ OTOMATİK SENKRONİZE ET
                try {
                  const pData = loadProjectsData();
                  await syncStores(pData);
                } catch (syncErr) {
                  console.error('Boru hattı sonrası mağaza senkronizasyonu hatası:', syncErr);
                }

                broadcastEvent({
                  type: 'pipeline_completed',
                  projectPath: releaseTargetDir,
                  summary,
                  pipeline: currentStatus,
                });
              }
            } catch (execErr) {
              const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
              const currentStatus = activePipelines.get(releaseTargetDir);
              if (currentStatus) {
                currentStatus.isReleasing = false;
                currentStatus.error = errMsg;
                if (currentStatus.stages[currentStatus.currentStageId - 1]) {
                  currentStatus.stages[currentStatus.currentStageId - 1]!.status = 'failed';
                }
                currentStatus.logs.push(`[${new Date().toLocaleTimeString()}] HATA: ${errMsg}`);

                // Yapay Zeka Hata Teşhisini ve Kök Neden Analizini Otomatik Başlat
                try {
                  const creds = getStoreCredentials(releaseTargetDir);
                  const diagnosis = await AIDiagnostician.diagnose({
                    projectName: options.projectName || meta.name,
                    projectPath: releaseTargetDir,
                    version: currentStatus.targetVersion,
                    failedStep: currentStatus.stages[currentStatus.currentStageId - 1]?.name,
                    errorText: errMsg,
                    recentLogs: currentStatus.logs.slice(-15),
                  }, {
                    provider: creds.ai?.provider,
                    apiKey: creds.ai?.geminiApiKey || process.env['GEMINI_API_KEY'],
                    model: creds.ai?.geminiModel,
                  });
                  currentStatus.diagnosis = diagnosis;
                } catch (diagErr) {
                  console.warn('Otomatik AI teşhis hatası:', diagErr);
                }

                broadcastEvent({
                  type: 'pipeline_failed',
                  projectPath: releaseTargetDir,
                  error: errMsg,
                  diagnosis: currentStatus.diagnosis,
                  pipeline: currentStatus,
                });
              }
            }

          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          }
        });
        return;
      }

      // ======================== STATİK DOSYA SUNUCUSU ========================
      let reqPath = req.url === '/' || !req.url ? '/index.html' : req.url;
      reqPath = reqPath.split('?')[0] || '/index.html';
      
      let filePath = path.join(staticDir, reqPath);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(staticDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Server error loading dashboard');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      clack.intro(chalk.bold('Webicro Distribution - Canlı Web Dashboard'));
      clack.log.success(`${chalk.green('Dashboard ve Canlı API Servisi hazır:')} ${chalk.cyan.underline(url)}`);
      clack.log.info(chalk.dim('Durdurmak için Ctrl+C tuşlarına basın.'));

      // Tarayıcıyı otomatik aç
      const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${startCmd} ${url}`);
    });
  });
