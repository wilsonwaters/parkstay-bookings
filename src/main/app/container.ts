/**
 * Composition root.
 *
 * Builds every repository, service, notifier, dispatcher, scheduler, updater and Gmail
 * service exactly once and wires them together by constructor injection. This is the only
 * place in `src/main` that constructs them: anything else receives what it needs from the
 * container. Main → renderer events go through `rendererEvents`, which reaches only the
 * webContents registered in `trustedWebContents` (the main window registers itself).
 */

import type Database from 'better-sqlite3';
import { closeDatabase } from '../database/connection';
import {
  BookingRepository,
  NotifierRepository,
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
import { SmtpEmailNotifier } from '../services/notification/notifiers/email-smtp.notifier';
import { ParkStayService } from '../services/parkstay/parkstay.service';
import { QueueService } from '../services/queue/queue.service';
import { SiteSniperService } from '../services/sitesniper/sitesniper.service';
import { AutoUpdaterService } from '../services/updater/auto-updater.service';
import { WatchService } from '../services/watch/watch.service';
import { JobScheduler } from '../scheduler/job-scheduler';
import { RendererEvents } from '../ipc/events';
import { TrustedWebContents } from '../ipc/trusted-web-contents';
import { registerBuiltInProviders } from '../providers';
import { ProviderRegistry } from '../providers/registry';
import {
  createProviderContext,
  InMemoryKeyValueStore,
  UnavailableSecretVault,
  type ProviderContextDeps,
} from '../providers/sdk';
import { ElectronSessionHttpClient } from '../providers/sdk/http-electron';
import { logger } from '../utils/logger';
import type { QueueStatusEvent } from '@shared/types';
import { createLocalProfile, LocalProfile } from './profile';

export interface AppRepositories {
  readonly users: UserRepository;
  readonly bookings: BookingRepository;
  readonly settings: SettingsRepository;
  readonly notifiers: NotifierRepository;
  readonly notifications: NotificationRepository;
  readonly watches: WatchRepository;
  readonly snipes: SiteSniperRepository;
  readonly queueSessions: QueueSessionRepository;
}

export interface AppContainer {
  readonly db: Database.Database;
  /** Where the log files are (`initFileLogging`); the `app` handlers open it. */
  readonly logsDir: string;
  readonly repositories: AppRepositories;
  /** The webContents allowed to call IPC and to receive events. */
  readonly trustedWebContents: TrustedWebContents;
  readonly rendererEvents: RendererEvents;
  readonly profile: LocalProfile;
  /** The accommodation providers (`providers/index.ts` lists the built-in ones). */
  readonly providers: ProviderRegistry;
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
  /**
   * Stops the scheduler, disposes the providers, destroys the queue service and closes the
   * database. Safe to call twice.
   */
  dispose(): void;
}

export interface ContainerOptions {
  /** An open, migrated database (`openDatabase`). The container owns it from here: `dispose` closes it. */
  readonly db: Database.Database;
  /** The log folder returned by `initFileLogging` (`<userData>/logs`). */
  readonly logsDir: string;
}

export function createContainer({ db, logsDir }: ContainerOptions): AppContainer {
  const repositories: AppRepositories = {
    users: new UserRepository(db),
    bookings: new BookingRepository(db),
    settings: new SettingsRepository(db),
    notifiers: new NotifierRepository(db),
    notifications: new NotificationRepository(db),
    watches: new WatchRepository(db),
    snipes: new SiteSniperRepository(db),
    queueSessions: new QueueSessionRepository(db),
  };

  const profile = createLocalProfile(repositories.users);

  const trustedWebContents = new TrustedWebContents();
  const rendererEvents = new RendererEvents(trustedWebContents);

  // Each provider gets its own session partition, state, secrets and child logger.
  const providerDeps: ProviderContextDeps = {
    createHttp: (providerId) => new ElectronSessionHttpClient({ providerId }),
    // V2 swaps in the SQLite store on `provider_state`.
    createState: () => new InMemoryKeyValueStore(),
    // P5 swaps in its SecretVault; until then nothing can store a secret.
    vault: new UnavailableSecretVault(),
    logger,
  };
  const providers = new ProviderRegistry({ logger });
  registerBuiltInProviders(providers, (id) => createProviderContext(id, providerDeps), { logger });

  const notifierDispatcher = new NotificationDispatcher(repositories.notifiers, [
    new SmtpEmailNotifier(),
  ]);
  const queueService = new QueueService(repositories.queueSessions);
  const forwardQueueStatus = (event: QueueStatusEvent): void =>
    rendererEvents.emit('queue:status', event);
  queueService.on('status', forwardQueueStatus);
  const parkStayService = new ParkStayService(queueService);
  const authService = new AuthService(repositories.users);
  const bookingService = new BookingService(repositories.bookings);
  const notificationService = new NotificationService(
    repositories.notifications,
    notifierDispatcher,
    rendererEvents
  );
  const watchService = new WatchService(repositories.watches, parkStayService, notificationService);
  const siteSniperService = new SiteSniperService(
    repositories.snipes,
    parkStayService,
    queueService,
    notificationService
  );
  const gmailService = new GmailOTPService(new OAuth2Handler());
  const autoUpdater = new AutoUpdaterService(rendererEvents);
  const scheduler = new JobScheduler(watchService, siteSniperService);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    scheduler.stop();
    // Never rejects; each provider's dispose starts before the database closes.
    void providers.disposeAll();
    queueService.off('status', forwardQueueStatus);
    queueService.destroy();
    closeDatabase(db);
  };

  return {
    db,
    logsDir,
    repositories,
    trustedWebContents,
    rendererEvents,
    profile,
    providers,
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
