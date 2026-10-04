export interface AndroidBuildConfig {
  buildName: string;
  buildNumber: number;
  clean?: boolean;
  flavor?: string;
  target?: string;
  dartDefines?: Record<string, string>;
  onLog?: (line: string) => void;
}

export interface AndroidBuildResult {
  aabPath: string;
  versionName: string;
  versionCode: number;
  durationMs: number;
}
