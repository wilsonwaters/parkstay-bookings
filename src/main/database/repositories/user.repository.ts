/**
 * User Repository
 * Handles CRUD operations for users. `encrypted_password` holds a SecretVault envelope
 * (AuthService encrypts and decrypts it). The v1.x `encryption_key`, `encryption_iv` and
 * `encryption_auth_tag` columns are only read by the legacy secret migration and are written
 * as `''` with stored credentials (V6 retires them). Since migration v8 every credential
 * column is nullable: NULL (a profile that never signed in, or cleared credentials) reads as
 * `''`.
 */

import { BaseRepository } from './base.repository';
import { User, UserInput } from '@shared/types';
import { logger } from '../../utils/logger';

/** Since v8 the credential columns are nullable: the local profile needs no login. */
interface UserRow {
  id: number;
  email: string | null;
  encrypted_password: string | null;
  encryption_key: string | null;
  encryption_iv: string | null;
  encryption_auth_tag: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export class UserRepository extends BaseRepository<User> {
  protected readonly tableName = 'users';

  /**
   * Map database row to User model. A NULL credential column (a profile that never signed
   * in) reads as '', the same as cleared credentials.
   */
  protected mapRow(row: UserRow): User {
    return {
      id: row.id,
      email: row.email ?? '',
      encryptedPassword: row.encrypted_password ?? '',
      firstName: row.first_name || undefined,
      lastName: row.last_name || undefined,
      phone: row.phone || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Create new user
   */
  create(email: string, encryptedPassword: string, userData?: Partial<UserInput>): User {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO users (
          email, encrypted_password, encryption_key, encryption_iv,
          encryption_auth_tag, first_name, last_name, phone
        )
        VALUES (?, ?, '', '', '', ?, ?, ?)
      `);

      const result = stmt.run(
        email,
        encryptedPassword,
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
      return row ? this.mapRow(row as UserRow) : null;
    } catch (error) {
      logger.error(`Error finding user by email ${email}:`, error);
      throw error;
    }
  }

  /**
   * Update user credentials
   */
  updateCredentials(id: number, encryptedPassword: string): User | null {
    try {
      const stmt = this.db.prepare(`
        UPDATE users
        SET encrypted_password = ?,
            encryption_key = '',
            encryption_iv = '',
            encryption_auth_tag = ''
        WHERE id = ?
      `);

      stmt.run(encryptedPassword, id);

      logger.info(`User credentials updated: ID ${id}`);
      return this.findById(id);
    } catch (error) {
      logger.error(`Error updating user credentials for ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Creates the single local profile (id 1) when the table is empty, with every credential
   * column NULL (as migration v8 does). A no-op when any row exists. Returns the local
   * profile.
   */
  createLocalProfileIfMissing(): User {
    this.db
      .prepare(
        `INSERT INTO users (
           id, email, encrypted_password, encryption_key, encryption_iv, encryption_auth_tag
         )
         SELECT 1, NULL, NULL, NULL, NULL, NULL
         WHERE NOT EXISTS (SELECT 1 FROM users)`
      )
      .run();
    const profile = this.getFirstUser();
    if (!profile) throw new Error('Failed to create the local profile');
    return profile;
  }

  /**
   * Writes credentials (and any profile fields given) onto an existing row. Profile fields
   * left undefined keep their stored value.
   */
  setCredentials(
    id: number,
    email: string,
    encryptedPassword: string,
    userData?: Partial<UserInput>
  ): User {
    this.db
      .prepare(
        `UPDATE users
         SET email = ?,
             encrypted_password = ?,
             encryption_key = '',
             encryption_iv = '',
             encryption_auth_tag = '',
             first_name = COALESCE(?, first_name),
             last_name = COALESCE(?, last_name),
             phone = COALESCE(?, phone)
         WHERE id = ?`
      )
      .run(
        email,
        encryptedPassword,
        userData?.firstName ?? null,
        userData?.lastName ?? null,
        userData?.phone ?? null,
        id
      );
    const user = this.findById(id);
    if (!user) throw new Error(`User ${id} not found`);
    logger.info(`User credentials set: ID ${id}`);
    return user;
  }

  /**
   * Replaces the stored password envelope with `envelope` (the same password re-encrypted),
   * only if it is still `previous`. Returns whether it was replaced.
   */
  resealPassword(id: number, previous: string, envelope: string): boolean {
    const result = this.db
      .prepare('UPDATE users SET encrypted_password = ? WHERE id = ? AND encrypted_password = ?')
      .run(envelope, id, previous);
    return result.changes > 0;
  }

  /**
   * Clears the credential fields of a row (NULL). The row itself, its profile fields and
   * every record that references it are kept (architecture-notes §12.22).
   */
  clearCredentials(id: number): void {
    this.db
      .prepare(
        `UPDATE users
         SET email = NULL,
             encrypted_password = NULL,
             encryption_key = NULL,
             encryption_iv = NULL,
             encryption_auth_tag = NULL
         WHERE id = ?`
      )
      .run(id);
    logger.info(`User credentials cleared: ID ${id}`);
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
      const row = this.db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
      return row ? this.mapRow(row as UserRow) : null;
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
