import { Watch, WatchInput, WatchExecutionResult, AvailabilityResult } from '@shared/types';
import { WatchResult } from '@shared/types/common.types';
import { WatchRepository } from '../../database/repositories';
import { ParkStayService } from '../parkstay/parkstay.service';
import { NotificationService } from '../notification/notification.service';

/**
 * Watch Service
 * Manages watch configurations and executes availability checks
 */
export class WatchService {
  private watchRepo: WatchRepository;
  private parkStayService: ParkStayService;
  private notificationService: NotificationService;

  constructor(parkStayService: ParkStayService, notificationService: NotificationService) {
    this.watchRepo = new WatchRepository();
    this.parkStayService = parkStayService;
    this.notificationService = notificationService;
  }

  /**
   * Create a new watch
   */
  async create(userId: number, input: WatchInput): Promise<Watch> {
    // Validate dates
    if (input.arrivalDate < new Date()) {
      throw new Error('Arrival date must be in the future');
    }
    if (input.departureDate <= input.arrivalDate) {
      throw new Error('Departure date must be after arrival date');
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
  async get(id: number): Promise<Watch | undefined> {
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
  async update(id: number, updates: Partial<WatchInput>): Promise<Watch> {
    return this.watchRepo.update(id, updates);
  }

  /**
   * Delete watch
   */
  async delete(id: number): Promise<boolean> {
    return this.watchRepo.delete(id);
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
      throw new Error('Watch not found');
    }

    const checkedAt = new Date();

    try {
      // Check if watch is still valid (arrival date not in past)
      if (watch.arrivalDate < new Date()) {
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

      // Check availability via ParkStay API
      const availabilityResult = await this.parkStayService.checkAvailability(watch.campgroundId, {
        campgroundId: watch.campgroundId,
        arrivalDate: watch.arrivalDate.toISOString().split('T')[0],
        departureDate: watch.departureDate.toISOString().split('T')[0],
        numGuests: watch.numGuests,
        siteType: watch.siteType,
      });

      // Filter results based on preferences
      let matchingSites = availabilityResult.sites.filter((site) =>
        site.dates.every((date) => date.available && date.bookable)
      );

      // Filter by preferred sites if specified
      if (watch.preferredSites && watch.preferredSites.length > 0) {
        matchingSites = matchingSites.filter(
          (site) =>
            watch.preferredSites!.includes(site.siteId) ||
            watch.preferredSites!.includes(site.siteName)
        );
      }

      // Filter by site type if specified
      if (watch.siteType) {
        matchingSites = matchingSites.filter(
          (site) => site.siteType.toLowerCase() === watch.siteType!.toLowerCase()
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
        dates: {
          arrival: watch.arrivalDate,
          departure: watch.departureDate,
        },
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
          console.log(`Auto-book enabled for watch ${watchId}, but not yet implemented`);
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
      console.error(`Watch ${watchId} execution failed:`, error);

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
    // Map: siteId → { siteName, siteType, price, availableDates }
    const siteAvailability = new Map<
      string,
      { siteName: string; siteType: string; price: number; availableDates: Date[] }
    >();

    const current = new Date(watch.arrivalDate);
    const end = new Date(watch.departureDate);

    while (current < end) {
      const nextDay = new Date(current);
      nextDay.setDate(nextDay.getDate() + 1);

      try {
        const result = await this.parkStayService.checkAvailability(watch.campgroundId, {
          campgroundId: watch.campgroundId,
          arrivalDate: current.toISOString().split('T')[0],
          departureDate: nextDay.toISOString().split('T')[0],
          numGuests: watch.numGuests,
          siteType: watch.siteType,
        });

        let nightSites = result.sites.filter((site) =>
          site.dates.every((date) => date.available && date.bookable)
        );

        if (watch.preferredSites && watch.preferredSites.length > 0) {
          nightSites = nightSites.filter(
            (site) =>
              watch.preferredSites!.includes(site.siteId) ||
              watch.preferredSites!.includes(site.siteName)
          );
        }

        if (watch.siteType) {
          nightSites = nightSites.filter(
            (site) => site.siteType.toLowerCase() === watch.siteType!.toLowerCase()
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
              availableDates: [],
            });
          }
          siteAvailability.get(site.siteId)!.availableDates.push(new Date(current));
        }
      } catch {
        // Skip nights where the individual availability check fails
      }

      current.setDate(current.getDate() + 1);
    }

    // Find consecutive blocks per site and build results
    const results: AvailabilityResult[] = [];

    for (const [siteId, data] of siteAvailability) {
      data.availableDates.sort((a, b) => a.getTime() - b.getTime());
      if (data.availableDates.length === 0) continue;

      let runStart = data.availableDates[0];
      let runEnd = data.availableDates[0];

      for (let i = 1; i < data.availableDates.length; i++) {
        const prev = data.availableDates[i - 1];
        const curr = data.availableDates[i];
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays === 1) {
          runEnd = curr;
        } else {
          const departure = new Date(runEnd);
          departure.setDate(departure.getDate() + 1);
          results.push({
            siteId,
            siteName: data.siteName,
            siteType: data.siteType,
            available: true,
            price: data.price,
            dates: { arrival: new Date(runStart), departure },
            partial: true,
          });
          runStart = curr;
          runEnd = curr;
        }
      }

      // Push the final run
      const departure = new Date(runEnd);
      departure.setDate(departure.getDate() + 1);
      results.push({
        siteId,
        siteName: data.siteName,
        siteType: data.siteType,
        available: true,
        price: data.price,
        dates: { arrival: new Date(runStart), departure },
        partial: true,
      });
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
