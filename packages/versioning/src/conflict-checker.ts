import { simpleGit } from 'simple-git';
import type { SemanticVersion, VersionConflict } from './types.js';
import { formatVersion } from './semver.js';

export class VersionConflictChecker {
  async checkGitTags(version: string, repoPath?: string): Promise<VersionConflict | null> {
    try {
      const git = simpleGit(repoPath || process.cwd());
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return null;

      const tags = await git.tags();
      const targetTag = `v${version}`;
      const bareTag = version;

      if (tags.all.includes(targetTag) || tags.all.includes(bareTag)) {
        return {
          source: 'git_tag',
          existingVersion: version,
          existingBuildNumber: 0,
          conflictType: 'version_exists'
        };
      }

      return null;
    } catch (error: unknown) {
      return null;
    }
  }

  async checkAll(version: SemanticVersion, checks: { gitTags?: boolean }): Promise<VersionConflict[]> {
    const conflicts: VersionConflict[] = [];
    const versionString = `${version.major}.${version.minor}.${version.patch}`;

    if (checks.gitTags) {
      const gitConflict = await this.checkGitTags(versionString);
      if (gitConflict) {
        conflicts.push(gitConflict);
      }
    }

    return conflicts;
  }
}
