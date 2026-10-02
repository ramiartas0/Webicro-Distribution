import type { ReleaseStatus } from '@webicro/database';
export type { ReleaseConfig } from '@webicro/config';
export type { VersionResolution } from '@webicro/versioning';
import type { ArtifactManifest } from '@webicro/artifacts';
import type { ReleaseNotesMap } from '@webicro/validation';

export type StepStatus = 'PENDING' | 'RUNNING' | 'IN_PROGRESS' | 'SUCCESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface OrchestratorOptions {
  configPath?: string;
  targetDir?: string;
  packageName?: string;
  bump?: 'major' | 'minor' | 'patch';
  manualVersion?: string;
  dryRun?: boolean;
  skipAndroid?: boolean;
  skipIos?: boolean;
  skipTests?: boolean;
  skipAi?: boolean;
  autoApprove?: boolean;
  googleTrack?: 'internal' | 'alpha' | 'beta' | 'production';
  rollout?: number;
  notesTr?: string;
  notesEn?: string;
  skipGit?: boolean;
  createGitTag?: boolean;
  pushGit?: boolean;
  gitCommitMessage?: string;
}

export interface ReleaseStepEvent {
  step: string;
  status: StepStatus;
  message?: string;
  error?: string;
}

export interface ReleaseExecutionSummary {
  releaseId: string;
  version: string;
  status: ReleaseStatus;
  androidArtifact?: ArtifactManifest;
  iosArtifact?: ArtifactManifest;
  googlePlayStatus?: string;
  appStoreStatus?: string;
  gitResult?: import('@webicro/git').CommitAndPushResult;
  durationMs: number;
  releaseNotes?: ReleaseNotesMap;
}

