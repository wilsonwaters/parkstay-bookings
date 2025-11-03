import { getDatabase } from '../connection';
import Database from 'better-sqlite3';

/**
 * Base repository class with common database operations
 */
export abstract class BaseRepository<T> {
  protected db: Database.Database;
  protected abstract tableName: string;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Find record by ID
   */
  findById(id: number): T | undefined {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
    const row = stmt.get(id);
    return row ? this.mapToModel(row) : undefined;
  }

  /**
   * Find all records
   */
  findAll(): T[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName}`);
    const rows = stmt.all();
    return rows.map((row) => this.mapToModel(row));
  }

  /**
   * Find records by condition
   */
  findWhere(condition: string, params: any[] = []): T[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE ${condition}`);
    const rows = stmt.all(params);
    return rows.map((row) => this.mapToModel(row));
  }

  /**
   * Find one record by condition
   */
  findOneWhere(condition: string, params: any[] = []): T | undefined {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE ${condition}`);
    const row = stmt.get(params);
    return row ? this.mapToModel(row) : undefined;
  }

  /**
   * Count records
   */
  count(condition?: string, params: any[] = []): number {
    const sql = condition
      ? `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${condition}`
      : `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(params) as { count: number };
    return result.count;
  }

  /**
   * Delete record by ID
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete records by condition
   */
  deleteWhere(condition: string, params: any[] = []): number {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE ${condition}`);
    const result = stmt.run(params);
    return result.changes;
  }

  /**
   * Check if record exists
   */
  exists(id: number): boolean {
    const stmt = this.db.prepare(`SELECT 1 FROM ${this.tableName} WHERE id = ? LIMIT 1`);
    return stmt.get(id) !== undefined;
  }

  /**
   * Map database row to model object
   */
  protected abstract mapToModel(row: any): T;

  /**
   * Map model object to database row
   */
  protected abstract mapToRow(model: Partial<T>): any;

  /**
   * Parse JSON field
   */
  protected parseJson<J>(value: string | null | undefined): J | undefined {
    if (!value) return undefined;
    try {
      return JSON.parse(value) as J;
    } catch {
      return undefined;
    }
  }

  /**
   * Stringify JSON field
   */
  protected stringifyJson(value: any): string | null {
    if (value === undefined || value === null) return null;
    return JSON.stringify(value);
  }

  /**
   * Parse date field
   */
  protected parseDate(value: string | number | null | undefined): Date | undefined {
    if (!value) return undefined;
    return new Date(value);
  }

  /**
   * Format date for database
   */
  protected formatDate(date: Date | undefined): string | null {
    if (!date) return null;
    return date.toISOString();
  }
}
