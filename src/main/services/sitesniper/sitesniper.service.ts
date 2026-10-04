import {
  SiteSnipe,
  SiteSnipeInput,
  SiteSnipeUpdate,
  SnipeExecutionResult,
  Stay,
  StayParams,
  type LocationAvailability,
  type StayInput,
  type UnitAvailability,
} from '@shared/types';
import { SnipeResult, SnipeReleaseMode, SnipeStatus } from '@shared/types/common.types';
import { toStayQuery } from '@shared/types/stay.types';
import { compareDates, isCalendarDate } from '@shared/utils/calendar-date';
import { SiteSniperRepository } from '../../database/repositories';
import { PARKSTAY_PROVIDER_ID } from '../../providers/parkstay';
import type { ProviderWith } from '../../providers/registry';
import type { AccessGate } from '../../providers/sdk/provider';
import { NotificationService } from '../notification/notification.service';
import { AppError } from '../../utils/app-error';
import { logger } from '../../utils/logger';

const log = logger.child({ module: 'sitesniper' });

/** ParkStay's defaults for the stay fields a snipe leaves out. */
const PARKSTAY_SNIPE_DEFAULTS: StayParams = { gearType: 'all', numVehicles: 1 };

/** The provider a snipe runs on: availability, holds and a release policy (and maybe a queue). */
export type SnipeProvider = ProviderWith<'snipes'>;

/** A stay input with the party counts it leaves out set to 0. */
function fullStay(stay: StayInput): Stay {
  return {
    arrival: stay.arrival,
    departure: stay.departure,
    adults: stay.adults,
    children: stay.children ?? 0,
    infants: stay.infants ?? 0,
    concessions: stay.concessions ?? 0,
  };
}

/** One poll's units for the log: `3 available/available`, at most 20 of them. */
function describeUnits(units: UnitAvailability[]): string {
  const shown = units
    .slice(0, 20)
    .map((u) => `${u.unitName || u.unitId} ${u.nights.map((n) => n.state).join('/') || '-'}`);
  return shown.join(', ') + (units.length > 20 ? `, … ${units.length - 20} more` : '');
}

/** Throws when a stored stay's dates are not calendar dates, so the attempt is marked in error. */
function assertCalendarDates(stay: Stay): void {
  if (!isCalendarDate(stay.arrival) || !isCalendarDate(stay.departure)) {
    throw new Error('The snipe dates are not calendar dates (YYYY-MM-DD)');
  }
}

/**
 * Site Sniper Service
 *
 * Owns the lifecycle of Site Snipes: automated attempts to book a high-demand
 * campsite the instant it becomes available. An attempt polls availability via
 * the real ParkStay availability endpoint and, on a match, places a 30-minute
 * temporary hold via create_booking. Payment stays a human step — we notify the
 * user with the payment URL as soon as a hold is placed.
 *
 * The service returns results; the scheduler/IPC layer forwards them.
 */
export class SiteSniperService {
  private repo: SiteSniperRepository;
  private provider: SnipeProvider;
  private notificationService: NotificationService;

  /** `provider` is ParkStay from the registry until V4 resolves snipes by provider. */
  constructor(
    repo: SiteSniperRepository,
    provider: SnipeProvider,
    notificationService: NotificationService
  ) {
    this.repo = repo;
    this.provider = provider;
    this.notificationService = notificationService;
  }

  /**
   * Create a new Site Snipe. Computes releaseAt for DAILY_ROLLOVER and primes the
   * next check time for CANCELLATION mode.
   */
  async create(userId: number, input: SiteSnipeInput): Promise<SiteSnipe> {
    // Snipes run on ParkStay until the core services use the provider registry (V4).
    if (input.providerId !== PARKSTAY_PROVIDER_ID) {
      throw new AppError('VALIDATION', `Site Sniper is not available for ${input.providerId}`);
    }
    // Cross-field rules (the IPC schema checks field types and date order)
    const { arrival, departure } = input.stay;
    if (!isCalendarDate(arrival) || !isCalendarDate(departure)) {
      throw new AppError('VALIDATION', 'Dates must be calendar dates (YYYY-MM-DD)');
    }
    if (compareDates(departure, arrival) <= 0) {
      throw new AppError('VALIDATION', 'Departure date must be after arrival date');
    }
    if (input.releaseMode === SnipeReleaseMode.SCHEDULED && !input.releaseAt) {
      throw new AppError('VALIDATION', 'A release date/time is required for scheduled releases');
    }

    const prepared: SiteSnipeInput = {
      ...input,
      stayParams: { ...PARKSTAY_SNIPE_DEFAULTS, ...input.stayParams },
    };

    if (input.releaseMode === SnipeReleaseMode.DAILY_ROLLOVER) {
      prepared.releaseAt = await this.releaseAtFor(
        input.location.externalId,
        fullStay(input.stay),
        prepared.stayParams ?? {},
        input.releaseMode
      );
    } else if (input.releaseMode === SnipeReleaseMode.CANCELLATION) {
      prepared.releaseAt = undefined;
    }

    const snipe = this.repo.create(userId, prepared);

    if (input.releaseMode === SnipeReleaseMode.CANCELLATION) {
      // Cancellation mode has no fixed release; make it immediately due for a poll.
      const now = new Date();
      this.repo.updateCheckTimestamps(snipe.id, now, now);
    }

    return this.repo.findById(snipe.id)!;
  }

  /**
   * Get a snipe by id.
   */
  async get(id: number): Promise<SiteSnipe | null> {
    return this.repo.findById(id);
  }

  /**
   * List all snipes for a user.
   */
  async list(userId: number): Promise<SiteSnipe[]> {
    return this.repo.findByUserId(userId);
  }

  /**
   * Update a snipe. Recomputes releaseAt when the dates or release mode change.
   */
  async update(id: number, updates: SiteSnipeUpdate): Promise<SiteSnipe> {
    let snipe = this.repo.update(id, updates);

    const datesOrModeChanged = updates.stay !== undefined || updates.releaseMode !== undefined;

    if (datesOrModeChanged && snipe.releaseMode === SnipeReleaseMode.DAILY_ROLLOVER) {
      const releaseAt = await this.releaseAtFor(
        snipe.location.externalId,
        snipe.stay,
        snipe.stayParams,
        snipe.releaseMode
      );
      snipe = this.repo.update(id, { releaseAt });
    }

    return snipe;
  }

  /**
   * Delete a snipe.
   */
  async delete(id: number): Promise<boolean> {
    return this.repo.deleteById(id);
  }

  /**
   * Activate (arm) a snipe.
   */
  async activate(id: number): Promise<void> {
    this.repo.activate(id);
  }

  /**
   * Deactivate a snipe.
   */
  async deactivate(id: number): Promise<void> {
    this.repo.deactivate(id);
  }

  /**
   * Execute a single snipe attempt. Never throws — always resolves to a result.
   */
  async execute(snipeId: number): Promise<SnipeExecutionResult> {
    const checkedAt = new Date();
    const snipe = this.repo.findById(snipeId);

    if (!snipe) {
      return {
        snipeId,
        success: false,
        result: SnipeResult.ERROR,
        held: false,
        error: 'Site snipe not found',
        checkedAt,
      };
    }

    try {
      if (!snipe.isActive) {
        return {
          snipeId,
          success: false,
          result: SnipeResult.EXPIRED,
          held: false,
          error: 'Snipe is not active',
          checkedAt,
        };
      }

      if (this.repo.hasReachedMaxAttempts(snipeId)) {
        this.repo.deactivate(snipeId);
        this.repo.setResult(snipeId, SnipeResult.EXPIRED, 'Maximum attempts reached');
        return {
          snipeId,
          success: false,
          result: SnipeResult.EXPIRED,
          held: false,
          error: 'Maximum attempts reached',
          checkedAt,
        };
      }

      // A row whose dates could not be read as calendar dates is marked in error, not run.
      assertCalendarDates(snipe.stay);
      // The location is the provider's (ParkStay: the campground).
      const externalId = snipe.location.externalId;
      const stay = toStayQuery(snipe.stay, snipe.stayParams);

      // Poll availability: the preferred units, or every unit.
      const availability = await this.provider.availability.check(externalId, stay, {
        unitIds: snipe.unitIds.length > 0 ? snipe.unitIds : undefined,
      });
      const matched = availability.units.find((unit) => unit.fullyAvailable);
      log.info(
        `Snipe ${snipeId} poll: ${availability.units.length} unit(s), ` +
          `${matched ? `unit ${matched.unitId} free` : 'none free'} — ${describeUnits(availability.units)}`
      );

      if (!matched) {
        this.repo.incrementAttempts(snipeId);
        const result = this.beforeRelease(snipe, availability, checkedAt)
          ? SnipeResult.TOO_EARLY
          : SnipeResult.UNAVAILABLE;
        this.repo.setResult(snipeId, result);
        this.repo.updateCheckTimestamps(snipeId, checkedAt, this.nextCheckFor(snipe, checkedAt));
        return { snipeId, success: true, result, held: false, checkedAt };
      }

      // Compliance guard (best-effort): one booking per night. If another of this
      // user's snipes already holds/booked an overlapping night, skip this hold.
      if (this.hasOverlappingHold(snipe)) {
        const message =
          'Skipped: an overlapping snipe is already held/booked (one booking per night)';
        this.repo.setResult(snipeId, SnipeResult.ERROR, message);
        this.repo.incrementAttempts(snipeId);
        return {
          snipeId,
          success: false,
          result: SnipeResult.ERROR,
          held: false,
          matchedSiteId: matched.unitId,
          error: message,
          checkedAt,
        };
      }

      // Attempt the hold.
      const hold = await this.provider.holds.create({ externalId, unitId: matched.unitId, stay });

      this.repo.incrementAttempts(snipeId);

      if (hold.ok) {
        // Payment is a human step, on the provider's site, within the hold.
        const paymentUrl = this.provider.holds.paymentUrl(hold);
        const unitId = hold.unitId ?? matched.unitId;
        this.repo.setHeld(snipeId, hold.reference, hold.expiresAt, paymentUrl, unitId);
        this.repo.deactivate(snipeId); // job done — hold placed
        const updated = this.repo.findById(snipeId)!;
        await this.notificationService.notifySnipeHeld(updated);
        return {
          snipeId,
          success: true,
          result: SnipeResult.HELD,
          held: true,
          holdReference: hold.reference,
          paymentUrl,
          matchedSiteId: unitId,
          checkedAt,
        };
      }

      if (hold.reason === 'taken') {
        // Race lost: the site went between the check and the hold. Try again next tick.
        const message = hold.message || 'Site was taken before the hold could be placed';
        this.repo.setResult(snipeId, SnipeResult.UNAVAILABLE, message);
        this.repo.updateCheckTimestamps(snipeId, checkedAt, this.nextCheckFor(snipe, checkedAt));
        return {
          snipeId,
          success: true,
          result: SnipeResult.UNAVAILABLE,
          held: false,
          matchedSiteId: matched.unitId,
          error: message,
          checkedAt,
        };
      }

      // In progress (a stale booking in the session), closed for bookings, or refused.
      const message =
        hold.message ||
        (hold.reason === 'in-progress' ? 'A booking is already in progress' : 'Hold failed');
      this.repo.setResult(snipeId, SnipeResult.ERROR, message);
      return {
        snipeId,
        success: false,
        result: SnipeResult.ERROR,
        held: false,
        matchedSiteId: matched.unitId,
        error: message,
        checkedAt,
      };
    } catch (error: any) {
      log.error(`Site snipe ${snipeId} execution failed:`, error);
      this.repo.setResult(snipeId, SnipeResult.ERROR, error?.message || 'Unknown error');
      this.repo.incrementAttempts(snipeId);
      this.repo.updateCheckTimestamps(snipeId, checkedAt, this.nextCheckFor(snipe, checkedAt));
      return {
        snipeId,
        success: false,
        result: SnipeResult.ERROR,
        held: false,
        error: error?.message || 'Unknown error',
        checkedAt,
      };
    }
  }

  /**
   * Convenience: repeatedly run execute() at the snipe's poll cadence until it is
   * held/booked, the window elapses, the snipe is deactivated, or max attempts are
   * reached. The scheduler normally drives the loop (centralised timers); this is
   * provided for standalone use/testing.
   */
  async runSnipeWindow(snipeId: number): Promise<SnipeExecutionResult> {
    const snipe = this.repo.findById(snipeId);
    if (!snipe) {
      return {
        snipeId,
        success: false,
        result: SnipeResult.ERROR,
        held: false,
        error: 'Site snipe not found',
        checkedAt: new Date(),
      };
    }

    const deadline = Date.now() + snipe.windowDurationMs;
    let last: SnipeExecutionResult = await this.execute(snipeId);

    while (
      !last.held &&
      last.result !== SnipeResult.BOOKED &&
      Date.now() < deadline &&
      (this.repo.findById(snipeId)?.isActive ?? false)
    ) {
      await this.delay(snipe.pollIntervalMs);
      last = await this.execute(snipeId);
    }

    return last;
  }

  /**
   * Active snipes.
   */
  getActive(): SiteSnipe[] {
    return this.repo.findActive();
  }

  /**
   * Armed snipes awaiting their release window.
   */
  getArmed(): SiteSnipe[] {
    return this.repo.findArmed();
  }

  /**
   * Cancellation-mode snipes due for a poll.
   */
  getCancellationDue(): SiteSnipe[] {
    return this.repo.findDueForCheck();
  }

  /**
   * The release instant the scheduler arms a snipe for: the one the provider's release
   * policy computed when the snipe was saved (daily rollover), or the time the person set
   * (scheduled). Undefined for CANCELLATION mode (no fixed release).
   */
  computeReleaseAt(snipe: SiteSnipe): Date | undefined {
    if (snipe.releaseMode === SnipeReleaseMode.CANCELLATION) return undefined;
    return snipe.releaseAt;
  }

  /**
   * Update a snipe's status (used by the scheduler for lifecycle transitions).
   */
  setStatus(id: number, status: SnipeStatus): void {
    this.repo.updateStatus(id, status);
  }

  /**
   * The provider's access gate (ParkStay: the DBCA queue), which the scheduler waits in
   * before a release when a snipe asks for it. Undefined when the provider has none.
   */
  getAccessGate(): AccessGate | undefined {
    return this.provider.manifest.capabilities.accessGate ? this.provider.access : undefined;
  }

  // ---- internal helpers -------------------------------------------------------

  /** The provider's release instant for a stay, or undefined when it has none (cancellation). */
  private async releaseAtFor(
    externalId: string,
    stay: Stay,
    stayParams: StayParams,
    mode: SnipeReleaseMode
  ): Promise<Date | undefined> {
    const at = await this.provider.release.computeReleaseAt({
      mode,
      externalId,
      stay: toStayQuery(stay, stayParams),
      now: new Date(),
    });
    return at ?? undefined;
  }

  /** Before the release: the snipe's own release time, or the provider says the dates are not open. */
  private beforeRelease(snipe: SiteSnipe, availability: LocationAvailability, now: Date): boolean {
    if (snipe.releaseAt && now < snipe.releaseAt) return true;
    return availability.release?.open === false;
  }

  private nextCheckFor(snipe: SiteSnipe, from: Date): Date | undefined {
    if (snipe.releaseMode === SnipeReleaseMode.CANCELLATION) {
      return new Date(from.getTime() + snipe.pollIntervalMs);
    }
    return undefined;
  }

  private hasOverlappingHold(snipe: SiteSnipe): boolean {
    const others = this.repo
      .findByUserId(snipe.userId)
      .filter(
        (s) =>
          s.id !== snipe.id && (s.status === SnipeStatus.HELD || s.status === SnipeStatus.BOOKED)
      );
    return others.some((o) => this.staysOverlap(o.stay, snipe.stay));
  }

  /** Whether two stays share a night. Calendar dates `YYYY-MM-DD` compare correctly as text. */
  private staysOverlap(a: Stay, b: Stay): boolean {
    return a.arrival < b.departure && b.arrival < a.departure;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
