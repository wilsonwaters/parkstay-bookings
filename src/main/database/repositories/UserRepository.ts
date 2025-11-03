/**
 * User Repository
 * Handles CRUD operations for users with encrypted credentials
 */

import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository';
import { User, UserInput } from '@shared/types';
import { logger } from '../../utils/logger';

interface UserRow {
  id: number;
  email: string;
  encrypted_password: string;
  encryption_key: string;
  encryption_iv: string;
  encryption_auth_tag: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export class UserRepository extends BaseRepository<User> {
  constructor(db: Database.Database) {
    super(db, 'users');
  }

  /**
   * Map database row to User model
   */
  protected mapRowToModel(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      encryptedPassword: row.encrypted_password,
      encryptionKey: row.encryption_key,
      encryptionIv: row.encryption_iv,
      encryptionAuthTag: row.encryption_auth_tag,
      firstName: row.first_name || undefined,
      lastName: row.last_name || undefined,
      phone: row.phone || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map User model to database row
   */
  protected mapModelToRow(user: Partial<User>): Partial<UserRow> {
    return {
      email: user.email,
      encrypted_password: user.encryptedPassword,
      encryption_key: user.encryptionKey,
      encryption_iv: user.encryptionIv,
      encryption_auth_tag: user.encryptionAuthTag,
      first_name: user.firstName || null,
      last_name: user.lastName || null,
      phone: user.phone || null,
    };
  }

  /**
   * Create new user
   */
  create(
    email: string,
    encryptedPassword: string,
    encryptionKey: string,
    encryptionIv: string,
    encryptionAuthTag: string,
    userData?: Partial<UserInput>
  ): User {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO users (
          email, encrypted_password, encryption_key, encryption_iv,
          encryption_auth_tag, first_name, last_name, phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        email,
        encryptedPassword,
        encryptionKey,
        encryptionIv,
        encryptionAuthTag,
        userData?.firstName || null,
        userData?.lastName || null,
        userData?.phone || null
      );

      const user = this.findById(result.lastInsertRowid as number);
      if (!user) throw new Error('Failed to create user');

      logger.info(`User created successfully: ${email}`);
      return user;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Find user by email
   */
  findByEmail(email: string): User | null {
    try {
      const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      return row ? this.mapRowToModel(row as UserRow) : null;
    } catch (error) {
      logger.error(`Error finding user by email ${email}:`, error);
      throw error;
    }
  }

  /**
   * Update user credentials
   */
  updateCredentials(
    id: number,
    encryptedPassword: string,
    encryptionKey: string,
    encryptionIv: string,
    encryptionAuthTag: string
  ): User | null {
    try {
      const stmt = this.db.prepare(`
        UPDATE users
        SET encrypted_password = ?,
            encryption_key = ?,
            encryption_iv = ?,
            encryption_auth_tag = ?
        WHERE id = ?
      `);

      stmt.run(encryptedPassword, encryptionKey, encryptionIv, encryptionAuthTag, id);

      logger.info(`User credentials updated: ID ${id}`);
      return this.findById(id);
    } catch (error) {
      logger.error(`Error updating user credentials for ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  updateProfile(id: number, data: Partial<UserInput>): User | null {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (data.firstName !== undefined) {
        updates.push('first_name = ?');
        values.push(data.firstName);
      }
      if (data.lastName !== undefined) {
        updates.push('last_name = ?');
        values.push(data.lastName);
      }
      if (data.phone !== undefined) {
        updates.push('phone = ?');
        values.push(data.phone);
      }

      if (updates.length === 0) {
        return this.findById(id);
      }

      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE users SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`User profile updated: ID ${id}`);
      return this.findById(id);
    } catch (error) {
      logger.error(`Error updating user profile for ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get the first user (single-user application)
   */
  getFirstUser(): User | null {
    try {
      const row = this.db.prepare('SELECT * FROM users LIMIT 1').get();
      return row ? this.mapRowToModel(row as UserRow) : null;
    } catch (error) {
      logger.error('Error getting first user:', error);
      throw error;
    }
  }

  /**
   * Check if any user exists
   */
  hasUsers(): boolean {
    try {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as {
        count: number;
      };
      return result.count > 0;
    } catch (error) {
      logger.error('Error checking if users exist:', error);
      throw error;
    }
  }
}
