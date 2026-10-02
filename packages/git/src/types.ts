export type CommitType = 'feat' | 'fix' | 'perf' | 'refactor' | 'docs' | 'test' | 'chore' | 'ci' | 'style' | 'build' | 'revert' | 'unknown';

export type VersionBump = 'major' | 'minor' | 'patch' | 'none';

export interface ParsedCommit {
  hash: string;
  type: CommitType;
  scope: string | null;
  message: string;
  body: string | null;
  isBreakingChange: boolean;
  raw: string;
}

export interface GitAnalysis {
  isRepository: boolean;
  currentBranch: string;
  isClean: boolean;
  uncommittedFiles?: string[];
  lastTag: string | null;
  commitsSinceLastTag: ParsedCommit[];
  changedFiles: string[];
  hasNativeChanges: boolean;
  nativeChangedFiles: string[];
  suggestedBump: VersionBump;
}

export interface NativeChangeInfo {
  androidChanged: boolean;
  iosChanged: boolean;
  androidFiles: string[];
  iosFiles: string[];
}
