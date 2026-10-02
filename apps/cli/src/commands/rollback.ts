import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import * as clack from '@clack/prompts';
import { DatabaseConnection, ReleaseRepository, AuditLogRepository } from '@webicro/database';

export const rollbackCommand = new Command('rollback')
  .description('Rollback a release')
  .argument('<releaseId>', 'The ID of the release to rollback')
  .action(async (releaseId: string) => {
    clack.intro('⏪ Webicro Distribution - Rollback');

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

      console.log(chalk.yellow(`Geri alma işlemi başlatılıyor: ${chalk.bold(releaseId)} (${record.version}+${record.buildNumber})`));

      releaseRepo.updateStatus(releaseId, 'FAILED');

      auditRepo.create({
        releaseId,
        action: 'RELEASE_ROLLED_BACK',
        actor: process.env['USER'] || 'operator',
        result: 'SUCCESS',
        details: JSON.stringify({
          rolledBackVersion: record.version,
          rolledBackBuildNumber: record.buildNumber,
          previousStatus: record.status,
          timestamp: new Date().toISOString(),
        }),
      });

      clack.note(
        [
          `1. Sürüm Durumu: ${record.status} -> FAILED (Geri alındı)`,
          `2. Git Tag: v${record.version} silinmesi önerilir: git tag -d v${record.version}`,
          `3. Denetim Günlüğü: Başarıyla SQLite kayıt altına alındı.`,
        ].join('\n'),
        'Geri Alma Özeti'
      );

      clack.outro(chalk.green(`✓ ${releaseId} sürümü başarıyla geri alındı.`));
    } catch (err) {
      clack.cancel(`Geri alma başarısız: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
