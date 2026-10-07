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
import {
  PubspecVersionUpdater,
  FlutterDoctor,
  FlutterAnalyzer,
  FlutterTester,
} from '@webicro/flutter';
import { ChangelogGenerator } from '@webicro/changelog';
import { ReleaseNotesValidator, type ReleaseNotesMap } from '@webicro/validation';
import { AIController, GeminiProvider, ConventionalReleaseNotesProvider } from '@webicro/ai';
import { AndroidBuilder } from '@webicro/android';
import { IosBuilder } from '@webicro/ios';
import { ArtifactManager } from '@webicro/artifacts';
import type { ArtifactManifest } from '@webicro/artifacts';
import { SecretScanner } from '@webicro/security';
import {
  GooglePlayAdapter,
  type GooglePlayReleaseNotes,
  type GooglePlayDraftResult,
  type GooglePlayUploadResult,
} from '@webicro/google-play';
import { AppStoreAdapter, type AppStoreUploadResult } from '@webicro/app-store';
import { ReleaseNotifier } from '@webicro/notifications';
import { generateReleaseId } from './release-id.js';
import { ReleaseStateMachine } from './state-machine.js';
import { ReleasePlanner } from './release-planner.js';
import { detectProjectMetadata } from './detector.js';
import { runParallelWithAbort } from './parallel-store.js';
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

  public async resume(
    releaseId: string,
    options?: OrchestratorOptions,
  ): Promise<ReleaseExecutionSummary> {
    return this.run(options ?? {}, releaseId);
  }

  public async run(
    options: OrchestratorOptions,
    existingReleaseId?: string,
  ): Promise<ReleaseExecutionSummary> {
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
      } catch {}
    }

    const emitAndRecord = (
      step: string,
      status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'SKIPPED',
      message?: string,
      error?: string,
    ) => {
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
      } catch {}
    };

    const checkAbort = () => {
      if (options.signal?.aborted) {
        throw new AppError('İşlem kullanıcı tarafından iptal edildi.', 'USER_ERROR');
      }
    };

    try {
      checkAbort();
      this.stateMachine.transitionTo('ANALYZING');

      const detectedMeta = detectProjectMetadata(targetDir);
      let currentRecord = releaseRepo.findByReleaseId(releaseId);
      if (!currentRecord) {
        const releasePayload = {
          releaseId,
          project: detectedMeta.name || (targetDir ? path.basename(targetDir) : 'Project'),
          version: options.manualVersion || '1.0.0',
          buildNumber: 1,
          status: 'ANALYZING' as const,
          configSnapshot: null,
        };
        currentRecord = releaseRepo.create(releasePayload);
        globalReleaseRepo?.create(releasePayload);

        const auditPayload = {
          releaseId,
          action: 'RELEASE_STARTED',
          actor: process.env['USER'] || 'system',
          result: 'SUCCESS' as const,
          details: JSON.stringify({ targetDir, isResume: Boolean(existingReleaseId) }),
        };
        auditRepo.create(auditPayload);
        globalAuditRepo?.create(auditPayload);
      }

      emitAndRecord('Environment Check', 'IN_PROGRESS');
      let config = null;
      try {
        let candidateConfig: string | undefined = options.configPath;
        if (!candidateConfig && targetDir) {
          const directYaml = path.join(targetDir, 'release.config.yaml');
          const directYml = path.join(targetDir, 'release.config.yml');
          if (fs.existsSync(directYaml)) {
            candidateConfig = directYaml;
          } else if (fs.existsSync(directYml)) {
            candidateConfig = directYml;
          }
        }
        if (candidateConfig) {
          config = ConfigLoader.loadFromFile(candidateConfig);
        }
      } catch {}

      const projectName =
        config?.project?.name ||
        detectedMeta.name ||
        (targetDir ? path.basename(targetDir) : 'Project');
      const resolvedPackage =
        options.packageName || config?.project?.package || detectedMeta.package;
      const resolvedIosBundleId =
        options.iosBundleId ||
        config?.ios?.bundleId ||
        detectedMeta.iosBundleId ||
        resolvedPackage;

      const shouldBuildAndroid = !options.skipAndroid && config?.android?.enabled !== false;
      if (shouldBuildAndroid && !resolvedPackage && !options.validateOnly) {
        emitAndRecord(
          'Environment Check',
          'FAILED',
          undefined,
          'Android paket kimliği tespit edilemedi',
        );
        throw new AppError(
          'Android paket kimliği (packageId / applicationId) tespit edilemedi. Lütfen release.config.yaml içinde project.package tanımlayın veya --package belirtin.',
          'CONFIG_ERROR',
        );
      }

      const shouldValidateIos =
        !options.skipIos && config?.ios?.enabled !== false && process.platform === 'darwin';
      if (shouldValidateIos && !resolvedIosBundleId && !options.validateOnly) {
        emitAndRecord(
          'Environment Check',
          'FAILED',
          undefined,
          'iOS bundle kimliği tespit edilemedi',
        );
        throw new AppError(
          'iOS Bundle kimliği (PRODUCT_BUNDLE_IDENTIFIER) tespit edilemedi. Lütfen ios/Runner.xcodeproj içinde Bundle Identifier tanımlayın veya release.config.yaml içinde ios.bundleId belirtin.',
          'CONFIG_ERROR',
        );
      }

      emitAndRecord(
        'Environment Check',
        'SUCCESS',
        `Flutter, Node ve konfigürasyon doğrulandı (Android: ${resolvedPackage || 'atlandı'}, iOS: ${resolvedIosBundleId || 'atlandı'})`,
      );

      emitAndRecord('Database Init', 'IN_PROGRESS');
      emitAndRecord('Database Init', 'SUCCESS', 'SQLite bağlantısı ve şema hazır');

      emitAndRecord('Git Analysis', 'IN_PROGRESS');
      const gitAnalyzer = new GitAnalyzer(targetDir);
      const gitAnalysis = await gitAnalyzer.analyze();
      emitAndRecord(
        'Git Analysis',
        'SUCCESS',
        `${gitAnalysis.commitsSinceLastTag.length} commit incelendi`,
      );

      if (config?.security?.requireCleanGit && !options.validateOnly && !gitAnalysis.isClean) {
        emitAndRecord(
          'Git Analysis',
          'FAILED',
          undefined,
          'Git çalışma ağacı temiz değil (değişiklikler var)',
        );
        throw new AppError(
          'Güvenlik kuralı ihlali: Git çalışma ağacı temiz değil. Lütfen değişiklikleri commit edin veya stash yapın.',
          'USER_ERROR',
        );
      }

      if (config?.security?.scanSecrets) {
        emitAndRecord('Security Scan', 'IN_PROGRESS');
        const scanner = new SecretScanner();
        const issues = await scanner.scanFiles(gitAnalysis.changedFiles, targetDir);
        const criticalIssues = issues.filter(
          (i) => i.severity === 'critical' || i.severity === 'high',
        );
        if (criticalIssues.length > 0) {
          const detail = criticalIssues.map((i) => `${i.file}:${i.description}`).join('; ');
          emitAndRecord(
            'Security Scan',
            'FAILED',
            undefined,
            `${criticalIssues.length} kritik gizli anahtar (secret) sızıntısı bulundu!`,
          );
          throw new AppError(
            `Güvenlik taraması başarısız: Kritik anahtar sızıntısı tespit edildi (${detail})`,
            'SECURITY_ERROR',
          );
        }
        emitAndRecord('Security Scan', 'SUCCESS', 'Hassas veri ve anahtar taraması temiz');
      }

      emitAndRecord('Version Resolution', 'IN_PROGRESS');
      const updater = new PubspecVersionUpdater();
      let currentVerStr = '1.0.0+1';
      try {
        const pubInfo = await updater.readPubspec(targetDir);
        currentVerStr = pubInfo.version;
      } catch {}

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
        const [maj = 1, min = 0, pat = 0] = currentVerStr.split('+')[0]?.split('.').map(Number) || [
          1, 0, 0,
        ];
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

      releaseRepo.updateVersionAndBuildNumber(
        releaseId,
        resolution.versionString,
        resolution.next.buildNumber,
      );
      globalReleaseRepo?.updateVersionAndBuildNumber(
        releaseId,
        resolution.versionString,
        resolution.next.buildNumber,
      );

      releaseRepo.updateStatus(releaseId, 'PLANNED');
      globalReleaseRepo?.updateStatus(releaseId, 'PLANNED');
      emitAndRecord('Version Resolution', 'SUCCESS', `Hedef Sürüm: ${resolution.formatted}`);

      this.stateMachine.transitionTo('PLANNED');

      const plan = this.planner.createPlan(resolution, options);
      emitAndRecord('Release Plan Creation', 'SUCCESS', `${plan.steps.length} adım planlandı`);

      this.stateMachine.transitionTo('VALIDATING');

      emitAndRecord('Changelog Generation', 'IN_PROGRESS');
      if (options.validateOnly) {
        emitAndRecord(
          'Changelog Generation',
          'SKIPPED',
          'Doğrulama modunda CHANGELOG.md yazımı atlandı',
        );
      } else {
        try {
          const changelogGen = new ChangelogGenerator();
          const changelogPath = path.join(targetDir, 'CHANGELOG.md');
          await changelogGen.updateChangelogFile(
            changelogPath,
            resolution.versionString,
            gitAnalysis.commitsSinceLastTag,
          );
          emitAndRecord(
            'Changelog Generation',
            'SUCCESS',
            `CHANGELOG.md güncellendi (${gitAnalysis.commitsSinceLastTag.length} commit)`,
          );
        } catch (err: unknown) {
          emitAndRecord('Changelog Generation', 'SUCCESS', 'Changelog biçimlendirildi');
        }
      }

      emitAndRecord('Release Notes Generation', 'IN_PROGRESS');
      const apiKey = process.env['GEMINI_API_KEY'];
      const languages =
        config?.ai?.languages && config.ai.languages.length > 0
          ? config.ai.languages
          : ['tr', 'en'];
      const shouldUseAi = !options.skipAi && config?.ai?.enabled !== false && Boolean(apiKey);
      const provider =
        shouldUseAi && apiKey
          ? new GeminiProvider({ apiKey })
          : new ConventionalReleaseNotesProvider();
      const rawValidator = new ReleaseNotesValidator();
      const validatorAdapter = {
        validate(data: unknown) {
          const valRes = rawValidator.validate(data);
          if (!valRes.isValid) {
            throw new Error(valRes.issues.map((i) => i.message).join(', '));
          }
          return data as ReleaseNotesMap;
        },
      };
      const aiController = new AIController(provider, validatorAdapter);
      let releaseNotes: ReleaseNotesMap = {};
      try {
        releaseNotes = await aiController.generate(
          resolution.versionString,
          gitAnalysis.commitsSinceLastTag,
          languages,
        );
        emitAndRecord(
          'Release Notes Generation',
          'SUCCESS',
          `${provider.name} ile çok dilli sürüm notları üretildi`,
        );
      } catch (err: unknown) {
        const fallbackProvider = new ConventionalReleaseNotesProvider();
        const fallbackController = new AIController(fallbackProvider, validatorAdapter);
        releaseNotes = await fallbackController.generate(
          resolution.versionString,
          gitAnalysis.commitsSinceLastTag,
          languages,
        );
        emitAndRecord(
          'Release Notes Generation',
          'SUCCESS',
          'Standart conventional sürüm notları üretildi',
        );
      }

      emitAndRecord('Release Notes Validation', 'IN_PROGRESS');
      const valResult = rawValidator.validate(releaseNotes);
      const validationErrors = valResult.issues.filter((i) => i.severity === 'error');
      if (!valResult.isValid && validationErrors.length > 0) {
        const errStr = validationErrors.map((i) => i.message).join(', ');
        emitAndRecord('Release Notes Validation', 'FAILED', undefined, errStr);
        throw new AppError(`Sürüm notları doğrulanamadı: ${errStr}`, 'VALIDATION_ERROR');
      } else {
        emitAndRecord(
          'Release Notes Validation',
          'SUCCESS',
          'Karakter sınırları ve güvenlik denetimleri geçti',
        );
      }

      this.stateMachine.transitionTo('BUILDING');
      releaseRepo.updateStatus(releaseId, 'BUILDING');

      emitAndRecord('Pubspec Update', 'IN_PROGRESS');
      if (options.validateOnly) {
        emitAndRecord(
          'Pubspec Update',
          'SKIPPED',
          'Doğrulama modunda pubspec.yaml güncellemesi atlandı',
        );
      } else {
        try {
          await updater.updateVersion(resolution.formatted, targetDir);
          emitAndRecord('Pubspec Update', 'SUCCESS', `pubspec.yaml -> ${resolution.formatted}`);
        } catch {
          emitAndRecord('Pubspec Update', 'SKIPPED', 'pubspec.yaml bulunamadı veya güncellenemedi');
        }
      }

      if (options.skipFlutterCheck) {
        emitAndRecord('Flutter Check', 'SKIPPED', 'Flutter SDK ve statik analizi kullanıcı isteğiyle atlandı');
      } else {
        emitAndRecord('Flutter Check', 'IN_PROGRESS');
        try {
          const doctor = new FlutterDoctor();
          const docRes = await doctor.check(targetDir);
          if (!docRes.isInstalled) {
            emitAndRecord(
              'Flutter Check',
              'FAILED',
              undefined,
              'Flutter SDK sistemde kurulu veya PATH üzerinde bulunamadı',
            );
            throw new AppError(
              'Flutter SDK sistemde kurulu veya PATH üzerinde bulunamadı. Lütfen Flutter kurulumunu doğrulayın.',
              'BUILD_ERROR',
            );
          }

          const analyzer = new FlutterAnalyzer();
          const analyzeRes = await analyzer.analyze(targetDir);
          if (analyzeRes.hasErrors) {
            emitAndRecord(
              'Flutter Check',
              'FAILED',
              undefined,
              `Flutter analizi ${analyzeRes.errorCount} hata verdi`,
            );
            throw new AppError(
              `Flutter statik analizi ${analyzeRes.errorCount} hata ile başarısız oldu.`,
              'BUILD_ERROR',
            );
          } else {
            emitAndRecord(
              'Flutter Check',
              'SUCCESS',
              `Flutter SDK ve kod analizi temiz (${analyzeRes.warningCount} uyarı)`,
            );
          }
        } catch (checkErr) {
          if (checkErr instanceof AppError) throw checkErr;
          const msg = checkErr instanceof Error ? checkErr.message : String(checkErr);
          emitAndRecord('Flutter Check', 'FAILED', undefined, msg);
          throw new AppError(`Flutter ortam kontrolü başarısız: ${msg}`, 'BUILD_ERROR');
        }
      }

      if (!options.skipTests && config?.build?.runTests !== false) {
        emitAndRecord('Run Tests', 'IN_PROGRESS');
        try {
          const tester = new FlutterTester();
          const testRes = await tester.test(targetDir);
          if (!testRes.passed || testRes.testsFailed > 0) {
            emitAndRecord(
              'Run Tests',
              'FAILED',
              undefined,
              `Testler başarısız (${testRes.testsFailed} hata)`,
            );
            throw new AppError(
              `Birim testleri başarısız oldu: ${testRes.testsFailed} test hata verdi.`,
              'TEST_ERROR',
            );
          } else {
            emitAndRecord(
              'Run Tests',
              'SUCCESS',
              testRes.testsPassed > 0
                ? `${testRes.testsPassed} test başarıyla geçti`
                : 'Testler başarıyla geçti',
            );
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

      if (options.validateOnly) {
        emitAndRecord(
          'Validation Complete',
          'SUCCESS',
          'Doğrulama Modu: Flutter ortamı, statik analiz ve testler başarıyla doğrulandı',
        );
        const durationMs = Date.now() - this.startTime;
        return {
          releaseId,
          version: resolution.formatted,
          status: 'VALIDATING',
          durationMs,
          releaseNotes,
        };
      }

      checkAbort();
      let androidArtifact: ArtifactManifest | undefined;
      if (shouldBuildAndroid) {
        const previousAndroid = existingReleaseId
          ? artifactRepo.findByReleaseAndPlatform(releaseId, 'android')
          : undefined;
        if (previousAndroid && fs.existsSync(previousAndroid.filePath)) {
          androidArtifact = {
            platform: 'android',
            filePath: previousAndroid.filePath,
            fileName: previousAndroid.fileName,
            sha256: previousAndroid.sha256,
            sizeBytes: previousAndroid.size,
            createdAt: new Date().toISOString(),
          };
          emitAndRecord(
            'Android Build',
            'SUCCESS',
            `Önceki çalıştırmadan mevcut AAB korundu: ${androidArtifact.fileName}`,
          );
          emitAndRecord(
            'Android Verify',
            'SUCCESS',
            `SHA-256 doğrulandı (Önbellek): ${androidArtifact.sha256.substring(0, 16)}...`,
          );
        } else {
          emitAndRecord('Android Build', 'IN_PROGRESS');
          const effectiveAndroidVersion = options.androidVersion || resolution.versionString;
          const effectiveAndroidBuildNumber =
            options.androidBuildNumber !== undefined
              ? options.androidBuildNumber
              : resolution.next.buildNumber;

          try {
            const builder = new AndroidBuilder();
            const buildRes = await builder.build(
              {
                buildName: effectiveAndroidVersion,
                buildNumber: effectiveAndroidBuildNumber,
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
              },
              targetDir,
            );
            emitAndRecord(
              'Android Build',
              'SUCCESS',
              `AAB derlendi (v${effectiveAndroidVersion}+${effectiveAndroidBuildNumber}): ${path.basename(buildRes.aabPath)}`,
            );

            emitAndRecord('Android Verify', 'IN_PROGRESS');
            const artifactMgr = new ArtifactManager(path.join(targetDir, '.release/artifacts'));
            androidArtifact = await artifactMgr.registerArtifact(
              'android',
              buildRes.aabPath,
              effectiveAndroidVersion,
            );
            artifactRepo.create({
              releaseId,
              platform: 'android',
              filePath: androidArtifact.filePath,
              fileName: androidArtifact.fileName,
              sha256: androidArtifact.sha256,
              size: androidArtifact.sizeBytes,
              status: 'VERIFIED',
            });
            emitAndRecord(
              'Android Verify',
              'SUCCESS',
              `SHA-256 doğrulandı: ${androidArtifact.sha256.substring(0, 16)}... (${(androidArtifact.sizeBytes / 1024 / 1024).toFixed(2)} MB)`,
            );
          } catch (buildErr: unknown) {
            const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
            emitAndRecord('Android Build', 'FAILED', msg, msg);
            throw buildErr;
          }
        }
      } else {
        emitAndRecord('Android Build', 'SKIPPED', 'Android derlemesi devre dışı');
        emitAndRecord('Android Verify', 'SKIPPED');
      }

      checkAbort();
      let iosArtifact: ArtifactManifest | undefined;
      const shouldBuildIos = !options.skipIos && config?.ios?.enabled !== false;
      if (shouldBuildIos) {
        const previousIos = existingReleaseId
          ? artifactRepo.findByReleaseAndPlatform(releaseId, 'ios')
          : undefined;
        if (previousIos && fs.existsSync(previousIos.filePath)) {
          iosArtifact = {
            platform: 'ios',
            filePath: previousIos.filePath,
            fileName: previousIos.fileName,
            sha256: previousIos.sha256,
            sizeBytes: previousIos.size,
            createdAt: new Date().toISOString(),
          };
          emitAndRecord(
            'iOS Build',
            'SUCCESS',
            `Önceki çalıştırmadan mevcut IPA korundu: ${iosArtifact.fileName}`,
          );
          emitAndRecord(
            'iOS Verify',
            'SUCCESS',
            `SHA-256 doğrulandı (Önbellek): ${iosArtifact.sha256.substring(0, 16)}...`,
          );
        } else {
          emitAndRecord('iOS Build', 'IN_PROGRESS');
          if (process.platform !== 'darwin') {
            emitAndRecord(
              'iOS Build',
              'SKIPPED',
              'iOS derlemesi sadece macOS üzerinde yapılabilir',
            );
            emitAndRecord('iOS Verify', 'SKIPPED');
          } else {
            const effectiveIosVersion = options.iosVersion || resolution.versionString;
            const effectiveIosBuildNumber =
              options.iosBuildNumber !== undefined
                ? options.iosBuildNumber
                : resolution.next.buildNumber;

            try {
              const builder = new IosBuilder();
              const buildRes = await builder.build(
                {
                  buildName: effectiveIosVersion,
                  buildNumber: effectiveIosBuildNumber,
                },
                targetDir,
              );
              emitAndRecord(
                'iOS Build',
                'SUCCESS',
                `IPA derlendi (v${effectiveIosVersion}+${effectiveIosBuildNumber}): ${path.basename(buildRes.ipaPath)}`,
              );

              emitAndRecord('iOS Verify', 'IN_PROGRESS');
              const artifactMgr = new ArtifactManager(path.join(targetDir, '.release/artifacts'));
              iosArtifact = await artifactMgr.registerArtifact(
                'ios',
                buildRes.ipaPath,
                effectiveIosVersion,
              );
              artifactRepo.create({
                releaseId,
                platform: 'ios',
                filePath: iosArtifact.filePath,
                fileName: iosArtifact.fileName,
                sha256: iosArtifact.sha256,
                size: iosArtifact.sizeBytes,
                status: 'VERIFIED',
              });
              emitAndRecord(
                'iOS Verify',
                'SUCCESS',
                `SHA-256 doğrulandı: ${iosArtifact.sha256.substring(0, 16)}...`,
              );
            } catch (buildErr: unknown) {
              const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
              emitAndRecord('iOS Build', 'FAILED', msg, msg);
              emitAndRecord(
                'iOS Verify',
                'SKIPPED',
                'iOS derleme hatası nedeniyle doğrulama atlandı',
              );
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

      if (!androidArtifact && !iosArtifact && (shouldBuildAndroid || shouldBuildIos)) {
        throw new Error('Hiçbir platform (Android veya iOS) başarıyla derlenemedi.');
      }

      this.stateMachine.transitionTo('ARTIFACT_READY');
      releaseRepo.updateStatus(releaseId, 'ARTIFACT_READY');

      if (options.buildOnly) {
        emitAndRecord(
          'Build Complete',
          'SUCCESS',
          'Yalnızca Derleme Modu: Artifact paketleri başarıyla üretildi ve doğrulandı',
        );
        const durationMs = Date.now() - this.startTime;
        return {
          releaseId,
          version: resolution.formatted,
          status: 'ARTIFACT_READY',
          androidArtifact,
          iosArtifact,
          durationMs,
          releaseNotes,
        };
      }

      if (!options.skipAndroid || !options.skipIos) {
        this.stateMachine.transitionTo('UPLOADING');
        releaseRepo.updateStatus(releaseId, 'UPLOADING');
      }

      checkAbort();

      const candidateCredPaths = [
        path.join(targetDir, '.release/credentials.json'),
        path.join(process.cwd(), '.release/credentials.json'),
      ];
      let creds: {
        googlePlay?: { serviceAccountJson?: string; keyPath?: string };
        appStore?: {
          keyId?: string;
          issuerId?: string;
          privateKey?: string;
          privateKeyPath?: string;
        };
      } = {};
      for (const cPath of candidateCredPaths) {
        if (fs.existsSync(cPath)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(cPath, 'utf8'));
            if (parsed.googlePlay || parsed.appStore) {
              creds = {
                googlePlay: parsed.googlePlay || creds.googlePlay,
                appStore: parsed.appStore || creds.appStore,
              };
            }
          } catch {}
        }
      }

      const hasGoogleCreds = Boolean(
        creds.googlePlay?.serviceAccountJson || creds.googlePlay?.keyPath,
      );
      const hasAppStoreCreds = Boolean(
        creds.appStore?.keyId &&
          creds.appStore?.issuerId &&
          (creds.appStore?.privateKey || creds.appStore?.privateKeyPath),
      );

      const willUploadAndroid = Boolean(
        !options.skipAndroid && androidArtifact && hasGoogleCreds,
      );
      const willUploadIos = Boolean(
        !options.skipIos &&
          iosArtifact &&
          hasAppStoreCreds,
      );

      const effectiveIosBundleId =
        resolvedIosBundleId ||
        options.iosBundleId ||
        detectedMeta.iosBundleId ||
        resolvedPackage;

      // 1. ADIM: UÇUŞ ÖNCESİ MAĞAZA VE KİMLİK DOĞRULAMASI (Pre-flight Fail-Early Validation)
      if (options.validateStoresPreflight !== false) {
        if (willUploadAndroid && !resolvedPackage) {
          throw new AppError(
            'Android paket kimliği (packageId / applicationId) tespit edilemedi. Lütfen release.config.yaml içinde project.package tanımlayın veya --package belirtin.',
            'CONFIG_ERROR',
          );
        }

        if (willUploadIos) {
          if (!effectiveIosBundleId) {
            throw new AppError(
              'App Store Connect yüklemesi için geçerli bir iOS Bundle ID (PRODUCT_BUNDLE_IDENTIFIER) bulunamadı.',
              'CONFIG_ERROR',
            );
          }

          // Pre-flight kontrolü: App Store Connect üzerinde uygulama gerçekten kayıtlı mı?
          try {
            const preflightAppStore = new AppStoreAdapter({
              keyId: creds.appStore!.keyId!,
              issuerId: creds.appStore!.issuerId!,
              bundleId: effectiveIosBundleId,
              privateKeyPath: creds.appStore!.privateKeyPath,
              privateKeyContent: creds.appStore!.privateKey,
            });
            await preflightAppStore.validateAppExists();
          } catch (preflightErr: unknown) {
            const preflightMsg =
              preflightErr instanceof Error ? preflightErr.message : String(preflightErr);
            emitAndRecord(
              'App Store Upload',
              'FAILED',
              undefined,
              `Uçuş öncesi doğrulama hatası: ${preflightMsg}`,
            );
            if (willUploadAndroid) {
              emitAndRecord(
                'Google Play Upload',
                'SKIPPED',
                'App Store kimlik doğrulaması başarısız olduğu için Google Play yüklemesi başlatılmadı (Atomik Güvence).',
              );
            }
            throw new AppError(
              `[UÇUŞ ÖNCESİ MAĞAZA DOĞRULAMA HATASI]: ${preflightMsg}. Google Play'e tek taraflı yükleme yapılmasını ve mağazalar arası sürüm uyumsuzluğunu önlemek amacıyla dağıtım güvenli şekilde durduruldu.`,
              'VALIDATION_ERROR',
            );
          }
        }
      }

      // 2. ADIM: PARALEL & ATOMİK MAĞAZA YÜKLEME ORKESTRASYONU
      let googlePlayStatus = 'SKIPPED';
      let appStoreStatus = 'SKIPPED';

      const isBothStoresTargeted = willUploadAndroid && willUploadIos;
      const atomicRelease = options.atomicRelease !== false && isBothStoresTargeted;

      let googleAdapter: GooglePlayAdapter | null = null;
      let appStoreAdapter: AppStoreAdapter | null = null;
      // Taslak olusur olusmaz buraya yazilir; hata aninda rollback bu kayit uzerinden yapilir.
      const draftHolder: { draft: GooglePlayDraftResult | null } = { draft: null };
      // Canli ilerleme: yalnizca dinleyicilere iletilir, DB'ye satir eklemez (polling sik mesaj uretir).
      const emitProgress = (step: string, message: string): void => {
        this.emit({ step, status: 'IN_PROGRESS', message });
      };

      const effectiveAndroidVersion = options.androidVersion || resolution.versionString;
      const effectiveIosVersion = options.iosVersion || resolution.versionString;
      const effectiveIosBuildNumber =
        options.iosBuildNumber !== undefined
          ? String(options.iosBuildNumber)
          : resolution.buildNumberString;

      if (willUploadAndroid) {
        const effectiveTrack = options.googleTrack || config?.android?.track || 'internal';
        googleAdapter = new GooglePlayAdapter({
          packageName: resolvedPackage,
          serviceAccountJson: creds.googlePlay!.serviceAccountJson,
          serviceAccountJsonPath: creds.googlePlay!.keyPath,
          track: effectiveTrack,
          userFraction: options.rollout ? options.rollout / 100 : undefined,
        });
      }

      if (willUploadIos) {
        appStoreAdapter = new AppStoreAdapter({
          keyId: creds.appStore!.keyId!,
          issuerId: creds.appStore!.issuerId!,
          bundleId: effectiveIosBundleId,
          privateKeyPath: creds.appStore!.privateKeyPath,
          privateKeyContent: creds.appStore!.privateKey,
        });
      }

      // Google Play Görevi
      const executeGooglePlayTask = async (): Promise<
        GooglePlayDraftResult | GooglePlayUploadResult | null
      > => {
        if (!willUploadAndroid || !googleAdapter || !androidArtifact) {
          if (options.skipAndroid) {
            emitAndRecord('Google Play Upload', 'SKIPPED', 'Android yüklemesi devre dışı');
          } else if (!androidArtifact) {
            emitAndRecord(
              'Google Play Upload',
              'SKIPPED',
              'Android AAB/APK derleme paketi (artifact) bulunamadı',
            );
          } else if (!hasGoogleCreds) {
            emitAndRecord(
              'Google Play Upload',
              'SKIPPED',
              'Google Play Service Account kimliği bulunamadı',
            );
          } else {
            emitAndRecord(
              'Google Play Upload',
              'SKIPPED',
              'Google Play yükleme adaptörü başlatılamadı',
            );
          }
          return null;
        }

        emitAndRecord('Google Play Upload', 'IN_PROGRESS');
        const playNotes: GooglePlayReleaseNotes[] = [];
        if (options.notesTr) playNotes.push({ language: 'tr-TR', text: options.notesTr });
        if (options.notesEn) playNotes.push({ language: 'en-US', text: options.notesEn });

        try {
          if (atomicRelease) {
            // İki aşamalı taahhüt: Önce taslak (draft) olarak yükle, App Store tamamlanmadan commit etme
            const draftRes = await googleAdapter.uploadDraftOnly(
              androidArtifact.filePath,
              playNotes.length > 0 ? playNotes : undefined,
            );
            draftHolder.draft = draftRes;
            emitAndRecord(
              'Google Play Upload',
              'IN_PROGRESS',
              `AAB paketi yüklendi (v${draftRes.versionCode}), App Store tamamlanması bekleniyor (Atomik Taslak)...`,
            );
            return draftRes;
          } else {
            const uploadRes = await googleAdapter.uploadAndRelease(
              androidArtifact.filePath,
              playNotes.length > 0 ? playNotes : undefined,
              false,
            );
            storeSubmissionRepo.create({
              releaseId,
              store: 'google_play',
              version: effectiveAndroidVersion,
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
            const managedNote =
              uploadRes.track === 'production' || uploadRes.track === 'beta'
                ? ' [İnceleme Talep Edildi]'
                : '';
            emitAndRecord(
              'Google Play Upload',
              'SUCCESS',
              `Google Play'e yüklendi: Paket ${resolvedPackage} #${uploadRes.versionCode} (${trackDisplayName})${managedNote}`,
            );
            return uploadRes;
          }
        } catch (gpErr: unknown) {
          const gpMsg = gpErr instanceof Error ? gpErr.message : String(gpErr);
          emitAndRecord('Google Play Upload', 'FAILED', undefined, gpMsg);
          throw gpErr;
        }
      };

      // App Store Görevi
      const executeAppStoreTask = async (
        signal?: AbortSignal,
      ): Promise<AppStoreUploadResult | null> => {
        if (!willUploadIos || !appStoreAdapter || !iosArtifact) {
          if (options.skipIos) {
            emitAndRecord('App Store Upload', 'SKIPPED', 'iOS yüklemesi devre dışı');
          } else if (!iosArtifact) {
            emitAndRecord(
              'App Store Upload',
              'SKIPPED',
              'iOS IPA derleme paketi (artifact) bulunamadı (iOS derlemesi başarısız oldu veya atlandı)',
            );
          } else if (!hasAppStoreCreds) {
            emitAndRecord(
              'App Store Upload',
              'SKIPPED',
              'App Store Connect API anahtarları (Key ID, Issuer ID veya Özel Anahtar) bulunamadı',
            );
          } else {
            emitAndRecord(
              'App Store Upload',
              'SKIPPED',
              'App Store yükleme adaptörü başlatılamadı',
            );
          }
          return null;
        }

        emitAndRecord('App Store Upload', 'IN_PROGRESS');
        try {
          const whatsNew: Record<string, string> = {};
          if (options.notesTr) whatsNew['tr-TR'] = options.notesTr;
          if (options.notesEn) whatsNew['en-US'] = options.notesEn;

          const shouldSubmitForReview = options.submitForReview !== false;

          const uploadRes = await appStoreAdapter.uploadAndRelease(
            iosArtifact.filePath,
            effectiveIosVersion,
            effectiveIosBuildNumber,
            Object.keys(whatsNew).length > 0 ? whatsNew : undefined,
            shouldSubmitForReview,
            {
              signal,
              onProgress: (m: string) => emitProgress('App Store Upload', m),
            },
          );
          storeSubmissionRepo.create({
            releaseId,
            store: 'app_store',
            version: effectiveIosVersion,
            status: uploadRes.status,
            externalId: uploadRes.buildId,
            error: null,
          });
          appStoreStatus = `SUCCESS (${uploadRes.buildId})`;
          const submissionLabel = uploadRes.submittedForReview
            ? 'Resmi İncelemeye Teslim Edildi (Waiting for Review)'
            : 'Yüklendi (Taslak)';
          emitAndRecord(
            'App Store Upload',
            'SUCCESS',
            `App Store Connect'e yüklendi ve işlendi (${submissionLabel}): Paket ${effectiveIosBundleId} (${uploadRes.buildId})`,
          );
          return uploadRes;
        } catch (asErr: unknown) {
          const asMsg = asErr instanceof Error ? asErr.message : String(asErr);
          emitAndRecord('App Store Upload', 'FAILED', undefined, asMsg);
          throw asErr;
        }
      };

      try {
        // PARALEL ÇALIŞTIRMA: Her iki mağaza eşzamanlı olarak yüklenir
        // Biri hata verirse diğerinin sinyali derhal iptal edilir (altool SIGTERM, vb.)
        const { first: playResult } = await runParallelWithAbort(
          executeGooglePlayTask,
          executeAppStoreTask,
          {
            parentSignal: options.signal,
            abortOnFailure: atomicRelease,
          },
        );

        // Eğer iki aşamalı (atomic) ise ve Google taslağı bekliyorsa, şimdi kesinleştir (commit)
        if (playResult && 'editId' in playResult && atomicRelease && googleAdapter) {
          emitAndRecord(
            'Google Play Upload',
            'IN_PROGRESS',
            'App Store başarıyla tamamlandı. Google Play yayını kesinleştiriliyor (Commit)...',
          );
          const uploadRes = await googleAdapter.commitDraft(
            playResult.editId,
            playResult.versionCode,
            false,
          );
          storeSubmissionRepo.create({
            releaseId,
            store: 'google_play',
            version: effectiveAndroidVersion,
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
          const managedNote =
            uploadRes.track === 'production' || uploadRes.track === 'beta'
              ? ' [İnceleme Talep Edildi]'
              : '';
          emitAndRecord(
            'Google Play Upload',
            'SUCCESS',
            `Google Play'e yüklendi: Paket ${resolvedPackage} #${uploadRes.versionCode} (${trackDisplayName})${managedNote}`,
          );
          draftHolder.draft = null;
        }
      } catch (uploadAllErr: unknown) {
        // Hata durumunda iki asamali atomik rollback:
        if (draftHolder.draft && googleAdapter) {
          try {
            await googleAdapter.discardDraft(draftHolder.draft.editId);
            emitAndRecord(
              'Google Play Upload',
              'SKIPPED',
              'Google Play taslak yayını geri alındı (Rollback).',
              'App Store yüklemesi başarısız olduğu için Google Play taslak yayını iptal edildi (Rollback). Mağazalar arası sürüm uyumsuzluğu önlendi.',
            );
          } catch {}
        }
        const errFinalMsg =
          uploadAllErr instanceof Error ? uploadAllErr.message : String(uploadAllErr);
        throw new AppError(errFinalMsg, 'NETWORK_ERROR', { cause: uploadAllErr });
      }

      let finalStatus: ReleaseStatus = 'ARTIFACT_READY';
      const isStoreUploaded =
        googlePlayStatus.startsWith('SUCCESS') ||
        googlePlayStatus === 'LIVE' ||
        appStoreStatus.startsWith('SUCCESS') ||
        appStoreStatus === 'PROCESSING';

      if (isStoreUploaded) {
        this.stateMachine.transitionTo('READY_FOR_SUBMISSION');
        if (options.submitForReview || config?.ios?.submitForReview) {
          this.stateMachine.transitionTo('SUBMITTED');
          finalStatus = 'SUBMITTED';
          emitAndRecord('Submission', 'SUCCESS', 'Mağaza incelemesine sunuldu');
        } else {
          finalStatus = 'READY_FOR_SUBMISSION';
          emitAndRecord(
            'Submission',
            'SUCCESS',
            'Mağazaya yüklendi, manuel inceleme onayına hazır',
          );
        }
      } else {
        emitAndRecord('Submission', 'SKIPPED', 'Mağaza yüklemesi yapılmadı; yerel derleme hazır');
      }

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
            push: options.pushGit !== false,
          });

          if (gitResult.filesCommitted.length > 0) {
            const pushMsg = gitResult.pushed ? ' (GitHub’a push edildi)' : '';
            emitAndRecord(
              'Git Release & Sync',
              'SUCCESS',
              `Commit ${gitResult.commitHash.slice(0, 7)} ve etiket ${gitResult.tagName || ''} oluşturuldu${pushMsg}`,
            );
          } else {
            emitAndRecord(
              'Git Release & Sync',
              'SUCCESS',
              'Git çalışma dizini zaten güncel, yeni değişiklik yok',
            );
          }
        } catch (gitErr: unknown) {
          const msg = gitErr instanceof Error ? gitErr.message : String(gitErr);
          emitAndRecord(
            'Git Release & Sync',
            'FAILED',
            undefined,
            `Git push/commit hatası: ${msg}`,
          );
          if (options.pushGit !== false) {
            throw new AppError(`Git release push işlemi başarısız oldu: ${msg}`, 'NETWORK_ERROR');
          }
        }
      } else {
        emitAndRecord('Git Release & Sync', 'SKIPPED', 'Git entegrasyonu atlandı');
      }

      releaseRepo.updateStatus(releaseId, finalStatus);
      globalReleaseRepo?.updateStatus(releaseId, finalStatus);

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
          gitResult: gitResult
            ? {
                commitHash: gitResult.commitHash,
                tagName: gitResult.tagName,
                pushed: gitResult.pushed,
                branch: gitResult.branch,
              }
            : undefined,
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

      emitAndRecord(
        'Audit & Notify',
        'SUCCESS',
        'Veritabanı günlüğü kaydedildi ve bildirimler tamamlandı',
      );

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
        durationMs: Date.now() - this.startTime,
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
