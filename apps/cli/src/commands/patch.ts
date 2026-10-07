import path from 'node:path';
import { Command } from 'commander';
import { ShorebirdRunner, type ShorebirdPlatform } from '@webicro/flutter';
import * as clack from '@clack/prompts';
import chalk from 'chalk';

export const patchCommand = new Command('patch')
  .description('Deploy an instant OTA (Over-The-Air) patch using Shorebird without store review')
  .option('-t, --target <path>', 'Target Flutter project directory (default: current directory)')
  .option(
    '-p, --platform <platform>',
    'Target platform (android | ios-framework | both)',
    'android',
  )
  .option('-v, --release-version <version>', 'Target release version to patch')
  .option('--allow-uncommitted', 'Allow uncommitted git changes', false)
  .option('--dry-run', 'Simulate patch deployment without executing Shorebird', false)
  .action(async (options: Record<string, unknown>) => {
    clack.intro(chalk.bold.cyan('⚡ Webicro Distribution - Shorebird OTA Canlı Yama'));

    const rawTarget = typeof options['target'] === 'string' ? options['target'] : process.cwd();
    const targetDir = path.resolve(rawTarget);
    const platform = (options['platform'] as ShorebirdPlatform) || 'android';
    const releaseVersion = typeof options['releaseVersion'] === 'string' ? options['releaseVersion'] : undefined;
    const allowUncommittedChanges = Boolean(options['allowUncommitted']);
    const dryRun = Boolean(options['dryRun']);

    const s = clack.spinner();
    s.start('Shorebird ortamı denetleniyor...');

    const isAvailable = await ShorebirdRunner.isAvailable();
    if (!isAvailable && !dryRun) {
      s.stop(chalk.red('Shorebird CLI sistemde bulunamadı.'));
      clack.note(
        'Shorebird CLI kurmak için terminalinizde çalıştırın:\ncurl --proto =https --tlsv1.2 -sSf https://raw.githubusercontent.com/shorebirdtech/install/main/install.sh | bash',
        'Kurulum Gerekli',
      );
      process.exit(1);
    }

    const version = await ShorebirdRunner.getVersion();
    s.stop(
      chalk.green(
        `Shorebird CLI hazır${version ? ` (${version})` : ''} - Hedef: ${platform} ${releaseVersion ? `(v${releaseVersion})` : ''}`,
      ),
    );

    const patchSpinner = clack.spinner();
    patchSpinner.start('Canlı yama oluşturuluyor ve dağıtılıyor...');

    const result = await ShorebirdRunner.patch({
      targetDir,
      platform,
      releaseVersion,
      allowUncommittedChanges,
      dryRun,
      onProgress: (msg) => {
        patchSpinner.message(msg);
      },
    });

    if (result.success) {
      patchSpinner.stop(chalk.green('✓ Shorebird OTA yaması başarıyla dağıtıldı!'));
      clack.note(
        `Platform: ${result.platform}\n${result.releaseVersion ? `Hedef Sürüm: ${result.releaseVersion}\n` : ''}${result.patchNumber ? `Yama Numarası: #${result.patchNumber}\n` : ''}Kullanıcılar uygulamayı yeniden başlattıklarında güncellemeyi anında alacaklardır.`,
        'Yama Başarıyla Yayınlandı',
      );
    } else {
      patchSpinner.stop(chalk.red('✗ Yama dağıtımı başarısız oldu.'));
      if (result.error) {
        console.error(chalk.red(`\nHata: ${result.error}`));
      }
      process.exit(1);
    }
  });
