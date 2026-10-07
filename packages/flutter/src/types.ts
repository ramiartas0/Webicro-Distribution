export interface FlutterDoctorResult {
  isInstalled: boolean;
  version: string | null;
  output: string;
}

export interface FlutterAnalyzeResult {
  hasErrors: boolean;
  errorCount: number;
  warningCount: number;
  output: string;
}

export interface FlutterTestResult {
  passed: boolean;
  testsPassed: number;
  testsFailed: number;
  output: string;
}

export interface PubspecInfo {
  name: string;
  version: string;
  description?: string;
}

export type ShorebirdPlatform = 'android' | 'ios-framework' | 'both';

export interface ShorebirdPatchOptions {
  targetDir?: string;
  platform: ShorebirdPlatform;
  releaseVersion?: string;
  allowUncommittedChanges?: boolean;
  dryRun?: boolean;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

export interface ShorebirdPatchResult {
  success: boolean;
  platform: ShorebirdPlatform;
  releaseVersion?: string;
  patchNumber?: number;
  output: string;
  error?: string;
}

