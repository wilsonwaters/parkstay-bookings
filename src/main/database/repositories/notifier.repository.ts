/**
 * Notifier Repository
 * Handles CRUD operations for notifiers (the `notifiers` table) with encrypted config
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import { machineIdSync } from 'node-machine-id';
import { BaseRepository } from './base.repository';
import {
  Notifier,
  NotifierInput,
  NotifierChannel,
  NotifierStatus,
  NotificationDeliveryLog,
  NotificationDeliveryLogInput,
} from '@shared/types';
import { logger } from '../../utils/logger';

// Legacy key-derivation inputs (v1.x). Stored configs were encrypted with them, so the
// values must never change; P5 migrates the configs to the SecretVault.
const NOTIFIER_CONFIG_SECRET = 'parkstay-notification-providers-v1';

interface NotifierRow {
  id: number;
  channel: string;
  display_name: string;
  enabled: number;
  config: string;
  status: string;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface DeliveryLogRow {
  id: number;
  notification_id: number | null;
  notifier_channel: string;
  status: string;
  message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export class NotifierRepository extends BaseRepository<Notifier> {
  protected readonly tableName = 'notifiers';
  private encryptionKey: Buffer | null = null;
  private machineId: string;

  constructor(db: Database.Database) {
    super(db);
    this.machineId = machineIdSync();
  }

  /**
   * Map database row to Notifier model
   */
  protected mapRow(row: NotifierRow): Notifier {
    let config: Record<string, unknown> = {};
    try {
      const decryptedConfig = this.decryptConfig(row.config);
      config = JSON.parse(decryptedConfig);
    } catch {
      logger.warn(`Failed to decrypt config for notifier ${row.channel}`);
    }

    return {
      id: row.id,
      channel: row.channel as NotifierChannel,
      displayName: row.display_name,
      enabled: row.enabled === 1,
      config,
      status: row.status as NotifierStatus,
      lastTestedAt: row.last_tested_at ? new Date(row.last_tested_at) : undefined,
      lastError: row.last_error || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Create or update a notifier
   */
  upsert(input: NotifierInput): Notifier {
    try {
      const existing = this.findByChannel(input.channel);

      if (existing) {
        // Update existing notifier
        return this.updateNotifier(existing.id, input);
      }

      // Create new notifier
      const encryptedConfig = this.encryptConfig(JSON.stringify(input.config));

      const stmt = this.db.prepare(`
        INSERT INTO notifiers (
          channel, display_name, enabled, config, status
        )
        VALUES (?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        input.channel,
        input.displayName,
        input.enabled ? 1 : 0,
        encryptedConfig,
        NotifierStatus.CONFIGURED
      );

      const notifier = this.findById(result.lastInsertRowid as number);
      if (!notifier) throw new Error('Failed to create notifier');

      logger.info(`Notifier created: ${input.channel}`);
      return notifier;
    } catch (error) {
      logger.error('Error creating notifier:', error);
      throw error;
    }
  }

  /**
   * Update a notifier
   */
  updateNotifier(id: number, input: Partial<NotifierInput>): Notifier {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (input.displayName !== undefined) {
        updates.push('display_name = ?');
        values.push(input.displayName);
      }

      if (input.enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(input.enabled ? 1 : 0);
      }

      if (input.config !== undefined) {
        updates.push('config = ?');
        values.push(this.encryptConfig(JSON.stringify(input.config)));
        updates.push('status = ?');
        values.push(NotifierStatus.CONFIGURED);
      }

      if (updates.length === 0) {
        const existing = this.findById(id);
        if (!existing) throw new Error('Notifier not found');
        return existing;
      }

      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE notifiers
        SET ${updates.join(', ')}
        WHERE id = ?
      `);

      stmt.run(...values);

      const notifier = this.findById(id);
      if (!notifier) throw new Error('Failed to update notifier');

      logger.info(`Notifier updated: ID ${id}`);
      return notifier;
    } catch (error) {
      logger.error('Error updating notifier:', error);
      throw error;
    }
  }

  /**
   * Find notifier by channel
   */
  findByChannel(channel: NotifierChannel): Notifier | null {
    try {
      const row = this.db.prepare('SELECT * FROM notifiers WHERE channel = ?').get(channel);
      return row ? this.mapRow(row as NotifierRow) : null;
    } catch (error) {
      logger.error(`Error finding notifier by channel ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Find all enabled notifiers
   */
  findEnabled(): Notifier[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM notifiers WHERE enabled = 1')
        .all() as NotifierRow[];
      return rows.map((row) => this.mapRow(row));
    } catch (error) {
      logger.error('Error finding enabled notifiers:', error);
      throw error;
    }
  }

  /**
   * Enable a notifier
   */
  enable(channel: NotifierChannel): boolean {
    try {
      const result = this.db
        .prepare('UPDATE notifiers SET enabled = 1 WHERE channel = ?')
        .run(channel);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Error enabling notifier ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Disable a notifier
   */
  disable(channel: NotifierChannel): boolean {
    try {
      const result = this.db
        .prepare('UPDATE notifiers SET enabled = 0 WHERE channel = ?')
        .run(channel);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Error disabling notifier ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Update notifier status
   */
  updateStatus(channel: NotifierChannel, status: NotifierStatus, error?: string): void {
    try {
      this.db
        .prepare(
          `
          UPDATE notifiers
          SET status = ?, last_error = ?
          WHERE channel = ?
        `
        )
        .run(status, error || null, channel);
    } catch (err) {
      logger.error(`Error updating notifier status ${channel}:`, err);
      throw err;
    }
  }

  /**
   * Update last tested timestamp
   */
  updateLastTested(channel: NotifierChannel, success: boolean, error?: string): void {
    try {
      this.db
        .prepare(
          `
          UPDATE notifiers
          SET last_tested_at = CURRENT_TIMESTAMP,
              status = ?,
              last_error = ?
          WHERE channel = ?
        `
        )
        .run(success ? NotifierStatus.CONFIGURED : NotifierStatus.ERROR, error || null, channel);
    } catch (err) {
      logger.error(`Error updating last tested for ${channel}:`, err);
      throw err;
    }
  }

  /**
   * Log a notification delivery
   */
  logDelivery(input: NotificationDeliveryLogInput): NotificationDeliveryLog {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO notification_delivery_logs (
          notification_id, notifier_channel, status, message_id, error_message, sent_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        input.notificationId || null,
        input.notifierChannel,
        input.status,
        input.messageId || null,
        input.errorMessage || null,
        input.sentAt?.toISOString() || null
      );

      return this.getDeliveryLog(result.lastInsertRowid as number)!;
    } catch (error) {
      logger.error('Error logging notification delivery:', error);
      throw error;
    }
  }

  /**
   * Get delivery log by ID
   */
  getDeliveryLog(id: number): NotificationDeliveryLog | null {
    try {
      const row = this.db
        .prepare('SELECT * FROM notification_delivery_logs WHERE id = ?')
        .get(id) as DeliveryLogRow | undefined;

      if (!row) return null;

      return {
        id: row.id,
        notificationId: row.notification_id || undefined,
        notifierChannel: row.notifier_channel as NotifierChannel,
        status: row.status as 'sent' | 'failed' | 'pending',
        messageId: row.message_id || undefined,
        errorMessage: row.error_message || undefined,
        sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
        createdAt: new Date(row.created_at),
      };
    } catch (error) {
      logger.error('Error getting delivery log:', error);
      throw error;
    }
  }

  /**
   * Get delivery logs for a notification
   */
  getDeliveryLogsForNotification(notificationId: number): NotificationDeliveryLog[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM notification_delivery_logs WHERE notification_id = ?')
        .all(notificationId) as DeliveryLogRow[];

      return rows.map((row) => ({
        id: row.id,
        notificationId: row.notification_id || undefined,
        notifierChannel: row.notifier_channel as NotifierChannel,
        status: row.status as 'sent' | 'failed' | 'pending',
        messageId: row.message_id || undefined,
        errorMessage: row.error_message || undefined,
        sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('Error getting delivery logs for notification:', error);
      throw error;
    }
  }

  /**
   * Clean up old delivery logs
   */
  cleanupDeliveryLogs(daysOld: number = 30): number {
    try {
      const result = this.db
        .prepare(
          `
          DELETE FROM notification_delivery_logs
          WHERE created_at < datetime('now', '-' || ? || ' days')
        `
        )
        .run(daysOld);
      return result.changes;
    } catch (error) {
      logger.error('Error cleaning up delivery logs:', error);
      throw error;
    }
  }

  /**
   * Get encryption key
   */
  private getEncryptionKey(): Buffer {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    this.encryptionKey = crypto.pbkdf2Sync(
      this.machineId + NOTIFIER_CONFIG_SECRET,
      'parkstay-provider-salt',
      100000,
      32,
      'sha512'
    );

    return this.encryptionKey;
  }

  /**
   * Encrypt config data
   */
  private encryptConfig(plaintext: string): string {
    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Return format: iv:authTag:encrypted
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error('Error encrypting config:', error);
      throw new Error('Failed to encrypt configuration');
    }
  }

  /**
   * Decrypt config data
   */
  private decryptConfig(ciphertext: string): string {
    try {
      const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

      if (!ivHex || !authTagHex || !encrypted) {
        throw new Error('Invalid encrypted format');
      }

      const key = this.getEncryptionKey();
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Error decrypting config:', error);
      throw new Error('Failed to decrypt configuration');
    }
  }
}
