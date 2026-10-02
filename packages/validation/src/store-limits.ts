import type { StoreLimits, ValidationResult } from './types.js';

export const STORE_LIMITS: StoreLimits = {
  googlePlay: {
    releaseNotesMaxChars: 500,
    titleMaxChars: 30,
    shortDescriptionMaxChars: 80,
    fullDescriptionMaxChars: 4000,
  },
  appStore: {
    whatsNewMaxChars: 4000,
    titleMaxChars: 30,
    subtitleMaxChars: 30,
    descriptionMaxChars: 4000,
    keywordsMaxChars: 100,
  },
};

export function validateGooglePlayReleaseNotes(text: string): ValidationResult {
  const isValid = text.length <= STORE_LIMITS.googlePlay.releaseNotesMaxChars;
  return {
    isValid,
    issues: isValid
      ? []
      : [
          {
            field: 'googlePlayReleaseNotes',
            message: `Google Play release notes exceed the maximum limit of ${STORE_LIMITS.googlePlay.releaseNotesMaxChars} characters.`,
            severity: 'error',
          },
        ],
  };
}

export function validateAppStoreWhatsNew(text: string): ValidationResult {
  const isValid = text.length <= STORE_LIMITS.appStore.whatsNewMaxChars;
  return {
    isValid,
    issues: isValid
      ? []
      : [
          {
            field: 'appStoreWhatsNew',
            message: `App Store What's New text exceeds the maximum limit of ${STORE_LIMITS.appStore.whatsNewMaxChars} characters.`,
            severity: 'error',
          },
        ],
  };
}
