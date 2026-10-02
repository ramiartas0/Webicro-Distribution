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
import { AIController, MockAIProvider, GeminiProvider } from '@webicro/ai';
import { ReleaseNotesValidator } from '@webicro/validation';
import { PubspecVersionUpdater } from '@webicro/flutter';
import { createGoogleAuth } from '@webicro/google-play';
import { generateAppStoreToken } from '@webicro/app-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProjectEntry {
  id: string;
  name: string;
  path: string;
  hasPubspec: boolean;
  package?: string;
  version?: string;
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
      try {
        if (fs.existsSync(projectsFile)) {
          return JSON.parse(fs.readFileSync(projectsFile, 'utf8')) as ProjectEntry[];
        }
      } catch {
        // Hata durumunda varsayılan
      }
      return [
        {
          id: 'default',
          name: 'Webicro Distribution',
          path: process.cwd(),
          hasPubspec: fs.existsSync(path.join(process.cwd(), 'pubspec.yaml')),
        }
      ];
    };

    const saveStoredProjects = (projects: ProjectEntry[]) => {
      try {
        const dir = path.dirname(projectsFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), 'utf8');
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

      // 1. GET /api/projects - Proje Listesi ve Aktif Proje
      if (req.method === 'GET' && pathname === '/api/projects') {
        const list = getStoredProjects();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          activePath: activeProjectDir,
          projects: list,
        }));
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
            let detectedName = payload.name;
            let detectedVersion = '1.0.0+1';

            if (hasPub) {
              const updater = new PubspecVersionUpdater();
              try {
                const info = await updater.readPubspec(resolvedPath);
                if (!detectedName) detectedName = info.name;
                detectedVersion = info.version;
              } catch {
                // Sessiz
              }
            }

            const currentList = getStoredProjects();
            const existing = currentList.find(p => p.path === resolvedPath);
            if (!existing) {
              const newEntry: ProjectEntry = {
                id: `proj_${Date.now()}`,
                name: detectedName || path.basename(resolvedPath),
                path: resolvedPath,
                hasPubspec: hasPub,
                version: detectedVersion,
              };
              currentList.push(newEntry);
              saveStoredProjects(currentList);
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

          // 4.5 Gerçek Google Play Bilgisi
          const defaultKeyPath = path.join(process.env['HOME'] || '~', '.secrets/google-play-key.json');
          const googlePlayKeyPath = process.env['GOOGLE_PLAY_SERVICE_ACCOUNT'] || defaultKeyPath;
          let googlePlayConnected = false;
          let googlePlayEmail = 'Bağlı değil (Anahtar bulunamadı)';
          let googlePlayProjectId = '';

          if (fs.existsSync(googlePlayKeyPath)) {
            try {
              const keyContent = JSON.parse(fs.readFileSync(googlePlayKeyPath, 'utf8')) as {
                client_email?: string;
                project_id?: string;
              };
              if (keyContent.client_email) {
                googlePlayConnected = true;
                googlePlayEmail = keyContent.client_email;
                googlePlayProjectId = keyContent.project_id || '';
              }
            } catch {
              googlePlayEmail = 'Geçersiz JSON anahtarı';
            }
          }

          // 4.6 Gerçek App Store Connect Bilgisi
          const appStoreKeyId = process.env['APPSTORE_KEY_ID'] || '';
          const appStoreIssuerId = process.env['APPSTORE_ISSUER_ID'] || '';
          const appStoreConnected = Boolean(appStoreKeyId && appStoreIssuerId);

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
              branch: gitAnalysis.currentBranch || 'main',
              isClean: gitAnalysis.isClean,
              hasPubspec: Boolean(pubspecInfo),
            },
            commits: gitAnalysis.commitsSinceLastTag,
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

      // 5. POST /api/stores/test-google - Gerçek Google Play Canlı Doğrulama
      if (req.method === 'POST' && pathname === '/api/stores/test-google') {
        try {
          const defaultKeyPath = path.join(process.env['HOME'] || '~', '.secrets/google-play-key.json');
          const keyPath = process.env['GOOGLE_PLAY_SERVICE_ACCOUNT'] || defaultKeyPath;

          if (!fs.existsSync(keyPath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              stage: 'file_check',
              error: `Hizmet hesabı JSON dosyası bulunamadı: ${keyPath}`,
              tip: 'Lütfen Google Cloud Console üzerinden indirdiğiniz Service Account JSON anahtarını ~/.secrets/google-play-key.json konumuna taşıyın.',
            }));
            return;
          }

          let keyJson: { client_email?: string; project_id?: string; private_key?: string };
          try {
            keyJson = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
          } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              stage: 'parse_check',
              error: 'JSON anahtar dosyası bozuk veya geçersiz bir formatta.',
            }));
            return;
          }

          if (!keyJson.client_email || !keyJson.private_key) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              stage: 'format_check',
              error: 'JSON dosyasında "client_email" veya "private_key" alanları eksik.',
            }));
            return;
          }

          // Gerçek Google OAuth Testi
          const auth = createGoogleAuth({
            packageName: 'com.webicro.app',
            serviceAccountJsonPath: keyPath,
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
            serviceAccount: keyJson.client_email,
            projectId: keyJson.project_id || 'Bilinmiyor',
            keyPath,
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
          const keyId = process.env['APPSTORE_KEY_ID'];
          const issuerId = process.env['APPSTORE_ISSUER_ID'];
          const privateKeyPath = process.env['APPSTORE_PRIVATE_KEY_PATH'];

          const missingFields: string[] = [];
          if (!keyId) missingFields.push('APPSTORE_KEY_ID');
          if (!issuerId) missingFields.push('APPSTORE_ISSUER_ID');
          if (!privateKeyPath) missingFields.push('APPSTORE_PRIVATE_KEY_PATH');

          if (missingFields.length > 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              stage: 'config_check',
              missingFields,
              error: `Eksik App Store Connect ortam değişkenleri: ${missingFields.join(', ')}`,
              tip: 'Lütfen proje dizinindeki .env dosyasına bu değişkenleri tanımlayın.',
            }));
            return;
          }

          if (privateKeyPath && !fs.existsSync(privateKeyPath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              stage: 'key_file_check',
              error: `Apple AuthKey .p8 dosyası bulunamadı: ${privateKeyPath}`,
            }));
            return;
          }

          // JWT ES256 İmzası Testi
          let jwtToken = '';
          try {
            jwtToken = generateAppStoreToken({
              keyId: keyId as string,
              issuerId: issuerId as string,
              privateKeyPath: privateKeyPath as string,
              bundleId: 'com.webicro.app',
            });
          } catch (jwtErr) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              stage: 'jwt_sign_check',
              error: `JWT imzalama hatası: ${jwtErr instanceof Error ? jwtErr.message : String(jwtErr)}`,
            }));
            return;
          }

          // App Store Connect API Canlı Sorgu Testi
          let apiStatus = 0;
          let apiMessage = '';
          let appsListCount = 0;

          try {
            const apiRes = await fetch('https://api.appstoreconnect.apple.com/v1/apps?limit=5', {
              headers: {
                Authorization: `Bearer ${jwtToken}`,
                'Content-Type': 'application/json',
              },
            });
            apiStatus = apiRes.status;
            if (apiRes.ok) {
              const apiJson = await apiRes.json() as { data?: unknown[] };
              appsListCount = apiJson.data?.length || 0;
              apiMessage = `Bağlantı başarılı! (${appsListCount} kayıtlı uygulama bulundu)`;
            } else {
              const errBody = await apiRes.text().catch(() => '');
              apiMessage = `Apple API Yanıtı: HTTP ${apiStatus} - ${errBody}`;
            }
          } catch (fetchErr) {
            apiMessage = `Apple API ağına ulaşılamadı: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: apiStatus === 200,
            keyId,
            issuerId,
            jwtGenerated: true,
            apiHttpStatus: apiStatus,
            message: apiMessage,
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
            const provider = apiKey ? new GeminiProvider({ apiKey }) : new MockAIProvider();
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
      clack.intro(chalk.bold('🚀 Webicro Distribution - Canlı Web Dashboard'));
      clack.log.success(`${chalk.green('Dashboard ve Canlı API Servisi hazır:')} ${chalk.cyan.underline(url)}`);
      clack.log.info(chalk.dim('Durdurmak için Ctrl+C tuşlarına basın.'));

      // Tarayıcıyı otomatik aç
      const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${startCmd} ${url}`);
    });
  });
