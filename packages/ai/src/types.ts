import type { ReleaseNotesMap } from '@webicro/validation';

export interface AIContext {
  version: string;
  commits: Array<{
    type: string;
    scope: string | null;
    message: string;
    isBreakingChange: boolean;
  }>;
  languages: string[];
}

export type AIProviderType = 'gemini' | 'openai' | 'anthropic' | 'conventional';

export interface AIProviderConfig {
  provider?: AIProviderType;
  apiKey?: string;
  model?: string;
}

export interface AIProvider {
  readonly name: string;
  generateReleaseNotes(context: AIContext): Promise<ReleaseNotesMap>;
}

export type AIDiagnosisCategory =
  | 'STORE_POLICY'
  | 'STORE_API'
  | 'APP_CODE'
  | 'NATIVE_BUILD'
  | 'SIGNING'
  | 'ENVIRONMENT'
  | 'UNKNOWN';

export type AutoFixActionType =
  | 'REMOVE_PHOTO_PERMISSIONS'
  | 'FLUTTER_CLEAN_RETRY'
  | 'FIX_SIGNING_CONFIG'
  | 'NONE';

export interface AIDiagnosisContext {
  projectName?: string;
  projectPath?: string;
  version?: string;
  failedStep?: string;
  errorText: string;
  recentLogs?: string[];
}

export interface AIDiagnosisResult {
  category: AIDiagnosisCategory;
  categoryTitle: string;
  source: 'google_play' | 'app_store' | 'flutter_code' | 'native_gradle' | 'environment' | 'unknown';
  sourceLabel: string;
  rootCause: string;
  explanation: string;
  solutionSteps: string[];
  autoFixAvailable: boolean;
  autoFixAction?: AutoFixActionType;
  autoFixDescription?: string;
}
