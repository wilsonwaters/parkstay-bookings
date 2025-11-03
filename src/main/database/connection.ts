import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database | null = null;

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
