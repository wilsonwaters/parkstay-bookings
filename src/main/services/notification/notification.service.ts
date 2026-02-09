import { Notification, NotificationInput, Watch, SkipTheQueueEntry } from '@shared/types';
import { NotificationType, RelatedType } from '@shared/types/common.types';
import { NotificationRepository } from '../../database/repositories';
import { NotificationDispatcher } from './notification-dispatcher';
import { Notification as ElectronNotification, app } from 'electron';
import * as path from 'path';
import { logger } from '../../utils/logger';

/**
 * Notification Service
 * Handles user notifications (desktop and in-app)
 */
export class NotificationService {
  private notificationRepo: NotificationRepository;
  private dispatcher: NotificationDispatcher | null = null;
  private soundEnabled: boolean = true;
  private desktopEnabled: boolean = true;

  constructor(dispatcher?: NotificationDispatcher) {
    this.notificationRepo = new NotificationRepository();
    this.dispatcher = dispatcher || null;
  }

  /**
   * Create a notification
   * @param input - Notification data to store
   * @param dispatchMeta - Optional metadata for external providers (email, etc.)
   */
  async notify(
    input: NotificationInput,
    dispatchMeta?: { campgroundName?: string }
  ): Promise<Notification> {
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

    // Send to renderer process via IPC
    this.sendToRenderer(notification);

    // Dispatch to all enabled external providers (email, etc.)
    if (this.dispatcher) {
      try {
        await this.dispatcher.dispatch({
          title: notification.title,
          message: notification.message,
          actionUrl: notification.actionUrl,
          type: notification.type,
          campgroundName: dispatchMeta?.campgroundName,
        });
      } catch (error) {
        logger.error('Error dispatching notification to providers:', error);
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
    const message = `Found ${sitesText} available at ${watch.campgroundName} for ${watch.arrivalDate.toLocaleDateString()} - ${watch.departureDate.toLocaleDateString()}`;

    await this.notify(
      {
        userId: watch.userId,
        type: NotificationType.WATCH_FOUND,
        title: 'Availability Found!',
        message,
        relatedId: watch.id,
        relatedType: RelatedType.WATCH,
        actionUrl: `/watches/${watch.id}`,
      },
      { campgroundName: watch.campgroundName }
    );
  }

  /**
   * Notify when STQ successfully rebooks
   */
  async notifySTQSuccess(entry: SkipTheQueueEntry, newBookingReference: string): Promise<void> {
    const message = `Successfully rebooked ${entry.bookingReference}. New booking reference: ${newBookingReference}`;

    await this.notify({
      userId: entry.userId,
      type: NotificationType.STQ_SUCCESS,
      title: 'Rebooking Successful!',
      message,
      relatedId: entry.id,
      relatedType: RelatedType.STQ,
      actionUrl: `/stq/${entry.id}`,
    });
  }

  /**
   * Notify booking confirmation
   */
  async notifyBookingConfirmed(
    userId: number,
    bookingId: number,
    bookingReference: string
  ): Promise<void> {
    await this.notify({
      userId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Booking Confirmed',
      message: `Your booking ${bookingReference} has been confirmed.`,
      relatedId: bookingId,
      relatedType: RelatedType.BOOKING,
      actionUrl: `/bookings/${bookingId}`,
    });
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
        icon: path.join(app.getAppPath(), 'resources', 'icons', 'icon.png'),
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
      console.error('Failed to show desktop notification:', error);
    }
  }

  /**
   * Play notification sound
   */
  private async playNotificationSound(): Promise<void> {
    // Sound playback would be implemented here
    // Could use a library like node-wav-player or play system sounds
    console.log('Playing notification sound');
  }

  /**
   * Send notification to renderer process
   */
  private sendToRenderer(notification: Notification): void {
    // This would use IPC to send notification to renderer
    // Implementation depends on how the app is structured
    console.log('Sending notification to renderer:', notification.title);
  }

  /**
   * Send navigation event to renderer
   */
  private sendNavigationEvent(url: string): void {
    console.log('Navigating to:', url);
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
    return this.notificationRepo.delete(id);
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
