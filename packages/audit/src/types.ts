import type { AuditResult } from '@webicro/database';

export interface AuditEntry {
  releaseId?: string;
  action: string;
  actor: string;
  result: AuditResult;
  details?: Record<string, unknown>;
}
