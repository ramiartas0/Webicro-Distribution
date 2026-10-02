export interface IosBuildConfig {
  buildName: string; // "2.5.0"
  buildNumber: number; // 250
  clean?: boolean;
  exportOptionsPlist?: string;
  flavor?: string;
  dartDefines?: Record<string, string>;
}

export interface IosBuildResult {
  ipaPath: string;
  versionName: string;
  versionCode: number;
  durationMs: number;
}
