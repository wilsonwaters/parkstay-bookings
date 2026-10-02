import { BaseRepository } from './base.repository';
import { SiteSnipe, SiteSnipeInput } from '@shared/types';
import { SnipeResult, SnipeReleaseMode, SnipeStatus } from '@shared/types/common.types';

/**
 * Repository for Site Snipe entries (site_snipes table).
 */
export class SiteSniperRepository extends BaseRepository<SiteSnipe> {
  protected tableName = 'site_snipes';

  /**
   * Create a new Site Snipe. Applies sensible defaults for optional fields.
   */
  create(userId: number, input: SiteSnipeInput): SiteSnipe {
    const stmt = this.db.prepare(`
      INSERT INTO site_snipes (
        user_id, name, campground_id, campground_name, target_site_ids, site_type,
        arrival_date, departure_date, num_adult, num_concession, num_child, num_infant,
        num_vehicle, postcode, release_mode, release_at, queue_enabled, lead_time_seconds,
        poll_interval_ms, window_duration_ms, status, is_active, max_attempts, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      input.name,
      input.campgroundId,
      input.campgroundName || null,
      this.stringifyJson(input.targetSiteIds || []),
      input.siteType || 'all',
      this.formatDate(input.arrivalDate),
      this.formatDate(input.departureDate),
      input.numAdult ?? 2,
      input.numConcession ?? 0,
      input.numChild ?? 0,
      input.numInfant ?? 0,
      input.numVehicle ?? 1,
      input.postcode || null,
      input.releaseMode,
      this.formatDate(input.releaseAt),
      input.queueEnabled ? 1 : 0,
      input.leadTimeSeconds ?? 120,
      input.pollIntervalMs ?? 1500,
      input.windowDurationMs ?? 900000,
      SnipeStatus.ARMED,
      1,
      input.maxAttempts ?? 0,
      input.notes || null
    );

    const snipe = this.findById(result.lastInsertRowid as number);
    if (!snipe) {
      throw new Error('Failed to create site snipe');
    }
    return snipe;
  }

  /**
   * Update a Site Snipe's editable fields.
   */
  update(id: number, updates: Partial<SiteSnipeInput>): SiteSnipe {
    const fields: string[] = [];
    const values: any[] = [];

    const push = (column: string, value: any) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (updates.name !== undefined) push('name', updates.name);
    if (updates.campgroundId !== undefined) push('campground_id', updates.campgroundId);
    if (updates.campgroundName !== undefined) push('campground_name', updates.campgroundName);
    if (updates.targetSiteIds !== undefined)
      push('target_site_ids', this.stringifyJson(updates.targetSiteIds));
    if (updates.siteType !== undefined) push('site_type', updates.siteType);
    if (updates.arrivalDate !== undefined)
      push('arrival_date', this.formatDate(updates.arrivalDate));
    if (updates.departureDate !== undefined)
      push('departure_date', this.formatDate(updates.departureDate));
    if (updates.numAdult !== undefined) push('num_adult', updates.numAdult);
    if (updates.numConcession !== undefined) push('num_concession', updates.numConcession);
    if (updates.numChild !== undefined) push('num_child', updates.numChild);
    if (updates.numInfant !== undefined) push('num_infant', updates.numInfant);
    if (updates.numVehicle !== undefined) push('num_vehicle', updates.numVehicle);
    if (updates.postcode !== undefined) push('postcode', updates.postcode);
    if (updates.releaseMode !== undefined) push('release_mode', updates.releaseMode);
    if (updates.releaseAt !== undefined) push('release_at', this.formatDate(updates.releaseAt));
    if (updates.queueEnabled !== undefined) push('queue_enabled', updates.queueEnabled ? 1 : 0);
    if (updates.leadTimeSeconds !== undefined) push('lead_time_seconds', updates.leadTimeSeconds);
    if (updates.pollIntervalMs !== undefined) push('poll_interval_ms', updates.pollIntervalMs);
    if (updates.windowDurationMs !== undefined)
      push('window_duration_ms', updates.windowDurationMs);
    if (updates.maxAttempts !== undefined) push('max_attempts', updates.maxAttempts);
    if (updates.notes !== undefined) push('notes', updates.notes);

    if (fields.length === 0) {
      const snipe = this.findById(id);
      if (!snipe) throw new Error('Site snipe not found');
      return snipe;
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE site_snipes SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(values);

    const snipe = this.findById(id);
    if (!snipe) throw new Error('Site snipe not found');
    return snipe;
  }

  /**
   * Find all snipes for a user (newest first).
   */
  findByUserId(userId: number): SiteSnipe[] {
    return this.findWhere('user_id = ? ORDER BY created_at DESC', [userId]);
  }

  /**
   * Find all active snipes.
   */
  findActive(): SiteSnipe[] {
    return this.findWhere('is_active = 1');
  }

  /**
   * Find snipes that are armed and awaiting their release window.
   */
  findArmed(): SiteSnipe[] {
    return this.findWhere(
      `is_active = 1 AND status IN ('${SnipeStatus.ARMED}', '${SnipeStatus.WAITING_RELEASE}')`
    );
  }

  /**
   * Find cancellation-mode snipes due for a poll.
   */
  findDueForCheck(): SiteSnipe[] {
    const now = new Date().toISOString();
    return this.findWhere(
      `is_active = 1 AND release_mode = '${SnipeReleaseMode.CANCELLATION}'
       AND (next_check_at IS NULL OR next_check_at <= ?)`,
      [now]
    );
  }

  /**
   * Activate a snipe (arm it).
   */
  activate(id: number): void {
    this.db
      .prepare(`UPDATE site_snipes SET is_active = 1, status = ? WHERE id = ?`)
      .run(SnipeStatus.ARMED, id);
  }

  /**
   * Deactivate a snipe. Preserves terminal statuses (held/booked); otherwise disables.
   */
  deactivate(id: number): void {
    const snipe = this.findById(id);
    const terminal =
      snipe &&
      (snipe.status === SnipeStatus.HELD ||
        snipe.status === SnipeStatus.BOOKED ||
        snipe.status === SnipeStatus.EXPIRED ||
        snipe.status === SnipeStatus.FAILED);
    if (terminal) {
      this.db.prepare('UPDATE site_snipes SET is_active = 0 WHERE id = ?').run(id);
    } else {
      this.db
        .prepare('UPDATE site_snipes SET is_active = 0, status = ? WHERE id = ?')
        .run(SnipeStatus.DISABLED, id);
    }
  }

  /**
   * Update the snipe status.
   */
  updateStatus(id: number, status: SnipeStatus): void {
    this.db.prepare('UPDATE site_snipes SET status = ? WHERE id = ?').run(status, id);
  }

  /**
   * Update the last-checked / next-check timestamps.
   */
  updateCheckTimestamps(id: number, lastChecked: Date, nextCheck?: Date): void {
    this.db
      .prepare('UPDATE site_snipes SET last_checked_at = ?, next_check_at = ? WHERE id = ?')
      .run(lastChecked.toISOString(), nextCheck ? nextCheck.toISOString() : null, id);
  }

  /**
   * Increment the attempts counter.
   */
  incrementAttempts(id: number): void {
    this.db
      .prepare('UPDATE site_snipes SET attempts_count = attempts_count + 1 WHERE id = ?')
      .run(id);
  }

  /**
   * Record that a temporary hold was placed on a site.
   * matchedSiteId is surfaced in the execution result; there is no dedicated column.
   */
  setHeld(
    id: number,
    pk: string,
    expiresAt: Date,
    paymentUrl?: string,
    _matchedSiteId?: string
  ): void {
    this.db
      .prepare(
        `UPDATE site_snipes
         SET status = ?, last_result = ?, held_booking_pk = ?, held_expires_at = ?,
             payment_url = ?, last_error = NULL
         WHERE id = ?`
      )
      .run(SnipeStatus.HELD, SnipeResult.HELD, pk, expiresAt.toISOString(), paymentUrl || null, id);
  }

  /**
   * Record that the booking was completed (payment confirmed by the user).
   */
  setBooked(id: number, reference: string): void {
    this.db
      .prepare(
        `UPDATE site_snipes
         SET status = ?, last_result = ?, booked_reference = ?, is_active = 0
         WHERE id = ?`
      )
      .run(SnipeStatus.BOOKED, SnipeResult.BOOKED, reference, id);
  }

  /**
   * Record the outcome of an attempt (and optional error message).
   */
  setResult(id: number, result: SnipeResult, error?: string): void {
    this.db
      .prepare('UPDATE site_snipes SET last_result = ?, last_error = ? WHERE id = ?')
      .run(result, error || null, id);
  }

  /**
   * Whether the snipe has reached its max attempts. maxAttempts === 0 means unlimited.
   */
  hasReachedMaxAttempts(id: number): boolean {
    const snipe = this.findById(id);
    if (!snipe) return true;
    if (snipe.maxAttempts <= 0) return false;
    return snipe.attemptsCount >= snipe.maxAttempts;
  }

  protected mapToModel(row: any): SiteSnipe {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      campgroundId: row.campground_id,
      campgroundName: row.campground_name || undefined,
      targetSiteIds: this.parseJson<string[]>(row.target_site_ids) || [],
      siteType: row.site_type,
      arrivalDate: this.parseDate(row.arrival_date)!,
      departureDate: this.parseDate(row.departure_date)!,
      numAdult: row.num_adult,
      numConcession: row.num_concession,
      numChild: row.num_child,
      numInfant: row.num_infant,
      numVehicle: row.num_vehicle,
      postcode: row.postcode || undefined,
      releaseMode: row.release_mode as SnipeReleaseMode,
      releaseAt: this.parseDate(row.release_at),
      queueEnabled: Boolean(row.queue_enabled),
      leadTimeSeconds: row.lead_time_seconds,
      pollIntervalMs: row.poll_interval_ms,
      windowDurationMs: row.window_duration_ms,
      status: row.status as SnipeStatus,
      isActive: Boolean(row.is_active),
      attemptsCount: row.attempts_count,
      maxAttempts: row.max_attempts,
      lastCheckedAt: this.parseDate(row.last_checked_at),
      nextCheckAt: this.parseDate(row.next_check_at),
      lastResult: (row.last_result as SnipeResult | null) || undefined,
      lastError: row.last_error || undefined,
      heldBookingPk: row.held_booking_pk || undefined,
      heldExpiresAt: this.parseDate(row.held_expires_at),
      paymentUrl: row.payment_url || undefined,
      bookedReference: row.booked_reference || undefined,
      notes: row.notes || undefined,
      createdAt: this.parseDate(row.created_at)!,
      updatedAt: this.parseDate(row.updated_at)!,
    };
  }

  protected mapToRow(model: Partial<SiteSnipe>): any {
    return {
      user_id: model.userId,
      name: model.name,
      campground_id: model.campgroundId,
      campground_name: model.campgroundName,
      target_site_ids: this.stringifyJson(model.targetSiteIds),
      site_type: model.siteType,
      arrival_date: this.formatDate(model.arrivalDate),
      departure_date: this.formatDate(model.departureDate),
      num_adult: model.numAdult,
      num_concession: model.numConcession,
      num_child: model.numChild,
      num_infant: model.numInfant,
      num_vehicle: model.numVehicle,
      postcode: model.postcode,
      release_mode: model.releaseMode,
      release_at: this.formatDate(model.releaseAt),
      queue_enabled: model.queueEnabled ? 1 : 0,
      lead_time_seconds: model.leadTimeSeconds,
      poll_interval_ms: model.pollIntervalMs,
      window_duration_ms: model.windowDurationMs,
      status: model.status,
      is_active: model.isActive ? 1 : 0,
      attempts_count: model.attemptsCount,
      max_attempts: model.maxAttempts,
      last_checked_at: this.formatDate(model.lastCheckedAt),
      next_check_at: this.formatDate(model.nextCheckAt),
      last_result: model.lastResult,
      last_error: model.lastError,
      held_booking_pk: model.heldBookingPk,
      held_expires_at: this.formatDate(model.heldExpiresAt),
      payment_url: model.paymentUrl,
      booked_reference: model.bookedReference,
      notes: model.notes,
    };
  }
}
