import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseConnection, AuditLogRepository } from '@webicro/database';

export const logsCommand = new Command('logs')
  .description('Shows audit logs for a release')
  .argument('[releaseId]', 'The ID of the release to show logs for')
  .action(async (releaseId: string | undefined) => {
    const dbPath = path.resolve(process.cwd(), '.release/release.db');
    if (!fs.existsSync(dbPath)) {
      console.log(chalk.yellow('Henüz bir denetim günlüğü (.release/release.db) bulunmuyor.'));
      return;
    }

    try {
      const dbConn = new DatabaseConnection(dbPath);
      const auditRepo = new AuditLogRepository(dbConn.getDb());

      const logs = releaseId ? auditRepo.findByReleaseId(releaseId) : auditRepo.findAll(50);

      if (logs.length === 0) {
        console.log(
          chalk.yellow(
            releaseId
              ? `ID: ${releaseId} için denetim kaydı bulunamadı.`
              : 'Henüz denetim kaydı bulunmuyor.',
          ),
        );
        return;
      }

      console.log(chalk.bold.cyan(`\n[AUDIT] Denetim Günlüğü (${logs.length} kayıt):`));
      for (const log of logs) {
        const resultColor =
          log.result === 'SUCCESS'
            ? chalk.green
            : log.result === 'FAILURE'
              ? chalk.red
              : chalk.yellow;
        const timeStr = chalk.dim(`[${new Date(log.timestamp).toLocaleString()}]`);
        const actorStr = chalk.blue(`(${log.actor})`);
        const actionStr = chalk.bold(log.action);
        const relStr = log.releaseId ? chalk.dim(`[${log.releaseId}] `) : '';
        console.log(`  ${timeStr} ${relStr}${actionStr} ${actorStr} -> ${resultColor(log.result)}`);
        if (log.details) {
          console.log(`    ${chalk.dim('Detay:')} ${log.details}`);
        }
      }
      console.log('');
    } catch (err) {
      console.error(
        chalk.red(`Denetim günlüğü okunamadı: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  });
