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

// Inlined schema to avoid file I/O issues in packaged (asar) builds
const SCHEMA_SQL = `
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      encrypted_password TEXT NOT NULL,
      encryption_key TEXT NOT NULL,
      encryption_iv TEXT NOT NULL,
      encryption_auth_tag TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  -- Bookings table
  CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      booking_reference TEXT UNIQUE NOT NULL,
      park_name TEXT NOT NULL,
      campground_name TEXT NOT NULL,
      site_number TEXT,
      site_type TEXT,
      arrival_date DATE NOT NULL,
      departure_date DATE NOT NULL,
      num_nights INTEGER NOT NULL,
      num_guests INTEGER NOT NULL,
      total_cost DECIMAL(10,2),
      currency TEXT DEFAULT 'AUD',
      status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled', 'pending')),
      booking_data JSON,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(booking_reference);
  CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_bookings_arrival_date ON bookings(arrival_date);
  CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(arrival_date, departure_date);

  -- Watches table
  CREATE TABLE IF NOT EXISTS watches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      park_id TEXT NOT NULL,
      park_name TEXT NOT NULL,
      campground_id TEXT NOT NULL,
      campground_name TEXT NOT NULL,
      arrival_date DATE NOT NULL,
      departure_date DATE NOT NULL,
      num_guests INTEGER NOT NULL,
      preferred_sites JSON,
      site_type TEXT,
      check_interval_minutes INTEGER DEFAULT 5,
      is_active BOOLEAN DEFAULT 1,
      last_checked_at DATETIME,
      next_check_at DATETIME,
      last_result TEXT,
      found_count INTEGER DEFAULT 0,
      auto_book BOOLEAN DEFAULT 0,
      notify_only BOOLEAN DEFAULT 1,
      max_price DECIMAL(10,2),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_watches_user_id ON watches(user_id);
  CREATE INDEX IF NOT EXISTS idx_watches_active ON watches(is_active);
  CREATE INDEX IF NOT EXISTS idx_watches_next_check ON watches(next_check_at);
  CREATE INDEX IF NOT EXISTS idx_watches_dates ON watches(arrival_date, departure_date);

  -- Skip The Queue entries table
  CREATE TABLE IF NOT EXISTS skip_the_queue_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      booking_id INTEGER NOT NULL,
      booking_reference TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      check_interval_minutes INTEGER DEFAULT 2,
      last_checked_at DATETIME,
      next_check_at DATETIME,
      attempts_count INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 1000,
      last_result TEXT,
      success_date DATETIME,
      new_booking_reference TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_stq_user_id ON skip_the_queue_entries(user_id);
  CREATE INDEX IF NOT EXISTS idx_stq_booking_id ON skip_the_queue_entries(booking_id);
  CREATE INDEX IF NOT EXISTS idx_stq_active ON skip_the_queue_entries(is_active);
  CREATE INDEX IF NOT EXISTS idx_stq_next_check ON skip_the_queue_entries(next_check_at);

  -- Notifications table
  CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('watch_found', 'stq_success', 'booking_confirmed', 'error', 'warning', 'info')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_id INTEGER,
      related_type TEXT CHECK(related_type IN ('booking', 'watch', 'stq')),
      action_url TEXT,
      is_read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
  CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
  CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

  -- Job logs table
  CREATE TABLE IF NOT EXISTS job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL CHECK(job_type IN ('watch_poll', 'stq_check', 'cleanup')),
      job_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'error')),
      message TEXT,
      error_details TEXT,
      duration_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_job_logs_type ON job_logs(job_type);
  CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
  CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_logs(status);
  CREATE INDEX IF NOT EXISTS idx_job_logs_created_at ON job_logs(created_at);

  -- Settings table
  CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      value_type TEXT NOT NULL CHECK(value_type IN ('string', 'number', 'boolean', 'json')),
      category TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

  -- Triggers for auto-updating timestamps
  CREATE TRIGGER IF NOT EXISTS update_users_timestamp
  AFTER UPDATE ON users
  BEGIN
      UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_bookings_timestamp
  AFTER UPDATE ON bookings
  BEGIN
      UPDATE bookings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_watches_timestamp
  AFTER UPDATE ON watches
  BEGIN
      UPDATE watches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_stq_timestamp
  AFTER UPDATE ON skip_the_queue_entries
  BEGIN
      UPDATE skip_the_queue_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_settings_timestamp
  AFTER UPDATE ON settings
  BEGIN
      UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
  END;
`;

export { SCHEMA_SQL };

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

  // Migration 005: Add allow_partial_match column to watches
  if (currentVersion < 5) {
    console.log('Running migration 005: Add allow_partial_match column to watches');

    const tableInfo = database.prepare('PRAGMA table_info(watches)').all() as any[];
    const hasColumn = tableInfo.some((col: any) => col.name === 'allow_partial_match');

    if (!hasColumn) {
      database.exec('ALTER TABLE watches ADD COLUMN allow_partial_match BOOLEAN DEFAULT 0');
      console.log('Added allow_partial_match column to watches table');
    } else {
      console.log('allow_partial_match column already exists');
    }

    database.prepare('INSERT INTO migrations (version) VALUES (?)').run(5);
    console.log('Migration 005 completed');
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

  // Create initial schema
  db.exec(SCHEMA_SQL);

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
