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

export interface AppStoreUploadHooks {
  /** Abort edildiginde altool sureci sonlandirilir ve build polling durur. */
  signal?: AbortSignal;
  /** altool ciktisi ve Apple build isleme durumu icin canli ilerleme mesajlari. */
  onProgress?: (message: string) => void;
}
