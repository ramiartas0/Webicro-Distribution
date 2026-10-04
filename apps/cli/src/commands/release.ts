import path from 'node:path';
import { Command } from 'commander';
import { ReleaseOrchestrator, detectProjectMetadata } from '@webicro/core';
import type { ReleaseStepEvent } from '@webicro/core';
import { ProgressReporter } from '../ui/progress.js';
import { FinalReporter } from '../ui/reporter.js';
import * as clack from '@clack/prompts';
import chalk from 'chalk';

export const releaseCommand = new Command('release')
  .description('Start a new release')
  .argument('[bump]', 'Type of version bump (patch | minor | major)')
  .option('-t, --target <path>', 'Target Flutter project directory (default: current directory)')
  .option('--validate-only', 'Run Flutter doctor, analyze and tests without building or releasing', false)
  .option('--build-only', 'Build and verify artifacts without store upload or git operations', false)
  .option('--skip-android', 'Skip Android build and upload', false)
  .option('--skip-ios', 'Skip iOS build and upload', false)
  .option('--skip-tests', 'Skip Flutter tests', false)
  .option('--skip-ai', 'Skip AI release notes generation', false)
  .option('--skip-git', 'Skip all Git operations (commit, tag, push)', false)
  .option('--no-push', 'Create Git commit and tag, but do not push to remote')
  .option('--track <track>', 'Google Play track (internal | alpha | beta | production)')
  .option('--package <id>', 'Explicit Android package name / applicationId override')
  .option('--config <path>', 'Custom config file path')
  .option('--version <version>', 'Manual version override')
  .option('-y, --yes', 'Skip interactive confirmation prompt', false)
  .action(async (bump: string | undefined, options: Record<string, unknown>) => {
    clack.intro('🚀 Webicro Distribution - Release');

    try {
      const rawTarget = typeof options['target'] === 'string' ? options['target'] : process.cwd();
      const targetDir = path.resolve(rawTarget);
      const meta = detectProjectMetadata(targetDir);

      const resolvedPackage = typeof options['package'] === 'string' ? options['package'] : meta.package;
      const trackOption = typeof options['track'] === 'string' ? options['track'].toLowerCase() : undefined;
      const validatedTrack = trackOption === 'internal' || trackOption === 'alpha' || trackOption === 'beta' || trackOption === 'production'
        ? trackOption
        : undefined;

      const isValidateOnly = Boolean(options['validateOnly']);
      const isBuildOnly = Boolean(options['buildOnly']);
      const skipGit = Boolean(options['skipGit']);
      const noPush = Boolean(options['push'] === false || options['noPush'] === true);

      const isLiveRelease = !isValidateOnly && !isBuildOnly;
      if (isLiveRelease && !options['yes'] && process.env['CI'] !== 'true') {
        const effectiveTrack = validatedTrack || 'internal';
        const gitSummary = skipGit ? 'Atlanacak' : noPush ? 'Commit + Tag (Push Yok)' : 'Commit + Tag + Push';

        clack.note(
          `Proje: ${chalk.bold(meta.name)}\n` +
          `Dizin: ${chalk.dim(targetDir)}\n` +
          `Paket (Android): ${chalk.cyan(resolvedPackage || 'Belirtilmedi')}\n` +
          `Bundle ID (iOS): ${chalk.cyan(meta.iosBundleId || 'Belirtilmedi')}\n` +
          `Kanal (Google Play): ${chalk.yellow(effectiveTrack)}\n` +
          `Git İşlemleri: ${gitSummary}\n` +
          `İşlemler: Gerçek Derleme + Mağaza Dağıtımı`,
          '⚠️ Canlı Dağıtım Öncesi Doğrulama'
        );

        const confirmed = await clack.confirm({
          message: 'Yukarıdaki ayarlarla CANLI mağaza dağıtımını başlatmak istiyor musunuz?',
          initialValue: false,
        });

        if (!confirmed || clack.isCancel(confirmed)) {
          clack.cancel('Dağıtım kullanıcı tarafından iptal edildi.');
          process.exit(0);
        }
      }

      const orchestrator = new ReleaseOrchestrator();
      const totalSteps = isValidateOnly ? 12 : isBuildOnly ? 16 : 20;
      const progress = new ProgressReporter(totalSteps, process.env['CI'] === 'true');

      let stepCounter = 1;
      orchestrator.onStep((event: ReleaseStepEvent) => {
        if (event.status === 'IN_PROGRESS') {
          progress.startStep({ name: `[${stepCounter}/${totalSteps}] ${event.step}` });
        } else if (event.status === 'SUCCESS') {
          progress.succeedStep();
          stepCounter++;
        } else if (event.status === 'FAILED') {
          progress.failStep(event.error ?? 'Unknown error');
        } else if (event.status === 'SKIPPED') {
          progress.skipStep();
          stepCounter++;
        }
      });

      const validatedBump = bump === 'major' || bump === 'minor' || bump === 'patch' ? bump : undefined;

      const summary = await orchestrator.execute({
        targetDir,
        packageName: resolvedPackage,
        bump: validatedBump,
        validateOnly: isValidateOnly,
        buildOnly: isBuildOnly,
        skipAndroid: Boolean(options['skipAndroid']),
        skipIos: Boolean(options['skipIos']),
        skipTests: Boolean(options['skipTests']),
        skipAi: Boolean(options['skipAi']),
        skipGit,
        pushGit: !noPush,
        googleTrack: validatedTrack,
        manualVersion: typeof options['version'] === 'string' ? options['version'] : undefined,
        configPath: typeof options['config'] === 'string' ? options['config'] : undefined,
      });

      const [verPart, buildPart] = summary.version.includes('+') ? summary.version.split('+') : [summary.version, '1'];
      const finalBuildNum = Number(buildPart) || 1;

      const parseReportStatus = (statusStr?: string, skipped?: boolean): 'success' | 'failed' | 'skipped' | 'pending' => {
        if (skipped) return 'skipped';
        if (!statusStr) return 'skipped';
        const lower = statusStr.toLowerCase();
        if (lower.includes('success') || lower === 'live' || lower === 'uploaded') return 'success';
        if (lower.includes('fail') || lower.includes('error')) return 'failed';
        if (lower.includes('processing') || lower.includes('pending')) return 'pending';
        return 'skipped';
      };

      const reporter = new FinalReporter();
      reporter.printSummary({
        releaseId: summary.releaseId,
        nextVersion: verPart || summary.version,
        buildNumber: finalBuildNum,
        androidArtifactInfo: summary.androidArtifact?.filePath || (options['skipAndroid'] || isValidateOnly ? 'none' : 'not generated'),
        androidStatus: summary.androidArtifact ? 'success' : (options['skipAndroid'] || isValidateOnly ? 'skipped' : 'failed'),
        iosArtifactInfo: summary.iosArtifact?.filePath || (options['skipIos'] || isValidateOnly ? 'none' : 'not generated'),
        iosStatus: summary.iosArtifact ? 'success' : (options['skipIos'] || isValidateOnly ? 'skipped' : 'failed'),
        googlePlayStatus: parseReportStatus(summary.googlePlayStatus, Boolean(options['skipAndroid'] || isValidateOnly || isBuildOnly)),
        appStoreStatus: parseReportStatus(summary.appStoreStatus, Boolean(options['skipIos'] || isValidateOnly || isBuildOnly)),
        totalDurationMs: summary.durationMs,
      });

    } catch (error: unknown) {
      clack.cancel(`Release failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
