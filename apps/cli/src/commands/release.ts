import { Command } from 'commander';
import { ReleaseOrchestrator } from '@webicro/core';
import type { ReleaseStepEvent } from '@webicro/core';
import { ProgressReporter } from '../ui/progress.js';
import { FinalReporter } from '../ui/reporter.js';
import * as clack from '@clack/prompts';

export const releaseCommand = new Command('release')
  .description('Start a new release')
  .argument('[bump]', 'Type of version bump (patch | minor | major)')
  .option('--dry-run', 'Dry run without store upload/commit', false)
  .option('--skip-android', 'Skip Android build', false)
  .option('--skip-ios', 'Skip iOS build', false)
  .option('--skip-tests', 'Skip Flutter tests', false)
  .option('--skip-ai', 'Skip AI release notes', false)
  .option('--config <path>', 'Custom config file path')
  .option('--version <version>', 'Manual version override')
  .action(async (bump: string | undefined, options: Record<string, unknown>) => {
    clack.intro('🚀 Webicro Distribution - Release');
    
    try {
      const orchestrator = new ReleaseOrchestrator();
      const totalSteps = 20; 
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
        bump: validatedBump,
        dryRun: Boolean(options['dryRun']),
        skipAndroid: Boolean(options['skipAndroid']),
        skipIos: Boolean(options['skipIos']),
        skipTests: Boolean(options['skipTests']),
        skipAi: Boolean(options['skipAi']),
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
        if (lower === 'simulated') return 'success';
        if (lower.includes('processing') || lower.includes('pending')) return 'pending';
        return 'skipped';
      };

      const reporter = new FinalReporter();
      reporter.printSummary({
        releaseId: summary.releaseId,
        nextVersion: verPart || summary.version,
        buildNumber: finalBuildNum,
        androidArtifactInfo: summary.androidArtifact?.filePath || (options['skipAndroid'] ? 'none' : 'not generated'),
        androidStatus: summary.androidArtifact ? 'success' : (options['skipAndroid'] ? 'skipped' : 'failed'),
        iosArtifactInfo: summary.iosArtifact?.filePath || (options['skipIos'] ? 'none' : 'not generated'),
        iosStatus: summary.iosArtifact ? 'success' : (options['skipIos'] ? 'skipped' : 'failed'),
        googlePlayStatus: parseReportStatus(summary.googlePlayStatus, Boolean(options['skipAndroid'])),
        appStoreStatus: parseReportStatus(summary.appStoreStatus, Boolean(options['skipIos'])),
        totalDurationMs: summary.durationMs,
      });
      
    } catch (error: unknown) {
      clack.cancel(`Release failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
