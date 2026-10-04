import type { Database } from 'better-sqlite3';
import type { ReleaseRecord, ReleaseStatus } from '../types.js';

export class ReleaseRepository {
  constructor(private db: Database) {}

  public create(data: Omit<ReleaseRecord, 'id' | 'createdAt' | 'updatedAt'>): ReleaseRecord {
    const stmt = this.db.prepare(`
      INSERT INTO releases (release_id, project, version, build_number, status, config_snapshot)
      VALUES (@releaseId, @project, @version, @buildNumber, @status, @configSnapshot)
    `);
    stmt.run({
      releaseId: data.releaseId,
      project: data.project,
      version: data.version,
      buildNumber: data.buildNumber,
      status: data.status,
      configSnapshot: data.configSnapshot,
    });
    return this.findByReleaseId(data.releaseId) as ReleaseRecord;
  }

  public findByReleaseId(releaseId: string): ReleaseRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        project, 
        version, 
        build_number as buildNumber, 
        status, 
        config_snapshot as configSnapshot, 
        created_at as createdAt, 
        updated_at as updatedAt 
      FROM releases 
      WHERE release_id = ?
    `);
    const row = stmt.get(releaseId);
    return row ? (row as ReleaseRecord) : undefined;
  }

  public findLatest(): ReleaseRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        project, 
        version, 
        build_number as buildNumber, 
        status, 
        config_snapshot as configSnapshot, 
        created_at as createdAt, 
        updated_at as updatedAt 
      FROM releases 
      ORDER BY id DESC LIMIT 1
    `);
    const row = stmt.get();
    return row ? (row as ReleaseRecord) : undefined;
  }

  public updateStatus(releaseId: string, status: ReleaseStatus): void {
    const stmt = this.db.prepare(`
      UPDATE releases 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE release_id = ?
    `);
    stmt.run(status, releaseId);
  }

  public updateVersionAndBuildNumber(
    releaseId: string,
    version: string,
    buildNumber: number,
  ): void {
    const stmt = this.db.prepare(`
      UPDATE releases 
      SET version = ?, build_number = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE release_id = ?
    `);
    stmt.run(version, buildNumber, releaseId);
  }

  public findAll(limit = 100): ReleaseRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        project, 
        version, 
        build_number as buildNumber, 
        status, 
        config_snapshot as configSnapshot, 
        created_at as createdAt, 
        updated_at as updatedAt 
      FROM releases 
      ORDER BY id DESC LIMIT ?
    `);
    return stmt.all(limit) as ReleaseRecord[];
  }
}
