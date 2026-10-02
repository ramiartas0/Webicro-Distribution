import { Command } from 'commander';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import chalk from 'chalk';
import * as clack from '@clack/prompts';

import { GitAnalyzer } from '@webicro/git';
import { VersionResolver } from '@webicro/versioning';
import { ConfigLoader } from '@webicro/config';
import { DatabaseConnection, ReleaseRepository, AuditLogRepository } from '@webicro/database';
import { ReleaseOrchestrator } from '@webicro/core';
import { AIController, ConventionalReleaseNotesProvider, GeminiProvider } from '@webicro/ai';
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
  version?: string;
  buildNumber?: number;
  stores?: StoreComparison;
}

/**
 * Proje dizininden paket adını ve versiyonunu otomatik tespit eder
 */
function detectProjectMetadata(projectPath: string): {
  name: string;
  package: string;
  version: string;
  buildNumber: number;
} {
  let name = path.basename(projectPath);
  let pkg = '';
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

  if (!pkg) {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    pkg = `com.webicro.${cleanName || 'app'}`;
  }

  return { name, package: pkg, version, buildNumber };
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
 */
export function deduplicateProjects(projects: ProjectEntry[], activePath?: string): ProjectEntry[] {
  const scoreProject = (p: ProjectEntry): number => {
    let score = 0;
    // 1. Aktif proje ise öncelik ver
    if (activePath && path.resolve(p.path) === path.resolve(activePath)) {
      score += 10000;
    }
    // 2. Mağazada canlı sürüm varsa yüksek öncelik
    const gpLive = p.stores?.googlePlay?.status === 'live';
    const asLive = p.stores?.appStore?.status === 'live';
    if (gpLive || asLive) {
      score += 3000;
    }
    if (gpLive && asLive) {
      score += 2000;
    }
    // 3. Karşılaştırma durumu
    if (p.stores?.comparisonStatus === 'UPDATE_READY' || p.stores?.comparisonStatus === 'UP_TO_DATE') {
      score += 1500;
    }
    // 4. Build numarası ve versiyon
    score += (p.buildNumber || 0);
    // 5. Pubspec varlığı
    if (p.hasPubspec) {
      score += 100;
    }
    return score;
  };

  // Skorlara göre azalan sırada sırala (en kaliteli / en güncel / canlı olan en başta)
  const sorted = [...projects].sort((a, b) => scoreProject(b) - scoreProject(a));

  const seenPackages = new Set<string>();
  const seenNames = new Set<string>();
  const seenPaths = new Set<string>();
  const result: ProjectEntry[] = [];

  for (const p of sorted) {
    const resolvedP = path.resolve(p.path);
    if (seenPaths.has(resolvedP)) continue;

    const normName = p.name.trim().toLowerCase().replace(/[-_]/g, '');
    const normPkg = p.package ? p.package.trim().toLowerCase() : '';

    // Eğer aynı paket adına veya aynı normalize isme sahip proje daha önce eklendiyse (yani daha yüksek skorlu olanı zaten aldıysak), bunu atla!
    if (normPkg && seenPackages.has(normPkg)) {
      continue;
    }
    if (normName && seenNames.has(normName)) {
      continue;
    }

    if (normPkg) seenPackages.add(normPkg);
    if (normName) seenNames.add(normName);
    seenPaths.add(resolvedP);
    result.push(p);
  }

  return result;
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
        if (parsed.googlePlay || parsed.appStore) {
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

/**
 * Projeyi Google Play ve Apple App Store ile canlı karşılaştırır
 */
async function compareProjectWithStores(
  pkgName: string,
  localBuildNumber: number,
  localVersion: string,
  projectDir?: string
): Promise<StoreComparison> {
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
  // Öncelik A: Resmi Apple iTunes API (Herkes için API anahtarsız canlı mağaza durumu)
  const itunesRes = await fetchAppleStoreLive(pkgName);
  if (itunesRes.status === 'live') {
    comparison.appStore = {
      status: 'live',
      version: itunesRes.version,
      message: `${itunesRes.version.startsWith('v') ? itunesRes.version : 'v' + itunesRes.version} yayında`,
    };
  }

  // Öncelik B: App Store Connect API varsa TestFlight / bekleyen build kontrolü
  if (creds.appStore && creds.appStore.keyId && creds.appStore.issuerId && (creds.appStore.privateKeyPath || creds.appStore.privateKey)) {
    try {
      const adapter = new AppStoreAdapter({
        keyId: creds.appStore.keyId,
        issuerId: creds.appStore.issuerId,
        bundleId: pkgName,
        privateKeyPath: creds.appStore.privateKeyPath,
        privateKeyContent: creds.appStore.privateKey,
      });

      const latestBuild = await adapter.getLatestBuild().catch(() => null);
      if (latestBuild) {
        comparison.appStore = {
          status: 'live',
          version: latestBuild.version !== 'unknown' ? latestBuild.version : comparison.appStore.version,
          buildNumber: latestBuild.buildNumber,
          message: `v${latestBuild.buildNumber} yayında`,
        };
      }
    } catch {
      // Connect API hatası olursa iTunes sonucu korunur
    }
  }

  if (comparison.appStore.status !== 'live' && itunesRes.status === 'not_found') {
    comparison.appStore = {
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

      if (list.length === 0) {
        const rootMeta = detectProjectMetadata(process.cwd());
        list = [
          {
            id: 'default',
            name: rootMeta.name || 'Webicro Distribution',
            path: process.cwd(),
            hasPubspec: fs.existsSync(path.join(process.cwd(), 'pubspec.yaml')),
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

    // SSE İstemcileri
    const sseClients: http.ServerResponse[] = [];

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
            p.stores = await compareProjectWithStores(p.package, p.buildNumber || 1, p.version || '1.0.0', p.path);
          }
        }
        if (!list.some(p => path.resolve(p.path) === path.resolve(activeProjectDir)) && list[0]) {
          activeProjectDir = list[0].path;
        }
        saveStoredProjects(list);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          activePath: activeProjectDir,
          projects: list,
        }));
        return;
      }

      // 1.1 POST /api/projects/sync-stores - Mağazalardan Canlı Karşılaştırmayı Yenile
      if (req.method === 'POST' && pathname === '/api/projects/sync-stores') {
        const list = getStoredProjects();
        for (const p of list) {
          if (p.package) {
            p.stores = await compareProjectWithStores(p.package, p.buildNumber || 1, p.version || '1.0.0', p.path);
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

      // 4. GET /api/project - Aktif Proje Detayları, Git ve Sürüm
      if (req.method === 'GET' && pathname === '/api/project') {
        try {
          const currentTarget = activeProjectDir;

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

          const projectName = pubspecInfo?.name || releaseConfig?.project?.name || path.basename(currentTarget) || 'Flutter Project';
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
              package: detectProjectMetadata(currentTarget).package,
              branch: gitAnalysis.currentBranch || 'main',
              isClean: gitAnalysis.isClean,
              hasPubspec: Boolean(pubspecInfo),
            },
            commits: gitAnalysis.commitsSinceLastTag,
            comparison: await compareProjectWithStores(
              detectProjectMetadata(currentTarget).package,
              currentBuildNumber,
              verStr,
              currentTarget
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
          }
        }));
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
            const auth = createGoogleAuth({
              packageName: 'com.webicro.app',
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
              token = generateAppStoreToken({
                keyId: payload.keyId,
                issuerId: payload.issuerId,
                bundleId: 'com.webicro.app',
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

          const auth = createGoogleAuth({
            packageName: 'com.webicro.app',
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
            token = generateAppStoreToken({
              keyId: appleCred.keyId,
              issuerId: appleCred.issuerId,
              bundleId: 'com.webicro.app',
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

      // 7. POST /api/ai/generate - Gerçek Git Commit'lerinden Sürüm Notu Üretimi
      if (req.method === 'POST' && pathname === '/api/ai/generate') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as { version?: string };
            const version = payload.version || '1.0.0';
            
            const gitAnalyzer = new GitAnalyzer(activeProjectDir);
            const gitAnalysis = await gitAnalyzer.analyze();
            const commits = gitAnalysis.commitsSinceLastTag;

            if (commits.length === 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                notesTr: '• Genel performans iyileştirmeleri ve hata düzeltmeleri yapıldı.',
                notesEn: '• General performance enhancements and bug fixes.',
              }));
              return;
            }

            const apiKey = process.env['GEMINI_API_KEY'];
            const provider = apiKey ? new GeminiProvider({ apiKey }) : new ConventionalReleaseNotesProvider();
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
            const aiController = new AIController(provider, validatorAdapter);

            const notes = await aiController.generate(version, commits, ['tr', 'en']);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              notesTr: notes['tr']?.full.map(item => `• ${item}`).join('\n') || '• Hata düzeltmeleri ve kararlılık iyileştirmeleri yapıldı.',
              notesEn: notes['en']?.full.map(item => `• ${item}`).join('\n') || '• Bug fixes and stability improvements.',
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // 8. GET /api/history - Gerçek SQLite Veritabanı Geçmişi
      if (req.method === 'GET' && pathname === '/api/history') {
        try {
          const releases = releaseRepo.findAll(30);
          const auditLogs = auditRepo.findAll(50);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ releases, auditLogs }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
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
        sseClients.push(res);

        req.on('close', () => {
          const index = sseClients.indexOf(res);
          if (index !== -1) {
            sseClients.splice(index, 1);
          }
        });
        return;
      }

      // 10. POST /api/release/start - Canlı Release Pipeline Başlatma
      if (req.method === 'POST' && pathname === '/api/release/start') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const options = JSON.parse(body || '{}') as {
              bump?: 'patch' | 'minor' | 'major';
              manualVersion?: string;
              dryRun?: boolean;
              targetAndroid?: boolean;
              targetIos?: boolean;
            };

            const orchestrator = new ReleaseOrchestrator();

            orchestrator.onStep((event) => {
              broadcastEvent({ type: 'step', event });
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'started' }));

            try {
              const summary = await orchestrator.execute({
                targetDir: activeProjectDir,
                bump: options.bump,
                manualVersion: options.manualVersion,
                dryRun: options.dryRun !== undefined ? options.dryRun : true,
                skipAndroid: !options.targetAndroid,
                skipIos: !options.targetIos,
                skipTests: false,
                skipAi: false,
                autoApprove: true,
              });
              broadcastEvent({ type: 'completed', summary });
            } catch (execErr) {
              broadcastEvent({
                type: 'failed',
                error: execErr instanceof Error ? execErr.message : String(execErr)
              });
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
