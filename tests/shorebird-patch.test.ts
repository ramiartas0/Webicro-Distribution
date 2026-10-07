import { describe, it, expect, vi } from 'vitest';
import { ShorebirdRunner } from '../packages/flutter/src/shorebird-runner.js';

describe('Shorebird OTA Instant Patch Runner', () => {
  it('Dry-run modunda doğru argümanlarla simüle edilmeli', async () => {
    const progressMessages: string[] = [];

    const result = await ShorebirdRunner.patch({
      platform: 'android',
      releaseVersion: '2.7.0',
      dryRun: true,
      onProgress: (msg) => {
        progressMessages.push(msg);
      },
    });

    expect(result.success).toBe(true);
    expect(result.platform).toBe('android');
    expect(result.releaseVersion).toBe('2.7.0');
    expect(result.patchNumber).toBe(1);
    expect(progressMessages[0]).toContain('DRY-RUN');
  });

  it('Shorebird CLI sistemde yoksa açıklayıcı hata vermeli', async () => {
    vi.spyOn(ShorebirdRunner, 'isAvailable').mockResolvedValue(false);

    const result = await ShorebirdRunner.patch({
      platform: 'android',
      dryRun: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Shorebird CLI sistemde bulunamadı');
  });
});
