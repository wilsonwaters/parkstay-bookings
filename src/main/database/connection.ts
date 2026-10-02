/**
 * Database Connection & Migrations
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR DATABASE INITIALIZATION AND MIGRATIONS.
 * All migrations live in the runMigrations() function below.
 *
 * To add a new migration:
 * 1. Bump LATEST_SCHEMA_VERSION to the new version N
 * 2. Add a new `if (currentVersion < N)` block at the bottom of runMigrations()
 * 3. Wrap its body in applyMigration(db, N, [tables it creates or rebuilds], () => { ... }).
 *    applyMigration runs the body and records version N in one transaction. The listed
 *    tables must be free of foreign-key violations when it commits, and the step may not
 *    introduce a violation in any other table (see assertForeignKeys).
 *
 * This module never imports the app shell: the caller passes the database file path.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/** Schema version this build creates and understands. */
export const LATEST_SCHEMA_VERSION = 7;

/** A migration step failed. Its transaction was rolled back, so the database is still at the previous version. */
export class MigrationError extends Error {
  readonly version: number;

  constructor(version: number, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Database migration ${version} failed: ${reason}`, { cause });
    this.name = 'MigrationError';
    this.version = version;
  }
}

/** The database was written by a newer build. Nothing is migrated: this build does not know that schema. */
export class DatabaseTooNewError extends Error {
  readonly version: number;
  readonly supportedVersion: number;

  constructor(version: number, supportedVersion: number) {
    super(
      `Database schema version ${version} is newer than this app supports (${supportedVersion}). ` +
        'Install the latest version of the app to open it.'
    );
    this.name = 'DatabaseTooNewError';
    this.version = version;
    this.supportedVersion = supportedVersion;
  }
}

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

interface ForeignKeyViolation {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
}

/** "child -> parent (count)" for each table pair, e.g. "notification_delivery_logs -> notifications_old (1)". */
function summariseViolations(violations: ForeignKeyViolation[]): string {
  const counts = new Map<string, number>();
  for (const v of violations) {
    const pair = `${v.table} -> ${v.parent}`;
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return [...counts].map(([pair, n]) => `${pair} (${n})`).join(', ');
}

/**
 * The first migration held to the strict foreign-key rule (see assertForeignKeys).
 * v1-v6 are the historic steps: their SQL is frozen as released, and v6 is known to break
 * the delivery-log FK, which v7 repairs.
 */
const STRICT_FK_FROM_VERSION = 7;

function readViolations(db: Database.Database): ForeignKeyViolation[] {
  return db.pragma('foreign_key_check') as ForeignKeyViolation[];
}

/** Identity of a violation: the same child row, FK and parent table. */
function violationKey(v: ForeignKeyViolation): string {
  return JSON.stringify([v.table, v.rowid, v.fkid, v.parent]);
}

/**
 * Runs `PRAGMA foreign_key_check` at the end of migration `version` and compares it with
 * `baseline`, the check taken just before the step ran (same transaction). The rule:
 *
 * 1. **The step's own tables must be fully clean.** Any violation in, or pointing at, one of
 *    `checkedTables` is fatal, even one that is in the baseline. A step that creates or
 *    rebuilds a table controls every row it writes there, so it must leave it clean. This is
 *    what proves v7 actually repairs the delivery-log FK that v6 broke: without it, that
 *    violation would be "pre-existing" from v7's point of view and only warned about.
 * 2. **From STRICT_FK_FROM_VERSION (v7) on, a step may not introduce a violation anywhere.**
 *    A violation that is not in the baseline is fatal in any table, listed or not.
 * 3. **A historic step (v1-v6) that introduces a violation outside its own tables only warns.**
 *    Their SQL is frozen, and v6 breaks `notification_delivery_logs -> notifications_old` on
 *    every database that has delivery logs. A later step of the same run (v7) repairs it,
 *    and rule 1 makes v7 prove it did, so a v5 -> v7 upgrade succeeds.
 * 4. **Pre-existing violations outside the step's own tables only warn.** That is old orphan
 *    data the step did not cause, and it must not brick startup.
 */
function assertForeignKeys(
  db: Database.Database,
  version: number,
  checkedTables: readonly string[],
  baseline: readonly ForeignKeyViolation[]
): void {
  const before = new Set(baseline.map(violationKey));
  const after = readViolations(db);
  const own = after.filter(
    (v) => checkedTables.includes(v.table) || checkedTables.includes(v.parent)
  );
  const other = after.filter((v) => !own.includes(v));
  const introduced = other.filter((v) => !before.has(violationKey(v)));
  const preExisting = other.filter((v) => before.has(violationKey(v)));

  if (own.length > 0) {
    throw new Error(
      `foreign_key_check found ${own.length} violation(s) in this step's tables: ${summariseViolations(own)}`
    );
  }
  if (introduced.length > 0) {
    if (version >= STRICT_FK_FROM_VERSION) {
      throw new Error(
        `foreign_key_check found ${introduced.length} new violation(s) introduced by this step: ${summariseViolations(introduced)}`
      );
    }
    logger.warn(
      `Migration ${version}: historic step introduced ${introduced.length} foreign-key violation(s), to be repaired by a later migration: ${summariseViolations(introduced)}`
    );
  }
  if (preExisting.length > 0) {
    logger.warn(
      `Migration ${version}: ${preExisting.length} pre-existing foreign-key violation(s), not introduced by migration ${version}: ${summariseViolations(preExisting)}`
    );
  }
}

/**
 * Applies one migration step atomically: `fn`, the foreign-key check and the
 * `INSERT INTO migrations` run in a single transaction, so a crash or error leaves the
 * database at the previous version. Any failure is rethrown as `MigrationError(version)`.
 *
 * `checkedTables` lists the tables the step creates or rebuilds. They must be completely
 * free of foreign-key violations when it commits; see assertForeignKeys for the full rule,
 * including how violations elsewhere are treated. The caller turns `foreign_keys` off around
 * the steps, because the pragma is a no-op inside a transaction.
 */
export function applyMigration(
  db: Database.Database,
  version: number,
  checkedTables: readonly string[],
  fn: () => void
): void {
  try {
    db.transaction(() => {
      const baseline = readViolations(db);
      fn();
      assertForeignKeys(db, version, checkedTables, baseline);
      db.prepare('INSERT INTO migrations (version) VALUES (?)').run(version);
    })();
  } catch (error) {
    throw error instanceof MigrationError ? error : new MigrationError(version, error);
  }
  logger.info(`Migration ${String(version).padStart(3, '0')} completed`);
}

/** The AUTOINCREMENT high-water mark of `table`, if it has one. */
function readSequence(db: Database.Database, table: string): number | undefined {
  const row = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table) as
    | { seq: number }
    | undefined;
  return row?.seq;
}

/** Restores a rebuilt table's AUTOINCREMENT high-water mark, so deleted ids are not reused. */
function restoreSequence(db: Database.Database, table: string, seq: number | undefined): void {
  if (seq === undefined) return;
  const updated = db
    .prepare('UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?')
    .run(seq, table);
  if (updated.changes === 0) {
    db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, seq);
  }
}

/**
 * Brings the database up to LATEST_SCHEMA_VERSION.
 * Add new migrations at the bottom of this function.
 */
export function runMigrations(database: Database.Database): void {
  // Create migrations table if it doesn't exist
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get current version. Pre-v2 installs have tables but no rows here, so they start at 0.
  const currentVersion =
    (
      database.prepare('SELECT MAX(version) as version FROM migrations').get() as {
        version: number | null;
      }
    ).version ?? 0;

  logger.info(`Current database migration version: ${currentVersion}`);

  if (currentVersion > LATEST_SCHEMA_VERSION) {
    throw new DatabaseTooNewError(currentVersion, LATEST_SCHEMA_VERSION);
  }
  if (currentVersion === LATEST_SCHEMA_VERSION) {
    return;
  }

  // Table rebuilds need foreign keys off. The pragma is ignored inside a transaction, so it
  // is set here, around all the steps, and always restored. Refuse to run if it cannot take
  // effect: a rebuild with foreign keys on would cascade-delete or reject rows.
  if (database.inTransaction) {
    throw new Error(
      'runMigrations cannot run inside an open transaction: PRAGMA foreign_keys is a no-op there, so table rebuilds would run with foreign keys on'
    );
  }
  database.pragma('foreign_keys = OFF');
  try {
    if (database.pragma('foreign_keys', { simple: true }) !== 0) {
      throw new Error(
        'runMigrations could not turn foreign keys off (PRAGMA foreign_keys still reads on); no migration was run'
      );
    }

    // Migration 001: Initial schema. Every statement is CREATE ... IF NOT EXISTS, so it is
    // harmless on pre-v2 installs that already have the tables. It writes no rows, so it
    // has no tables to check.
    if (currentVersion < 1) {
      applyMigration(database, 1, [], () => {
        logger.info('Running migration 001: Initial schema');
        database.exec(SCHEMA_SQL);
      });
    }

    // Migration 002: Add last_availability column to watches
    if (currentVersion < 2) {
      applyMigration(database, 2, [], () => {
        logger.info('Running migration 002: Add last_availability column');

        // Check if column already exists
        const tableInfo = database.prepare('PRAGMA table_info(watches)').all() as {
          name: string;
        }[];
        const hasColumn = tableInfo.some((col) => col.name === 'last_availability');

        if (!hasColumn) {
          database.exec('ALTER TABLE watches ADD COLUMN last_availability JSON');
          logger.info('Added last_availability column to watches table');
        } else {
          logger.info('last_availability column already exists');
        }

        // Kept from the original v2. Migration 001 now always records itself first, so this
        // is a no-op.
        database.prepare('INSERT OR IGNORE INTO migrations (version) VALUES (?)').run(1);
      });
    }

    // Migration 003: Add notification providers tables
    if (currentVersion < 3) {
      applyMigration(database, 3, ['notification_providers', 'notification_delivery_logs'], () => {
        logger.info('Running migration 003: Add notification providers tables');

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
      });
    }

    // Migration 004: Add queue_session table for persisting queue position
    if (currentVersion < 4) {
      applyMigration(database, 4, ['queue_session'], () => {
        logger.info('Running migration 004: Add queue_session table');

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
      });
    }

    // Migration 005: Add allow_partial_match column to watches
    if (currentVersion < 5) {
      applyMigration(database, 5, [], () => {
        logger.info('Running migration 005: Add allow_partial_match column to watches');

        const tableInfo = database.prepare('PRAGMA table_info(watches)').all() as {
          name: string;
        }[];
        const hasColumn = tableInfo.some((col) => col.name === 'allow_partial_match');

        if (!hasColumn) {
          database.exec('ALTER TABLE watches ADD COLUMN allow_partial_match BOOLEAN DEFAULT 0');
          logger.info('Added allow_partial_match column to watches table');
        } else {
          logger.info('allow_partial_match column already exists');
        }
      });
    }

    // Migration 006: Add site_snipes table (Site Sniper feature, replaces STQ) and
    // widen the notifications type/related_type CHECK constraints to include snipe types.
    // NOTE: renaming notifications aside makes SQLite rewrite the delivery-log FK to
    // "notifications_old", which is then dropped. The SQL is kept as released (so v5 → v7
    // upgrades replay it exactly); migration 007 repairs the damage.
    if (currentVersion < 6) {
      applyMigration(database, 6, ['site_snipes', 'notifications'], () => {
        logger.info('Running migration 006: Add site_snipes table + widen notifications CHECK');

        database.exec(`
      -- Site Sniper entries table
      CREATE TABLE IF NOT EXISTS site_snipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        campground_id TEXT NOT NULL,
        campground_name TEXT,
        target_site_ids TEXT,               -- JSON array of site id strings
        site_type TEXT DEFAULT 'all',
        arrival_date DATE NOT NULL,
        departure_date DATE NOT NULL,
        num_adult INTEGER DEFAULT 2,
        num_concession INTEGER DEFAULT 0,
        num_child INTEGER DEFAULT 0,
        num_infant INTEGER DEFAULT 0,
        num_vehicle INTEGER DEFAULT 1,
        postcode TEXT,
        release_mode TEXT NOT NULL DEFAULT 'daily_rollover'
           CHECK(release_mode IN ('daily_rollover','scheduled','cancellation')),
        release_at DATETIME,
        queue_enabled BOOLEAN DEFAULT 0,
        lead_time_seconds INTEGER DEFAULT 120,
        poll_interval_ms INTEGER DEFAULT 1500,
        window_duration_ms INTEGER DEFAULT 900000,
        status TEXT DEFAULT 'armed',
        is_active BOOLEAN DEFAULT 1,
        attempts_count INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 0,
        last_checked_at DATETIME,
        next_check_at DATETIME,
        last_result TEXT,
        last_error TEXT,
        held_booking_pk TEXT,
        held_expires_at DATETIME,
        payment_url TEXT,
        booked_reference TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_snipe_user_id ON site_snipes(user_id);
      CREATE INDEX IF NOT EXISTS idx_snipe_active ON site_snipes(is_active);
      CREATE INDEX IF NOT EXISTS idx_snipe_release_at ON site_snipes(release_at);
      CREATE TRIGGER IF NOT EXISTS update_site_snipes_timestamp
      AFTER UPDATE ON site_snipes
      BEGIN
        UPDATE site_snipes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

        // Widen the notifications CHECK constraints. SQLite cannot ALTER a CHECK, so we
        // rebuild the table. Old values ('stq_success', related_type 'stq') are preserved
        // for backward compatibility with existing rows; new values are added.
        database.exec(`
      ALTER TABLE notifications RENAME TO notifications_old;
      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('watch_found','stq_success','snipe_held','snipe_booked','booking_confirmed','error','warning','info')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        related_id INTEGER,
        related_type TEXT CHECK(related_type IN ('booking','watch','stq','snipe')),
        action_url TEXT,
        is_read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO notifications (id,user_id,type,title,message,related_id,related_type,action_url,is_read,created_at)
        SELECT id,user_id,type,title,message,related_id,related_type,action_url,is_read,created_at FROM notifications_old;
      DROP TABLE notifications_old;
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    `);
      });
    }

    // Migration 007: Integrity.
    // - Rebuild notifications without its CHECK constraints (types are validated in code).
    // - Rebuild notification_delivery_logs with a real FK to notifications (repairs 006),
    //   renaming provider_channel to notifier_channel.
    // - Rename notification_providers to notifiers.
    // - Drop the dead Skip The Queue table and its trigger.
    // Tables are rebuilt as: create under a temp name -> copy -> drop old -> rename new.
    // The old table is never renamed aside, because SQLite would then rewrite other tables'
    // FKs to the aside name (the 006 bug). Indexes are created only after the old table is
    // dropped, because index names are global.
    if (currentVersion < 7) {
      applyMigration(
        database,
        7,
        ['notifications', 'notification_delivery_logs', 'notifiers'],
        () => {
          logger.info('Running migration 007: Repair delivery-log FK, notifiers, drop STQ');

          // 1. notifications, without the CHECK constraints
          const notificationsSeq = readSequence(database, 'notifications');
          database.exec(`
            CREATE TABLE notifications_v7 (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              message TEXT NOT NULL,
              related_id INTEGER,
              related_type TEXT,
              action_url TEXT,
              is_read BOOLEAN DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            INSERT INTO notifications_v7 (id, user_id, type, title, message, related_id,
                related_type, action_url, is_read, created_at)
              SELECT id, user_id, type, title, message, related_id,
                related_type, action_url, is_read, created_at
              FROM notifications;
            DROP TABLE notifications;
            ALTER TABLE notifications_v7 RENAME TO notifications;
            CREATE INDEX idx_notifications_user_id ON notifications(user_id);
            CREATE INDEX idx_notifications_is_read ON notifications(is_read);
            CREATE INDEX idx_notifications_type ON notifications(type);
            CREATE INDEX idx_notifications_created_at ON notifications(created_at);
          `);
          restoreSequence(database, 'notifications', notificationsSeq);

          // 2. notification_delivery_logs, with a real FK. Logs whose notification no
          //    longer exists are kept, with notification_id cleared.
          const orphaned = (
            database
              .prepare(
                `SELECT COUNT(*) AS n FROM notification_delivery_logs
                 WHERE notification_id IS NOT NULL
                   AND notification_id NOT IN (SELECT id FROM notifications)`
              )
              .get() as { n: number }
          ).n;
          const logsSeq = readSequence(database, 'notification_delivery_logs');
          database.exec(`
            CREATE TABLE notification_delivery_logs_v7 (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              notification_id INTEGER,
              notifier_channel TEXT NOT NULL,
              status TEXT NOT NULL,
              message_id TEXT,
              error_message TEXT,
              sent_at DATETIME,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
            );
            INSERT INTO notification_delivery_logs_v7 (id, notification_id, notifier_channel,
                status, message_id, error_message, sent_at, created_at)
              SELECT id,
                CASE WHEN notification_id IN (SELECT id FROM notifications)
                  THEN notification_id END,
                provider_channel, status, message_id, error_message, sent_at, created_at
              FROM notification_delivery_logs;
            DROP TABLE notification_delivery_logs;
            ALTER TABLE notification_delivery_logs_v7 RENAME TO notification_delivery_logs;
            CREATE INDEX idx_delivery_logs_notification_id ON notification_delivery_logs(notification_id);
            CREATE INDEX idx_delivery_logs_notifier ON notification_delivery_logs(notifier_channel);
            CREATE INDEX idx_delivery_logs_status ON notification_delivery_logs(status);
            CREATE INDEX idx_delivery_logs_created_at ON notification_delivery_logs(created_at);
          `);
          restoreSequence(database, 'notification_delivery_logs', logsSeq);
          if (orphaned > 0) {
            logger.info(
              `Migration 007: cleared notification_id on ${orphaned} delivery log(s) whose notification no longer exists`
            );
          }

          // 3. notification_providers -> notifiers. SQLite cannot rename an index, so the
          //    two indexes are dropped and recreated under the new name.
          database.exec(`
            ALTER TABLE notification_providers RENAME TO notifiers;
            DROP INDEX IF EXISTS idx_notification_providers_channel;
            DROP INDEX IF EXISTS idx_notification_providers_enabled;
            CREATE INDEX idx_notifiers_channel ON notifiers(channel);
            CREATE INDEX idx_notifiers_enabled ON notifiers(enabled);
          `);

          // 4. Skip The Queue is gone; its rows are discarded.
          const hasStq = database
            .prepare(
              "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'skip_the_queue_entries'"
            )
            .get();
          const discarded = hasStq
            ? (
                database.prepare('SELECT COUNT(*) AS n FROM skip_the_queue_entries').get() as {
                  n: number;
                }
              ).n
            : 0;
          database.exec(`
            DROP TRIGGER IF EXISTS update_stq_timestamp;
            DROP TABLE IF EXISTS skip_the_queue_entries;
          `);
          logger.info(
            `Migration 007: dropped skip_the_queue_entries, discarding ${discarded} row(s)`
          );
        }
      );
    }
  } finally {
    database.pragma('foreign_keys = ON');
  }
}

/**
 * Opens (creating if needed) the database at `filePath`, enables foreign keys and WAL, and
 * migrates it to LATEST_SCHEMA_VERSION. On any failure the connection is closed and the
 * error rethrown.
 */
export function openDatabase(filePath: string): Database.Database {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const db = new Database(filePath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  });

  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    runMigrations(db);
  } catch (error) {
    db.close();
    throw error;
  }

  logger.info(`Database initialized at: ${filePath}`);
  return db;
}

/**
 * Closes a database connection opened by openDatabase.
 */
export function closeDatabase(db: Database.Database): void {
  if (db.open) {
    db.close();
    logger.info('Database connection closed');
  }
}
