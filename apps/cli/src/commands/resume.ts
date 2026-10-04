import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import * as clack from '@clack/prompts';
import { DatabaseConnection, ReleaseRepository } from '@webicro/database';
import { ReleaseOrchestrator } from '@webicro/core';
import { ProgressReporter } from '../ui/progress.js';

export const resumeCommand = new Command('resume')
  .description('Resume a previous release from where it stopped')
  .argument('<releaseId>', 'The ID of the release to resume')
  .action(async (releaseId: string) => {
    clack.intro('▶️ Webicro Distribution - Resume Release');

    const dbPath = path.resolve(process.cwd(), '.release/release.db');
    if (!fs.existsSync(dbPath)) {
      clack.cancel('Hata: .release/release.db veritabanı bulunamadı.');
      return;
    }

    try {
      const dbConn = new DatabaseConnection(dbPath);
      const releaseRepo = new ReleaseRepository(dbConn.getDb());
      const record = releaseRepo.findByReleaseId(releaseId);

      if (!record) {
        clack.cancel(`Hata: ${releaseId} kimlikli release veritabanında bulunamadı.`);
        return;
      }

      console.log(
        chalk.blue(`Resuming release: ${chalk.bold(releaseId)} (Current Status: ${record.status})`),
      );

      const orchestrator = new ReleaseOrchestrator();
      const progress = new ProgressReporter(20, process.env['CI'] === 'true');

      let stepCounter = 1;
      orchestrator.onStep((ev) => {
        if (ev.status === 'IN_PROGRESS' || ev.status === 'RUNNING') {
          progress.startStep({ name: `[${stepCounter}/20] ${ev.step}` });
        } else if (ev.status === 'SUCCESS' || ev.status === 'COMPLETED') {
          progress.succeedStep();
          stepCounter++;
        } else if (ev.status === 'FAILED') {
          progress.failStep(ev.error || 'Failed');
        } else if (ev.status === 'SKIPPED') {
          progress.skipStep();
          stepCounter++;
        }
      });

      const summary = await orchestrator.resume(releaseId);
      clack.outro(
        chalk.green(`✓ Release ${summary.releaseId} (${summary.version}) başarıyla tamamlandı!`),
      );
    } catch (err) {
      clack.cancel(`Resume başarısız: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
