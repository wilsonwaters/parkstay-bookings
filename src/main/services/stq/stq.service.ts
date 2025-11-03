import { SkipTheQueueEntry, STQInput, STQExecutionResult } from '@shared/types';
import { STQResult } from '@shared/types/common.types';
import { STQRepository } from '../../database/repositories';
import { ParkStayService } from '../parkstay/parkstay.service';
import { NotificationService } from '../notification/notification.service';

/**
 * Skip The Queue Service
 * Manages STQ entries and executes rebooking attempts
 */
export class STQService {
  private stqRepo: STQRepository;
  private parkStayService: ParkStayService;
  private notificationService: NotificationService;

  constructor(
    parkStayService: ParkStayService,
    notificationService: NotificationService
  ) {
    this.stqRepo = new STQRepository();
    this.parkStayService = parkStayService;
    this.notificationService = notificationService;
  }

  /**
   * Create a new STQ entry
   */
  async create(userId: number, input: STQInput): Promise<SkipTheQueueEntry> {
    // Check if STQ entry already exists for this booking
    const existing = this.stqRepo.findByBookingId(input.bookingId);
    if (existing) {
      throw new Error('Skip The Queue entry already exists for this booking');
    }

    // Create STQ entry
    const entry = this.stqRepo.create(userId, input);

    // Calculate next check time
    const nextCheck = new Date();
    nextCheck.setMinutes(nextCheck.getMinutes() + entry.checkIntervalMinutes);
    this.stqRepo.updateCheckTimestamps(entry.id, new Date(), nextCheck);

    return this.stqRepo.findById(entry.id)!;
  }

  /**
   * Get STQ entry by ID
   */
  async get(id: number): Promise<SkipTheQueueEntry | undefined> {
    return this.stqRepo.findById(id);
  }

  /**
   * List all STQ entries for user
   */
  async list(userId: number): Promise<SkipTheQueueEntry[]> {
    return this.stqRepo.findByUserId(userId);
  }

  /**
   * Update STQ entry
   */
  async update(id: number, updates: Partial<STQInput>): Promise<SkipTheQueueEntry> {
    return this.stqRepo.update(id, updates);
  }

  /**
   * Delete STQ entry
   */
  async delete(id: number): Promise<boolean> {
    return this.stqRepo.delete(id);
  }

  /**
   * Activate STQ entry
   */
  async activate(id: number): Promise<void> {
    this.stqRepo.activate(id);
  }

  /**
   * Deactivate STQ entry
   */
  async deactivate(id: number): Promise<void> {
    this.stqRepo.deactivate(id);
  }

  /**
   * Execute STQ check - attempt rebooking
   */
  async execute(stqId: number): Promise<STQExecutionResult> {
    const entry = this.stqRepo.findById(stqId);
    if (!entry) {
      throw new Error('STQ entry not found');
    }

    const checkedAt = new Date();

    try {
      // Check if max attempts reached
      if (this.stqRepo.hasReachedMaxAttempts(stqId)) {
        this.stqRepo.deactivate(stqId);
        return {
          stqId,
          success: false,
          rebooked: false,
          error: new Error('Maximum attempts reached'),
          checkedAt,
        };
      }

      // Get booking details to check current status
      const bookingDetails = await this.parkStayService.getBookingDetails(
        entry.bookingReference
      );

      // Check if booking is already cancelled
      if (bookingDetails.status === 'cancelled') {
        // Attempt to rebook
        const rebookResult = await this.parkStayService.updateBooking(entry.bookingReference, {
          bookingReference: entry.bookingReference,
        });

        if (rebookResult.success && rebookResult.newBookingReference) {
          // Rebooking successful
          this.stqRepo.markSuccess(stqId, rebookResult.newBookingReference);

          // Send success notification
          await this.notificationService.notifySTQSuccess(entry, rebookResult.newBookingReference);

          return {
            stqId,
            success: true,
            rebooked: true,
            newBookingReference: rebookResult.newBookingReference,
            checkedAt,
          };
        } else {
          // Rebooking failed
          this.stqRepo.updateLastResult(stqId, STQResult.UNAVAILABLE);
          this.stqRepo.incrementAttempts(stqId);

          // Update check timestamps
          const nextCheck = new Date();
          nextCheck.setMinutes(nextCheck.getMinutes() + entry.checkIntervalMinutes);
          this.stqRepo.updateCheckTimestamps(stqId, checkedAt, nextCheck);

          return {
            stqId,
            success: true,
            rebooked: false,
            error: new Error(rebookResult.error || 'Rebooking unavailable'),
            checkedAt,
          };
        }
      } else {
        // Booking still active, no action needed
        this.stqRepo.incrementAttempts(stqId);

        // Update check timestamps
        const nextCheck = new Date();
        nextCheck.setMinutes(nextCheck.getMinutes() + entry.checkIntervalMinutes);
        this.stqRepo.updateCheckTimestamps(stqId, checkedAt, nextCheck);

        return {
          stqId,
          success: true,
          rebooked: false,
          checkedAt,
        };
      }
    } catch (error: any) {
      console.error(`STQ ${stqId} execution failed:`, error);

      // Update STQ with error status
      this.stqRepo.updateLastResult(stqId, STQResult.ERROR);
      this.stqRepo.incrementAttempts(stqId);

      // Update check timestamps
      const nextCheck = new Date();
      nextCheck.setMinutes(nextCheck.getMinutes() + entry.checkIntervalMinutes);
      this.stqRepo.updateCheckTimestamps(stqId, checkedAt, nextCheck);

      return {
        stqId,
        success: false,
        rebooked: false,
        error,
        checkedAt,
      };
    }
  }

  /**
   * Get STQ entries due for checking
   */
  getDueEntries(): SkipTheQueueEntry[] {
    return this.stqRepo.findDueForCheck();
  }

  /**
   * Get active STQ entries
   */
  getActiveEntries(): SkipTheQueueEntry[] {
    return this.stqRepo.findActive();
  }

  /**
   * Calculate optimal booking schedule for 180-day window
   * This helps users plan their bookings to maximize stay duration
   */
  calculateBookingSchedule(
    targetStartDate: Date,
    targetEndDate: Date,
    isPeakSeason: boolean
  ): {
    initialBookingDate: Date;
    rebookCheckDates: Date[];
    maxStayNights: number;
  } {
    const maxStayNights = isPeakSeason ? 14 : 28;
    const bookingWindowDays = 180;

    // Calculate when to make initial booking (180 days before)
    const initialBookingDate = new Date(targetStartDate);
    initialBookingDate.setDate(initialBookingDate.getDate() - bookingWindowDays);

    // Calculate when to check for rebooking (21-28 days before 180-day threshold)
    const rebookCheckDates: Date[] = [];
    const numNights = Math.ceil(
      (targetEndDate.getTime() - targetStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // If stay exceeds max stay, need multiple bookings
    if (numNights > maxStayNights) {
      let currentDate = new Date(targetStartDate);
      while (currentDate < targetEndDate) {
        // Calculate threshold date (180 days before this segment)
        const thresholdDate = new Date(currentDate);
        thresholdDate.setDate(thresholdDate.getDate() - bookingWindowDays);

        // Calculate check dates (21-28 days before threshold)
        const checkDate = new Date(thresholdDate);
        checkDate.setDate(checkDate.getDate() + bookingWindowDays - 28);
        rebookCheckDates.push(checkDate);

        // Move to next segment
        currentDate.setDate(currentDate.getDate() + maxStayNights);
      }
    }

    return {
      initialBookingDate,
      rebookCheckDates,
      maxStayNights,
    };
  }
}
