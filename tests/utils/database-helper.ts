/**
 * Database Helper for Tests
 * Provides utilities for setting up and tearing down test databases
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DatabaseManager } from '@main/database/Database';

export class TestDatabaseHelper {
  private db: Database.Database | null = null;
  private dbPath: string;
  private dbManager: DatabaseManager | null = null;

  constructor(testName?: string) {
    // Create unique test database for each test
    const timestamp = Date.now();
    const name = testName ? `test-${testName}-${timestamp}` : `test-${timestamp}`;
    this.dbPath = path.join(__dirname, '../.test-dbs', `${name}.db`);
  }

  /**
   * Initialize test database
   */
  async setup(): Promise<DatabaseManager> {
    // Ensure test database directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Create database manager
    this.dbManager = new DatabaseManager(this.dbPath);
    await this.dbManager.initialize();
    await this.dbManager.seedDefaultSettings();

    this.db = this.dbManager.getDb();
    return this.dbManager;
  }

  /**
   * Clean up test database
   */
  async teardown(): Promise<void> {
    if (this.dbManager) {
      this.dbManager.close();
      this.dbManager = null;
    }

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
   * Get database manager
   */
  getDbManager(): DatabaseManager {
    if (!this.dbManager) {
      throw new Error('Database manager not initialized. Call setup() first.');
    }
    return this.dbManager;
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
    if (this.dbManager) {
      await this.dbManager.seedDefaultSettings();
    }
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
