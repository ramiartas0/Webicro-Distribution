export interface ProjectConfig {
  name: string;
  package: string;
  path?: string;
}

export interface VersionConfig {
  strategy: 'conventional-commits' | 'manual';
  autoIncrement: boolean;
}

export interface BuildConfig {
  flutterChannel: 'stable' | 'beta' | 'dev';
  clean: boolean;
  runTests: boolean;
  runAnalyze: boolean;
}

export interface AndroidConfig {
  enabled: boolean;
  track: 'internal' | 'alpha' | 'beta' | 'production';
  rollout: number;
}

export interface IosConfig {
  enabled: boolean;
  submitForReview: boolean;
  bundleId?: string;
}

export interface AiConfig {
  enabled: boolean;
  provider: 'gemini' | 'openai' | 'anthropic';
  generateReleaseNotes: boolean;
  generateLocalizations: boolean;
  languages: string[];
}

export interface StoresConfig {
  googlePlay: boolean;
  appStoreConnect: boolean;
}

export interface SecurityConfig {
  requireCleanGit: boolean;
  scanSecrets: boolean;
}

export interface DeploymentConfig {
  approvalRequired: boolean;
}

export interface NotificationsConfig {
  enabled: boolean;
  channels: string[];
}

export interface ReleaseConfig {
  project: ProjectConfig;
  version: VersionConfig;
  build: BuildConfig;
  android: AndroidConfig;
  ios: IosConfig;
  ai: AiConfig;
  stores: StoresConfig;
  security: SecurityConfig;
  deployment: DeploymentConfig;
  notifications: NotificationsConfig;
}
