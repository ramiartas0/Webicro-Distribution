import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import * as clack from '@clack/prompts';
import { DatabaseConnection, ReleaseRepository, AuditLogRepository } from '@webicro/database';
import { ReleaseOrchestrator } from '@webicro/core';
import { ProgressReporter } from '../ui/progress.js';

export const retryCommand = new Command('retry')
  .description('Retry a failed release')
  .argument('<releaseId>', 'The ID of the release to retry')
  .action(async (releaseId: string) => {
    clack.intro('🔄 Webicro Distribution - Retry Release');

    const dbPath = path.resolve(process.cwd(), '.release/release.db');
    if (!fs.existsSync(dbPath)) {
      clack.cancel('Hata: .release/release.db veritabanı bulunamadı.');
      return;
    }

    try {
      const dbConn = new DatabaseConnection(dbPath);
      const releaseRepo = new ReleaseRepository(dbConn.getDb());
      const auditRepo = new AuditLogRepository(dbConn.getDb());

      const record = releaseRepo.findByReleaseId(releaseId);
      if (!record) {
        clack.cancel(`Hata: ${releaseId} kimlikli release bulunamadı.`);
        return;
      }

      console.log(chalk.blue(`Retrying release: ${chalk.bold(releaseId)} (Önceki durum: ${record.status})`));

      auditRepo.create({
        releaseId,
        action: 'RELEASE_RETRY_INITIATED',
        actor: process.env['USER'] || 'operator',
        result: 'SUCCESS',
        details: JSON.stringify({ previousStatus: record.status }),
      });

      releaseRepo.updateStatus(releaseId, 'ANALYZING');

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

      const summary = await orchestrator.run({ dryRun: false }, releaseId);
      clack.outro(chalk.green(`✓ Release ${summary.releaseId} başarıyla tamamlandı!`));
    } catch (err) {
      clack.cancel(`Yeniden deneme başarısız: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
