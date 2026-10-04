export interface GooglePlayConfig {
  packageName: string;
  serviceAccountJsonPath?: string;
  serviceAccountJson?: string;
  track?: 'internal' | 'alpha' | 'beta' | 'production';
  userFraction?: number;
}

export interface GooglePlayUploadResult {
  versionCode: number;
  track: string;
  userFraction: number;
  status: string;
}

export interface GooglePlayReleaseNotes {
  language: string;
  text: string;
}

export interface GooglePlaySafeTrackResult {
  status: 'found' | 'not_found' | 'auth_error' | 'error';
  versionCode?: number;
  versionName?: string;
  track?: string;
  statusRelease?: string;
  releaseNotes?: GooglePlayReleaseNotes[];
  message?: string;
}
