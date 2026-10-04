export interface IosBuildConfig {
  buildName: string;
  buildNumber: number;
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
