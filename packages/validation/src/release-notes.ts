import { z } from 'zod';
import type { ReleaseNotesMap, ValidationResult, ValidationIssue } from './types.js';
import { validateGooglePlayReleaseNotes, validateAppStoreWhatsNew } from './store-limits.js';
import { SensitiveDataScanner } from './sensitive-data.js';
import { ForbiddenContentScanner } from './forbidden-terms.js';

const LocalizedReleaseNotesSchema = z.object({
  short: z.string().optional(),
  full: z.array(z.string()).min(1, 'Full release notes cannot be empty'),
});

const ReleaseNotesMapSchema = z.record(LocalizedReleaseNotesSchema);

export class ReleaseNotesValidator {
  private sensitiveScanner = new SensitiveDataScanner();
  private forbiddenScanner = new ForbiddenContentScanner();

  public validate(notesMap: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];

    const parseResult = ReleaseNotesMapSchema.safeParse(notesMap);
    if (!parseResult.success) {
      for (const error of parseResult.error.errors) {
        issues.push({
          field: error.path.join('.'),
          message: error.message,
          severity: 'error',
        });
      }
      return { isValid: false, issues };
    }

    const validNotes = parseResult.data as ReleaseNotesMap;

    for (const [lang, notes] of Object.entries(validNotes)) {
      if (notes.short) {
        const shortGoogleRes = validateGooglePlayReleaseNotes(notes.short);
        issues.push(...shortGoogleRes.issues.map((i) => ({ ...i, field: `${lang}.short` })));

        issues.push(
          ...this.sensitiveScanner.scan(notes.short).map((i) => ({ ...i, field: `${lang}.short` })),
        );
        issues.push(
          ...this.forbiddenScanner.scan(notes.short).map((i) => ({ ...i, field: `${lang}.short` })),
        );
      }

      const fullText = notes.full.join('\\n');

      const fullGoogleRes = validateGooglePlayReleaseNotes(fullText);
      issues.push(
        ...fullGoogleRes.issues.map((i) => ({ ...i, field: `${lang}.full (Google Play)` })),
      );

      const fullAppleRes = validateAppStoreWhatsNew(fullText);
      issues.push(...fullAppleRes.issues.map((i) => ({ ...i, field: `${lang}.full (App Store)` })));

      issues.push(
        ...this.sensitiveScanner.scan(fullText).map((i) => ({ ...i, field: `${lang}.full` })),
      );
      issues.push(
        ...this.forbiddenScanner.scan(fullText).map((i) => ({ ...i, field: `${lang}.full` })),
      );
    }

    const errorIssues = issues.filter((i) => i.severity === 'error');

    return {
      isValid: errorIssues.length === 0,
      issues,
    };
  }
}
