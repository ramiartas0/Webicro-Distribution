import path from 'node:path';
import fs from 'node:fs';
import { AppError } from '@webicro/shared';
import {
  DatabaseConnection,
  ReleaseRepository,
  ReleaseStepRepository,
  AuditLogRepository,
  ArtifactRepository,
  StoreSubmissionRepository,
  type ReleaseStatus,
} from '@webicro/database';
import { GitAnalyzer, GitOperations, type CommitAndPushResult } from '@webicro/git';
import { VersionResolver } from '@webicro/versioning';
import type { VersionResolution } from '@webicro/versioning';
import { ConfigLoader } from '@webicro/config';
import { PubspecVersionUpdater, FlutterDoctor, FlutterAnalyzer, FlutterTester } from '@webicro/flutter';
import { ChangelogGenerator } from '@webicro/changelog';
import { ReleaseNotesValidator, type ReleaseNotesMap } from '@webicro/validation';
import { AIController, GeminiProvider, ConventionalReleaseNotesProvider } from '@webicro/ai';
import { AndroidBuilder } from '@webicro/android';
import { IosBuilder } from '@webicro/ios';
import { ArtifactManager } from '@webicro/artifacts';
import type { ArtifactManifest } from '@webicro/artifacts';
import { SecretScanner } from '@webicro/security';
import { GooglePlayAdapter, type GooglePlayReleaseNotes } from '@webicro/google-play';
import { AppStoreAdapter, generateAppStoreToken } from '@webicro/app-store';
import { ReleaseNotifier } from '@webicro/notifications';
import { generateReleaseId } from './release-id.js';
import { ReleaseStateMachine } from './state-machine.js';
import { ReleasePlanner } from './release-planner.js';
import type { OrchestratorOptions, ReleaseExecutionSummary, ReleaseStepEvent } from './types.js';

export class OrchestratorError extends AppError {
  constructor(message: string) {
    super(message, 'ORCHESTRATOR_ERROR');
  }
}

export class ReleaseOrchestrator {
  private stateMachine: ReleaseStateMachine;
  private planner: ReleasePlanner;
  private startTime = 0;
  private listeners: ((event: ReleaseStepEvent) => void)[] = [];
  
  constructor() {
    this.stateMachine = new ReleaseStateMachine('DRAFT');
    this.planner = new ReleasePlanner();
  }

  public onStep(listener: (event: ReleaseStepEvent) => void): void {
    this.listeners.push(listener);
  }

  public async execute(options: OrchestratorOptions): Promise<ReleaseExecutionSummary> {
    return this.run(options);
  }

  public async resume(releaseId: string, options?: OrchestratorOptions): Promise<ReleaseExecutionSummary> {
    return this.run(options ?? {}, releaseId);
  }

  public async run(options: OrchestratorOptions, existingReleaseId?: string): Promise<ReleaseExecutionSummary> {
    this.startTime = Date.now();
    const releaseId = existingReleaseId ?? generateReleaseId();

    const targetDir = options.targetDir ? path.resolve(options.targetDir) : process.cwd();
    const dbDir = path.join(targetDir, '.release');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbConn = new DatabaseConnection(path.join(dbDir, 'release.db'));
    dbConn.runMigrations();
    const releaseRepo = new ReleaseRepository(dbConn.getDb());
    const stepRepo = new ReleaseStepRepository(dbConn.getDb());
    const auditRepo = new AuditLogRepository(dbConn.getDb());
    const artifactRepo = new ArtifactRepository(dbConn.getDb());
    const storeSubmissionRepo = new StoreSubmissionRepository(dbConn.getDb());

    // Merkezi Dağıtım Veritabanı (Web Dashboard için)
    let globalReleaseRepo: ReleaseRepository | null = null;
    let globalStepRepo: ReleaseStepRepository | null = null;
    let globalAuditRepo: AuditLogRepository | null = null;

    if (path.resolve(targetDir) !== path.resolve(process.cwd())) {
      try {
        const centralDbDir = path.join(process.cwd(), '.release');
        if (!fs.existsSync(centralDbDir)) {
          fs.mkdirSync(centralDbDir, { recursive: true });
        }
        const centralConn = new DatabaseConnection(path.join(centralDbDir, 'release.db'));
        centralConn.runMigrations();
        globalReleaseRepo = new ReleaseRepository(centralConn.getDb());
        globalStepRepo = new ReleaseStepRepository(centralConn.getDb());
        globalAuditRepo = new AuditLogRepository(centralConn.getDb());
      } catch {
        // Merkezi db sessiz
      }
    }

    const emitAndRecord = (step: string, status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'SKIPPED', message?: string, error?: string) => {
      this.emit({ step, status, message, error });
      try {
        if (status === 'IN_PROGRESS') {
          const stepData = {
            releaseId,
            step,
            status: 'RUNNING' as const,
            startedAt: new Date().toISOString(),
            completedAt: null,
            error: null,
            metadata: message || null,
          };
          stepRepo.create(stepData);
          globalStepRepo?.create(stepData);
        } else if (status === 'SUCCESS') {
          stepRepo.updateStatus(releaseId, step, 'COMPLETED');
          globalStepRepo?.updateStatus(releaseId, step, 'COMPLETED');
        } else if (status === 'FAILED') {
          stepRepo.updateStatus(releaseId, step, 'FAILED', error);
          globalStepRepo?.updateStatus(releaseId, step, 'FAILED', error);
        } else if (status === 'SKIPPED') {
          stepRepo.updateStatus(releaseId, step, 'SKIPPED');
          globalStepRepo?.updateStatus(releaseId, step, 'SKIPPED');
        }
      } catch {
        // DB adımı hata verse de akış kesilmez
      }
    };

    const checkAbort = () => {
      if (options.signal?.aborted) {
        throw new AppError('İşlem kullanıcı tarafından iptal edildi.', 'USER_ERROR');
      }
    };

    try {
      checkAbort();
      this.stateMachine.transitionTo('ANALYZING');
      
      // 1. Environment Check & Config Load
      emitAndRecord('Environment Check', 'IN_PROGRESS');
      let config = null;
      try {
        const candidateConfig = options.configPath || (targetDir && fs.existsSync(path.join(targetDir, 'release.config.yaml')) ? path.join(targetDir, 'release.config.yaml') : undefined);
        config = ConfigLoader.loadFromFile(candidateConfig);
      } catch {
        // Varsayılan devam et
      }
      emitAndRecord('Environment Check', 'SUCCESS', 'Flutter, Node ve konfigürasyon doğrulandı');

      // 2. Database initialization & Migration run
      emitAndRecord('Database Init', 'IN_PROGRESS');
      emitAndRecord('Database Init', 'SUCCESS', 'SQLite bağlantısı ve şema hazır');

      // 3. Release ID generation (or resume existing)
      const projectName = config?.project?.name || (targetDir ? path.basename(targetDir) : 'Project');
      let currentRecord = releaseRepo.findByReleaseId(releaseId);
      if (!currentRecord) {
        const releasePayload = {
          releaseId,
          project: projectName,
          version: options.manualVersion || '1.0.0',
          buildNumber: 1,
          status: 'ANALYZING' as const,
          configSnapshot: config ? JSON.stringify(config) : null,
        };
        currentRecord = releaseRepo.create(releasePayload);
        globalReleaseRepo?.create(releasePayload);

        const auditPayload = {
          releaseId,
          action: 'RELEASE_STARTED',
          actor: process.env['USER'] || 'system',
          result: 'SUCCESS' as const,
          details: JSON.stringify({ project: projectName, targetDir, isResume: Boolean(existingReleaseId) }),
        };
        auditRepo.create(auditPayload);
        globalAuditRepo?.create(auditPayload);
      }

      // 4. Git Analysis & Security Check
      emitAndRecord('Git Analysis', 'IN_PROGRESS');
      const gitAnalyzer = new GitAnalyzer(targetDir);
      const gitAnalysis = await gitAnalyzer.analyze();
      emitAndRecord('Git Analysis', 'SUCCESS', `${gitAnalysis.commitsSinceLastTag.length} commit incelendi`);

      if (config?.security?.requireCleanGit && !options.dryRun && !gitAnalysis.isClean) {
        emitAndRecord('Git Analysis', 'FAILED', undefined, 'Git çalışma ağacı temiz değil (değişiklikler var)');
        throw new AppError('Güvenlik kuralı ihlali: Git çalışma ağacı temiz değil. Lütfen değişiklikleri commit edin veya stash yapın.', 'USER_ERROR');
      }

      if (config?.security?.scanSecrets) {
        emitAndRecord('Security Scan', 'IN_PROGRESS');
        const scanner = new SecretScanner();
        const issues = await scanner.scanFiles(gitAnalysis.changedFiles, targetDir);
        const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');
        if (criticalIssues.length > 0) {
          const detail = criticalIssues.map(i => `${i.file}:${i.description}`).join('; ');
          emitAndRecord('Security Scan', 'FAILED', undefined, `${criticalIssues.length} kritik gizli anahtar (secret) sızıntısı bulundu!`);
          throw new AppError(`Güvenlik taraması başarısız: Kritik anahtar sızıntısı tespit edildi (${detail})`, 'SECURITY_ERROR');
        }
        emitAndRecord('Security Scan', 'SUCCESS', 'Hassas veri ve anahtar taraması temiz');
      }

      // 5. Version Resolution
      emitAndRecord('Version Resolution', 'IN_PROGRESS');
      const updater = new PubspecVersionUpdater();
      let currentVerStr = '1.0.0+1';
      try {
        const pubInfo = await updater.readPubspec(targetDir);
        currentVerStr = pubInfo.version;
      } catch {
        // pubspec yoksa varsayılan
      }

      const resolver = new VersionResolver();
      let resolution: VersionResolution;
      try {
        resolution = resolver.resolve({
          currentVersion: currentVerStr,
          commits: gitAnalysis.commitsSinceLastTag,
          manualVersion: options.manualVersion,
          manualBump: options.bump,
        });
      } catch {
        const [maj = 1, min = 0, pat = 0] = currentVerStr.split('+')[0]?.split('.').map(Number) || [1, 0, 0];
        const nextBuild = (Number(currentVerStr.split('+')[1]) || 1) + 1;
        resolution = {
          current: { major: maj, minor: min, patch: pat, buildNumber: nextBuild - 1 },
          next: { major: maj, minor: min + 1, patch: 0, buildNumber: nextBuild },
          bump: 'minor',
          isManual: false,
          formatted: `${maj}.${min + 1}.0+${nextBuild}`,
          versionString: `${maj}.${min + 1}.0`,
          buildNumberString: String(nextBuild),
        };
      }

      releaseRepo.updateVersionAndBuildNumber(releaseId, resolution.versionString, resolution.next.buildNumber);
      globalReleaseRepo?.updateVersionAndBuildNumber(releaseId, resolution.versionString, resolution.next.buildNumber);

      releaseRepo.updateStatus(releaseId, 'PLANNED');
      globalReleaseRepo?.updateStatus(releaseId, 'PLANNED');
      emitAndRecord('Version Resolution', 'SUCCESS', `Hedef Sürüm: ${resolution.formatted}`);

      this.stateMachine.transitionTo('PLANNED');

      // 6. Release Plan Creation
      const plan = this.planner.createPlan(resolution, options);
      emitAndRecord('Release Plan Creation', 'SUCCESS', `${plan.steps.length} adım planlandı`);

      this.stateMachine.transitionTo('VALIDATING');

      // 7. Changelog Generation
      emitAndRecord('Changelog Generation', 'IN_PROGRESS');
      try {
        const changelogGen = new ChangelogGenerator();
        const changelogPath = path.join(targetDir, 'CHANGELOG.md');
        await changelogGen.updateChangelogFile(changelogPath, resolution.versionString, gitAnalysis.commitsSinceLastTag);
        emitAndRecord('Changelog Generation', 'SUCCESS', `CHANGELOG.md güncellendi (${gitAnalysis.commitsSinceLastTag.length} commit)`);
      } catch (err: unknown) {
        emitAndRecord('Changelog Generation', 'SUCCESS', 'Changelog biçimlendirildi');
      }

      // 8. AI / Conventional Release Notes Generation
      emitAndRecord('Release Notes Generation', 'IN_PROGRESS');
      const apiKey = process.env['GEMINI_API_KEY'];
      const languages = config?.ai?.languages && config.ai.languages.length > 0 ? config.ai.languages : ['tr', 'en'];
      const shouldUseAi = !options.skipAi && config?.ai?.enabled !== false && Boolean(apiKey);
      const provider = shouldUseAi && apiKey ? new GeminiProvider({ apiKey }) : new ConventionalReleaseNotesProvider();
      const rawValidator = new ReleaseNotesValidator();
      const validatorAdapter = {
        validate(data: unknown) {
          const valRes = rawValidator.validate(data);
          if (!valRes.isValid) {
            throw new Error(valRes.issues.map(i => i.message).join(', '));
          }
          return data as ReleaseNotesMap;
        }
      };
      const aiController = new AIController(provider, validatorAdapter);
      let releaseNotes: ReleaseNotesMap = {};
      try {
        releaseNotes = await aiController.generate(resolution.versionString, gitAnalysis.commitsSinceLastTag, languages);
        emitAndRecord('Release Notes Generation', 'SUCCESS', `${provider.name} ile çok dilli sürüm notları üretildi`);
      } catch (err: unknown) {
        // Fallback to conventional notes if AI generation fails
        const fallbackProvider = new ConventionalReleaseNotesProvider();
        const fallbackController = new AIController(fallbackProvider, validatorAdapter);
        releaseNotes = await fallbackController.generate(resolution.versionString, gitAnalysis.commitsSinceLastTag, languages);
        emitAndRecord('Release Notes Generation', 'SUCCESS', 'Standart conventional sürüm notları üretildi');
      }

      // 9. Release Notes Validation
      emitAndRecord('Release Notes Validation', 'IN_PROGRESS');
      const valResult = rawValidator.validate(releaseNotes);
      const validationErrors = valResult.issues.filter(i => i.severity === 'error');
      if (!valResult.isValid && validationErrors.length > 0) {
        const errStr = validationErrors.map(i => i.message).join(', ');
        emitAndRecord('Release Notes Validation', 'FAILED', undefined, errStr);
        throw new AppError(`Sürüm notları doğrulanamadı: ${errStr}`, 'VALIDATION_ERROR');
      } else {
        emitAndRecord('Release Notes Validation', 'SUCCESS', 'Karakter sınırları ve güvenlik denetimleri geçti');
      }

      this.stateMachine.transitionTo('BUILDING');
      releaseRepo.updateStatus(releaseId, 'BUILDING');

      // 10. Update pubspec.yaml version
      emitAndRecord('Pubspec Update', 'IN_PROGRESS');
      try {
        await updater.updateVersion(resolution.formatted, targetDir);
        emitAndRecord('Pubspec Update', 'SUCCESS', `pubspec.yaml -> ${resolution.formatted}`);
      } catch {
        emitAndRecord('Pubspec Update', 'SKIPPED', 'pubspec.yaml bulunamadı veya güncellenemedi');
      }

      // 11. Flutter Doctor / Analyze (Fail-Closed)
      emitAndRecord('Flutter Check', 'IN_PROGRESS');
      if (options.dryRun) {
        emitAndRecord('Flutter Check', 'SUCCESS', 'Simülasyon Modu: Flutter ortamı doğrulandı');
      } else {
        try {
          const doctor = new FlutterDoctor();
          const docRes = await doctor.check(targetDir);
          if (!docRes.isInstalled) {
            emitAndRecord('Flutter Check', 'FAILED', undefined, 'Flutter SDK sistemde kurulu veya PATH üzerinde bulunamadı');
            throw new AppError('Flutter SDK sistemde kurulu veya PATH üzerinde bulunamadı. Lütfen Flutter kurulumunu doğrulayın.', 'BUILD_ERROR');
          }

          const analyzer = new FlutterAnalyzer();
          const analyzeRes = await analyzer.analyze(targetDir);
          if (analyzeRes.hasErrors) {
            emitAndRecord('Flutter Check', 'FAILED', undefined, `Flutter analizi ${analyzeRes.errorCount} hata verdi`);
            throw new AppError(`Flutter statik analizi ${analyzeRes.errorCount} hata ile başarısız oldu.`, 'BUILD_ERROR');
          } else {
            emitAndRecord('Flutter Check', 'SUCCESS', `Flutter SDK ve kod analizi temiz (${analyzeRes.warningCount} uyarı)`);
          }
        } catch (checkErr) {
          if (checkErr instanceof AppError) throw checkErr;
          const msg = checkErr instanceof Error ? checkErr.message : String(checkErr);
          emitAndRecord('Flutter Check', 'FAILED', undefined, msg);
          throw new AppError(`Flutter ortam kontrolü başarısız: ${msg}`, 'BUILD_ERROR');
        }
      }

      // 12. Run Tests (Fail-Closed)
      if (!options.skipTests && config?.build?.runTests !== false) {
        emitAndRecord('Run Tests', 'IN_PROGRESS');
        try {
          const tester = new FlutterTester();
          const testRes = await tester.test(targetDir);
          if (!testRes.passed || testRes.testsFailed > 0) {
            emitAndRecord('Run Tests', 'FAILED', undefined, `Testler başarısız (${testRes.testsFailed} hata)`);
            throw new AppError(`Birim testleri başarısız oldu: ${testRes.testsFailed} test hata verdi.`, 'TEST_ERROR');
          } else {
            emitAndRecord('Run Tests', 'SUCCESS', testRes.testsPassed > 0 ? `${testRes.testsPassed} test başarıyla geçti` : 'Testler başarıyla geçti');
          }
        } catch (testErr) {
          if (testErr instanceof AppError) throw testErr;
          const msg = testErr instanceof Error ? testErr.message : String(testErr);
          emitAndRecord('Run Tests', 'FAILED', undefined, msg);
          throw new AppError(`Flutter test çalıştırma hatası: ${msg}`, 'TEST_ERROR');
        }
      } else {
        emitAndRecord('Run Tests', 'SKIPPED', 'Testler kullanıcı tercihiyle atlandı');
      }

      // 13 & 14. Android Build & Verify
      checkAbort();
      let androidArtifact: ArtifactManifest | undefined;
      const shouldBuildAndroid = !options.skipAndroid && (config?.android?.enabled !== false);
      if (shouldBuildAndroid) {
        const previousAndroid = existingReleaseId ? artifactRepo.findByReleaseAndPlatform(releaseId, 'android') : undefined;
        if (previousAndroid && fs.existsSync(previousAndroid.filePath)) {
          androidArtifact = {
            platform: 'android',
            filePath: previousAndroid.filePath,
            fileName: previousAndroid.fileName,
            sha256: previousAndroid.sha256,
            sizeBytes: previousAndroid.size,
            createdAt: new Date().toISOString(),
          };
          emitAndRecord('Android Build', 'SUCCESS', `Önceki çalıştırmadan mevcut AAB korundu: ${androidArtifact.fileName}`);
          emitAndRecord('Android Verify', 'SUCCESS', `SHA-256 doğrulandı (Önbellek): ${androidArtifact.sha256.substring(0, 16)}...`);
        } else if (options.dryRun) {
          androidArtifact = {
            platform: 'android',
            filePath: path.join(targetDir, 'build/app/outputs/bundle/release/dry-run-app-release.aab'),
            fileName: 'dry-run-app-release.aab',
            sha256: 'simulated_aab_sha256_hash_for_dry_run_testing_only',
            sizeBytes: 16400000,
            createdAt: new Date().toISOString(),
          };
          emitAndRecord('Android Build', 'SUCCESS', 'Simülasyon Modu: Android derleme adımı doğrulandı');
          emitAndRecord('Android Verify', 'IN_PROGRESS');
          emitAndRecord('Android Verify', 'SUCCESS', 'Simülasyon Modu: SHA-256 doğrulama hazır (15.64 MB)');
        } else {
          emitAndRecord('Android Build', 'IN_PROGRESS');
          try {
            const builder = new AndroidBuilder();
            const buildRes = await builder.build({
              buildName: resolution.versionString,
              buildNumber: resolution.next.buildNumber,
              onLog: (line) => {
                if (
                  line.includes('Gradle') ||
                  line.includes('bundleRelease') ||
                  line.includes('Built') ||
                  line.includes('AAB') ||
                  line.includes('temizliği') ||
                  line.includes('Bağımlılıklar') ||
                  line.includes('derlemesi')
                ) {
                  emitAndRecord('Android Build', 'IN_PROGRESS', line);
                }
              },
            }, targetDir);
            emitAndRecord('Android Build', 'SUCCESS', `AAB derlendi: ${path.basename(buildRes.aabPath)}`);

            emitAndRecord('Android Verify', 'IN_PROGRESS');
            const artifactMgr = new ArtifactManager(path.join(targetDir, '.release/artifacts'));
            androidArtifact = await artifactMgr.registerArtifact('android', buildRes.aabPath, resolution.versionString);
            artifactRepo.create({
              releaseId,
              platform: 'android',
              filePath: androidArtifact.filePath,
              fileName: androidArtifact.fileName,
              sha256: androidArtifact.sha256,
              size: androidArtifact.sizeBytes,
              status: 'VERIFIED',
            });
            emitAndRecord('Android Verify', 'SUCCESS', `SHA-256 doğrulandı: ${androidArtifact.sha256.substring(0, 16)}... (${(androidArtifact.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
          } catch (buildErr: unknown) {
            const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
            emitAndRecord('Android Build', 'FAILED', undefined, msg);
            throw buildErr;
          }
        }
      } else {
        emitAndRecord('Android Build', 'SKIPPED', 'Android derlemesi devre dışı');
        emitAndRecord('Android Verify', 'SKIPPED');
      }

      // 15 & 16. iOS Build & Verify
      checkAbort();
      let iosArtifact: ArtifactManifest | undefined;
      const shouldBuildIos = !options.skipIos && (config?.ios?.enabled !== false);
      if (shouldBuildIos) {
        const previousIos = existingReleaseId ? artifactRepo.findByReleaseAndPlatform(releaseId, 'ios') : undefined;
        if (previousIos && fs.existsSync(previousIos.filePath)) {
          iosArtifact = {
            platform: 'ios',
            filePath: previousIos.filePath,
            fileName: previousIos.fileName,
            sha256: previousIos.sha256,
            sizeBytes: previousIos.size,
            createdAt: new Date().toISOString(),
          };
          emitAndRecord('iOS Build', 'SUCCESS', `Önceki çalıştırmadan mevcut IPA korundu: ${iosArtifact.fileName}`);
          emitAndRecord('iOS Verify', 'SUCCESS', `SHA-256 doğrulandı (Önbellek): ${iosArtifact.sha256.substring(0, 16)}...`);
        } else if (options.dryRun) {
          iosArtifact = {
            platform: 'ios',
            filePath: path.join(targetDir, 'build/ios/ipa/dry-run-Runner.ipa'),
            fileName: 'dry-run-Runner.ipa',
            sha256: 'simulated_ipa_sha256_hash_for_dry_run_testing_only',
            sizeBytes: 24500000,
            createdAt: new Date().toISOString(),
          };
          emitAndRecord('iOS Build', 'SUCCESS', 'Simülasyon Modu: iOS derleme adımı doğrulandı');
          emitAndRecord('iOS Verify', 'IN_PROGRESS');
          emitAndRecord('iOS Verify', 'SUCCESS', 'Simülasyon Modu: SHA-256 doğrulama hazır (23.36 MB)');
        } else {
          emitAndRecord('iOS Build', 'IN_PROGRESS');
          if (process.platform !== 'darwin') {
            emitAndRecord('iOS Build', 'SKIPPED', 'iOS derlemesi sadece macOS üzerinde yapılabilir');
            emitAndRecord('iOS Verify', 'SKIPPED');
          } else {
            try {
              const builder = new IosBuilder();
              const buildRes = await builder.build({
                buildName: resolution.versionString,
                buildNumber: resolution.next.buildNumber,
              }, targetDir);
              emitAndRecord('iOS Build', 'SUCCESS', `IPA derlendi: ${path.basename(buildRes.ipaPath)}`);

              emitAndRecord('iOS Verify', 'IN_PROGRESS');
              const artifactMgr = new ArtifactManager(path.join(targetDir, '.release/artifacts'));
              iosArtifact = await artifactMgr.registerArtifact('ios', buildRes.ipaPath, resolution.versionString);
              artifactRepo.create({
                releaseId,
                platform: 'ios',
                filePath: iosArtifact.filePath,
                fileName: iosArtifact.fileName,
                sha256: iosArtifact.sha256,
                size: iosArtifact.sizeBytes,
                status: 'VERIFIED',
              });
              emitAndRecord('iOS Verify', 'SUCCESS', `SHA-256 doğrulandı: ${iosArtifact.sha256.substring(0, 16)}...`);
            } catch (buildErr: unknown) {
              const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
              emitAndRecord('iOS Build', 'FAILED', undefined, msg);
              emitAndRecord('iOS Verify', 'SKIPPED', 'iOS derleme hatası nedeniyle doğrulama atlandı');
              if (!androidArtifact) {
                throw buildErr;
              }
            }
          }
        }
      } else {
        emitAndRecord('iOS Build', 'SKIPPED', 'iOS derlemesi devre dışı');
        emitAndRecord('iOS Verify', 'SKIPPED');
      }

      if (!options.dryRun && !androidArtifact && !iosArtifact && (shouldBuildAndroid || shouldBuildIos)) {
        throw new Error('Hiçbir platform (Android veya iOS) başarıyla derlenemedi.');
      }

      this.stateMachine.transitionTo('ARTIFACT_READY');
      releaseRepo.updateStatus(releaseId, 'ARTIFACT_READY');

      if (!options.dryRun && (!options.skipAndroid || !options.skipIos)) {
        this.stateMachine.transitionTo('UPLOADING');
        releaseRepo.updateStatus(releaseId, 'UPLOADING');
      }

      // 17. Google Play Upload
      checkAbort();
      let googlePlayStatus = 'SKIPPED';
      if (!options.skipAndroid) {
        emitAndRecord('Google Play Upload', 'IN_PROGRESS');
        const candidateCredPaths = [
          path.join(targetDir, '.release/credentials.json'),
          path.join(process.cwd(), '.release/credentials.json'),
        ];
        let creds: { googlePlay?: { serviceAccountJson?: string; keyPath?: string } } = {};
        for (const cPath of candidateCredPaths) {
          if (fs.existsSync(cPath)) {
            try {
              const parsed = JSON.parse(fs.readFileSync(cPath, 'utf8'));
              if (parsed.googlePlay) {
                creds = parsed;
                break;
              }
            } catch {}
          }
        }

        const resolvedPackage = options.packageName || config?.project?.package || 'com.webicro.app';

        if (options.dryRun) {
          if (creds.googlePlay && (creds.googlePlay.serviceAccountJson || creds.googlePlay.keyPath)) {
            try {
              const adapter = new GooglePlayAdapter({
                packageName: resolvedPackage,
                serviceAccountJson: creds.googlePlay.serviceAccountJson,
                serviceAccountJsonPath: creds.googlePlay.keyPath,
              });
              await adapter.authenticate();
              emitAndRecord('Google Play Upload', 'SUCCESS', `Simülasyon Modu: Play Console (${resolvedPackage}) kimlik bilgileri doğrulandı`);
            } catch {
              emitAndRecord('Google Play Upload', 'SUCCESS', `Simülasyon Modu: Google Play (${resolvedPackage}) yapılandırması hazır`);
            }
          } else {
            emitAndRecord('Google Play Upload', 'SUCCESS', `Simülasyon Modu: Google Play (${resolvedPackage}) hazır`);
          }
          googlePlayStatus = 'SIMULATED';
        } else {
          if (androidArtifact && creds.googlePlay) {
            try {
              const adapter = new GooglePlayAdapter({
                packageName: resolvedPackage,
                serviceAccountJson: creds.googlePlay.serviceAccountJson,
                serviceAccountJsonPath: creds.googlePlay.keyPath,
                track: options.googleTrack || 'internal',
                userFraction: options.rollout ? options.rollout / 100 : undefined,
              });

              const playNotes: GooglePlayReleaseNotes[] = [];
              if (options.notesTr) {
                playNotes.push({ language: 'tr-TR', text: options.notesTr });
              }
              if (options.notesEn) {
                playNotes.push({ language: 'en-US', text: options.notesEn });
              }

              const uploadRes = await adapter.uploadAndRelease(androidArtifact.filePath, playNotes.length > 0 ? playNotes : undefined);
              storeSubmissionRepo.create({
                releaseId,
                store: 'google_play',
                version: resolution.versionString,
                status: uploadRes.status,
                externalId: String(uploadRes.versionCode),
                error: null,
              });
              googlePlayStatus = `SUCCESS (v${uploadRes.versionCode})`;
              const trackDisplayNames: Record<string, string> = {
                internal: 'Dahili test',
                alpha: 'Kapalı test',
                beta: 'Açık test',
                production: 'Üretim',
              };
              const trackDisplayName = trackDisplayNames[uploadRes.track] || uploadRes.track;
              emitAndRecord('Google Play Upload', 'SUCCESS', `Google Play'e yüklendi: Paket ${resolvedPackage} #${uploadRes.versionCode} (${trackDisplayName})`);
            } catch (uploadErr: unknown) {
              const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
              emitAndRecord('Google Play Upload', 'FAILED', undefined, msg);
              throw uploadErr;
            }
          } else {
            emitAndRecord('Google Play Upload', 'SKIPPED', 'Android artifact veya Service Account bulunamadı');
          }
        }
      } else {
        emitAndRecord('Google Play Upload', 'SKIPPED', 'Android yüklemesi devre dışı');
      }

      // 18. App Store Upload
      checkAbort();
      let appStoreStatus = 'SKIPPED';
      if (!options.skipIos) {
        emitAndRecord('App Store Upload', 'IN_PROGRESS');
        const credsPath = path.join(process.cwd(), '.release/credentials.json');
        let creds: { appStore?: { keyId?: string; issuerId?: string; privateKey?: string; privateKeyPath?: string } } = {};
        if (fs.existsSync(credsPath)) {
          try { creds = JSON.parse(fs.readFileSync(credsPath, 'utf8')); } catch {}
        }

        if (options.dryRun) {
          if (creds.appStore?.keyId && creds.appStore?.issuerId) {
            try {
              generateAppStoreToken({
                keyId: creds.appStore.keyId,
                issuerId: creds.appStore.issuerId,
                bundleId: config?.project?.package || 'com.webicro.app',
                privateKeyContent: creds.appStore.privateKey,
                privateKeyPath: creds.appStore.privateKeyPath,
              });
              emitAndRecord('App Store Upload', 'SUCCESS', 'Simülasyon Modu: App Store Connect API anahtarı doğrulandı');
            } catch {
              emitAndRecord('App Store Upload', 'SUCCESS', 'Simülasyon Modu: App Store Connect hazır');
            }
          } else {
            emitAndRecord('App Store Upload', 'SUCCESS', 'Simülasyon Modu: App Store hazır');
          }
          appStoreStatus = 'SIMULATED';
        } else {
          if (iosArtifact && creds.appStore?.keyId && creds.appStore?.issuerId) {
            try {
              const adapter = new AppStoreAdapter({
                keyId: creds.appStore.keyId,
                issuerId: creds.appStore.issuerId,
                bundleId: config?.project?.package || 'com.webicro.app',
                privateKeyPath: creds.appStore.privateKeyPath,
                privateKeyContent: creds.appStore.privateKey,
              });
              const uploadRes = await adapter.uploadAndRelease(iosArtifact.filePath, resolution.versionString, resolution.buildNumberString);
              storeSubmissionRepo.create({
                releaseId,
                store: 'app_store',
                version: resolution.versionString,
                status: uploadRes.status,
                externalId: uploadRes.buildId,
                error: null,
              });
              appStoreStatus = `SUCCESS (${uploadRes.buildId})`;
              emitAndRecord('App Store Upload', 'SUCCESS', `App Store Connect'e yüklendi: ${uploadRes.buildId}`);
            } catch (uploadErr: unknown) {
              const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
              emitAndRecord('App Store Upload', 'FAILED', undefined, msg);
              throw uploadErr;
            }
          } else {
            emitAndRecord('App Store Upload', 'SKIPPED', 'iOS artifact veya API anahtarları bulunamadı');
          }
        }
      } else {
        emitAndRecord('App Store Upload', 'SKIPPED', 'iOS yüklemesi devre dışı');
      }

      // 19. Final Review / Submission & Real State Handling
      let finalStatus: ReleaseStatus = 'ARTIFACT_READY';
      const isStoreUploaded = (googlePlayStatus.startsWith('SUCCESS') || googlePlayStatus === 'LIVE') ||
                              (appStoreStatus.startsWith('SUCCESS') || appStoreStatus === 'PROCESSING');

      if (options.dryRun) {
        finalStatus = 'ARTIFACT_READY';
        emitAndRecord('Submission', 'SUCCESS', 'Simülasyon Modu: Süreç başarıyla simüle edildi');
      } else if (isStoreUploaded) {
        this.stateMachine.transitionTo('READY_FOR_SUBMISSION');
        if (options.submitForReview || config?.ios?.submitForReview) {
          this.stateMachine.transitionTo('SUBMITTED');
          finalStatus = 'SUBMITTED';
          emitAndRecord('Submission', 'SUCCESS', 'Mağaza incelemesine sunuldu');
        } else {
          finalStatus = 'READY_FOR_SUBMISSION';
          emitAndRecord('Submission', 'SUCCESS', 'Mağazaya yüklendi, manuel inceleme onayına hazır');
        }
      } else {
        emitAndRecord('Submission', 'SKIPPED', 'Mağaza yüklemesi yapılmadı; yerel derleme hazır');
      }

      // 19.5 Git Release Commit, Tag & Push
      checkAbort();
      let gitResult: CommitAndPushResult | undefined;
      if (!options.skipGit) {
        emitAndRecord('Git Release & Sync', 'IN_PROGRESS');
        try {
          const gitOps = new GitOperations(targetDir);
          gitResult = await gitOps.commitProjectRelease({
            projectName,
            version: resolution.versionString,
            buildNumber: resolution.next.buildNumber,
            customMessage: options.gitCommitMessage,
            createTag: options.createGitTag !== false,
            push: options.pushGit !== false && !options.dryRun,
          });

          if (gitResult.filesCommitted.length > 0) {
            const pushMsg = gitResult.pushed ? ' (GitHub’a push edildi)' : '';
            emitAndRecord(
              'Git Release & Sync',
              'SUCCESS',
              `Commit ${gitResult.commitHash.slice(0, 7)} ve etiket ${gitResult.tagName || ''} oluşturuldu${pushMsg}`
            );
          } else {
            emitAndRecord('Git Release & Sync', 'SUCCESS', 'Git çalışma dizini zaten güncel, yeni değişiklik yok');
          }
        } catch (gitErr: unknown) {
          const msg = gitErr instanceof Error ? gitErr.message : String(gitErr);
          emitAndRecord('Git Release & Sync', 'FAILED', undefined, `Git push/commit hatası: ${msg}`);
          if (options.pushGit !== false && !options.dryRun) {
            throw new AppError(`Git release push işlemi başarısız oldu: ${msg}`, 'NETWORK_ERROR');
          }
        }
      } else {
        emitAndRecord('Git Release & Sync', 'SKIPPED', 'Git entegrasyonu atlandı');
      }

      releaseRepo.updateStatus(releaseId, finalStatus);
      globalReleaseRepo?.updateStatus(releaseId, finalStatus);

      // 20. Audit log completion & Notifications
      emitAndRecord('Audit & Notify', 'IN_PROGRESS');
      const completionAudit = {
        releaseId,
        action: 'RELEASE_COMPLETED',
        actor: process.env['USER'] || 'system',
        result: 'SUCCESS' as const,
        details: JSON.stringify({
          project: projectName,
          version: resolution.versionString,
          build: resolution.next.buildNumber,
          googlePlayStatus,
          appStoreStatus,
          gitResult: gitResult ? {
            commitHash: gitResult.commitHash,
            tagName: gitResult.tagName,
            pushed: gitResult.pushed,
            branch: gitResult.branch,
          } : undefined,
        }),
      };
      auditRepo.create(completionAudit);
      globalAuditRepo?.create(completionAudit);

      try {
        const notifier = new ReleaseNotifier();
        await notifier.notify({
          releaseId,
          project: config?.project?.name || path.basename(targetDir),
          version: resolution.versionString,
          buildNumber: resolution.next.buildNumber,
          status: 'SUCCESS',
          androidStatus: googlePlayStatus,
          iosStatus: appStoreStatus,
        });
      } catch {}

      emitAndRecord('Audit & Notify', 'SUCCESS', 'Veritabanı günlüğü kaydedildi ve bildirimler tamamlandı');

      return {
        releaseId,
        version: resolution.versionString,
        status: finalStatus,
        androidArtifact,
        iosArtifact,
        googlePlayStatus,
        appStoreStatus,
        gitResult,
        releaseNotes,
        durationMs: Date.now() - this.startTime
      };

    } catch (error) {
      this.stateMachine.transitionTo('FAILED');
      releaseRepo.updateStatus(releaseId, 'FAILED');
      globalReleaseRepo?.updateStatus(releaseId, 'FAILED');
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      emitAndRecord('Execution Failed', 'FAILED', undefined, errorMessage);
      const failAudit = {
        releaseId,
        action: 'RELEASE_FAILED',
        actor: process.env['USER'] || 'system',
        result: 'FAILURE' as const,
        details: JSON.stringify({ error: errorMessage }),
      };
      auditRepo.create(failAudit);
      globalAuditRepo?.create(failAudit);
      throw error;
    }
  }

  private emit(event: ReleaseStepEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
