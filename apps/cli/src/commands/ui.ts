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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

      // 1. GET /api/project - Gerçek Proje, Git ve Store Durumu
      if (req.method === 'GET' && pathname === '/api/project') {
        try {
          // 1.1 Config yükle
          let releaseConfig = null;
          try {
            releaseConfig = ConfigLoader.loadFromFile();
          } catch {
            // Config dosyası yoksa varsayılan
          }

          // 1.2 Pubspec.yaml ara ve oku
          const updater = new PubspecVersionUpdater();
          let pubspecInfo = null;
          const searchPaths = [
            process.cwd(),
            releaseConfig?.project?.path ? path.resolve(process.cwd(), releaseConfig.project.path) : '',
          ].filter(Boolean);

          for (const sp of searchPaths) {
            try {
              pubspecInfo = await updater.readPubspec(sp);
              if (pubspecInfo) break;
            } catch {
              // Devam et
            }
          }

          const projectName = pubspecInfo?.name || releaseConfig?.project?.name || 'Flutter Project';
          const fullVersion = pubspecInfo?.version || '1.0.0+1';
          const [verStr = '1.0.0', buildStr = '1'] = fullVersion.split('+');
          const currentBuildNumber = Number(buildStr) || 1;

          // 1.3 Gerçek Git Analizi
          const gitAnalyzer = new GitAnalyzer(process.cwd());
          const gitAnalysis = await gitAnalyzer.analyze();

          // 1.4 Sürüm Çözümleme (SemVer)
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

          // 1.5 Gerçek Google Play Bağlantı Kontrolü
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

          // 1.6 Gerçek App Store Connect Bağlantı Kontrolü
          const appStoreKeyId = process.env['APPSTORE_KEY_ID'] || '';
          const appStoreIssuerId = process.env['APPSTORE_ISSUER_ID'] || '';
          const appStoreConnected = Boolean(appStoreKeyId && appStoreIssuerId);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            project: {
              name: projectName,
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

      // 2. POST /api/ai/generate - Gerçek Git Commit'lerinden Sürüm Notu Üretimi
      if (req.method === 'POST' && pathname === '/api/ai/generate') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}') as { version?: string };
            const version = payload.version || '1.0.0';
            
            const gitAnalyzer = new GitAnalyzer(process.cwd());
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
                const res = rawValidator.validate(data);
                if (!res.isValid) {
                  throw new Error(res.issues.map(i => i.message).join(', '));
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

      // 3. GET /api/history - Gerçek SQLite Veritabanı Geçmişi
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

      // 4. GET /api/release/events - SSE (Server-Sent Events) Canlı Akış
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

      // 5. POST /api/release/start - Canlı Release Pipeline Başlatma
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

            // Başlatma onayını hemen gönder
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'started' }));

            // Boru hattını asenkron yürüt
            try {
              const summary = await orchestrator.execute({
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
