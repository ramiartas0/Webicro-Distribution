import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StoreAssetSync } from '../packages/artifacts/src/asset-sync.js';
import type { GooglePlayAdapter } from '../packages/google-play/src/adapter.js';

describe('Store Asset & Metadata Sync', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-sync-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('Yerel metadata dosyalarını dil bazında doğru ayrıştırmalı', () => {
    const metaDir = path.join(tmpDir, '.release/metadata');
    fs.mkdirSync(path.join(metaDir, 'tr-TR'), { recursive: true });
    fs.mkdirSync(path.join(metaDir, 'en-US'), { recursive: true });

    fs.writeFileSync(path.join(metaDir, 'tr-TR/title.txt'), 'Piyyu Kurye');
    fs.writeFileSync(path.join(metaDir, 'tr-TR/description.txt'), 'Hızlı ve güvenilir teslimat uygulaması.');
    fs.writeFileSync(path.join(metaDir, 'tr-TR/keywords.txt'), 'kurye,teslimat,siparis');

    fs.writeFileSync(path.join(metaDir, 'en-US/title.txt'), 'Piyyu Courier');
    fs.writeFileSync(path.join(metaDir, 'en-US/description.txt'), 'Fast and reliable courier app.');

    const metadata = StoreAssetSync.discoverLocalMetadata(metaDir);

    expect(Object.keys(metadata.locales)).toHaveLength(2);
    expect(metadata.locales['tr-TR']?.title).toBe('Piyyu Kurye');
    expect(metadata.locales['tr-TR']?.keywords).toBe('kurye,teslimat,siparis');
    expect(metadata.locales['en-US']?.title).toBe('Piyyu Courier');
  });

  it('Yerel ekran görüntülerini platform ve cihaz tipine göre ayrıştırmalı', () => {
    const screenDir = path.join(tmpDir, '.release/screenshots');
    const androidPhoneDir = path.join(screenDir, 'android/tr-TR/phone');
    const androidTabletDir = path.join(screenDir, 'android/tr-TR/tablet_7');
    fs.mkdirSync(androidPhoneDir, { recursive: true });
    fs.mkdirSync(androidTabletDir, { recursive: true });

    fs.writeFileSync(path.join(androidPhoneDir, 'shot1.png'), 'fake-image-bytes');
    fs.writeFileSync(path.join(androidPhoneDir, 'shot2.png'), 'fake-image-bytes');
    fs.writeFileSync(path.join(androidTabletDir, 'tablet1.png'), 'fake-image-bytes');

    const screenshots = StoreAssetSync.discoverLocalScreenshots(screenDir);

    expect(screenshots.items).toHaveLength(3);
    const phoneItems = screenshots.items.filter((s) => s.deviceType === 'phone');
    const tabletItems = screenshots.items.filter((s) => s.deviceType === 'sevenInch');
    expect(phoneItems).toHaveLength(2);
    expect(tabletItems).toHaveLength(1);
  });

  it('Google Play adaptörü ile listing ve ekran görüntülerini senkronize etmeli', async () => {
    const mockGooglePlay = {
      syncListings: vi.fn().mockResolvedValue(undefined),
      uploadListingImage: vi.fn().mockResolvedValue(undefined),
    } as unknown as GooglePlayAdapter;

    const metadata = {
      locales: {
        'tr-TR': {
          locale: 'tr-TR',
          title: 'Piyyu Kurye',
          fullDescription: 'Harika bir kurye deneyimi',
        },
      },
    };

    const screenshots = {
      items: [
        {
          platform: 'android' as const,
          locale: 'tr-TR',
          deviceType: 'phone' as const,
          filePath: '/path/to/shot1.png',
        },
      ],
    };

    const result = await StoreAssetSync.syncToGooglePlay(
      mockGooglePlay,
      'edit-123',
      metadata,
      screenshots,
    );

    expect(result.metadataLocalesUpdated).toEqual(['tr-TR']);
    expect(result.screenshotsUploaded).toBe(1);
    expect(mockGooglePlay.syncListings).toHaveBeenCalledWith('edit-123', [
      {
        language: 'tr-TR',
        title: 'Piyyu Kurye',
        shortDescription: undefined,
        fullDescription: 'Harika bir kurye deneyimi',
      },
    ]);
    expect(mockGooglePlay.uploadListingImage).toHaveBeenCalledWith(
      'edit-123',
      'tr-TR',
      'phoneScreenshots',
      '/path/to/shot1.png',
    );
  });
});
