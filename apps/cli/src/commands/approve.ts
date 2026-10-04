import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseConnection, ReleaseRepository, AuditLogRepository } from '@webicro/database';

export const approveCommand = new Command('approve')
  .description('Manually approve a release that is waiting for approval')
  .argument('<releaseId>', 'The ID of the release to approve')
  .action(async (releaseId: string) => {
    const dbPath = path.resolve(process.cwd(), '.release/release.db');
    if (!fs.existsSync(dbPath)) {
      console.log(chalk.red('Hata: .release/release.db veritabanı bulunamadı.'));
      return;
    }

    try {
      const dbConn = new DatabaseConnection(dbPath);
      const releaseRepo = new ReleaseRepository(dbConn.getDb());
      const auditRepo = new AuditLogRepository(dbConn.getDb());

      const record = releaseRepo.findByReleaseId(releaseId);
      if (!record) {
        console.log(chalk.red(`Hata: ${releaseId} kimlikli release bulunamadı.`));
        return;
      }

      const actor = process.env['USER'] || 'operator';
      releaseRepo.updateStatus(releaseId, 'VALIDATING');

      auditRepo.create({
        releaseId,
        action: 'MANUAL_APPROVAL',
        actor,
        result: 'SUCCESS',
        details: JSON.stringify({ approvedAt: new Date().toISOString() }),
      });

      console.log(
        chalk.green(
          `✓ Release ${chalk.bold(releaseId)} (${record.version}+${record.buildNumber}) başarıyla onaylandı.`,
        ),
      );
      console.log(
        chalk.dim(`Durum: ${record.status} -> VALIDATING. Boru hattı devam ettirilebilir.`),
      );
    } catch (err) {
      console.error(
        chalk.red(`Onay işlemi hatası: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  });
