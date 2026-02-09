import { WatchService } from '../services/watch/watch.service';
import { STQService } from '../services/stq/stq.service';
import { NotificationService } from '../services/notification/notification.service';
import { NotificationDispatcher } from '../services/notification/notification-dispatcher';
import { AuthService } from '../services/auth/AuthService';
import { BookingService } from '../services/booking/BookingService';
import { ParkStayService } from '../services/parkstay/parkstay.service';
import { QueueService } from '../services/queue/queue.service';
import { SettingsRepository } from '../database/repositories/SettingsRepository';
import { NotificationProviderRepository } from '../database/repositories/notification-provider.repository';
import { JobScheduler } from '../scheduler/job-scheduler';
import { GmailOTPService } from '../services/gmail/GmailOTPService';
import { registerWatchHandlers } from './handlers/watch.handlers';
import { registerSTQHandlers } from './handlers/stq.handlers';
import { registerNotificationHandlers } from './handlers/notification.handlers';
import { registerNotificationProviderHandlers } from './handlers/notification-provider.handlers';
import { registerAuthHandlers } from './handlers/auth.handlers';
import { registerBookingHandlers } from './handlers/booking.handlers';
import { registerSettingsHandlers } from './handlers/settings.handlers';
import { registerGmailHandlers } from './handlers/gmail.handlers';
import { registerParkStayHandlers } from './handlers/parkstay.handlers';
import { registerQueueHandlers } from './handlers/queue.handlers';

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(
  authService: AuthService,
  bookingService: BookingService,
  settingsRepository: SettingsRepository,
  watchService: WatchService,
  stqService: STQService,
  notificationService: NotificationService,
  jobScheduler: JobScheduler,
  parkStayService?: ParkStayService,
  notificationProviderRepository?: NotificationProviderRepository,
  notificationDispatcher?: NotificationDispatcher,
  queueService?: QueueService
): void {
  console.log('Registering IPC handlers...');

  // Get Gmail service singleton
  const gmailService = GmailOTPService.getInstance();

  registerAuthHandlers(authService);
  registerBookingHandlers(bookingService, () => authService.getCurrentUser()?.id || 0);
  registerSettingsHandlers(settingsRepository);
  registerWatchHandlers(watchService, jobScheduler);
  registerSTQHandlers(stqService, jobScheduler);
  registerNotificationHandlers(notificationService);
  registerGmailHandlers(gmailService);

  // Register ParkStay handlers if service provided
  if (parkStayService) {
    registerParkStayHandlers(parkStayService);
  }

  // Register notification provider handlers if repository and dispatcher provided
  if (notificationProviderRepository && notificationDispatcher) {
    registerNotificationProviderHandlers(notificationProviderRepository, notificationDispatcher);
  }

  // Register queue handlers if service provided
  if (queueService) {
    registerQueueHandlers(queueService);
  }

  console.log('IPC handlers registered');
}
