export type ReleaseStatus = 'DRAFT' | 'ANALYZING' | 'PLANNED' | 'VALIDATING' | 'BUILDING' | 'ARTIFACT_READY' | 'UPLOADING' | 'STORE_PROCESSING' | 'READY_FOR_SUBMISSION' | 'SUBMITTED' | 'RELEASED' | 'FAILED';

export type StepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export type Platform = 'android' | 'ios';

export type StoreName = 'google_play' | 'app_store';

export type AuditResult = 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'WARNING';

export interface ReleaseRecord {
  id: number;
  releaseId: string;
  project: string;
  version: string;
  buildNumber: number;
  status: ReleaseStatus;
  configSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseStepRecord {
  id: number;
  releaseId: string;
  step: string;
  status: StepStatus;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  metadata: string | null;
}

export interface ArtifactRecord {
  id: number;
  releaseId: string;
  platform: Platform;
  filePath: string;
  fileName: string;
  sha256: string;
  size: number;
  status: string;
}

export interface StoreSubmissionRecord {
  id: number;
  releaseId: string;
  store: StoreName;
  version: string;
  status: string;
  externalId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: number;
  releaseId: string | null;
  action: string;
  actor: string;
  timestamp: string;
  result: AuditResult;
  details: string | null;
}
