import { BaseRepository } from './base.repository';
import { Notification, NotificationInput } from '@shared/types';
import { NotificationType, RelatedType } from '@shared/types/common.types';

export class NotificationRepository extends BaseRepository<Notification> {
  protected readonly tableName = 'notifications';

  /**
   * Create a new notification
   */
  create(input: NotificationInput): Notification {
    const stmt = this.db.prepare(`
      INSERT INTO notifications (
        user_id, type, title, message, related_id, related_type, action_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.userId,
      input.type,
      input.title,
      input.message,
      input.relatedId || null,
      input.relatedType || null,
      input.actionUrl || null
    );

    const notification = this.findById(result.lastInsertRowid as number);
    if (!notification) {
      throw new Error('Failed to create notification');
    }
    return notification;
  }

  /**
   * Find notifications by user ID
   */
  findByUserId(userId: number, limit?: number): Notification[] {
    const sql = limit
      ? `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
      : `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`;
    const stmt = this.db.prepare(sql);
    const rows = limit ? stmt.all(userId, limit) : stmt.all(userId);
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Find unread notifications by user ID
   */
  findUnreadByUserId(userId: number): Notification[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ? AND is_read = 0
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(userId);
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Get unread count
   */
  getUnreadCount(userId: number): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(userId) as { count: number };
    return row.count;
  }

  /**
   * Mark as read
   */
  markAsRead(id: number): void {
    const stmt = this.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Mark all as read for user
   */
  markAllAsRead(userId: number): void {
    const stmt = this.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?');
    stmt.run(userId);
  }

  /**
   * Delete old notifications
   */
  deleteOld(days: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return this.db
      .prepare('DELETE FROM notifications WHERE created_at < ?')
      .run(cutoffDate.toISOString()).changes;
  }

  /**
   * Delete all notifications for user
   */
  deleteAllForUser(userId: number): number {
    return this.db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId).changes;
  }

  protected mapRow(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as NotificationType,
      title: row.title,
      message: row.message,
      relatedId: row.related_id,
      relatedType: row.related_type as RelatedType | undefined,
      actionUrl: row.action_url,
      isRead: Boolean(row.is_read),
      createdAt: this.parseDate(row.created_at)!,
    };
  }
}
