import type { ParsedCommit } from '@webicro/git';
import type { AIContext } from './types.js';

export function buildAIContext(version: string, commits: ParsedCommit[], languages?: string[]): AIContext {
  const normalizedCommits = commits.map((commit) => ({
    type: commit.type ?? 'chore',
    scope: commit.scope ?? null,
    message: commit.message + (commit.body ? '\n' + commit.body : ''),
    isBreakingChange: commit.isBreakingChange,
  }));

  return {
    version,
    commits: normalizedCommits,
    languages: languages ?? ['en'],
  };
}
