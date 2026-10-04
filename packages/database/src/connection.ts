import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { up as initialMigrationUp } from './migrations/001-initial.js';

export class DatabaseConnection {
  private db: DatabaseType;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  public getDb(): DatabaseType {
    return this.db;
  }

  public close(): void {
    this.db.close();
  }

  public runMigrations(): void {

    const createMigrationsTable = this.db.prepare(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        run_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createMigrationsTable.run();

    const checkMigration = this.db.prepare('SELECT id FROM migrations WHERE name = ?');
    const insertMigration = this.db.prepare('INSERT INTO migrations (name) VALUES (?)');

    if (!checkMigration.get('001-initial')) {
      this.db.transaction(() => {
        initialMigrationUp(this.db);
        insertMigration.run('001-initial');
      })();
    }
  }
}
