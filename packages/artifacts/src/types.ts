export interface ArtifactManifest {
  platform: 'android' | 'ios';
  filePath: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ArtifactValidationResult {
  isValid: boolean;
  exists: boolean;
  hashMatches: boolean;
  sizeMatches: boolean;
  expectedSha256?: string;
  actualSha256?: string;
  error?: string;
}

export interface StoreLocaleMetadata {
  locale: string;
  title?: string;
  shortDescription?: string;
  fullDescription?: string;
  keywords?: string;
  whatsNew?: string;
  supportUrl?: string;
  marketingUrl?: string;
  privacyUrl?: string;
}

export interface LocalStoreMetadata {
  locales: Record<string, StoreLocaleMetadata>;
}

export interface LocalScreenshotItem {
  platform: 'android' | 'ios';
  locale: string;
  deviceType: 'phone' | 'sevenInch' | 'tenInch';
  filePath: string;
}

export interface LocalStoreScreenshots {
  items: LocalScreenshotItem[];
}

