export interface AndroidBuildConfig {
  buildName: string; // e.g. "2.5.0"
  buildNumber: number; // e.g. 250
  clean?: boolean;
  flavor?: string;
  target?: string;
  dartDefines?: Record<string, string>;
}

export interface AndroidBuildResult {
  aabPath: string;
  versionName: string;
  versionCode: number;
  durationMs: number;
}
