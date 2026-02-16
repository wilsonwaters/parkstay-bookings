/**
 * Database Connection & Migrations
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR DATABASE INITIALIZATION AND MIGRATIONS.
 * All migrations should be added to the runMigrations() function below.
 *
 * To add a new migration:
 * 1. Check the current max version in runMigrations()
 * 2. Add a new `if (currentVersion < N)` block with your migration
 * 3. Always INSERT the new version number into the migrations table at the end
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database | null = null;

/**
 * Run database migrations
 * Add new migrations at the bottom of this function
 */
export function runMigrations(database: Database.Database): void {
  // Create migrations table if it doesn't exist
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get current version
  const currentVersion =
    (database.prepare('SELECT MAX(version) as version FROM migrations').get() as any)?.version || 0;

  console.log(`Current database migration version: ${currentVersion}`);

  // Migration 002: Add last_availability column to watches
  if (currentVersion < 2) {
    console.log('Running migration 002: Add last_availability column');

    // Check if column already exists
    const tableInfo = database.prepare('PRAGMA table_info(watches)').all() as any[];
    const hasColumn = tableInfo.some((col: any) => col.name === 'last_availability');

    if (!hasColumn) {
      database.exec('ALTER TABLE watches ADD COLUMN last_availability JSON');
      console.log('Added last_availability column to watches table');
    } else {
      console.log('last_availability column already exists');
    }

    // Record migration (use INSERT OR IGNORE in case version 1 wasn't recorded)
    database.prepare('INSERT OR IGNORE INTO migrations (version) VALUES (?)').run(1);
    database.prepare('INSERT INTO migrations (version) VALUES (?)').run(2);
    console.log('Migration 002 completed');
  }

  // Migration 003: Add notification providers tables
  if (currentVersion < 3) {
    console.log('Running migration 003: Add notification providers tables');

    database.exec(`
      -- Notification providers table
      CREATE TABLE IF NOT EXISTS notification_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 0,
        config JSON NOT NULL,
        status TEXT DEFAULT 'not_configured',
        last_tested_at DATETIME,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notification_providers_channel ON notification_providers(channel);
      CREATE INDEX IF NOT EXISTS idx_notification_providers_enabled ON notification_providers(enabled);

      -- Notification delivery logs table
      CREATE TABLE IF NOT EXISTS notification_delivery_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INTEGER,
        provider_channel TEXT NOT NULL,
        status TEXT NOT NULL,
        message_id TEXT,
        error_message TEXT,
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (notification_id) REFERENCES notifications(id)
      );

      CREATE INDEX IF NOT EXISTS idx_delivery_logs_notification_id ON notification_delivery_logs(notification_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_provider ON notification_delivery_logs(provider_channel);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON notification_delivery_logs(status);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_created_at ON notification_delivery_logs(created_at);
    `);

    database.prepare('INSERT INTO migrations (version) VALUES (?)').run(3);
    console.log('Migration 003 completed');
  }

  // Migration 004: Add queue_session table for persisting queue position
  if (currentVersion < 4) {
    console.log('Running migration 004: Add queue_session table');

    database.exec(`
      -- Queue session table for persisting queue position across restarts
      CREATE TABLE IF NOT EXISTS queue_session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        session_key TEXT NOT NULL,
        status TEXT DEFAULT 'Unknown',
        position INTEGER DEFAULT 0,
        estimated_wait_seconds INTEGER DEFAULT 0,
        expiry_seconds INTEGER DEFAULT 0,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    database.prepare('INSERT INTO migrations (version) VALUES (?)').run(4);
    console.log('Migration 004 completed');
  }
}

/**
 * Initialize database connection and create tables
 */
export function initializeDatabase(): Database.Database {
  if (db) {
    return db;
  }

  // Determine database path
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'parkstay.db');

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  // Create database connection
  db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  });

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Load and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Run migrations
  runMigrations(db);

  console.log(`Database initialized at: ${dbPath}`);

  return db;
}

/**
 * Get database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Set the database instance (for testing only)
 */
export function setDatabase(database: Database.Database | null): void {
  db = database;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}

/**
 * Execute a raw SQL query
 */
export function query<T = any>(sql: string, params?: any[]): T[] {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  return stmt.all(params) as T[];
}

/**
 * Execute a single SQL query and return first result
 */
export function queryOne<T = any>(sql: string, params?: any[]): T | undefined {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  return stmt.get(params) as T | undefined;
}

/**
 * Execute SQL query without returning results
 */
export function execute(sql: string, params?: any[]): Database.RunResult {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  return stmt.run(params);
}

/**
 * Begin a transaction
 */
export function beginTransaction(): void {
  getDatabase().prepare('BEGIN TRANSACTION').run();
}

/**
 * Commit a transaction
 */
export function commitTransaction(): void {
  getDatabase().prepare('COMMIT').run();
}

/**
 * Rollback a transaction
 */
export function rollbackTransaction(): void {
  getDatabase().prepare('ROLLBACK').run();
}

/**
 * Execute operations in a transaction
 */
export function withTransaction<T>(callback: () => T): T {
  const database = getDatabase();
  const transaction = database.transaction(callback);
  return transaction();
}
