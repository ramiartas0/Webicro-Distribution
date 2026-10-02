export interface GooglePlayConfig {
  packageName: string;
  serviceAccountJsonPath?: string;
  serviceAccountJson?: string;
  track?: 'internal' | 'alpha' | 'beta' | 'production';
  userFraction?: number; // 0.0 - 1.0 (e.g. 0.1 for 10% rollout)
}

export interface GooglePlayUploadResult {
  versionCode: number;
  track: string;
  userFraction: number;
  status: string;
}

export interface GooglePlayReleaseNotes {
  language: string; // e.g. "en-US", "tr-TR"
  text: string;
}
