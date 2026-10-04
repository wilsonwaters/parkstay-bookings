/**
 * Composition root.
 *
 * Builds every repository, service, notifier, dispatcher, scheduler, updater and Gmail
 * service exactly once and wires them together by constructor injection. This is the only
 * place in `src/main` that constructs them: anything else receives what it needs from the
 * container. Main → renderer events go through `rendererEvents`, which reaches only the
 * webContents registered in `trustedWebContents` (the main window registers itself).
 *
 * Secrets: the SecretVault is built first, then `migrateLegacySecrets` turns any v1.x
 * ciphertexts into vault envelopes before anything reads a secret (the dispatcher loads
 * notifier configs as it is built). That is the vault's first use, so `createContainer`
 * must run after `ready` and after the final userData path is set (architecture-notes
 * §12.23; see `security/secret-vault.ts`).
 */

import path from 'path';
import type Database from 'better-sqlite3';
import { app } from 'electron';
import { closeDatabase } from '../database/connection';
import {
  BookingRepository,
  LocationRepository,
  NotifierRepository,
  NotificationRepository,
  ProviderAccountRepository,
  ProviderStateRepository,
  SettingsRepository,
  SiteSniperRepository,
  SqliteKeyValueStore,
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
import { SiteSniperService } from '../services/sitesniper/sitesniper.service';
import { AutoUpdaterService } from '../services/updater/auto-updater.service';
import { WatchService } from '../services/watch/watch.service';
import { JobScheduler } from '../scheduler/job-scheduler';
import { RendererEvents } from '../ipc/events';
import { TrustedWebContents } from '../ipc/trusted-web-contents';
import { registerBuiltInProviders } from '../providers';
import { PARKSTAY_PROVIDER_ID } from '../providers/parkstay';
import { ProviderRegistry } from '../providers/registry';
import { createProviderContext, type ProviderContextDeps } from '../providers/sdk';
import { ElectronSessionHttpClient } from '../providers/sdk/http-electron';
import { legacyMachineId } from '../security/legacy-decryptors';
import { migrateLegacySecrets } from '../security/legacy-migration';
import { FileLocalKeyStore, SecretVault, type SafeStorageLike } from '../security/secret-vault';
import { FixtureHttpClient, type FixtureModeOptions } from '../testing';
import { logger } from '../utils/logger';
import { getEmailLogoPath } from './paths';
import { createLocalProfile, LocalProfile } from './profile';

export interface AppRepositories {
  readonly users: UserRepository;
  readonly bookings: BookingRepository;
  readonly settings: SettingsRepository;
  readonly notifiers: NotifierRepository;
  readonly notifications: NotificationRepository;
  readonly watches: WatchRepository;
  readonly snipes: SiteSniperRepository;
  /** Each provider's key-value state (`provider_state`). */
  readonly providerState: ProviderStateRepository;
  readonly providerAccounts: ProviderAccountRepository;
  /** The cached location catalogue (`locations` + FTS). */
  readonly locations: LocationRepository;
}

export interface AppContainer {
  readonly db: Database.Database;
  /** Where the log files are (`initFileLogging`); the `app` handlers open it. */
  readonly logsDir: string;
  readonly repositories: AppRepositories;
  /** Encrypts every stored secret (`safeStorage`, or the local key file as a fallback). */
  readonly vault: SecretVault;
  /** The webContents allowed to call IPC and to receive events. */
  readonly trustedWebContents: TrustedWebContents;
  readonly rendererEvents: RendererEvents;
  readonly profile: LocalProfile;
  /** The accommodation providers (`providers/index.ts` lists the built-in ones). */
  readonly providers: ProviderRegistry;
  readonly notifierDispatcher: NotificationDispatcher;
  readonly authService: AuthService;
  readonly bookingService: BookingService;
  readonly notificationService: NotificationService;
  readonly watchService: WatchService;
  readonly siteSniperService: SiteSniperService;
  readonly gmailService: GmailOTPService;
  readonly autoUpdater: AutoUpdaterService;
  readonly scheduler: JobScheduler;
  /**
   * Cuts the renderer off (no webContents is trusted any more, so no invoke reaches a
   * handler and no event is sent), stops the scheduler, starts disposing the providers (and
   * with them ParkStay's queue gate) and closes the database, all before it returns. The promise
   * resolves once every provider is disposed and its browser closed (each browser gets at
   * most 5 s, then is killed); it never rejects. Safe to call twice.
   */
  dispose(): Promise<void>;
}

export interface ContainerOptions {
  /** An open, migrated database (`openDatabase`). The container owns it from here: `dispose` closes it. */
  readonly db: Database.Database;
  /** The log folder returned by `initFileLogging` (`<userData>/logs`). */
  readonly logsDir: string;
  /**
   * The final userData folder: the vault's `secret-vault.key` and `gmail-oauth.json` live
   * here. B3 sets the path before `ready`; it must not change afterwards.
   */
  readonly userDataDir: string;
  /** Electron's `safeStorage` (a fake in tests). Used lazily, never before `isReady()`. */
  readonly safeStorage: SafeStorageLike;
  /** `app.isReady()`. */
  readonly isReady: () => boolean;
  /**
   * Test-only (`startFixtureMode`, never when packaged): every provider gets a
   * `FixtureHttpClient` instead of its session partition.
   */
  readonly fixtureMode?: FixtureModeOptions;
}

export function createContainer({
  db,
  logsDir,
  userDataDir,
  safeStorage,
  isReady,
  fixtureMode,
}: ContainerOptions): AppContainer {
  // Lazy: no safeStorage call and no key file until the first secret is read or written
  const vault = new SecretVault({
    safeStorage,
    platform: process.platform,
    localKey: new FileLocalKeyStore(path.join(userDataDir, 'secret-vault.key')),
    logger,
    isReady,
  });
  // legacy: never change the file name — existing data depends on it (v1.x electron-store
  // `name: 'gmail-oauth'`, which the legacy secret migration reads in place)
  const gmailStorePath = path.join(userDataDir, 'gmail-oauth.json');

  const providerState = new ProviderStateRepository(db);
  const repositories: AppRepositories = {
    users: new UserRepository(db),
    bookings: new BookingRepository(db),
    settings: new SettingsRepository(db),
    notifiers: new NotifierRepository(db, vault),
    notifications: new NotificationRepository(db),
    watches: new WatchRepository(db),
    snipes: new SiteSniperRepository(db),
    providerState,
    providerAccounts: new ProviderAccountRepository(db),
    locations: new LocationRepository(db),
  };

  // v1.x ciphertexts become vault envelopes before any secret is read (first vault use).
  // The machine id is read only if a machine-bound legacy value is found.
  migrateLegacySecrets({ db, vault, machineId: legacyMachineId, gmailStorePath });

  const profile = createLocalProfile(repositories.users);

  const trustedWebContents = new TrustedWebContents();
  const rendererEvents = new RendererEvents(trustedWebContents);

  // Each provider gets its own session partition, state, secrets and child logger.
  const providerDeps: ProviderContextDeps = {
    createHttp: (providerId) =>
      fixtureMode
        ? new FixtureHttpClient({ providerId, ...fixtureMode })
        : new ElectronSessionHttpClient({ providerId }),
    // `provider_state`, scoped to the provider; its scoped secrets live there too.
    createState: (providerId) => new SqliteKeyValueStore(providerState, providerId),
    // Each provider's ScopedSecretVault: envelopes from this vault, in the provider's own state
    vault,
    logger,
    // Each provider's browser profile is <userData>/providers/<id>/browser.
    providersDir: path.join(app.getPath('userData'), 'providers'),
    // Development only (§12.14): a packaged build always detects Edge or Chrome itself.
    browserExecutablePath: app.isPackaged ? undefined : process.env.WA_STAY_BROWSER_PATH,
  };
  const providers = new ProviderRegistry({ logger });
  registerBuiltInProviders(providers, (manifest) => createProviderContext(manifest, providerDeps), {
    logger,
  });

  const notifierDispatcher = new NotificationDispatcher(repositories.notifiers, [
    new SmtpEmailNotifier({
      providerName: (id) => providers.tryGet(id)?.manifest.shortName,
      logoPath: getEmailLogoPath(),
    }),
  ]);
  const authService = new AuthService(repositories.users, vault);
  const bookingService = new BookingService(repositories.bookings);
  const notificationService = new NotificationService(
    repositories.notifications,
    notifierDispatcher,
    rendererEvents
  );
  // Watches and snipes run on ParkStay until V4 resolves them through the registry.
  const watchService = new WatchService(
    repositories.watches,
    providers.require(PARKSTAY_PROVIDER_ID, 'watches'),
    notificationService
  );
  const siteSniperService = new SiteSniperService(
    repositories.snipes,
    providers.require(PARKSTAY_PROVIDER_ID, 'snipes'),
    notificationService
  );
  const gmailService = new GmailOTPService(new OAuth2Handler({ vault, filePath: gmailStorePath }));
  const autoUpdater = new AutoUpdaterService(rendererEvents);
  const scheduler = new JobScheduler(watchService, siteSniperService);

  let disposed: Promise<void> | null = null;
  const dispose = (): Promise<void> => {
    if (disposed) return disposed;
    // Nothing from the renderer may reach the database once it closes below.
    trustedWebContents.revokeAll();
    scheduler.stop();
    // Never rejects; each provider's dispose (its queue gate, its browser) starts before the
    // database closes.
    disposed = providers.disposeAll();
    closeDatabase(db);
    return disposed;
  };

  return {
    db,
    logsDir,
    repositories,
    vault,
    trustedWebContents,
    rendererEvents,
    profile,
    providers,
    notifierDispatcher,
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
