/**
 * Database Helper for Tests
 * Provides utilities for setting up and tearing down test databases
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { FixtureName } from '@tests/fixtures/db/constants';
import { runMigrations, setDatabase, SCHEMA_SQL } from '@main/database/connection';

export class TestDatabaseHelper {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(testName?: string) {
    // Create unique test database for each test
    const timestamp = Date.now();
    const name = testName ? `test-${testName}-${timestamp}` : `test-${timestamp}`;
    this.dbPath = path.join(__dirname, '../.test-dbs', `${name}.db`);
  }

  /**
   * Initialize test database
   */
  async setup(): Promise<Database.Database> {
    // Ensure test database directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Execute the production schema
    this.db.exec(SCHEMA_SQL);

    // Run production migrations
    runMigrations(this.db);

    // Set as global db so repos using getDatabase() work
    setDatabase(this.db);

    return this.db;
  }

  /**
   * Clean up test database
   */
  async teardown(): Promise<void> {
    setDatabase(null);
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    // Delete test database file
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }

    // Clean up WAL and SHM files
    const walPath = `${this.dbPath}-wal`;
    const shmPath = `${this.dbPath}-shm`;
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  }

  /**
   * Get database instance
   */
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call setup() first.');
    }
    return this.db;
  }

  /**
   * Get database manager (deprecated - use getDb() instead)
   */
  getDbManager(): Database.Database {
    return this.getDb();
  }

  /**
   * Clear all data from database (keeps schema)
   */
  clearAllData(): void {
    if (!this.db) return;

    const tables = [
      'notifications',
      'job_logs',
      'skip_the_queue_entries',
      'watches',
      'bookings',
      'users',
      'settings',
    ];

    for (const table of tables) {
      try {
        this.db.prepare(`DELETE FROM ${table}`).run();
      } catch (error) {
        // Table might not exist, ignore
      }
    }
  }

  /**
   * Reset database to initial state
   */
  async reset(): Promise<void> {
    this.clearAllData();
  }

  /**
   * Create in-memory database (faster for simple tests)
   */
  static createInMemory(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    return db;
  }

  /**
   * Clean up all test databases in the test directory
   */
  static cleanupAllTestDbs(): void {
    const testDbDir = path.join(__dirname, '../.test-dbs');
    if (fs.existsSync(testDbDir)) {
      const files = fs.readdirSync(testDbDir);
      for (const file of files) {
        const filePath = path.join(testDbDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // Ignore errors
        }
      }
    }
  }
}

/**
 * Helper to run tests with a clean database
 */
export async function withTestDb<T>(
  testName: string,
  testFn: (dbHelper: TestDatabaseHelper) => Promise<T>
): Promise<T> {
  const dbHelper = new TestDatabaseHelper(testName);
  try {
    await dbHelper.setup();
    return await testFn(dbHelper);
  } finally {
    await dbHelper.teardown();
  }
}

const FIXTURE_DIR = path.join(__dirname, '../fixtures/db');

/**
 * Replays a schema-fixture SQL dump (`tests/fixtures/db/<name>.sql`) into a fresh database
 * file in its own temp directory. Foreign keys are OFF, as for any freshly opened connection,
 * so the dump replays exactly as written (including the v6 FK to "notifications_old").
 * Release it with `disposeFixture`.
 */
export function loadFixture(name: FixtureName): Database.Database {
  const sql = fs.readFileSync(path.join(FIXTURE_DIR, `${name}.sql`), 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-stay-fixture-'));
  const db = new Database(path.join(dir, `${name}.db`));
  db.pragma('foreign_keys = OFF');
  db.exec(sql);
  return db;
}

/** Closes a database opened by `loadFixture` and deletes its temp directory. */
export function disposeFixture(db: Database.Database): void {
  if (db.open) db.close();
  fs.rmSync(path.dirname(db.name), { recursive: true, force: true });
}
