/**
 * Base Repository
 * Provides common database operations for all repositories
 */

import Database from 'better-sqlite3';
import { logger } from '../../utils/logger';

export abstract class BaseRepository<T> {
  protected db: Database.Database;
  protected tableName: string;

  constructor(db: Database.Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Convert database row to model
   */
  protected abstract mapRowToModel(row: any): T;

  /**
   * Convert model to database row
   */
  protected abstract mapModelToRow(model: Partial<T>): any;

  /**
   * Find by ID
   */
  findById(id: number): T | null {
    try {
      const row = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(id);
      return row ? this.mapRowToModel(row) : null;
    } catch (error) {
      logger.error(`Error finding ${this.tableName} by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find all records
   */
  findAll(): T[] {
    try {
      const rows = this.db.prepare(`SELECT * FROM ${this.tableName}`).all();
      return rows.map((row) => this.mapRowToModel(row));
    } catch (error) {
      logger.error(`Error finding all ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Delete by ID
   */
  deleteById(id: number): boolean {
    try {
      const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Error deleting ${this.tableName} by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Count records
   */
  count(where?: string, params?: any[]): number {
    try {
      const query = where
        ? `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${where}`
        : `SELECT COUNT(*) as count FROM ${this.tableName}`;
      const result = this.db.prepare(query).get(...(params || [])) as { count: number };
      return result.count;
    } catch (error) {
      logger.error(`Error counting ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Parse JSON field
   */
  protected parseJson<T>(value: string | null): T | undefined {
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  /**
   * Stringify JSON field
   */
  protected stringifyJson(value: any): string | null {
    if (!value) return null;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  /**
   * Parse date field
   */
  protected parseDate(value: string | null): Date | undefined {
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
