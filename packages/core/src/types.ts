import type { ReleaseStatus } from '@webicro/database';
export type { ReleaseConfig } from '@webicro/config';
export type { VersionResolution } from '@webicro/versioning';
import type { ArtifactManifest } from '@webicro/artifacts';
import type { ReleaseNotesMap } from '@webicro/validation';
import type { CommitAndPushResult } from '@webicro/git';

export type StepStatus =
  'PENDING' | 'RUNNING' | 'IN_PROGRESS' | 'SUCCESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface OrchestratorOptions {
  configPath?: string;
  targetDir?: string;
  packageName?: string;
  iosBundleId?: string;
  bump?: 'major' | 'minor' | 'patch';
  manualVersion?: string;
  validateOnly?: boolean;
  buildOnly?: boolean;
  skipFlutterCheck?: boolean;
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
  submitForReview?: boolean;
  androidVersion?: string;
  androidBuildNumber?: number;
  iosVersion?: string;
  iosBuildNumber?: number;
  decoupledVersions?: boolean;
  signal?: AbortSignal;
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
  gitResult?: CommitAndPushResult;
  durationMs: number;
  releaseNotes?: ReleaseNotesMap;
}
