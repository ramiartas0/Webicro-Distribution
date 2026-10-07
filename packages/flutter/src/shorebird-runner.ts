import { spawn } from 'node:child_process';
import type { ShorebirdPatchOptions, ShorebirdPatchResult } from './types.js';

export class ShorebirdRunner {
  /**
   * Sistemde Shorebird CLI aracının kurulu olup olmadığını kontrol eder.
   */
  public static async isAvailable(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const proc = spawn('shorebird', ['--version']);
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
  }

  /**
   * Kurulu Shorebird CLI sürümünü döndürür.
   */
  public static async getVersion(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const proc = spawn('shorebird', ['--version']);
      let output = '';
      proc.stdout?.on('data', (d: Buffer) => {
        output += d.toString();
      });
      proc.on('error', () => resolve(null));
      proc.on('close', (code) => {
        if (code === 0) {
          const match = output.match(/Shorebird\s+([0-9.]+)/i);
          resolve(match ? match[1] ?? output.trim() : output.trim());
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Canlıdaki uygulamaya Shorebird üzerinden mağaza incelemesi beklemeden anında OTA yaması (patch) dağıtır.
   */
  public static async patch(options: ShorebirdPatchOptions): Promise<ShorebirdPatchResult> {
    const report = options.onProgress;
    const cwd = options.targetDir || process.cwd();

    if (options.dryRun) {
      report?.(`[DRY-RUN] Shorebird yama simülasyonu başlatıldı: Platform: ${options.platform}`);
      return {
        success: true,
        platform: options.platform,
        releaseVersion: options.releaseVersion || '1.0.0',
        patchNumber: 1,
        output: `[DRY-RUN] shorebird patch ${options.platform} başarıyla simüle edildi.`,
      };
    }

    const available = await this.isAvailable();
    if (!available) {
      const errorMsg =
        'Shorebird CLI sistemde bulunamadı. Lütfen "curl --proto =https --tlsv1.2 -sSf https://raw.githubusercontent.com/shorebirdtech/install/main/install.sh | bash" ile kurun.';
      report?.(`[HATA] ${errorMsg}`);
      return {
        success: false,
        platform: options.platform,
        output: '',
        error: errorMsg,
      };
    }

    const runSinglePlatform = async (
      platform: 'android' | 'ios-framework',
    ): Promise<{ success: boolean; output: string; error?: string; patchNumber?: number }> => {
      const args = ['patch', platform, '--force'];

      if (options.releaseVersion) {
        args.push(`--release-version=${options.releaseVersion}`);
      }
      if (options.allowUncommittedChanges) {
        args.push('--allow-uncommitted-changes');
      }

      report?.(`Shorebird komutu çalıştırılıyor: shorebird ${args.join(' ')}`);

      return new Promise((resolve) => {
        const proc = spawn('shorebird', args, {
          cwd,
          signal: options.signal,
          env: { ...process.env, CI: 'true' },
        });

        let fullOutput = '';
        let errOutput = '';

        proc.stdout?.on('data', (d: Buffer) => {
          const text = d.toString();
          fullOutput += text;
          for (const raw of text.split('\n')) {
            const line = raw.trim();
            if (line) report?.(`[Shorebird] ${line}`);
          }
        });

        proc.stderr?.on('data', (d: Buffer) => {
          const text = d.toString();
          errOutput += text;
          for (const raw of text.split('\n')) {
            const line = raw.trim();
            if (line) report?.(`[Shorebird ERR] ${line}`);
          }
        });

        proc.on('error', (err) => {
          resolve({
            success: false,
            output: fullOutput,
            error: `Shorebird başlatılamadı: ${err.message}`,
          });
        });

        proc.on('close', (code) => {
          if (code === 0) {
            // Yama numarasını çıktıdan regex ile tespit et (ör: "Published patch #3")
            const patchMatch = fullOutput.match(/patch\s+#?(\d+)/i);
            const patchNumber = patchMatch && patchMatch[1] ? parseInt(patchMatch[1], 10) : undefined;
            resolve({
              success: true,
              output: fullOutput,
              patchNumber,
            });
          } else {
            resolve({
              success: false,
              output: fullOutput,
              error: errOutput || `Shorebird çıktı kodu ${code} ile başarısız oldu`,
            });
          }
        });
      });
    };

    if (options.platform === 'both') {
      report?.('Android ve iOS için çoklu platform Shorebird yaması başlatılıyor...');
      const androidRes = await runSinglePlatform('android');
      if (!androidRes.success) {
        return {
          success: false,
          platform: 'both',
          output: androidRes.output,
          error: `Android patch başarısız: ${androidRes.error}`,
        };
      }

      const iosRes = await runSinglePlatform('ios-framework');
      return {
        success: iosRes.success,
        platform: 'both',
        releaseVersion: options.releaseVersion,
        patchNumber: iosRes.patchNumber ?? androidRes.patchNumber,
        output: `${androidRes.output}\n\n${iosRes.output}`,
        error: iosRes.error ? `iOS patch başarısız: ${iosRes.error}` : undefined,
      };
    }

    const singleRes = await runSinglePlatform(options.platform);
    return {
      success: singleRes.success,
      platform: options.platform,
      releaseVersion: options.releaseVersion,
      patchNumber: singleRes.patchNumber,
      output: singleRes.output,
      error: singleRes.error,
    };
  }
}
