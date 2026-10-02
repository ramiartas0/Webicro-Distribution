export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}

export interface LocalizedReleaseNotes {
  short?: string;
  full: string[];
}

export type ReleaseNotesMap = Record<string, LocalizedReleaseNotes>;

export interface StoreLimits {
  googlePlay: {
    releaseNotesMaxChars: number;
    titleMaxChars: number;
    shortDescriptionMaxChars: number;
    fullDescriptionMaxChars: number;
  };
  appStore: {
    whatsNewMaxChars: number;
    titleMaxChars: number;
    subtitleMaxChars: number;
    descriptionMaxChars: number;
    keywordsMaxChars: number;
  };
}
