import type { AuditResult } from '@webicro/database';
import type { AuditEntry } from './types.js';

export interface AuditLogRecord {
  id: string;
  releaseId?: string;
  action: string;
  actor: string;
  result: AuditResult;
  details?: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditLogRepository {
  insert(entry: Omit<AuditLogRecord, 'id' | 'createdAt'>): AuditLogRecord | void;
  findByReleaseId(releaseId: string): AuditLogRecord[];
  findAll(limit?: number): AuditLogRecord[];
}

export class AuditLogger {
  private auditLogRepo: AuditLogRepository;

  constructor(auditLogRepo: AuditLogRepository) {
    this.auditLogRepo = auditLogRepo;
  }

  public log(entry: AuditEntry): void {
    this.auditLogRepo.insert({
      releaseId: entry.releaseId,
      action: entry.action,
      actor: entry.actor,
      result: entry.result,
      details: entry.details,
    });
  }

  public logSuccess(releaseId: string, action: string, details?: Record<string, unknown>): void {
    this.log({
      releaseId,
      action,
      actor: 'system',
      result: 'SUCCESS' as unknown as AuditResult,
      details,
    });
  }

  public logFailure(releaseId: string, action: string, error: unknown, details?: Record<string, unknown>): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    this.log({
      releaseId,
      action,
      actor: 'system',
      result: 'FAILURE' as unknown as AuditResult,
      details: { ...details, error: errorMsg },
    });
  }

  public logWarning(releaseId: string, action: string, details?: Record<string, unknown>): void {
    this.log({
      releaseId,
      action,
      actor: 'system',
      result: 'WARNING' as unknown as AuditResult,
      details,
    });
  }

  public getReleaseLogs(releaseId: string): AuditLogRecord[] {
    return this.auditLogRepo.findByReleaseId(releaseId);
  }

  public getAllLogs(limit?: number): AuditLogRecord[] {
    return this.auditLogRepo.findAll(limit);
  }
}
