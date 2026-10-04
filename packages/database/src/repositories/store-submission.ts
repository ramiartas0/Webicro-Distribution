import type { Database } from 'better-sqlite3';
import type { StoreSubmissionRecord, StoreName } from '../types.js';

export class StoreSubmissionRepository {
  constructor(private db: Database) {}

  public create(
    data: Omit<StoreSubmissionRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): StoreSubmissionRecord {
    const stmt = this.db.prepare(`
      INSERT INTO store_submissions (release_id, store, version, status, external_id, error)
      VALUES (@releaseId, @store, @version, @status, @externalId, @error)
    `);
    stmt.run({
      releaseId: data.releaseId,
      store: data.store,
      version: data.version,
      status: data.status,
      externalId: data.externalId,
      error: data.error,
    });

    return this.findByReleaseAndStore(data.releaseId, data.store) as StoreSubmissionRecord;
  }

  public findByReleaseId(releaseId: string): StoreSubmissionRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        store, 
        version, 
        status, 
        external_id as externalId, 
        error, 
        created_at as createdAt, 
        updated_at as updatedAt 
      FROM store_submissions 
      WHERE release_id = ?
    `);
    return stmt.all(releaseId) as StoreSubmissionRecord[];
  }

  public findByReleaseAndStore(
    releaseId: string,
    store: StoreName,
  ): StoreSubmissionRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        store, 
        version, 
        status, 
        external_id as externalId, 
        error, 
        created_at as createdAt, 
        updated_at as updatedAt 
      FROM store_submissions 
      WHERE release_id = ? AND store = ?
    `);
    const row = stmt.get(releaseId, store);
    return row ? (row as StoreSubmissionRecord) : undefined;
  }

  public updateStatus(
    releaseId: string,
    store: StoreName,
    status: string,
    externalId?: string,
    error?: string,
  ): void {
    const stmt = this.db.prepare(`
      UPDATE store_submissions 
      SET status = ?, external_id = COALESCE(?, external_id), error = COALESCE(?, error), updated_at = CURRENT_TIMESTAMP
      WHERE release_id = ? AND store = ?
    `);
    stmt.run(status, externalId || null, error || null, releaseId, store);
  }
}
