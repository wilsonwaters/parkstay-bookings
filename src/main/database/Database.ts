/**
 * Database Class
 * Manages SQLite database connection, initialization, and migrations
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { logger } from '../utils/logger';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;
  // Database version for future migrations
  // private readonly DB_VERSION = 1;

  constructor(dbPath?: string) {
    // Use provided path or default to userData directory
    this.dbPath =
      dbPath || path.join(app.getPath('userData'), 'data', 'parkstay.db');
  }

  /**
   * Initialize database connection and run migrations
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database connection
      this.db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? logger.debug : undefined,
      });

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Set journal mode to WAL for better concurrency
      this.db.pragma('journal_mode = WAL');

      logger.info(`Database initialized at: ${this.dbPath}`);

      // Run migrations
      await this.runMigrations();

      logger.info('Database migrations completed successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check if migrations table exists
    const table = this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'`
      )
      .get();

    if (!table) {
      // Create migrations table
      this.db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Get current version
    const currentVersion =
      (this.db.prepare('SELECT MAX(version) as version FROM migrations').get() as any)
        ?.version || 0;

    // Run migrations
    if (currentVersion < 1) {
      await this.migration001_initial();
    }

    // Add more migrations here as needed
  }

  /**
   * Migration 001: Initial schema
   */
  private async migration001_initial(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    logger.info('Running migration 001: Initial schema');

    this.db.exec(`
      -- Users table
      CREATE TABLE users (
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

      CREATE INDEX idx_users_email ON users(email);

      -- Bookings table
      CREATE TABLE bookings (
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

      CREATE INDEX idx_bookings_user_id ON bookings(user_id);
      CREATE INDEX idx_bookings_reference ON bookings(booking_reference);
      CREATE INDEX idx_bookings_status ON bookings(status);
      CREATE INDEX idx_bookings_arrival_date ON bookings(arrival_date);
      CREATE INDEX idx_bookings_dates ON bookings(arrival_date, departure_date);

      -- Watches table
      CREATE TABLE watches (
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

      CREATE INDEX idx_watches_user_id ON watches(user_id);
      CREATE INDEX idx_watches_active ON watches(is_active);
      CREATE INDEX idx_watches_next_check ON watches(next_check_at);
      CREATE INDEX idx_watches_dates ON watches(arrival_date, departure_date);

      -- Skip The Queue entries table
      CREATE TABLE skip_the_queue_entries (
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

      CREATE INDEX idx_stq_user_id ON skip_the_queue_entries(user_id);
      CREATE INDEX idx_stq_booking_id ON skip_the_queue_entries(booking_id);
      CREATE INDEX idx_stq_active ON skip_the_queue_entries(is_active);
      CREATE INDEX idx_stq_next_check ON skip_the_queue_entries(next_check_at);

      -- Notifications table
      CREATE TABLE notifications (
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

      CREATE INDEX idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX idx_notifications_is_read ON notifications(is_read);
      CREATE INDEX idx_notifications_type ON notifications(type);
      CREATE INDEX idx_notifications_created_at ON notifications(created_at);

      -- Job logs table
      CREATE TABLE job_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL CHECK(job_type IN ('watch_poll', 'stq_check', 'cleanup')),
        job_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'error')),
        message TEXT,
        error_details TEXT,
        duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_job_logs_type ON job_logs(job_type);
      CREATE INDEX idx_job_logs_job_id ON job_logs(job_id);
      CREATE INDEX idx_job_logs_status ON job_logs(status);
      CREATE INDEX idx_job_logs_created_at ON job_logs(created_at);

      -- Settings table
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        value_type TEXT NOT NULL CHECK(value_type IN ('string', 'number', 'boolean', 'json')),
        category TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_settings_category ON settings(category);

      -- Triggers for updated_at
      CREATE TRIGGER update_users_timestamp
      AFTER UPDATE ON users
      BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER update_bookings_timestamp
      AFTER UPDATE ON bookings
      BEGIN
        UPDATE bookings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER update_watches_timestamp
      AFTER UPDATE ON watches
      BEGIN
        UPDATE watches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER update_stq_timestamp
      AFTER UPDATE ON skip_the_queue_entries
      BEGIN
        UPDATE skip_the_queue_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER update_settings_timestamp
      AFTER UPDATE ON settings
      BEGIN
        UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
      END;
    `);

    // Record migration
    this.db.prepare('INSERT INTO migrations (version) VALUES (?)').run(1);

    logger.info('Migration 001 completed successfully');
  }

  /**
   * Seed default settings
   */
  async seedDefaultSettings(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const settings = [
      // General
      { key: 'general.launchOnStartup', value: 'false', type: 'boolean', category: 'general' },
      { key: 'general.minimizeToTray', value: 'true', type: 'boolean', category: 'general' },
      { key: 'general.checkForUpdates', value: 'true', type: 'boolean', category: 'general' },
      // Notifications
      { key: 'notifications.enabled', value: 'true', type: 'boolean', category: 'notifications' },
      { key: 'notifications.sound', value: 'true', type: 'boolean', category: 'notifications' },
      { key: 'notifications.desktop', value: 'true', type: 'boolean', category: 'notifications' },
      {
        key: 'notifications.soundFile',
        value: 'default',
        type: 'string',
        category: 'notifications',
      },
      // Watches
      { key: 'watches.defaultInterval', value: '5', type: 'number', category: 'watches' },
      { key: 'watches.maxConcurrent', value: '10', type: 'number', category: 'watches' },
      { key: 'watches.autoBookEnabled', value: 'false', type: 'boolean', category: 'watches' },
      // STQ
      { key: 'stq.defaultInterval', value: '2', type: 'number', category: 'stq' },
      { key: 'stq.maxAttempts', value: '1000', type: 'number', category: 'stq' },
      { key: 'stq.enabled', value: 'true', type: 'boolean', category: 'stq' },
      // UI
      { key: 'ui.theme', value: 'system', type: 'string', category: 'ui' },
      { key: 'ui.language', value: 'en', type: 'string', category: 'ui' },
      { key: 'ui.dateFormat', value: 'DD/MM/YYYY', type: 'string', category: 'ui' },
      // Advanced
      { key: 'advanced.logLevel', value: 'info', type: 'string', category: 'advanced' },
      { key: 'advanced.databasePath', value: 'default', type: 'string', category: 'advanced' },
      { key: 'advanced.maxLogSize', value: '10485760', type: 'number', category: 'advanced' },
    ];

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, value_type, category)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((settings) => {
      for (const setting of settings) {
        insert.run(setting.key, setting.value, setting.type, setting.category);
      }
    });

    insertMany(settings);

    logger.info('Default settings seeded successfully');
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Database connection closed');
    }
  }

  /**
   * Backup database
   */
  async backup(backupPath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.backup(backupPath);
    logger.info(`Database backed up to: ${backupPath}`);
  }

  /**
   * Optimize database (vacuum)
   */
  async optimize(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec('VACUUM');
    logger.info('Database optimized');
  }
}

// Singleton instance
let dbInstance: DatabaseManager | null = null;

export function getDatabaseInstance(dbPath?: string): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager(dbPath);
  }
  return dbInstance;
}
