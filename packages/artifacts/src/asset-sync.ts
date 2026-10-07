import fs from 'node:fs';
import path from 'node:path';
import type {
  LocalStoreMetadata,
  LocalStoreScreenshots,
  StoreLocaleMetadata,
} from './types.js';

export interface AppStoreMetadataSyncer {
  syncVersionMetadata(
    versionId: string,
    metadata: {
      locale: string;
      description?: string;
      keywords?: string;
      promotionalText?: string;
      supportUrl?: string;
      marketingUrl?: string;
      whatsNew?: string;
    },
  ): Promise<void>;
}

export interface GooglePlayListingItem {
  language: string;
  title?: string;
  shortDescription?: string;
  fullDescription?: string;
}

export interface GooglePlayAssetSyncer {
  syncListings(editId: string, listings: GooglePlayListingItem[]): Promise<void>;
  uploadListingImage(
    editId: string,
    language: string,
    imageType: 'phoneScreenshots' | 'sevenInchScreenshots' | 'tenInchScreenshots',
    imagePath: string,
  ): Promise<void>;
}


export interface AssetSyncResult {
  metadataLocalesUpdated: string[];
  screenshotsUploaded: number;
}

export class StoreAssetSync {
  /**
   * Belirtilen dizindeki (varsayılan: <projectRoot>/.release/metadata) yerel meta veri dosyalarını ayrıştırır.
   * Dizin yapısı örneği:
   * .release/metadata/
   *   tr-TR/
   *     title.txt
   *     short_description.txt
   *     description.txt
   *     keywords.txt
   *   en-US/
   *     title.txt
   *     ...
   */
  public static discoverLocalMetadata(metadataDir: string): LocalStoreMetadata {
    const result: LocalStoreMetadata = { locales: {} };
    if (!fs.existsSync(metadataDir)) {
      return result;
    }

    const entries = fs.readdirSync(metadataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const locale = entry.name;
      const localePath = path.join(metadataDir, locale);

      const readFileTrim = (fileName: string): string | undefined => {
        const filePath = path.join(localePath, fileName);
        if (fs.existsSync(filePath)) {
          return fs.readFileSync(filePath, 'utf8').trim();
        }
        return undefined;
      };

      const meta: StoreLocaleMetadata = {
        locale,
        title: readFileTrim('title.txt'),
        shortDescription: readFileTrim('short_description.txt'),
        fullDescription: readFileTrim('description.txt') || readFileTrim('full_description.txt'),
        keywords: readFileTrim('keywords.txt'),
        whatsNew: readFileTrim('whats_new.txt'),
        supportUrl: readFileTrim('support_url.txt'),
        marketingUrl: readFileTrim('marketing_url.txt'),
        privacyUrl: readFileTrim('privacy_url.txt'),
      };

      if (
        meta.title ||
        meta.shortDescription ||
        meta.fullDescription ||
        meta.keywords ||
        meta.whatsNew
      ) {
        result.locales[locale] = meta;
      }
    }

    return result;
  }

  /**
   * Belirtilen dizindeki (varsayılan: <projectRoot>/.release/screenshots) yerel ekran görüntülerini tarar.
   * Dizin yapısı örneği:
   * .release/screenshots/
   *   android/
   *     tr-TR/
   *       phone/screen1.png
   *       tablet_7/screen1.png
   *   ios/
   *     en-US/
   *       phone/screen1.png
   */
  public static discoverLocalScreenshots(screenshotsDir: string): LocalStoreScreenshots {
    const result: LocalStoreScreenshots = { items: [] };
    if (!fs.existsSync(screenshotsDir)) {
      return result;
    }

    const platforms: ('android' | 'ios')[] = ['android', 'ios'];
    for (const platform of platforms) {
      const platformDir = path.join(screenshotsDir, platform);
      if (!fs.existsSync(platformDir)) continue;

      const locales = fs.readdirSync(platformDir, { withFileTypes: true });
      for (const locEntry of locales) {
        if (!locEntry.isDirectory()) continue;
        const locale = locEntry.name;
        const localeDir = path.join(platformDir, locale);

        const deviceTypes: { folder: string; type: 'phone' | 'sevenInch' | 'tenInch' }[] = [
          { folder: 'phone', type: 'phone' },
          { folder: 'tablet_7', type: 'sevenInch' },
          { folder: 'tablet_10', type: 'tenInch' },
        ];

        for (const dev of deviceTypes) {
          const devDir = path.join(localeDir, dev.folder);
          if (!fs.existsSync(devDir)) continue;

          const files = fs.readdirSync(devDir);
          for (const file of files) {
            if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
              const filePath = path.join(devDir, file);
              result.items.push({
                platform,
                locale,
                deviceType: dev.type,
                filePath,
              });
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Yerel meta verileri Apple App Store Connect API üzerinden sürüm kaydı ile eşitler.
   */
  public static async syncMetadataToAppStore(
    adapter: AppStoreMetadataSyncer,
    versionId: string,
    metadata: LocalStoreMetadata,
  ): Promise<string[]> {
    const updatedLocales: string[] = [];

    for (const [locale, meta] of Object.entries(metadata.locales)) {
      await adapter.syncVersionMetadata(versionId, {
        locale,
        description: meta.fullDescription,
        keywords: meta.keywords,
        promotionalText: meta.shortDescription,
        supportUrl: meta.supportUrl,
        marketingUrl: meta.marketingUrl,
        whatsNew: meta.whatsNew,
      });
      updatedLocales.push(locale);
    }

    return updatedLocales;
  }

  /**
   * Yerel meta verileri ve ekran görüntülerini Google Play Console Developer API üzerinden eşitler.
   */
  public static async syncToGooglePlay(
    adapter: GooglePlayAssetSyncer,
    editId: string,
    metadata?: LocalStoreMetadata,
    screenshots?: LocalStoreScreenshots,
  ): Promise<AssetSyncResult> {
    const updatedLocales: string[] = [];
    let uploadedCount = 0;

    // 1. Meta Veri Listeleme Güncellemesi
    if (metadata && Object.keys(metadata.locales).length > 0) {
      const listings: GooglePlayListingItem[] = Object.entries(metadata.locales).map(
        ([locale, meta]) => ({
          language: locale,
          title: meta.title,
          shortDescription: meta.shortDescription,
          fullDescription: meta.fullDescription,
        }),
      );

      await adapter.syncListings(editId, listings);
      updatedLocales.push(...Object.keys(metadata.locales));
    }

    // 2. Ekran Görüntüleri Yükleme
    if (screenshots && screenshots.items.length > 0) {
      const androidScreenshots = screenshots.items.filter((item) => item.platform === 'android');
      for (const item of androidScreenshots) {
        const imageType =
          item.deviceType === 'phone'
            ? 'phoneScreenshots'
            : item.deviceType === 'sevenInch'
              ? 'sevenInchScreenshots'
              : 'tenInchScreenshots';

        await adapter.uploadListingImage(editId, item.locale, imageType, item.filePath);
        uploadedCount++;
      }
    }

    return {
      metadataLocalesUpdated: updatedLocales,
      screenshotsUploaded: uploadedCount,
    };
  }
}
