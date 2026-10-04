import type { Database } from 'better-sqlite3';
import type { AuditLogRecord } from '../types.js';

export class AuditLogRepository {
  constructor(private db: Database) {}

  public create(data: Omit<AuditLogRecord, 'id' | 'timestamp'>): AuditLogRecord {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (release_id, action, actor, result, details)
      VALUES (@releaseId, @action, @actor, @result, @details)
    `);
    const info = stmt.run({
      releaseId: data.releaseId,
      action: data.action,
      actor: data.actor,
      result: data.result,
      details: data.details,
    });

    const selectStmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        action, 
        actor, 
        timestamp, 
        result, 
        details 
      FROM audit_logs 
      WHERE id = ?
    `);
    return selectStmt.get(info.lastInsertRowid) as AuditLogRecord;
  }

  public findByReleaseId(releaseId: string): AuditLogRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        action, 
        actor, 
        timestamp, 
        result, 
        details 
      FROM audit_logs 
      WHERE release_id = ?
      ORDER BY id DESC
    `);
    return stmt.all(releaseId) as AuditLogRecord[];
  }

  public findAll(limit = 100): AuditLogRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        action, 
        actor, 
        timestamp, 
        result, 
        details 
      FROM audit_logs 
      ORDER BY id DESC LIMIT ?
    `);
    return stmt.all(limit) as AuditLogRecord[];
  }
}
