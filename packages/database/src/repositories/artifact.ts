import type { Database } from 'better-sqlite3';
import type { ArtifactRecord, Platform } from '../types.js';

export class ArtifactRepository {
  constructor(private db: Database) {}

  public create(data: Omit<ArtifactRecord, 'id'>): ArtifactRecord {
    const stmt = this.db.prepare(`
      INSERT INTO artifacts (release_id, platform, file_path, file_name, sha256, size, status)
      VALUES (@releaseId, @platform, @filePath, @fileName, @sha256, @size, @status)
    `);
    const info = stmt.run({
      releaseId: data.releaseId,
      platform: data.platform,
      filePath: data.filePath,
      fileName: data.fileName,
      sha256: data.sha256,
      size: data.size,
      status: data.status,
    });

    const selectStmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        platform, 
        file_path as filePath, 
        file_name as fileName, 
        sha256, 
        size, 
        status 
      FROM artifacts 
      WHERE id = ?
    `);
    return selectStmt.get(info.lastInsertRowid) as ArtifactRecord;
  }

  public findByReleaseId(releaseId: string): ArtifactRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        platform, 
        file_path as filePath, 
        file_name as fileName, 
        sha256, 
        size, 
        status 
      FROM artifacts 
      WHERE release_id = ?
    `);
    return stmt.all(releaseId) as ArtifactRecord[];
  }

  public findByReleaseAndPlatform(
    releaseId: string,
    platform: Platform,
  ): ArtifactRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        release_id as releaseId, 
        platform, 
        file_path as filePath, 
        file_name as fileName, 
        sha256, 
        size, 
        status 
      FROM artifacts 
      WHERE release_id = ? AND platform = ?
    `);
    const row = stmt.get(releaseId, platform);
    return row ? (row as ArtifactRecord) : undefined;
  }
}
