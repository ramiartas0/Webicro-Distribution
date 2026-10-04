import type { ValidationIssue } from './types.js';

export class ForbiddenContentScanner {
  private readonly forbiddenTerms = ['TODO', 'test release', 'dummy', 'fake', 'fix bug #unknown'];

  public scan(text: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lowerText = text.toLowerCase();

    for (const term of this.forbiddenTerms) {
      if (lowerText.includes(term.toLowerCase())) {
        issues.push({
          field: 'content',
          message: `Forbidden term detected: "${term}" should not be included in release notes.`,
          severity: 'warning',
        });
      }
    }

    return issues;
  }
}
