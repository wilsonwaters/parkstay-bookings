import type { AppContainer } from '../app/container';
import { registerWatchHandlers } from './handlers/watch.handlers';
import { registerSiteSniperHandlers } from './handlers/site-sniper.handlers';
import { registerNotificationHandlers } from './handlers/notification.handlers';
import { registerNotificationProviderHandlers } from './handlers/notification-provider.handlers';
import { registerAuthHandlers } from './handlers/auth.handlers';
import { registerBookingHandlers } from './handlers/booking.handlers';
import { registerSettingsHandlers } from './handlers/settings.handlers';
import { registerGmailHandlers } from './handlers/gmail.handlers';
import { registerParkStayHandlers } from './handlers/parkstay.handlers';
import { registerQueueHandlers } from './handlers/queue.handlers';
import { registerUpdaterHandlers } from './handlers/updater.handler';
import { registerAppHandlers } from './handlers/app.handler';
import { logger } from '../utils/logger';

/**
 * Register all IPC handlers from the composition root
 */
export function registerIPCHandlers(container: AppContainer): void {
  logger.info('Registering IPC handlers...');

  registerAuthHandlers(container.authService);
  registerBookingHandlers(container.bookingService, container.profile.requireUserId);
  registerSettingsHandlers(container.repositories.settings);
  registerWatchHandlers(container.watchService, container.scheduler);
  registerSiteSniperHandlers(container.siteSniperService, container.scheduler);
  registerNotificationHandlers(container.notificationService);
  registerGmailHandlers(container.gmailService);
  registerParkStayHandlers(container.parkStayService);
  registerNotificationProviderHandlers(
    container.repositories.notifiers,
    container.notifierDispatcher
  );
  registerQueueHandlers(container.queueService);
  registerUpdaterHandlers(container.autoUpdater);
  registerAppHandlers(container.repositories.settings);

  logger.info('IPC handlers registered');
}
