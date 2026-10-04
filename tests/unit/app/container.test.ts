/**
 * Composition root: every service is built once, with shared instances; nothing is a
 * singleton (two containers share nothing); dispose cuts the renderer off, stops the
 * scheduler, disposes the providers (ParkStay's queue gate with them), then closes the
 * database. Watches and snipes get the registry's ParkStay provider. The SecretVault is
 * shared by every consumer, including each provider's ScopedSecretVault, and building the
 * container on a fresh install does not touch `safeStorage` or read the machine id.
 */

import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { machineIdSync } from 'node-machine-id';
import { openDatabase } from '@main/database/connection';
import { createContainer, AppContainer } from '@main/app/container';
import * as repositories from '@main/database/repositories';
import { AuthService } from '@main/services/auth/AuthService';
import { BookingService } from '@main/services/booking/BookingService';
import { GmailOTPService } from '@main/services/gmail/GmailOTPService';
import { OAuth2Handler } from '@main/services/gmail/oauth2-handler';
import { NotificationDispatcher } from '@main/services/notification/notification-dispatcher';
import { NotificationService } from '@main/services/notification/notification.service';
import { SmtpEmailNotifier } from '@main/services/notification/notifiers/email-smtp.notifier';
import { SiteSniperService } from '@main/services/sitesniper/sitesniper.service';
import { AutoUpdaterService } from '@main/services/updater/auto-updater.service';
import { ProviderRegistry } from '@main/providers/registry';
import { WatchService } from '@main/services/watch/watch.service';
import { LocationCatalogService } from '@main/core/catalog/location-catalog.service';
import { JobScheduler } from '@main/scheduler/job-scheduler';
import { RendererEvents } from '@main/ipc/events';
import { TrustedWebContents } from '@main/ipc/trusted-web-contents';
import { createProviderContext, type ProviderContextDeps } from '@main/providers/sdk';
import { SecretVault } from '@main/security/secret-vault';
import { TEST_LOGS_DIR } from '@tests/utils/ipc-harness';
import { containerSecrets, FakeSafeStorage, removeUserData } from '@tests/utils/fake-safe-storage';
import { testManifest } from '@tests/utils/fake-provider';
import { SnipeStatus } from '@shared/types/common.types';
import { createMockSiteSnipeInput } from '@tests/fixtures/site-sniper';

jest.mock('electron', () => ({
  app: { getAppPath: () => '/app', getPath: () => '/tmp', isPackaged: false },
  Notification: jest.fn(),
  shell: { openExternal: jest.fn(), openPath: jest.fn() },
  session: {
    fromPartition: jest.fn(() => jest.requireActual('@tests/utils/electron-mocks').fakeSession()),
  },
}));
jest.mock('electron-updater', () => {
  const { EventEmitter } = jest.requireActual('events');
  return { autoUpdater: new EventEmitter() };
});
jest.mock('node-machine-id', () => ({ machineIdSync: jest.fn(() => 'test-machine-id') }));

/**
 * Replaces each exported class of a module with a jest.fn that constructs the real class,
 * so the test can count constructions and see the arguments, and still gets real instances.
 */
function mockCountedModule(modulePath: string): Record<string, unknown> {
  const actual = jest.requireActual(modulePath) as Record<string, unknown>;
  const counted: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value === 'function' && /^[A-Z]/.test(name) && value.prototype) {
      const Real = value as new (...args: unknown[]) => unknown;
      counted[name] = jest.fn((...args: unknown[]) => new Real(...args));
    }
  }
  return counted;
}

jest.mock('@main/database/repositories', () => mockCountedModule('@main/database/repositories'));
jest.mock('@main/services/auth/AuthService', () =>
  mockCountedModule('@main/services/auth/AuthService')
);
jest.mock('@main/services/booking/BookingService', () =>
  mockCountedModule('@main/services/booking/BookingService')
);
jest.mock('@main/services/gmail/GmailOTPService', () =>
  mockCountedModule('@main/services/gmail/GmailOTPService')
);
jest.mock('@main/services/gmail/oauth2-handler', () =>
  mockCountedModule('@main/services/gmail/oauth2-handler')
);
jest.mock('@main/services/notification/notification-dispatcher', () =>
  mockCountedModule('@main/services/notification/notification-dispatcher')
);
jest.mock('@main/services/notification/notification.service', () =>
  mockCountedModule('@main/services/notification/notification.service')
);
jest.mock('@main/services/notification/notifiers/email-smtp.notifier', () =>
  mockCountedModule('@main/services/notification/notifiers/email-smtp.notifier')
);
jest.mock('@main/services/sitesniper/sitesniper.service', () =>
  mockCountedModule('@main/services/sitesniper/sitesniper.service')
);
jest.mock('@main/services/updater/auto-updater.service', () =>
  mockCountedModule('@main/services/updater/auto-updater.service')
);
jest.mock('@main/services/watch/watch.service', () =>
  mockCountedModule('@main/services/watch/watch.service')
);
jest.mock('@main/scheduler/job-scheduler', () =>
  mockCountedModule('@main/scheduler/job-scheduler')
);
jest.mock('@main/core/catalog/location-catalog.service', () =>
  mockCountedModule('@main/core/catalog/location-catalog.service')
);
jest.mock('@main/ipc/events', () => mockCountedModule('@main/ipc/events'));
jest.mock('@main/ipc/trusted-web-contents', () =>
  mockCountedModule('@main/ipc/trusted-web-contents')
);
jest.mock('@main/providers/registry', () => mockCountedModule('@main/providers/registry'));
jest.mock('@main/security/secret-vault', () => mockCountedModule('@main/security/secret-vault'));
// createProviderContext is recorded, so a test can see the deps each provider got
jest.mock('@main/providers/sdk', () => {
  const actual = jest.requireActual('@main/providers/sdk');
  return { ...actual, createProviderContext: jest.fn(actual.createProviderContext) };
});

const CONSTRUCTED_ONCE = {
  UserRepository: repositories.UserRepository,
  BookingRepository: repositories.BookingRepository,
  SettingsRepository: repositories.SettingsRepository,
  NotifierRepository: repositories.NotifierRepository,
  NotificationRepository: repositories.NotificationRepository,
  WatchRepository: repositories.WatchRepository,
  SiteSniperRepository: repositories.SiteSniperRepository,
  ProviderStateRepository: repositories.ProviderStateRepository,
  ProviderAccountRepository: repositories.ProviderAccountRepository,
  LocationRepository: repositories.LocationRepository,
  // One per provider; ParkStay is the only built-in one
  SqliteKeyValueStore: repositories.SqliteKeyValueStore,
  AuthService,
  BookingService,
  GmailOTPService,
  OAuth2Handler,
  NotificationDispatcher,
  NotificationService,
  SmtpEmailNotifier,
  SiteSniperService,
  AutoUpdaterService,
  WatchService,
  LocationCatalogService,
  JobScheduler,
  RendererEvents,
  TrustedWebContents,
  ProviderRegistry,
  SecretVault,
};

describe('createContainer', () => {
  const opened: AppContainer[] = [];
  const userDataDirs: string[] = [];

  function build(safeStorage: FakeSafeStorage = new FakeSafeStorage()): {
    container: AppContainer;
    db: Database.Database;
    userDataDir: string;
  } {
    const db = openDatabase(':memory:');
    const secrets = containerSecrets(safeStorage);
    userDataDirs.push(secrets.userDataDir);
    const container = createContainer({ db, logsDir: TEST_LOGS_DIR, ...secrets });
    opened.push(container);
    return { container, db, userDataDir: secrets.userDataDir };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    opened.splice(0).forEach((c) => c.dispose());
    userDataDirs.splice(0).forEach(removeUserData);
  });

  it('builds every repository, service, notifier, dispatcher, scheduler and updater exactly once', () => {
    const { container } = build();

    for (const [name, ctor] of Object.entries(CONSTRUCTED_ONCE)) {
      expect({ name, calls: jest.mocked(ctor).mock.calls.length }).toEqual({ name, calls: 1 });
    }

    // The single instances are the ones injected into their dependants.
    const r = container.repositories;
    // Watches and snipes run on the registry's ParkStay provider (V4 resolves them per watch).
    const parkstay = container.providers.get('parkstay');
    expect(WatchService).toHaveBeenCalledWith(r.watches, parkstay, container.notificationService);
    expect(SiteSniperService).toHaveBeenCalledWith(
      r.snipes,
      parkstay,
      container.notificationService
    );
    expect(NotificationService).toHaveBeenCalledWith(
      r.notifications,
      container.notifierDispatcher,
      container.rendererEvents
    );
    expect(AutoUpdaterService).toHaveBeenCalledWith(container.rendererEvents);
    // The catalogue reads the registry, caches in locations and provider_state, and announces
    // syncs on the renderer events bus
    expect(LocationCatalogService).toHaveBeenCalledWith(
      expect.objectContaining({
        registry: container.providers,
        locations: r.locations,
        providerState: r.providerState,
        events: container.rendererEvents,
        isReleaseInProgress: expect.any(Function),
      })
    );
    expect(jest.mocked(LocationCatalogService).mock.results[0].value).toBe(
      container.catalogService
    );
    expect(RendererEvents).toHaveBeenCalledWith(container.trustedWebContents);
    expect(JobScheduler).toHaveBeenCalledWith(container.watchService, container.siteSniperService);
    expect(GmailOTPService).toHaveBeenCalledWith(jest.mocked(OAuth2Handler).mock.results[0].value);
    expect(NotificationDispatcher).toHaveBeenCalledWith(r.notifiers, [
      jest.mocked(SmtpEmailNotifier).mock.results[0].value,
    ]);

    // One vault, shared by every consumer of secrets
    const vault = container.vault;
    expect(jest.mocked(SecretVault).mock.results[0].value).toBe(vault);
    expect(repositories.NotifierRepository).toHaveBeenCalledWith(container.db, vault);
    expect(AuthService).toHaveBeenCalledWith(r.users, vault);
    expect(OAuth2Handler).toHaveBeenCalledWith(
      expect.objectContaining({ vault, filePath: expect.stringMatching(/gmail-oauth\.json$/) })
    );
    expect(jest.mocked(createProviderContext).mock.calls[0][1].vault).toBe(vault);
    expect(repositories.SqliteKeyValueStore).toHaveBeenCalledWith(r.providerState, 'parkstay');
    // ParkStay's queue gate is the provider's, not a service of its own.
    expect(container.siteSniperService.getAccessGate()).toBe(parkstay.access);
  });

  it('builds the vault lazily: a fresh install touches neither safeStorage nor the key file, nor reads the machine id', () => {
    const safeStorage = new FakeSafeStorage();
    const { container, userDataDir } = build(safeStorage);

    expect(safeStorage.calls).toEqual([]);
    expect(machineIdSync).not.toHaveBeenCalled(); // only needed for a legacy value
    expect(fs.existsSync(path.join(userDataDir, 'secret-vault.key'))).toBe(false);
    expect(container.vault.status()).toEqual({ backend: 'os' }); // first use
  });

  it("gives each provider a ScopedSecretVault on the app's vault, namespaced per provider", async () => {
    const { container } = build();
    const parkstay = jest.mocked(createProviderContext).mock.results[0].value;
    expect(parkstay.id).toBe('parkstay');

    await parkstay.secrets.set('token', 'parkstay-token-value');
    const stored = await parkstay.state.get<string>('secret:token');
    expect(stored).toMatch(/^vault:v1:os:/);
    expect(stored).not.toContain('parkstay-token-value');
    expect(container.vault.decrypt(stored as string)).toContain('parkstay-token-value');
    await expect(parkstay.secrets.get('token')).resolves.toBe('parkstay-token-value');

    // Another provider built with the same deps has its own store, and the ParkStay
    // ciphertext copied into it does not read as its secret
    const deps = jest.mocked(createProviderContext).mock.calls[0][1] as ProviderContextDeps;
    const other = createProviderContext(testManifest('fake2'), deps);
    await expect(other.secrets.get('token')).resolves.toBeUndefined();
    await other.state.set('secret:token', stored);
    await expect(other.secrets.get('token')).rejects.toThrow(
      'Secret "token" was not written by fake2'
    );
  });

  it('gives each provider its state on provider_state, scoped to it and persistent', async () => {
    const { db } = build();
    const state = jest.mocked(repositories.SqliteKeyValueStore).mock.results[0]
      .value as repositories.SqliteKeyValueStore;

    await state.set('release.cache', { opensAt: '2026-12-13' });

    expect(db.prepare('SELECT provider_id, key, value FROM provider_state').all()).toEqual([
      { provider_id: 'parkstay', key: 'release.cache', value: '{"opensAt":"2026-12-13"}' },
    ]);
  });

  it('has no singletons: a second container shares no instance with the first', () => {
    const first = build().container;
    const second = build().container;

    expect(second.gmailService).not.toBe(first.gmailService);
    expect(second.notificationService).not.toBe(first.notificationService);
    expect(second.scheduler).not.toBe(first.scheduler);
    expect(second.repositories.users).not.toBe(first.repositories.users);
    expect(
      'getInstance' in jest.requireActual('@main/services/gmail/GmailOTPService').GmailOTPService
    ).toBe(false);
  });

  it('registers the built-in providers, each on its own session partition', () => {
    const { container } = build();
    const { session } = jest.requireMock('electron') as { session: { fromPartition: jest.Mock } };

    expect(container.providers.list().map((m) => m.id)).toEqual(['parkstay']);
    expect(session.fromPartition).toHaveBeenCalledWith('persist:provider-parkstay');
  });

  it("gives the email notifier the providers' names and the small WA Stay email logo", () => {
    build();

    const [options] = jest.mocked(SmtpEmailNotifier).mock.calls[0];
    expect(options?.logoPath).toBe(path.join('/app', 'resources', 'icons', 'email-logo.png'));
    expect(options?.providerName?.('parkstay')).toBe('ParkStay');
    expect(options?.providerName?.('not-a-provider')).toBeUndefined();
  });

  it('the catalogue waits for its automatic sync while a snipe of that provider is queueing or sniping', () => {
    const { container } = build();
    const userId = container.profile.ensureLocalProfile();
    const [{ isReleaseInProgress }] = jest.mocked(LocationCatalogService).mock.calls[0];
    const snipes = container.repositories.snipes;
    const snipe = snipes.create(userId, createMockSiteSnipeInput({ providerId: 'parkstay' }));

    expect(isReleaseInProgress?.('parkstay')).toBe(false);
    snipes.updateStatus(snipe.id, SnipeStatus.QUEUEING);
    expect(isReleaseInProgress?.('parkstay')).toBe(true);
    expect(isReleaseInProgress?.('other')).toBe(false);
    snipes.updateStatus(snipe.id, SnipeStatus.SNIPING);
    expect(isReleaseInProgress?.('parkstay')).toBe(true);
    snipes.updateStatus(snipe.id, SnipeStatus.HELD);
    expect(isReleaseInProgress?.('parkstay')).toBe(false);
  });

  it('dispose disposes the providers before the database closes', () => {
    const { container, db } = build();
    const disposeAll = jest.spyOn(container.providers, 'disposeAll');
    const close = jest.spyOn(db, 'close');

    container.dispose();
    container.dispose();

    expect(disposeAll).toHaveBeenCalledTimes(1);
    expect(disposeAll.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
    expect(container.providers.list()).toEqual([]);
  });

  it("dispose cuts the renderer off, stops the scheduler, disposes ParkStay's queue gate, then closes the database, once", () => {
    const { container, db } = build();
    const revoke = jest.spyOn(container.trustedWebContents, 'revokeAll');
    const stop = jest.spyOn(container.scheduler, 'stop');
    const stopCatalog = jest.spyOn(container.catalogService, 'stop');
    const gate = container.providers.get('parkstay').access!;
    const disposeGate = jest.spyOn(gate, 'dispose');
    const close = jest.spyOn(db, 'close');

    container.dispose();
    container.dispose();

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(disposeGate).toHaveBeenCalled();
    expect(revoke.mock.invocationCallOrder[0]).toBeLessThan(stop.mock.invocationCallOrder[0]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(disposeGate.mock.invocationCallOrder[0]);
    // A catalogue sync in flight is aborted before the database closes
    expect(stopCatalog).toHaveBeenCalledTimes(1);
    expect(stopCatalog.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
    expect(disposeGate.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
    expect(db.open).toBe(false);
  });
});
