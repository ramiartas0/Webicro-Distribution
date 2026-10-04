import type { ParsedCommit, CommitType, VersionBump } from './types.js';

export function parseConventionalCommit(rawMessage: string, hash: string): ParsedCommit {
  const lines = rawMessage.trim().split('\n');
  const header = lines[0] || '';
  const body = lines.length > 1 ? lines.slice(1).join('\n').trim() : null;

  const regex = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s+(?<message>.+)$/;
  const match = header.match(regex);

  const knownTypes: string[] = [
    'feat',
    'fix',
    'perf',
    'refactor',
    'docs',
    'test',
    'chore',
    'ci',
    'style',
    'build',
    'revert',
  ];
  let isBreakingChange = false;

  if (body && body.includes('BREAKING CHANGE')) {
    isBreakingChange = true;
  }

  if (!match || !match.groups) {
    return {
      hash,
      type: 'unknown',
      scope: null,
      message: header,
      body,
      isBreakingChange,
      raw: rawMessage,
    };
  }

  const { type, scope, breaking, message } = match.groups;

  if (breaking === '!') {
    isBreakingChange = true;
  }

  const commitType = knownTypes.includes(type as string) ? (type as CommitType) : 'unknown';

  return {
    hash,
    type: commitType,
    scope: scope || null,
    message: (message as string).trim(),
    body,
    isBreakingChange,
    raw: rawMessage,
  };
}

export function determineVersionBump(commits: ParsedCommit[]): VersionBump {
  let hasFeature = false;
  let hasFix = false;

  for (const commit of commits) {
    if (commit.isBreakingChange) {
      return 'major';
    }
    if (commit.type === 'feat') {
      hasFeature = true;
    }
    if (commit.type === 'fix' || commit.type === 'perf') {
      hasFix = true;
    }
  }

  if (hasFeature) return 'minor';
  if (hasFix) return 'patch';
  return 'none';
}

export function categorizeCommits(commits: ParsedCommit[]): Record<CommitType, ParsedCommit[]> {
  const result: Record<CommitType, ParsedCommit[]> = {
    feat: [],
    fix: [],
    perf: [],
    refactor: [],
    docs: [],
    test: [],
    chore: [],
    ci: [],
    style: [],
    build: [],
    revert: [],
    unknown: [],
  };

  for (const commit of commits) {
    if (result[commit.type]) {
      result[commit.type].push(commit);
    } else {
      result.unknown.push(commit);
    }
  }

  return result;
}
