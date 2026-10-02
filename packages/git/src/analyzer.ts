import { simpleGit, type SimpleGit } from 'simple-git';
import type { GitAnalysis, ParsedCommit } from './types.js';
import { parseConventionalCommit, determineVersionBump } from './commit-parser.js';
import { detectNativeChanges } from './change-detector.js';

export class GitAnalyzer {
  private git: SimpleGit;

  constructor(repoPath?: string) {
    this.git = simpleGit(repoPath || process.cwd());
  }

  async analyze(): Promise<GitAnalysis> {
    const isRepository = await this.git.checkIsRepo();
    if (!isRepository) {
      throw new Error('Not a git repository');
    }

    const currentBranch = await this.getCurrentBranch();
    const clean = await this.isClean();
    const lastTag = await this.getLastTag();

    const commitsSinceLastTag = await this.getCommitsSince(lastTag || 'HEAD');
    const changedFiles = await this.getChangedFilesSince(lastTag || 'HEAD');
    const nativeChanges = detectNativeChanges(changedFiles);

    const suggestedBump = determineVersionBump(commitsSinceLastTag);

    return {
      isRepository,
      currentBranch,
      isClean: clean,
      lastTag,
      commitsSinceLastTag,
      changedFiles,
      hasNativeChanges: nativeChanges.androidChanged || nativeChanges.iosChanged,
      nativeChangedFiles: [...nativeChanges.androidFiles, ...nativeChanges.iosFiles],
      suggestedBump
    };
  }

  async getLastTag(): Promise<string | null> {
    try {
      const tags = await this.git.tags({ '--sort': '-v:refname' });
      const vTags = tags.all.filter(tag => tag.startsWith('v') || tag.match(/^\d+\.\d+\.\d+/));
      return vTags.length > 0 ? (vTags[0] ?? null) : null;
    } catch (error: unknown) {
      return null;
    }
  }

  async getCommitsSince(ref: string): Promise<ParsedCommit[]> {
    try {
      const log = ref === 'HEAD' 
        ? await this.git.log() 
        : await this.git.log({ from: ref, to: 'HEAD' });
        
      return log.all.map(commit => 
        parseConventionalCommit(commit.message + (commit.body ? '\n' + commit.body : ''), commit.hash)
      );
    } catch (error: unknown) {
      return [];
    }
  }

  private async getChangedFilesSince(ref: string): Promise<string[]> {
    try {
      if (ref === 'HEAD') return [];
      const diff = await this.git.diffSummary([`${ref}..HEAD`]);
      return diff.files.map(f => f.file);
    } catch (error: unknown) {
      return [];
    }
  }

  async isClean(): Promise<boolean> {
    try {
      const status = await this.git.status();
      return status.isClean();
    } catch (error: unknown) {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const status = await this.git.status();
      return status.current || 'unknown';
    } catch (error: unknown) {
      return 'unknown';
    }
  }
}
