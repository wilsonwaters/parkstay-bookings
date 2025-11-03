import { WatchService } from '../services/watch/watch.service';
import { STQService } from '../services/stq/stq.service';
import { NotificationService } from '../services/notification/notification.service';
import { AuthService } from '../services/auth/AuthService';
import { BookingService } from '../services/booking/BookingService';
import { SettingsRepository } from '../database/repositories/SettingsRepository';
import { JobScheduler } from '../scheduler/job-scheduler';
import { registerWatchHandlers } from './handlers/watch.handlers';
import { registerSTQHandlers } from './handlers/stq.handlers';
import { registerNotificationHandlers } from './handlers/notification.handlers';
import { registerAuthHandlers } from './handlers/auth.handlers';
import { registerBookingHandlers } from './handlers/booking.handlers';
import { registerSettingsHandlers } from './handlers/settings.handlers';

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
  jobScheduler: JobScheduler
): void {
  console.log('Registering IPC handlers...');

  registerAuthHandlers(authService);
  registerBookingHandlers(bookingService, () => authService.getCurrentUser()?.id || 0);
  registerSettingsHandlers(settingsRepository);
  registerWatchHandlers(watchService, jobScheduler);
  registerSTQHandlers(stqService, jobScheduler);
  registerNotificationHandlers(notificationService);

  console.log('IPC handlers registered');
}
