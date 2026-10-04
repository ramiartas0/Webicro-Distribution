import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseConnection, ReleaseRepository, ReleaseStepRepository } from '@webicro/database';

export const statusCommand = new Command('status')
  .description('Show status of the latest release or a specific release ID')
  .argument('[releaseId]', 'Specific release ID to check status for')
  .action(async (releaseId: string | undefined) => {
    const dbPath = path.resolve(process.cwd(), '.release/release.db');
    if (!fs.existsSync(dbPath)) {
      console.log(chalk.yellow('Henüz bir release veritabanı (.release/release.db) bulunmuyor.'));
      return;
    }

    try {
      const dbConn = new DatabaseConnection(dbPath);
      const releaseRepo = new ReleaseRepository(dbConn.getDb());
      const stepRepo = new ReleaseStepRepository(dbConn.getDb());

      const record = releaseId ? releaseRepo.findByReleaseId(releaseId) : releaseRepo.findLatest();

      if (!record) {
        console.log(
          chalk.yellow(
            releaseId
              ? `ID: ${releaseId} olan release kaydı bulunamadı.`
              : 'Henüz kayıtlı bir release bulunmuyor.',
          ),
        );
        return;
      }

      console.log(chalk.bold.cyan('\n[STATUS] Sürüm Durumu:'));
      console.log(`  ${chalk.dim('Release ID:')}     ${chalk.bold(record.releaseId)}`);
      console.log(`  ${chalk.dim('Proje:')}          ${record.project}`);
      console.log(
        `  ${chalk.dim('Sürüm:')}          ${chalk.green(record.version)}+${record.buildNumber}`,
      );
      console.log(
        `  ${chalk.dim('Durum:')}          ${record.status === 'RELEASED' ? chalk.green.bold(record.status) : record.status === 'FAILED' ? chalk.red.bold(record.status) : chalk.yellow.bold(record.status)}`,
      );
      console.log(
        `  ${chalk.dim('Oluşturulma:')}    ${new Date(record.createdAt).toLocaleString()}`,
      );
      console.log(
        `  ${chalk.dim('Güncellenme:')}    ${new Date(record.updatedAt).toLocaleString()}`,
      );

      const steps = stepRepo.findByReleaseId(record.releaseId);
      if (steps.length > 0) {
        console.log(chalk.bold('\n[ADIMLAR] Adım Detayları:'));
        for (const s of steps) {
          const statusIcon =
            s.status === 'COMPLETED'
              ? chalk.green('✓')
              : s.status === 'FAILED'
                ? chalk.red('✗')
                : s.status === 'RUNNING'
                  ? chalk.cyan('●')
                  : chalk.gray('○');
          console.log(
            `  ${statusIcon} ${s.step} [${s.status}]${s.error ? ` - ${chalk.red(s.error)}` : ''}`,
          );
        }
      }
      console.log('');
    } catch (err) {
      console.error(
        chalk.red(`Durum kontrolü hatası: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  });
