import { BaseRepository } from './base.repository';
import { Watch, WatchInput } from '@shared/types';
import { WatchResult } from '@shared/types/common.types';

export class WatchRepository extends BaseRepository<Watch> {
  protected tableName = 'watches';

  /**
   * Create a new watch
   */
  create(userId: number, input: WatchInput): Watch {
    const stmt = this.db.prepare(`
      INSERT INTO watches (
        user_id, name, park_id, park_name, campground_id, campground_name,
        arrival_date, departure_date, num_guests, preferred_sites, site_type,
        check_interval_minutes, auto_book, notify_only, max_price, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      input.name,
      input.parkId,
      input.parkName,
      input.campgroundId,
      input.campgroundName,
      this.formatDate(input.arrivalDate),
      this.formatDate(input.departureDate),
      input.numGuests,
      this.stringifyJson(input.preferredSites),
      input.siteType || null,
      input.checkIntervalMinutes || 5,
      input.autoBook ? 1 : 0,
      input.notifyOnly !== false ? 1 : 0,
      input.maxPrice || null,
      input.notes || null
    );

    const watch = this.findById(result.lastInsertRowid as number);
    if (!watch) {
      throw new Error('Failed to create watch');
    }
    return watch;
  }

  /**
   * Update watch
   */
  update(id: number, updates: Partial<WatchInput>): Watch {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.parkId !== undefined) {
      fields.push('park_id = ?');
      values.push(updates.parkId);
    }
    if (updates.parkName !== undefined) {
      fields.push('park_name = ?');
      values.push(updates.parkName);
    }
    if (updates.campgroundId !== undefined) {
      fields.push('campground_id = ?');
      values.push(updates.campgroundId);
    }
    if (updates.campgroundName !== undefined) {
      fields.push('campground_name = ?');
      values.push(updates.campgroundName);
    }
    if (updates.arrivalDate !== undefined) {
      fields.push('arrival_date = ?');
      values.push(this.formatDate(updates.arrivalDate));
    }
    if (updates.departureDate !== undefined) {
      fields.push('departure_date = ?');
      values.push(this.formatDate(updates.departureDate));
    }
    if (updates.numGuests !== undefined) {
      fields.push('num_guests = ?');
      values.push(updates.numGuests);
    }
    if (updates.preferredSites !== undefined) {
      fields.push('preferred_sites = ?');
      values.push(this.stringifyJson(updates.preferredSites));
    }
    if (updates.siteType !== undefined) {
      fields.push('site_type = ?');
      values.push(updates.siteType);
    }
    if (updates.checkIntervalMinutes !== undefined) {
      fields.push('check_interval_minutes = ?');
      values.push(updates.checkIntervalMinutes);
    }
    if (updates.autoBook !== undefined) {
      fields.push('auto_book = ?');
      values.push(updates.autoBook ? 1 : 0);
    }
    if (updates.notifyOnly !== undefined) {
      fields.push('notify_only = ?');
      values.push(updates.notifyOnly ? 1 : 0);
    }
    if (updates.maxPrice !== undefined) {
      fields.push('max_price = ?');
      values.push(updates.maxPrice);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    if (fields.length === 0) {
      const watch = this.findById(id);
      if (!watch) throw new Error('Watch not found');
      return watch;
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE watches SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(values);

    const watch = this.findById(id);
    if (!watch) throw new Error('Watch not found');
    return watch;
  }

  /**
   * Find watches by user ID
   */
  findByUserId(userId: number): Watch[] {
    return this.findWhere('user_id = ?', [userId]);
  }

  /**
   * Find active watches
   */
  findActive(): Watch[] {
    return this.findWhere('is_active = 1');
  }

  /**
   * Find watches due for checking
   */
  findDueForCheck(): Watch[] {
    const now = new Date().toISOString();
    return this.findWhere('is_active = 1 AND (next_check_at IS NULL OR next_check_at <= ?)', [
      now,
    ]);
  }

  /**
   * Activate watch
   */
  activate(id: number): void {
    const stmt = this.db.prepare('UPDATE watches SET is_active = 1 WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Deactivate watch
   */
  deactivate(id: number): void {
    const stmt = this.db.prepare('UPDATE watches SET is_active = 0 WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Update check timestamps
   */
  updateCheckTimestamps(id: number, lastChecked: Date, nextCheck: Date): void {
    const stmt = this.db.prepare(`
      UPDATE watches
      SET last_checked_at = ?, next_check_at = ?
      WHERE id = ?
    `);
    stmt.run(lastChecked.toISOString(), nextCheck.toISOString(), id);
  }

  /**
   * Update last result
   */
  updateLastResult(id: number, result: WatchResult, found: boolean): void {
    const stmt = this.db.prepare(`
      UPDATE watches
      SET last_result = ?, found_count = found_count + ?
      WHERE id = ?
    `);
    stmt.run(result, found ? 1 : 0, id);
  }

  protected mapToModel(row: any): Watch {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      parkId: row.park_id,
      parkName: row.park_name,
      campgroundId: row.campground_id,
      campgroundName: row.campground_name,
      arrivalDate: this.parseDate(row.arrival_date)!,
      departureDate: this.parseDate(row.departure_date)!,
      numGuests: row.num_guests,
      preferredSites: this.parseJson<string[]>(row.preferred_sites),
      siteType: row.site_type,
      checkIntervalMinutes: row.check_interval_minutes,
      isActive: Boolean(row.is_active),
      lastCheckedAt: this.parseDate(row.last_checked_at),
      nextCheckAt: this.parseDate(row.next_check_at),
      lastResult: row.last_result as WatchResult | undefined,
      foundCount: row.found_count,
      autoBook: Boolean(row.auto_book),
      notifyOnly: Boolean(row.notify_only),
      maxPrice: row.max_price,
      notes: row.notes,
      createdAt: this.parseDate(row.created_at)!,
      updatedAt: this.parseDate(row.updated_at)!,
    };
  }

  protected mapToRow(model: Partial<Watch>): any {
    return {
      user_id: model.userId,
      name: model.name,
      park_id: model.parkId,
      park_name: model.parkName,
      campground_id: model.campgroundId,
      campground_name: model.campgroundName,
      arrival_date: this.formatDate(model.arrivalDate),
      departure_date: this.formatDate(model.departureDate),
      num_guests: model.numGuests,
      preferred_sites: this.stringifyJson(model.preferredSites),
      site_type: model.siteType,
      check_interval_minutes: model.checkIntervalMinutes,
      is_active: model.isActive ? 1 : 0,
      last_checked_at: this.formatDate(model.lastCheckedAt),
      next_check_at: this.formatDate(model.nextCheckAt),
      last_result: model.lastResult,
      found_count: model.foundCount,
      auto_book: model.autoBook ? 1 : 0,
      notify_only: model.notifyOnly ? 1 : 0,
      max_price: model.maxPrice,
      notes: model.notes,
    };
  }
}
