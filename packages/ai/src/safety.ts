import type { ParsedCommit } from '@webicro/git';
import type { ReleaseNotesMap } from '@webicro/validation';

export class AISafetyChecker {
  public check(notes: ReleaseNotesMap, commits: ParsedCommit[]): string[] {
    const warnings: string[] = [];

    for (const [lang, note] of Object.entries(notes)) {
      if (!note.short) {
        warnings.push(`[${lang}] Missing short description.`);
      }
      if (note.full && note.full.length === 0 && commits.length > 0) {
        warnings.push(`[${lang}] No full release notes generated despite having commits.`);
      }
      if (note.full && note.full.length > commits.length * 3) {
        warnings.push(`[${lang}] Unusually high number of release note items compared to commits, possible hallucination.`);
      }
    }

    return warnings;
  }
}
