import { BaseRepository } from './base.repository';
import { locationKeyOf, Watch, WatchInput, WatchUpdate } from '@shared/types';
import { WatchResult } from '@shared/types/common.types';
import { AppError } from '../../utils/app-error';
import { readStay, readStayParams, readUnitIds, StayRow, stayValues } from '../stay-columns';

interface WatchRow extends StayRow {
  id: number;
  user_id: number;
  provider_id: string;
  name: string;
  location_external_id: string;
  location_name: string;
  area_name: string | null;
  unit_ids: string | null;
  stay_params: string | null;
  check_interval_minutes: number;
  is_active: number;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_result: string | null;
  found_count: number;
  auto_book: number;
  notify_only: number;
  allow_partial_match: number;
  max_price: number | null;
  notes: string | null;
  last_availability: string | null;
  created_at: string;
  updated_at: string;
}

export class WatchRepository extends BaseRepository<Watch> {
  protected readonly tableName = 'watches';

  /**
   * Create a new watch
   */
  create(userId: number, input: WatchInput): Watch {
    const stmt = this.db.prepare(`
      INSERT INTO watches (
        user_id, provider_id, name, location_external_id, location_name, area_name,
        arrival_date, departure_date, num_adults, num_children, num_infants, num_concessions,
        unit_ids, stay_params, check_interval_minutes, auto_book, notify_only,
        allow_partial_match, max_price, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      input.providerId,
      input.name,
      input.location.externalId,
      input.location.name,
      input.location.areaName ?? null,
      ...stayValues(input.stay),
      JSON.stringify(input.unitIds ?? []),
      JSON.stringify(input.stayParams ?? {}),
      input.checkIntervalMinutes || 5,
      input.autoBook ? 1 : 0,
      input.notifyOnly !== false ? 1 : 0,
      input.allowPartialMatch ? 1 : 0,
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
   * Update watch. The provider never changes; `location` and `stay` are replaced whole.
   */
  update(id: number, updates: WatchUpdate): Watch {
    const fields: string[] = [];
    const values: unknown[] = [];
    const push = (column: string, value: unknown): void => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (updates.name !== undefined) push('name', updates.name);
    if (updates.location !== undefined) {
      push('location_external_id', updates.location.externalId);
      push('location_name', updates.location.name);
      push('area_name', updates.location.areaName ?? null);
    }
    if (updates.stay !== undefined) {
      const [arrival, departure, adults, children, infants, concessions] = stayValues(updates.stay);
      push('arrival_date', arrival);
      push('departure_date', departure);
      push('num_adults', adults);
      push('num_children', children);
      push('num_infants', infants);
      push('num_concessions', concessions);
    }
    if (updates.unitIds !== undefined) push('unit_ids', JSON.stringify(updates.unitIds));
    if (updates.stayParams !== undefined) push('stay_params', JSON.stringify(updates.stayParams));
    if (updates.checkIntervalMinutes !== undefined) {
      push('check_interval_minutes', updates.checkIntervalMinutes);
    }
    if (updates.autoBook !== undefined) push('auto_book', updates.autoBook ? 1 : 0);
    if (updates.notifyOnly !== undefined) push('notify_only', updates.notifyOnly ? 1 : 0);
    if (updates.allowPartialMatch !== undefined) {
      push('allow_partial_match', updates.allowPartialMatch ? 1 : 0);
    }
    if (updates.maxPrice !== undefined) push('max_price', updates.maxPrice);
    if (updates.notes !== undefined) push('notes', updates.notes);

    if (fields.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE watches SET ${fields.join(', ')} WHERE id = ?`).run(values);
    }

    const watch = this.findById(id);
    if (!watch) throw new AppError('NOT_FOUND', 'Watch not found');
    return watch;
  }

  /**
   * Find watches by user ID
   */
  findByUserId(userId: number): Watch[] {
    const rows = this.db.prepare('SELECT * FROM watches WHERE user_id = ?').all(userId);
    return rows.map((row) => this.mapRow(row as WatchRow));
  }

  /**
   * Find active watches
   */
  findActive(): Watch[] {
    const rows = this.db.prepare('SELECT * FROM watches WHERE is_active = 1').all();
    return rows.map((row) => this.mapRow(row as WatchRow));
  }

  /**
   * Find watches due for checking
   */
  findDueForCheck(): Watch[] {
    const now = new Date().toISOString();
    const rows = this.db
      .prepare(
        'SELECT * FROM watches WHERE is_active = 1 AND (next_check_at IS NULL OR next_check_at <= ?)'
      )
      .all(now);
    return rows.map((row) => this.mapRow(row as WatchRow));
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

  /**
   * Update last availability results
   */
  updateLastAvailability(id: number, availability: unknown[]): void {
    const stmt = this.db.prepare(`
      UPDATE watches
      SET last_availability = ?
      WHERE id = ?
    `);
    stmt.run(JSON.stringify(availability), id);
  }

  protected mapRow(row: WatchRow): Watch {
    const where = `watches ${row.id}`;
    return {
      id: row.id,
      userId: row.user_id,
      providerId: row.provider_id,
      locationKey: locationKeyOf(row.provider_id, row.location_external_id),
      location: {
        externalId: row.location_external_id,
        name: row.location_name,
        ...(row.area_name !== null ? { areaName: row.area_name } : {}),
      },
      name: row.name,
      stay: readStay(row),
      unitIds: readUnitIds(row.unit_ids, where),
      stayParams: readStayParams(row.stay_params, where),
      checkIntervalMinutes: row.check_interval_minutes,
      isActive: Boolean(row.is_active),
      lastCheckedAt: this.parseDate(row.last_checked_at),
      nextCheckAt: this.parseDate(row.next_check_at),
      lastResult: (row.last_result ?? undefined) as WatchResult | undefined,
      lastAvailability: this.parseJson(row.last_availability),
      foundCount: row.found_count,
      autoBook: Boolean(row.auto_book),
      notifyOnly: Boolean(row.notify_only),
      allowPartialMatch: Boolean(row.allow_partial_match),
      maxPrice: row.max_price ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: this.parseDate(row.created_at)!,
      updatedAt: this.parseDate(row.updated_at)!,
    };
  }
}
