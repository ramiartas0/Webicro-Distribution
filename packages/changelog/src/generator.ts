import type { ParsedCommit } from '@webicro/git';
import type { ChangelogOptions, ChangelogRelease, ChangelogSection } from './types.js';
import { formatReleaseMarkdown, prependToChangelogFile } from './formatter.js';

export class ChangelogGenerator {
  public generate(
    version: string,
    commits: ParsedCommit[],
    options: ChangelogOptions = {},
  ): ChangelogRelease {
    const breakingChanges: string[] = [];
    const features: string[] = [];
    const fixes: string[] = [];
    const improvements: string[] = [];

    for (const commit of commits) {
      const scope = options.includeScopes && commit.scope ? `**${commit.scope}:** ` : '';
      let message = `${scope}${commit.message}`;

      if (options.repoUrl && commit.hash) {
        const shortHash = commit.hash.substring(0, 7);
        message += ` ([${shortHash}](${options.repoUrl}/commit/${commit.hash}))`;
      }

      if (commit.isBreakingChange) {
        breakingChanges.push(message);
        continue;
      }

      switch (commit.type) {
        case 'feat':
          features.push(message);
          break;
        case 'fix':
          fixes.push(message);
          break;
        case 'perf':
        case 'refactor':
          improvements.push(message);
          break;
      }
    }

    const sections: ChangelogSection[] = [];

    if (breakingChanges.length > 0) {
      sections.push({ title: 'Breaking Changes', items: breakingChanges });
    }
    if (features.length > 0) {
      sections.push({ title: 'New Features', items: features });
    }
    if (improvements.length > 0) {
      sections.push({ title: 'Improvements & Refactoring', items: improvements });
    }
    if (fixes.length > 0) {
      sections.push({ title: 'Bug Fixes', items: fixes });
    }

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return {
      version,
      date: `${year}-${month}-${day}`,
      sections,
    };
  }

  public generateMarkdown(
    version: string,
    commits: ParsedCommit[],
    options: ChangelogOptions = {},
  ): string {
    const release = this.generate(version, commits, options);
    return formatReleaseMarkdown(release);
  }

  public async updateChangelogFile(
    filePath: string,
    version: string,
    commits: ParsedCommit[],
    options: ChangelogOptions = {},
  ): Promise<string> {
    const markdown = this.generateMarkdown(version, commits, options);
    await prependToChangelogFile(filePath, markdown);
    return markdown;
  }
}
