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
