import {
  SiteSnipe,
  SiteSnipeInput,
  SnipeExecutionResult,
  SiteAvailabilityEntry,
} from '@shared/types';
import { SnipeResult, SnipeReleaseMode, SnipeStatus } from '@shared/types/common.types';
import { PARKSTAY_BASE_URL, BOOKING_HOLD_MINUTES } from '@shared/constants';
import { SiteSniperRepository } from '../../database/repositories';
import { ParkStayService } from '../parkstay/parkstay.service';
import { QueueService } from '../queue/queue.service';
import { NotificationService } from '../notification/notification.service';
import { computeDailyRolloverReleaseAt } from './release-timing';

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
  private parkStayService: ParkStayService;
  private queueService: QueueService;
  private notificationService: NotificationService;

  constructor(
    parkStayService: ParkStayService,
    queueService: QueueService,
    notificationService: NotificationService
  ) {
    this.repo = new SiteSniperRepository();
    this.parkStayService = parkStayService;
    this.queueService = queueService;
    this.notificationService = notificationService;
  }

  /**
   * Create a new Site Snipe. Computes releaseAt for DAILY_ROLLOVER and primes the
   * next check time for CANCELLATION mode.
   */
  async create(userId: number, input: SiteSnipeInput): Promise<SiteSnipe> {
    const prepared: SiteSnipeInput = { ...input };

    if (input.releaseMode === SnipeReleaseMode.DAILY_ROLLOVER) {
      prepared.releaseAt = computeDailyRolloverReleaseAt(input.arrivalDate, new Date());
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
  async get(id: number): Promise<SiteSnipe | undefined> {
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
  async update(id: number, updates: Partial<SiteSnipeInput>): Promise<SiteSnipe> {
    let snipe = this.repo.update(id, updates);

    const datesOrModeChanged =
      updates.arrivalDate !== undefined ||
      updates.departureDate !== undefined ||
      updates.releaseMode !== undefined;

    if (datesOrModeChanged && snipe.releaseMode === SnipeReleaseMode.DAILY_ROLLOVER) {
      const releaseAt = computeDailyRolloverReleaseAt(snipe.arrivalDate, new Date());
      snipe = this.repo.update(id, { releaseAt });
    }

    return snipe;
  }

  /**
   * Delete a snipe.
   */
  async delete(id: number): Promise<boolean> {
    return this.repo.delete(id);
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

      // Poll availability.
      const view = await this.parkStayService.getSiteAvailabilityView(
        snipe.campgroundId,
        {
          arrivalDate: this.toYmd(snipe.arrivalDate),
          departureDate: this.toYmd(snipe.departureDate),
          numAdult: snipe.numAdult,
          numConcession: snipe.numConcession,
          numChild: snipe.numChild,
          numInfant: snipe.numInfant,
          gearType: snipe.siteType,
        },
        snipe.queueEnabled
      );

      // Determine matching site.
      let matched: SiteAvailabilityEntry | undefined;
      if (snipe.targetSiteIds.length > 0) {
        matched = view.sites.find((s) => snipe.targetSiteIds.includes(s.siteId) && s.allOpen);
      } else {
        matched = view.sites.find((s) => s.allOpen);
      }

      if (!matched) {
        this.repo.incrementAttempts(snipeId);
        const beforeRelease = snipe.releaseAt ? checkedAt < snipe.releaseAt : false;
        const result = beforeRelease ? SnipeResult.TOO_EARLY : SnipeResult.UNAVAILABLE;
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
          matchedSiteId: matched.siteId,
          error: message,
          checkedAt,
        };
      }

      // Attempt the hold.
      const hold = await this.parkStayService.createBookingHold(
        {
          campgroundId: snipe.campgroundId,
          campsiteId: matched.siteId,
          campsiteClassId: matched.siteClassId,
          arrivalDate: this.toYmd(snipe.arrivalDate),
          departureDate: this.toYmd(snipe.departureDate),
          numAdult: snipe.numAdult,
          numConcession: snipe.numConcession,
          numChild: snipe.numChild,
          numInfant: snipe.numInfant,
          numVehicle: snipe.numVehicle,
          postcode: snipe.postcode,
        },
        snipe.queueEnabled
      );

      this.repo.incrementAttempts(snipeId);

      if (hold.success && hold.pk) {
        const heldExpiresAt = new Date(checkedAt.getTime() + BOOKING_HOLD_MINUTES * 60 * 1000);
        // We cannot know the exact BPOINT payment URL without the ledger step, so
        // link the user to the booking page to complete payment within the window.
        const paymentUrl = `${PARKSTAY_BASE_URL}/booking/`;
        this.repo.setHeld(snipeId, hold.pk, heldExpiresAt, paymentUrl, matched.siteId);
        this.repo.deactivate(snipeId); // job done — hold placed
        const updated = this.repo.findById(snipeId)!;
        await this.notificationService.notifySnipeHeld(updated);
        return {
          snipeId,
          success: true,
          result: SnipeResult.HELD,
          held: true,
          heldBookingPk: hold.pk,
          paymentUrl,
          matchedSiteId: matched.siteId,
          checkedAt,
        };
      }

      if (hold.inProgress) {
        // Transient: a stale booking is already in the session.
        const message = hold.error || 'A booking is already in progress';
        this.repo.setResult(snipeId, SnipeResult.ERROR, message);
        return {
          snipeId,
          success: false,
          result: SnipeResult.ERROR,
          held: false,
          matchedSiteId: matched.siteId,
          error: message,
          checkedAt,
        };
      }

      // Race lost or server re-validation failed.
      const message = hold.error || 'Site was taken before the hold could be placed';
      this.repo.setResult(snipeId, SnipeResult.UNAVAILABLE, message);
      this.repo.updateCheckTimestamps(snipeId, checkedAt, this.nextCheckFor(snipe, checkedAt));
      return {
        snipeId,
        success: true,
        result: SnipeResult.UNAVAILABLE,
        held: false,
        matchedSiteId: matched.siteId,
        error: message,
        checkedAt,
      };
    } catch (error: any) {
      console.error(`Site snipe ${snipeId} execution failed:`, error);
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
   * Compute the release instant for a snipe (delegates pure timing to release-timing).
   * Returns undefined for CANCELLATION mode (no fixed release).
   */
  computeReleaseAt(snipe: SiteSnipe): Date | undefined {
    if (snipe.releaseMode === SnipeReleaseMode.DAILY_ROLLOVER) {
      return computeDailyRolloverReleaseAt(snipe.arrivalDate, new Date());
    }
    if (snipe.releaseMode === SnipeReleaseMode.SCHEDULED) {
      return snipe.releaseAt;
    }
    return undefined;
  }

  /**
   * Update a snipe's status (used by the scheduler for lifecycle transitions).
   */
  setStatus(id: number, status: SnipeStatus): void {
    this.repo.updateStatus(id, status);
  }

  /**
   * Access to the underlying QueueService (used by the scheduler for warm-up).
   */
  getQueueService(): QueueService {
    return this.queueService;
  }

  // ---- internal helpers -------------------------------------------------------

  private toYmd(date: Date): string {
    return date.toISOString().slice(0, 10);
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
    return others.some((o) =>
      this.datesOverlap(o.arrivalDate, o.departureDate, snipe.arrivalDate, snipe.departureDate)
    );
  }

  private datesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
