import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import * as clack from '@clack/prompts';
import { DatabaseConnection, ReleaseRepository, AuditLogRepository } from '@webicro/database';
import { simpleGit } from 'simple-git';
import { PubspecVersionUpdater } from '@webicro/flutter';

interface RollbackOptions {
  deleteTag?: boolean;
  revertPubspec?: boolean;
  force?: boolean;
}

export const rollbackCommand = new Command('rollback')
  .description('Geri alma (rollback) işlemini başlatır ve mağaza/git durumunu yönetir')
  .argument('<releaseId>', 'Geri alınacak sürümün kimliği (Release ID)')
  .option('--delete-tag', 'Yerel ve uzak Git etiketini (vX.Y.Z) sil')
  .option('--revert-pubspec', 'pubspec.yaml dosyasını bir önceki kararlı sürüme geri al')
  .option('--force', 'Kullanıcı onayı istemeden doğrudan çalıştır')
  .action(async (releaseId: string, options: RollbackOptions) => {
    clack.intro(chalk.bold('Webicro Distribution - Geri Alma (Rollback)'));

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

      const tagName = `v${record.version}`;
      clack.log.info(
        `${chalk.yellow('Hedef Sürüm:')} ${chalk.bold(record.project)} ${chalk.cyan(`v${record.version}+${record.buildNumber}`)} [Mevcut Durum: ${record.status}]`,
      );

      if (!options.force) {
        const confirm = await clack.confirm({
          message: `${releaseId} (${tagName}) sürümünü geri almak ve FAILED olarak işaretlemek istiyor musunuz?`,
          initialValue: true,
        });
        if (!confirm || clack.isCancel(confirm)) {
          clack.cancel('Geri alma işlemi iptal edildi.');
          return;
        }
      }

      const executedActions: string[] = [];

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
          deleteTag: Boolean(options.deleteTag),
          revertPubspec: Boolean(options.revertPubspec),
          timestamp: new Date().toISOString(),
        }),
      });
      executedActions.push(
        `1. Veritabanı Durumu: ${record.status} -> ${chalk.red('FAILED')} (Geri Alındı)`,
      );

      if (options.deleteTag) {
        try {
          const git = simpleGit(process.cwd());
          await git.tag(['-d', tagName]);
          executedActions.push(`2. Yerel Git Etiketi: '${tagName}' başarıyla silindi.`);

          try {
            const remotes = await git.getRemotes();
            if (remotes.length > 0) {
              await git.push(['origin', `:refs/tags/${tagName}`]);
              executedActions.push(
                `2.1 Uzak Git Etiketi: 'origin/${tagName}' GitHub/uzak repodan kaldırıldı.`,
              );
            }
          } catch (remoteTagErr) {
            executedActions.push(
              `2.1 Uzak Git Etiketi: Uzak repoda bulunamadı veya silinemedi (${String(remoteTagErr)}).`,
            );
          }
        } catch (tagErr) {
          executedActions.push(
            `2. Git Etiketi: Yerel etiket bulunamadı veya silinirken hata: ${String(tagErr)}`,
          );
        }
      } else {
        executedActions.push(
          `2. Git Etiketi: Korundu (Silmek için: git tag -d ${tagName} && git push origin :refs/tags/${tagName})`,
        );
      }

      if (options.revertPubspec) {
        const allReleases = releaseRepo.findAll(20);
        const previousSuccess = allReleases.find(
          (r) => r.releaseId !== releaseId && r.status === 'RELEASED',
        );
        const fallbackTarget = previousSuccess
          ? `${previousSuccess.version}+${previousSuccess.buildNumber}`
          : undefined;

        if (fallbackTarget) {
          try {
            const updater = new PubspecVersionUpdater();
            await updater.updateVersion(fallbackTarget, process.cwd());
            executedActions.push(
              `3. pubspec.yaml: Başarıyla önceki kararlı sürüm v${fallbackTarget} olarak güncellendi.`,
            );
          } catch (pubErr) {
            executedActions.push(`3. pubspec.yaml: Güncelleme hatası: ${String(pubErr)}`);
          }
        } else {
          executedActions.push(
            '3. pubspec.yaml: Önceki başarılı bir sürüm kaydı bulunamadığı için otomatik geri alınamadı.',
          );
        }
      }

      clack.note(executedActions.join('\n'), 'Gerçekleştirilen İşlemler');

      const playbooks = [
        chalk.bold.yellow('[GOOGLE PLAY] Console Geri Alma Playbook:'),
        '  • Google Play doğrudan önceki sürüme geri dönmeyi desteklemez.',
        '  • Eğer sürüm Açık/Kapalı testte veya Kademeli Dağıtımda (Rollout) ise:',
        `    1. Google Play Console -> Uygulamanız -> İlgili Dağıtım Kanalı'na gidin.`,
        '    2. "Kademeli dağıtımı durdur" (Halt rollout) butonuna basın.',
        '    3. Veya önceki kararlı sürümün paketini daha yüksek bir build numarası ile derleyip yeni dağıtım oluşturun.',
        '',
        chalk.bold.yellow('[APP STORE] Connect Geri Alma Playbook:'),
        '  • Eğer sürüm "İnceleme Bekliyor" veya "İncelemede" durumundaysa:',
        "    1. App Store Connect -> Uygulamanız -> Sürüm Sayfası'na gidin.",
        '    2. "Bu Yapıyı İncelemeden Geri Çek" (Remove this build from review) butonuna tıklayın.',
        '  • Eğer sürüm yayına çıktıysa:',
        '    1. Yayındaki sürümü mağazadan kaldırabilir (Remove from sale) veya bir sonraki düzeltme sürümünü gönderebilirsiniz.',
      ].join('\n');

      clack.note(playbooks, 'Mağaza Geri Alma Talimatları (Rollback Playbook)');

      clack.outro(chalk.green(`✓ ${releaseId} sürümü başarıyla geri alındı.`));
    } catch (err) {
      clack.cancel(`Geri alma başarısız: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
