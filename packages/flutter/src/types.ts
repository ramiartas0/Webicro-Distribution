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
