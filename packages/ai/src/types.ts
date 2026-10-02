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
