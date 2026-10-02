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

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
}

export interface AIProvider {
  readonly name: string;
  generateReleaseNotes(context: AIContext): Promise<ReleaseNotesMap>;
}
