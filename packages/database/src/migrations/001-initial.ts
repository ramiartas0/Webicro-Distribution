import type { Database } from 'better-sqlite3';

export const up = (db: Database): void => {
  db.exec(`
    CREATE TABLE releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id TEXT NOT NULL UNIQUE,
      project TEXT NOT NULL,
      version TEXT NOT NULL,
      build_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      config_snapshot TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE release_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id TEXT NOT NULL,
      step TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at DATETIME,
      completed_at DATETIME,
      error TEXT,
      metadata TEXT,
      FOREIGN KEY(release_id) REFERENCES releases(release_id) ON DELETE CASCADE,
      UNIQUE(release_id, step)
    );

    CREATE TABLE artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size INTEGER NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY(release_id) REFERENCES releases(release_id) ON DELETE CASCADE
    );

    CREATE TABLE store_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id TEXT NOT NULL,
      store TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      external_id TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(release_id) REFERENCES releases(release_id) ON DELETE CASCADE,
      UNIQUE(release_id, store)
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id TEXT,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      result TEXT NOT NULL,
      details TEXT,
      FOREIGN KEY(release_id) REFERENCES releases(release_id) ON DELETE SET NULL
    );

    CREATE INDEX idx_release_steps_release_id ON release_steps(release_id);
    CREATE INDEX idx_artifacts_release_id ON artifacts(release_id);
    CREATE INDEX idx_store_submissions_release_id ON store_submissions(release_id);
    CREATE INDEX idx_audit_logs_release_id ON audit_logs(release_id);
  `);
};

export const down = (db: Database): void => {
  db.exec(`
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS store_submissions;
    DROP TABLE IF EXISTS artifacts;
    DROP TABLE IF EXISTS release_steps;
    DROP TABLE IF EXISTS releases;
  `);
};
