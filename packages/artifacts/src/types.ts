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
