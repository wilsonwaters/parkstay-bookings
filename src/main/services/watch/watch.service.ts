import {
  Watch,
  WatchInput,
  WatchUpdate,
  WatchExecutionResult,
  AvailabilityResult,
  Stay,
} from '@shared/types';
import { WatchResult } from '@shared/types/common.types';
import {
  addDays,
  compareDates,
  eachNight,
  isCalendarDate,
  todayIn,
} from '@shared/utils/calendar-date';
import { WatchRepository } from '../../database/repositories';
import { PARKSTAY_PROVIDER_ID, parkstayManifest } from '../../providers/parkstay';
import { ParkStayService } from '../parkstay/parkstay.service';
import { NotificationService } from '../notification/notification.service';
import { AppError } from '../../utils/app-error';
import { logger } from '../../utils/logger';

const log = logger.child({ module: 'watches' });

/** Everyone in the party: ParkStay's availability search takes one guest count. */
function partySize(stay: Stay): number {
  return stay.adults + stay.children + stay.infants + stay.concessions;
}

/** The ParkStay gear type a watch filters on, if any (`stay_params.gearType`). */
function gearTypeOf(watch: Watch): string | undefined {
  const gearType = watch.stayParams.gearType;
  return typeof gearType === 'string' && gearType !== '' ? gearType : undefined;
}

/**
 * Watch Service
 * Manages watch configurations and executes availability checks
 */
export class WatchService {
  private watchRepo: WatchRepository;
  private parkStayService: ParkStayService;
  private notificationService: NotificationService;

  constructor(
    watchRepo: WatchRepository,
    parkStayService: ParkStayService,
    notificationService: NotificationService
  ) {
    this.watchRepo = watchRepo;
    this.parkStayService = parkStayService;
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

      // Check availability via ParkStay API (the location is the campground)
      const campgroundId = watch.location.externalId;
      const siteType = gearTypeOf(watch);
      const availabilityResult = await this.parkStayService.checkAvailability(campgroundId, {
        campgroundId,
        arrivalDate: arrival,
        departureDate: departure,
        numGuests: partySize(watch.stay),
        siteType,
      });

      // Filter results based on preferences
      let matchingSites = availabilityResult.sites.filter((site) =>
        site.dates.every((date) => date.available && date.bookable)
      );

      // Filter by preferred sites if specified
      if (watch.unitIds.length > 0) {
        matchingSites = matchingSites.filter(
          (site) => watch.unitIds.includes(site.siteId) || watch.unitIds.includes(site.siteName)
        );
      }

      // Filter by site type if specified
      if (siteType) {
        matchingSites = matchingSites.filter(
          (site) => site.siteType.toLowerCase() === siteType.toLowerCase()
        );
      }

      // Filter by max price if specified
      if (watch.maxPrice) {
        matchingSites = matchingSites.filter((site) =>
          site.dates.every((date) => date.price <= watch.maxPrice!)
        );
      }

      const found = matchingSites.length > 0;

      // Map full-match results
      const availability: AvailabilityResult[] = matchingSites.map((site) => ({
        siteId: site.siteId,
        siteName: site.siteName,
        siteType: site.siteType,
        available: true,
        price: site.dates[0]?.price || 0,
        dates: { arrival, departure },
      }));

      // Check for partial matches if no full match found and partial matching is enabled
      let partialResults: AvailabilityResult[] = [];
      if (!found && watch.allowPartialMatch) {
        partialResults = await this.checkPartialAvailability(watch);
      }

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
        await this.notificationService.notifyWatchFound(watch, matchingSites);

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
   * Check for partial availability — iterates each night in the watch range individually,
   * then groups consecutive available nights per site into blocks.
   */
  private async checkPartialAvailability(watch: Watch): Promise<AvailabilityResult[]> {
    // Map: siteId → { siteName, siteType, price, availableNights }
    const siteAvailability = new Map<
      string,
      { siteName: string; siteType: string; price: number; availableNights: string[] }
    >();

    const campgroundId = watch.location.externalId;
    const siteType = gearTypeOf(watch);

    for (const night of eachNight(watch.stay.arrival, watch.stay.departure)) {
      try {
        const result = await this.parkStayService.checkAvailability(campgroundId, {
          campgroundId,
          arrivalDate: night,
          departureDate: addDays(night, 1),
          numGuests: partySize(watch.stay),
          siteType,
        });

        let nightSites = result.sites.filter((site) =>
          site.dates.every((date) => date.available && date.bookable)
        );

        if (watch.unitIds.length > 0) {
          nightSites = nightSites.filter(
            (site) => watch.unitIds.includes(site.siteId) || watch.unitIds.includes(site.siteName)
          );
        }

        if (siteType) {
          nightSites = nightSites.filter(
            (site) => site.siteType.toLowerCase() === siteType.toLowerCase()
          );
        }

        if (watch.maxPrice) {
          nightSites = nightSites.filter((site) =>
            site.dates.every((date) => date.price <= watch.maxPrice!)
          );
        }

        for (const site of nightSites) {
          if (!siteAvailability.has(site.siteId)) {
            siteAvailability.set(site.siteId, {
              siteName: site.siteName,
              siteType: site.siteType,
              price: site.dates[0]?.price || 0,
              availableNights: [],
            });
          }
          siteAvailability.get(site.siteId)!.availableNights.push(night);
        }
      } catch {
        // Skip nights where the individual availability check fails
      }
    }

    // Find consecutive blocks per site and build results
    const results: AvailabilityResult[] = [];

    for (const [siteId, data] of siteAvailability) {
      const nights = [...data.availableNights].sort(compareDates);
      if (nights.length === 0) continue;

      const pushRun = (first: string, last: string): void => {
        results.push({
          siteId,
          siteName: data.siteName,
          siteType: data.siteType,
          available: true,
          price: data.price,
          dates: { arrival: first, departure: addDays(last, 1) },
          partial: true,
        });
      };

      let runStart = nights[0];
      let runEnd = nights[0];
      for (const night of nights.slice(1)) {
        if (night === addDays(runEnd, 1)) {
          runEnd = night;
        } else {
          pushRun(runStart, runEnd);
          runStart = night;
          runEnd = night;
        }
      }
      // Push the final run
      pushRun(runStart, runEnd);
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
