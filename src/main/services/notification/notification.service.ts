import {
  Notification,
  NotificationInput,
  Watch,
  SiteSnipe,
  AvailabilityResult,
} from '@shared/types';
import { NotificationType, RelatedType } from '@shared/types/common.types';
import { isCalendarDate, nightsBetween } from '@shared/utils/calendar-date';
import { NotificationRepository } from '../../database/repositories';
import { NotificationDispatcher } from './notification-dispatcher';
import type { EventSink } from '@shared/contracts/events';
import { Notification as ElectronNotification } from 'electron';
import { getBrandIconPath } from '../../app/paths';
import { logger } from '../../utils/logger';

const log = logger.child({ module: 'notifications' });

/**
 * A calendar date `YYYY-MM-DD` in the host's date format, as the day it names (formatted in
 * UTC from UTC midnight, so the host time zone cannot shift it). Anything else is shown as is.
 */
function formatCalendarDate(date: string): string {
  if (!isCalendarDate(date)) return date;
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { timeZone: 'UTC' });
}

/** What an email says a notification is about, beyond what is stored. */
interface DispatchMeta {
  providerId?: string;
  locationName?: string;
}

/**
 * Notification Service
 * Handles user notifications (desktop and in-app)
 */
export class NotificationService {
  private notificationRepo: NotificationRepository;
  private dispatcher: NotificationDispatcher | null = null;
  private events: EventSink | null = null;
  private soundEnabled: boolean = true;
  private desktopEnabled: boolean = true;

  /** `events` delivers `notification:created` to trusted renderers. */
  constructor(
    notificationRepo: NotificationRepository,
    dispatcher?: NotificationDispatcher,
    events?: EventSink
  ) {
    this.notificationRepo = notificationRepo;
    this.dispatcher = dispatcher || null;
    this.events = events || null;
  }

  /**
   * Create a notification
   * @param input - Notification data to store
   * @param dispatchMeta - The provider and location, for external notifiers (email, etc.)
   */
  async notify(input: NotificationInput, dispatchMeta?: DispatchMeta): Promise<Notification> {
    // Store notification in database
    const notification = this.notificationRepo.create(input);

    // Show desktop notification if enabled
    if (this.desktopEnabled) {
      await this.showDesktopNotification(notification);
    }

    // Play sound if enabled
    if (this.soundEnabled) {
      await this.playNotificationSound();
    }

    // Tell the renderer about the stored notification
    this.events?.emit('notification:created', notification);

    // Dispatch to all enabled external providers (email, etc.)
    if (this.dispatcher) {
      try {
        await this.dispatcher.dispatch({
          title: notification.title,
          message: notification.message,
          actionUrl: notification.actionUrl,
          type: notification.type,
          providerId: dispatchMeta?.providerId,
          locationName: dispatchMeta?.locationName,
        });
      } catch (error) {
        log.error('Error dispatching notification to providers:', error);
        // Don't throw - we don't want provider failures to break the main notification flow
      }
    }

    return notification;
  }

  /**
   * Notify when watch finds availability
   */
  async notifyWatchFound(watch: Watch, availability: any[]): Promise<void> {
    const sitesText = availability.length === 1 ? '1 site' : `${availability.length} sites`;
    const message = `Found ${sitesText} available at ${watch.location.name} for ${formatCalendarDate(watch.stay.arrival)} - ${formatCalendarDate(watch.stay.departure)}`;

    await this.notify(
      {
        userId: watch.userId,
        providerId: watch.providerId,
        type: NotificationType.WATCH_FOUND,
        title: 'Availability Found!',
        message,
        relatedId: watch.id,
        relatedType: RelatedType.WATCH,
        actionUrl: `/watches/${watch.id}`,
      },
      { providerId: watch.providerId, locationName: watch.location.name }
    );
  }

  /**
   * Notify when watch finds partial (consecutive subset) availability
   */
  async notifyWatchPartialFound(watch: Watch, partialResults: AvailabilityResult[]): Promise<void> {
    // Highlight the longest consecutive block
    const nightsOf = (r: AvailabilityResult): number =>
      nightsBetween(r.dates.arrival, r.dates.departure);
    const longestBlock = partialResults.reduce((best, r) =>
      nightsOf(r) > nightsOf(best) ? r : best
    );

    const nights = nightsOf(longestBlock);
    const nightsText = nights === 1 ? '1 night' : `${nights} consecutive nights`;
    const message = `Partial availability at ${watch.location.name}: ${nightsText} available from ${formatCalendarDate(longestBlock.dates.arrival)} - ${formatCalendarDate(longestBlock.dates.departure)}`;

    await this.notify(
      {
        userId: watch.userId,
        providerId: watch.providerId,
        type: NotificationType.WATCH_FOUND,
        title: 'Partial Availability Found!',
        message,
        relatedId: watch.id,
        relatedType: RelatedType.WATCH,
        actionUrl: `/watches/${watch.id}`,
      },
      { providerId: watch.providerId, locationName: watch.location.name }
    );
  }

  /**
   * Notify when a Site Snipe places a temporary hold (payment still required).
   */
  async notifySnipeHeld(snipe: SiteSnipe): Promise<void> {
    const arrival = formatCalendarDate(snipe.stay.arrival);
    const departure = formatCalendarDate(snipe.stay.departure);
    const where = snipe.location.name || snipe.location.externalId;
    // The provider sets how long a hold lasts (ParkStay: 30 minutes).
    const minutesLeft = snipe.holdExpiresAt
      ? Math.max(1, Math.round((snipe.holdExpiresAt.getTime() - Date.now()) / 60_000))
      : undefined;
    const deadline = minutesLeft ? ` within ${minutesLeft} minutes` : ' before the hold expires';
    const message = `Site held at ${where} for ${arrival}–${departure}. Complete payment${deadline}.`;

    await this.notify(
      {
        userId: snipe.userId,
        providerId: snipe.providerId,
        type: NotificationType.SNIPE_HELD,
        title: 'Site Held — Complete Payment!',
        message,
        relatedId: snipe.id,
        relatedType: RelatedType.SNIPE,
        actionUrl: `/site-sniper/${snipe.id}`,
      },
      { providerId: snipe.providerId, locationName: snipe.location.name || undefined }
    );
  }

  /**
   * Notify when a Site Snipe booking is completed (payment confirmed).
   */
  async notifySnipeBooked(snipe: SiteSnipe): Promise<void> {
    const arrival = formatCalendarDate(snipe.stay.arrival);
    const departure = formatCalendarDate(snipe.stay.departure);
    const where = snipe.location.name || snipe.location.externalId;
    const reference = snipe.bookedReference ? ` (ref ${snipe.bookedReference})` : '';
    const message = `Booking confirmed at ${where} for ${arrival}–${departure}${reference}.`;

    await this.notify(
      {
        userId: snipe.userId,
        providerId: snipe.providerId,
        type: NotificationType.SNIPE_BOOKED,
        title: 'Snipe Booked!',
        message,
        relatedId: snipe.id,
        relatedType: RelatedType.SNIPE,
        actionUrl: `/site-sniper/${snipe.id}`,
      },
      { providerId: snipe.providerId, locationName: snipe.location.name || undefined }
    );
  }

  /**
   * Notify booking confirmation
   */
  async notifyBookingConfirmed(
    userId: number,
    providerId: string,
    bookingId: number,
    bookingReference: string
  ): Promise<void> {
    await this.notify(
      {
        userId,
        providerId,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Booking Confirmed',
        message: `Your booking ${bookingReference} has been confirmed.`,
        relatedId: bookingId,
        relatedType: RelatedType.BOOKING,
        actionUrl: `/bookings/${bookingId}`,
      },
      { providerId }
    );
  }

  /**
   * Notify error
   */
  async notifyError(userId: number, error: Error, context: string): Promise<void> {
    await this.notify({
      userId,
      type: NotificationType.ERROR,
      title: 'Error',
      message: `${context}: ${error.message}`,
    });
  }

  /**
   * Notify warning
   */
  async notifyWarning(userId: number, title: string, message: string): Promise<void> {
    await this.notify({
      userId,
      type: NotificationType.WARNING,
      title,
      message,
    });
  }

  /**
   * Notify info
   */
  async notifyInfo(userId: number, title: string, message: string): Promise<void> {
    await this.notify({
      userId,
      type: NotificationType.INFO,
      title,
      message,
    });
  }

  /**
   * Show desktop notification
   */
  private async showDesktopNotification(notification: Notification): Promise<void> {
    try {
      const desktopNotification = new ElectronNotification({
        title: notification.title,
        body: notification.message,
        silent: !this.soundEnabled,
        icon: getBrandIconPath(),
      });

      desktopNotification.on('click', () => {
        // Handle notification click - navigate to relevant page
        if (notification.actionUrl) {
          // This would trigger navigation in the renderer process
          this.sendNavigationEvent(notification.actionUrl);
        }
      });

      desktopNotification.show();
    } catch (error) {
      log.error('Failed to show desktop notification:', error);
    }
  }

  /**
   * Play notification sound
   */
  private async playNotificationSound(): Promise<void> {
    // Sound playback would be implemented here
    // Could use a library like node-wav-player or play system sounds
    log.info('Playing notification sound');
  }

  /**
   * Send navigation event to renderer
   */
  private sendNavigationEvent(url: string): void {
    log.info(`Navigating to: ${url}`);
  }

  /**
   * Get notifications for user
   */
  async getNotifications(userId: number, limit?: number): Promise<Notification[]> {
    return this.notificationRepo.findByUserId(userId, limit);
  }

  /**
   * Get unread notifications for user
   */
  async getUnreadNotifications(userId: number): Promise<Notification[]> {
    return this.notificationRepo.findUnreadByUserId(userId);
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: number): Promise<number> {
    return this.notificationRepo.getUnreadCount(userId);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: number): Promise<void> {
    this.notificationRepo.markAsRead(id);
  }

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(userId: number): Promise<void> {
    this.notificationRepo.markAllAsRead(userId);
  }

  /**
   * Delete notification
   */
  async delete(id: number): Promise<boolean> {
    return this.notificationRepo.deleteById(id);
  }

  /**
   * Delete all notifications for user
   */
  async deleteAll(userId: number): Promise<number> {
    return this.notificationRepo.deleteAllForUser(userId);
  }

  /**
   * Clean up old notifications
   */
  async cleanupOld(days: number = 30): Promise<number> {
    return this.notificationRepo.deleteOld(days);
  }

  /**
   * Enable/disable desktop notifications
   */
  setDesktopEnabled(enabled: boolean): void {
    this.desktopEnabled = enabled;
  }

  /**
   * Enable/disable sound
   */
  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
  }
}
