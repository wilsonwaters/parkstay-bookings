import { BaseRepository } from './base.repository';
import { SkipTheQueueEntry, STQInput } from '@shared/types';
import { STQResult } from '@shared/types/common.types';

export class STQRepository extends BaseRepository<SkipTheQueueEntry> {
  protected tableName = 'skip_the_queue_entries';

  /**
   * Create a new STQ entry
   */
  create(userId: number, input: STQInput): SkipTheQueueEntry {
    const stmt = this.db.prepare(`
      INSERT INTO skip_the_queue_entries (
        user_id, booking_id, booking_reference, check_interval_minutes, max_attempts, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      input.bookingId,
      input.bookingReference,
      input.checkIntervalMinutes || 2,
      input.maxAttempts || 1000,
      input.notes || null
    );

    const entry = this.findById(result.lastInsertRowid as number);
    if (!entry) {
      throw new Error('Failed to create STQ entry');
    }
    return entry;
  }

  /**
   * Update STQ entry
   */
  update(id: number, updates: Partial<STQInput>): SkipTheQueueEntry {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.checkIntervalMinutes !== undefined) {
      fields.push('check_interval_minutes = ?');
      values.push(updates.checkIntervalMinutes);
    }
    if (updates.maxAttempts !== undefined) {
      fields.push('max_attempts = ?');
      values.push(updates.maxAttempts);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    if (fields.length === 0) {
      const entry = this.findById(id);
      if (!entry) throw new Error('STQ entry not found');
      return entry;
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE skip_the_queue_entries SET ${fields.join(', ')} WHERE id = ?`
    );
    stmt.run(values);

    const entry = this.findById(id);
    if (!entry) throw new Error('STQ entry not found');
    return entry;
  }

  /**
   * Find STQ entries by user ID
   */
  findByUserId(userId: number): SkipTheQueueEntry[] {
    return this.findWhere('user_id = ?', [userId]);
  }

  /**
   * Find STQ entry by booking ID
   */
  findByBookingId(bookingId: number): SkipTheQueueEntry | undefined {
    return this.findOneWhere('booking_id = ? AND is_active = 1', [bookingId]);
  }

  /**
   * Find active STQ entries
   */
  findActive(): SkipTheQueueEntry[] {
    return this.findWhere('is_active = 1');
  }

  /**
   * Find STQ entries due for checking
   */
  findDueForCheck(): SkipTheQueueEntry[] {
    const now = new Date().toISOString();
    return this.findWhere('is_active = 1 AND (next_check_at IS NULL OR next_check_at <= ?)', [now]);
  }

  /**
   * Activate STQ entry
   */
  activate(id: number): void {
    const stmt = this.db.prepare('UPDATE skip_the_queue_entries SET is_active = 1 WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Deactivate STQ entry
   */
  deactivate(id: number): void {
    const stmt = this.db.prepare('UPDATE skip_the_queue_entries SET is_active = 0 WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Update check timestamps
   */
  updateCheckTimestamps(id: number, lastChecked: Date, nextCheck: Date): void {
    const stmt = this.db.prepare(`
      UPDATE skip_the_queue_entries
      SET last_checked_at = ?, next_check_at = ?
      WHERE id = ?
    `);
    stmt.run(lastChecked.toISOString(), nextCheck.toISOString(), id);
  }

  /**
   * Increment attempts count
   */
  incrementAttempts(id: number): void {
    const stmt = this.db.prepare(`
      UPDATE skip_the_queue_entries
      SET attempts_count = attempts_count + 1
      WHERE id = ?
    `);
    stmt.run(id);
  }

  /**
   * Update last result
   */
  updateLastResult(id: number, result: STQResult): void {
    const stmt = this.db.prepare(`
      UPDATE skip_the_queue_entries
      SET last_result = ?
      WHERE id = ?
    `);
    stmt.run(result, id);
  }

  /**
   * Mark as successful
   */
  markSuccess(id: number, newBookingReference: string): void {
    const stmt = this.db.prepare(`
      UPDATE skip_the_queue_entries
      SET is_active = 0, success_date = ?, new_booking_reference = ?, last_result = 'success'
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), newBookingReference, id);
  }

  /**
   * Check if max attempts reached
   */
  hasReachedMaxAttempts(id: number): boolean {
    const entry = this.findById(id);
    if (!entry) return true;
    return entry.attemptsCount >= entry.maxAttempts;
  }

  protected mapToModel(row: any): SkipTheQueueEntry {
    return {
      id: row.id,
      userId: row.user_id,
      bookingId: row.booking_id,
      bookingReference: row.booking_reference,
      isActive: Boolean(row.is_active),
      checkIntervalMinutes: row.check_interval_minutes,
      lastCheckedAt: this.parseDate(row.last_checked_at),
      nextCheckAt: this.parseDate(row.next_check_at),
      attemptsCount: row.attempts_count,
      maxAttempts: row.max_attempts,
      lastResult: row.last_result as STQResult | undefined,
      successDate: this.parseDate(row.success_date),
      newBookingReference: row.new_booking_reference,
      notes: row.notes,
      createdAt: this.parseDate(row.created_at)!,
      updatedAt: this.parseDate(row.updated_at)!,
    };
  }

  protected mapToRow(model: Partial<SkipTheQueueEntry>): any {
    return {
      user_id: model.userId,
      booking_id: model.bookingId,
      booking_reference: model.bookingReference,
      is_active: model.isActive ? 1 : 0,
      check_interval_minutes: model.checkIntervalMinutes,
      last_checked_at: this.formatDate(model.lastCheckedAt),
      next_check_at: this.formatDate(model.nextCheckAt),
      attempts_count: model.attemptsCount,
      max_attempts: model.maxAttempts,
      last_result: model.lastResult,
      success_date: this.formatDate(model.successDate),
      new_booking_reference: model.newBookingReference,
      notes: model.notes,
    };
  }
}
