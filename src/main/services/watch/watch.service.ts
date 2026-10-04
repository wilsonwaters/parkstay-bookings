import {
  Watch,
  WatchInput,
  WatchUpdate,
  WatchExecutionResult,
  AvailabilityResult,
  type NightStatus,
  type UnitAvailability,
} from '@shared/types';
import { WatchResult } from '@shared/types/common.types';
import { toStayQuery } from '@shared/types/stay.types';
import { addDays, compareDates, isCalendarDate, todayIn } from '@shared/utils/calendar-date';
import { WatchRepository } from '../../database/repositories';
import { PARKSTAY_PROVIDER_ID, parkstayManifest } from '../../providers/parkstay';
import type { ProviderWith } from '../../providers/registry';
import { NotificationService } from '../notification/notification.service';
import { AppError } from '../../utils/app-error';
import { logger } from '../../utils/logger';

const log = logger.child({ module: 'watches' });

/** The provider a watch runs on: one with availability. */
export type WatchProvider = ProviderWith<'watches'>;

/** The gear type a watch filters on, if any (`stay_params.gearType`): shown as the site type. */
function gearTypeOf(watch: Watch): string | undefined {
  const gearType = watch.stayParams.gearType;
  return typeof gearType === 'string' && gearType !== '' ? gearType : undefined;
}

/** A unit the watch wants: any unit, or one named by its id or name. */
function isWanted(watch: Watch, unit: UnitAvailability): boolean {
  return (
    watch.unitIds.length === 0 ||
    watch.unitIds.includes(unit.unitId) ||
    watch.unitIds.includes(unit.unitName)
  );
}

/** A night within the watch's price limit (a night without a price is not ruled out). */
function withinPrice(watch: Watch, night: NightStatus): boolean {
  return !watch.maxPrice || night.price === undefined || night.price <= watch.maxPrice;
}

/** A night the watch would take: available and within the price limit. */
function isWantedNight(watch: Watch, night: NightStatus): boolean {
  return night.state === 'available' && withinPrice(watch, night);
}

/**
 * Watch Service
 * Manages watch configurations and executes availability checks
 */
export class WatchService {
  private watchRepo: WatchRepository;
  private provider: WatchProvider;
  private notificationService: NotificationService;

  /** `provider` is ParkStay from the registry until V4 resolves watches by provider. */
  constructor(
    watchRepo: WatchRepository,
    provider: WatchProvider,
    notificationService: NotificationService
  ) {
    this.watchRepo = watchRepo;
    this.provider = provider;
    this.notificationService = notificationService;
  }

  /**
   * Create a new watch
   */
  async create(userId: number, input: WatchInput): Promise<Watch> {
    // Watches run on ParkStay until the core services use the provider registry (V4).
    if (input.providerId !== PARKSTAY_PROVIDER_ID) {
      throw new AppError('VALIDATION', `Watches are not available for ${input.providerId}`);
    }
    // Validate dates: calendar dates, compared with today where the provider is
    const { arrival, departure } = input.stay;
    if (!isCalendarDate(arrival) || !isCalendarDate(departure)) {
      throw new AppError('VALIDATION', 'Dates must be calendar dates (YYYY-MM-DD)');
    }
    if (compareDates(arrival, todayIn(parkstayManifest.timezone)) < 0) {
      throw new AppError('VALIDATION', 'Arrival date must be today or in the future');
    }
    if (compareDates(departure, arrival) <= 0) {
      throw new AppError('VALIDATION', 'Departure date must be after arrival date');
    }

    // Create watch
    const watch = this.watchRepo.create(userId, input);

    // Calculate next check time
    const nextCheck = new Date();
    nextCheck.setMinutes(nextCheck.getMinutes() + watch.checkIntervalMinutes);
    this.watchRepo.updateCheckTimestamps(watch.id, new Date(), nextCheck);

    return this.watchRepo.findById(watch.id)!;
  }

  /**
   * Get watch by ID
   */
  async get(id: number): Promise<Watch | null> {
    return this.watchRepo.findById(id);
  }

  /**
   * List all watches for user
   */
  async list(userId: number): Promise<Watch[]> {
    return this.watchRepo.findByUserId(userId);
  }

  /**
   * Update watch
   */
  async update(id: number, updates: WatchUpdate): Promise<Watch> {
    return this.watchRepo.update(id, updates);
  }

  /**
   * Delete watch
   */
  async delete(id: number): Promise<boolean> {
    return this.watchRepo.deleteById(id);
  }

  /**
   * Activate watch
   */
  async activate(id: number): Promise<void> {
    this.watchRepo.activate(id);
  }

  /**
   * Deactivate watch
   */
  async deactivate(id: number): Promise<void> {
    this.watchRepo.deactivate(id);
  }

  /**
   * Execute watch - check availability
   */
  async execute(watchId: number): Promise<WatchExecutionResult> {
    const watch = this.watchRepo.findById(watchId);
    if (!watch) {
      throw new AppError('NOT_FOUND', 'Watch not found');
    }

    const checkedAt = new Date();

    try {
      // A row whose dates could not be read as calendar dates is marked in error, not run
      const { arrival, departure } = watch.stay;
      if (!isCalendarDate(arrival) || !isCalendarDate(departure)) {
        throw new Error('The watch dates are not calendar dates (YYYY-MM-DD)');
      }

      // Check if watch is still valid (arrival date not in past)
      if (compareDates(arrival, todayIn(parkstayManifest.timezone)) < 0) {
        // Deactivate watch as date has passed
        this.watchRepo.deactivate(watchId);
        return {
          watchId,
          success: false,
          found: false,
          error: new Error('Watch arrival date has passed'),
          checkedAt,
        };
      }

      // One availability call: every unit, night by night, with prices.
      const result = await this.provider.availability.check(
        watch.location.externalId,
        toStayQuery(watch.stay, watch.stayParams)
      );
      const units = result.units.filter((unit) => isWanted(watch, unit));
      const siteType = gearTypeOf(watch) ?? '';

      // Full matches: every night available and within the price limit.
      const matchingSites = units.filter(
        (unit) => unit.fullyAvailable && unit.nights.every((night) => withinPrice(watch, night))
      );
      const found = matchingSites.length > 0;

      const availability: AvailabilityResult[] = matchingSites.map((unit) => ({
        siteId: unit.unitId,
        siteName: unit.unitName,
        siteType: unit.unitType ?? siteType,
        available: true,
        // The nightly price (the first night's; ParkStay prices a site the same each night).
        price: unit.nights[0]?.price ?? 0,
        dates: { arrival, departure },
      }));

      // Partial matches come from the same nights: no extra requests.
      const partialResults =
        !found && watch.allowPartialMatch ? this.partialMatches(watch, units, siteType) : [];

      // Determine overall result type
      let resultType: WatchResult;
      if (found) {
        resultType = WatchResult.FOUND;
      } else if (partialResults.length > 0) {
        resultType = WatchResult.PARTIAL_FOUND;
      } else {
        resultType = WatchResult.NOT_FOUND;
      }

      const anyFound = found || partialResults.length > 0;
      const finalAvailability = found ? availability : partialResults;

      // Update watch status
      this.watchRepo.updateLastResult(watchId, resultType, anyFound);

      // Update last availability results
      this.watchRepo.updateLastAvailability(watchId, finalAvailability);

      // Update check timestamps
      const nextCheck = new Date();
      nextCheck.setMinutes(nextCheck.getMinutes() + watch.checkIntervalMinutes);
      this.watchRepo.updateCheckTimestamps(watchId, checkedAt, nextCheck);

      // Send notifications and handle deactivation
      if (found) {
        await this.notificationService.notifyWatchFound(watch, availability);

        // If auto-book is enabled, attempt to book
        if (watch.autoBook) {
          // Auto-booking would be implemented here
          // For safety, this should be carefully implemented with user confirmation
          log.info(`Auto-book enabled for watch ${watchId}, but not yet implemented`);
        }

        // If watch is configured for single notification, deactivate
        if (watch.notifyOnly) {
          this.watchRepo.deactivate(watchId);
        }
      } else if (partialResults.length > 0) {
        await this.notificationService.notifyWatchPartialFound(watch, partialResults);

        if (watch.notifyOnly) {
          this.watchRepo.deactivate(watchId);
        }
      }

      return {
        watchId,
        success: true,
        found: anyFound,
        availability: finalAvailability,
        checkedAt,
      };
    } catch (error: any) {
      log.error(`Watch ${watchId} execution failed:`, error);

      // Update watch with error status
      this.watchRepo.updateLastResult(watchId, WatchResult.ERROR, false);

      // Update check timestamps
      const nextCheck = new Date();
      nextCheck.setMinutes(nextCheck.getMinutes() + watch.checkIntervalMinutes);
      this.watchRepo.updateCheckTimestamps(watchId, checkedAt, nextCheck);

      return {
        watchId,
        success: false,
        found: false,
        error,
        checkedAt,
      };
    }
  }

  /**
   * Partial matches: per unit, each run of consecutive nights that are available (and within
   * the price limit), as its own stay.
   */
  private partialMatches(
    watch: Watch,
    units: UnitAvailability[],
    siteType: string
  ): AvailabilityResult[] {
    const results: AvailabilityResult[] = [];
    for (const unit of units) {
      let run: NightStatus[] = [];
      const pushRun = (): void => {
        if (run.length === 0) return;
        results.push({
          siteId: unit.unitId,
          siteName: unit.unitName,
          siteType: unit.unitType ?? siteType,
          available: true,
          price: run[0].price ?? 0,
          dates: { arrival: run[0].date, departure: addDays(run[run.length - 1].date, 1) },
          partial: true,
        });
        run = [];
      };
      for (const night of unit.nights) {
        const last = run[run.length - 1];
        if (!isWantedNight(watch, night)) {
          pushRun();
          continue;
        }
        if (last && night.date !== addDays(last.date, 1)) pushRun();
        run.push(night);
      }
      pushRun();
    }
    return results;
  }

  /**
   * Get watches due for checking
   */
  getDueWatches(): Watch[] {
    return this.watchRepo.findDueForCheck();
  }

  /**
   * Get active watches
   */
  getActiveWatches(): Watch[] {
    return this.watchRepo.findActive();
  }
}
