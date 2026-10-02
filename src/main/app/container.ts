/**
 * Composition root.
 *
 * Builds every repository, service, notifier, dispatcher, scheduler, updater and Gmail
 * service exactly once and wires them together by constructor injection. This is the only
 * place in `src/main` that constructs them: anything else receives what it needs from the
 * container.
 */

import type Database from 'better-sqlite3';
import { closeDatabase } from '../database/connection';
import {
  BookingRepository,
  NotificationProviderRepository,
  NotificationRepository,
  QueueSessionRepository,
  SettingsRepository,
  SiteSniperRepository,
  UserRepository,
  WatchRepository,
} from '../database/repositories';
import { AuthService } from '../services/auth/AuthService';
import { BookingService } from '../services/booking/BookingService';
import { GmailOTPService } from '../services/gmail/GmailOTPService';
import { OAuth2Handler } from '../services/gmail/oauth2-handler';
import { NotificationDispatcher } from '../services/notification/notification-dispatcher';
import { NotificationService } from '../services/notification/notification.service';
import { SMTPEmailProvider } from '../services/notification/providers/email-smtp.provider';
import { ParkStayService } from '../services/parkstay/parkstay.service';
import { QueueService } from '../services/queue/queue.service';
import { SiteSniperService } from '../services/sitesniper/sitesniper.service';
import { AutoUpdaterService } from '../services/updater/auto-updater.service';
import { WatchService } from '../services/watch/watch.service';
import { JobScheduler } from '../scheduler/job-scheduler';
import { createLocalProfile, LocalProfile } from './profile';

export interface AppRepositories {
  readonly users: UserRepository;
  readonly bookings: BookingRepository;
  readonly settings: SettingsRepository;
  readonly notifiers: NotificationProviderRepository;
  readonly notifications: NotificationRepository;
  readonly watches: WatchRepository;
  readonly snipes: SiteSniperRepository;
  readonly queueSessions: QueueSessionRepository;
}

export interface AppContainer {
  readonly db: Database.Database;
  readonly repositories: AppRepositories;
  readonly profile: LocalProfile;
  readonly notifierDispatcher: NotificationDispatcher;
  readonly queueService: QueueService;
  readonly parkStayService: ParkStayService;
  readonly authService: AuthService;
  readonly bookingService: BookingService;
  readonly notificationService: NotificationService;
  readonly watchService: WatchService;
  readonly siteSniperService: SiteSniperService;
  readonly gmailService: GmailOTPService;
  readonly autoUpdater: AutoUpdaterService;
  readonly scheduler: JobScheduler;
  /** Stops the scheduler, destroys the queue service and closes the database. Safe to call twice. */
  dispose(): void;
}

export interface ContainerOptions {
  /** An open, migrated database (`openDatabase`). The container owns it from here: `dispose` closes it. */
  readonly db: Database.Database;
}

export function createContainer({ db }: ContainerOptions): AppContainer {
  const repositories: AppRepositories = {
    users: new UserRepository(db),
    bookings: new BookingRepository(db),
    settings: new SettingsRepository(db),
    notifiers: new NotificationProviderRepository(db),
    notifications: new NotificationRepository(db),
    watches: new WatchRepository(db),
    snipes: new SiteSniperRepository(db),
    queueSessions: new QueueSessionRepository(db),
  };

  const profile = createLocalProfile(repositories.users);

  const notifierDispatcher = new NotificationDispatcher(repositories.notifiers, [
    new SMTPEmailProvider(),
  ]);
  const queueService = new QueueService(repositories.queueSessions);
  const parkStayService = new ParkStayService(queueService);
  const authService = new AuthService(repositories.users);
  const bookingService = new BookingService(repositories.bookings);
  const notificationService = new NotificationService(
    repositories.notifications,
    notifierDispatcher
  );
  const watchService = new WatchService(repositories.watches, parkStayService, notificationService);
  const siteSniperService = new SiteSniperService(
    repositories.snipes,
    parkStayService,
    queueService,
    notificationService
  );
  const gmailService = new GmailOTPService(new OAuth2Handler());
  const autoUpdater = new AutoUpdaterService();
  const scheduler = new JobScheduler(watchService, siteSniperService);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    scheduler.stop();
    queueService.destroy();
    closeDatabase(db);
  };

  return {
    db,
    repositories,
    profile,
    notifierDispatcher,
    queueService,
    parkStayService,
    authService,
    bookingService,
    notificationService,
    watchService,
    siteSniperService,
    gmailService,
    autoUpdater,
    scheduler,
    dispose,
  };
}
