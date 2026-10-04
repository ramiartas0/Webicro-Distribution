import type { Database } from 'better-sqlite3';
import type { ReleaseStepRecord, StepStatus } from '../types.js';

export class ReleaseStepRepository {
  constructor(private db: Database) {}

  public create(data: Omit<ReleaseStepRecord, 'id'>): ReleaseStepRecord {
    const stmt = this.db.prepare(`
      INSERT INTO release_steps (release_id, step, status, started_at, completed_at, error, metadata)
      VALUES (@releaseId, @step, @status, @startedAt, @completedAt, @error, @metadata)
    `);
    stmt.run({
      releaseId: data.releaseId,
      step: data.step,
      status: data.status,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      error: data.error,
      metadata: data.metadata,
    });

    return this.findByReleaseId(data.releaseId).find(
      (s) => s.step === data.step,
    ) as ReleaseStepRecord;
  }

  public findByReleaseId(releaseId: string): ReleaseStepRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        step, 
        status, 
        started_at as startedAt, 
        completed_at as completedAt, 
        error, 
        metadata 
      FROM release_steps 
      WHERE release_id = ?
      ORDER BY id ASC
    `);
    return stmt.all(releaseId) as ReleaseStepRecord[];
  }

  public updateStatus(releaseId: string, step: string, status: StepStatus, error?: string): void {
    const stmt = this.db.prepare(`
      UPDATE release_steps 
      SET status = ?, error = COALESCE(?, error)
      WHERE release_id = ? AND step = ?
    `);
    stmt.run(status, error || null, releaseId, step);
  }

  public markStarted(releaseId: string, step: string): void {
    const stmt = this.db.prepare(`
      UPDATE release_steps 
      SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP 
      WHERE release_id = ? AND step = ?
    `);
    stmt.run(releaseId, step);
  }

  public markCompleted(releaseId: string, step: string, metadata?: string): void {
    const stmt = this.db.prepare(`
      UPDATE release_steps 
      SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, metadata = COALESCE(?, metadata)
      WHERE release_id = ? AND step = ?
    `);
    stmt.run(metadata || null, releaseId, step);
  }

  public markFailed(releaseId: string, step: string, error: string): void {
    const stmt = this.db.prepare(`
      UPDATE release_steps 
      SET status = 'FAILED', error = ?
      WHERE release_id = ? AND step = ?
    `);
    stmt.run(error, releaseId, step);
  }
}
