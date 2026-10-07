export interface AppStoreConfig {
  keyId: string;
  issuerId: string;
  privateKeyPath?: string;
  privateKeyContent?: string;
  bundleId: string;
}

export interface AppStoreUploadResult {
  buildId: string;
  version: string;
  buildNumber: string;
  status: string;
  submittedForReview: boolean;
}

export interface AppStoreVersionStatusResult {
  versionId: string;
  versionString: string;
  appStoreState: string;
  rawState?: string;
  rejectionReasons?: string[];
}

export interface AppStoreMetadataLocalization {
  locale: string;
  whatsNew?: string;
  description?: string;
  keywords?: string;
  promotionalText?: string;
  supportUrl?: string;
  marketingUrl?: string;
}

export interface AppStoreCertificateInfo {
  id: string;
  name: string;
  certificateType: string;
  expirationDate: string;
  daysRemaining: number;
  isExpired: boolean;
  platform?: string;
}

export interface AppStoreProfileInfo {
  id: string;
  name: string;
  profileType: string;
  expirationDate: string;
  daysRemaining: number;
  isExpired: boolean;
  profileState: string;
}

export interface AppStoreUploadHooks {
  /** Abort edildiginde altool sureci sonlandirilir ve build polling durur. */
  signal?: AbortSignal;
  /** altool ciktisi ve Apple build isleme durumu icin canli ilerleme mesajlari. */
  onProgress?: (message: string) => void;
}

