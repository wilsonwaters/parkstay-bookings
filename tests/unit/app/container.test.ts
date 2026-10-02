/**
 * Composition root: every service is built once, with shared instances; nothing is a
 * singleton (two containers share nothing); dispose stops the scheduler, then destroys the
 * queue service, then closes the database.
 */

import type Database from 'better-sqlite3';
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
import { ParkStayService } from '@main/services/parkstay/parkstay.service';
import { QueueService } from '@main/services/queue/queue.service';
import { SiteSniperService } from '@main/services/sitesniper/sitesniper.service';
import { AutoUpdaterService } from '@main/services/updater/auto-updater.service';
import { WatchService } from '@main/services/watch/watch.service';
import { JobScheduler } from '@main/scheduler/job-scheduler';

jest.mock('electron', () => ({
  app: { getAppPath: () => '/app', getPath: () => '/tmp', isPackaged: false },
  Notification: jest.fn(),
  shell: { openExternal: jest.fn(), openPath: jest.fn() },
}));
jest.mock('electron-updater', () => {
  const { EventEmitter } = jest.requireActual('events');
  return { autoUpdater: new EventEmitter() };
});
jest.mock('electron-store', () =>
  jest.fn().mockImplementation(() => ({ get: jest.fn(), set: jest.fn(), delete: jest.fn() }))
);
jest.mock('node-machine-id', () => ({ machineIdSync: () => 'test-machine-id' }));

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
jest.mock('@main/services/parkstay/parkstay.service', () =>
  mockCountedModule('@main/services/parkstay/parkstay.service')
);
jest.mock('@main/services/queue/queue.service', () =>
  mockCountedModule('@main/services/queue/queue.service')
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

const CONSTRUCTED_ONCE = {
  UserRepository: repositories.UserRepository,
  BookingRepository: repositories.BookingRepository,
  SettingsRepository: repositories.SettingsRepository,
  NotifierRepository: repositories.NotifierRepository,
  NotificationRepository: repositories.NotificationRepository,
  WatchRepository: repositories.WatchRepository,
  SiteSniperRepository: repositories.SiteSniperRepository,
  QueueSessionRepository: repositories.QueueSessionRepository,
  AuthService,
  BookingService,
  GmailOTPService,
  OAuth2Handler,
  NotificationDispatcher,
  NotificationService,
  SmtpEmailNotifier,
  ParkStayService,
  QueueService,
  SiteSniperService,
  AutoUpdaterService,
  WatchService,
  JobScheduler,
};

describe('createContainer', () => {
  const opened: AppContainer[] = [];

  function build(): { container: AppContainer; db: Database.Database } {
    const db = openDatabase(':memory:');
    const container = createContainer({ db });
    opened.push(container);
    return { container, db };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    opened.splice(0).forEach((c) => c.dispose());
  });

  it('builds every repository, service, notifier, dispatcher, scheduler and updater exactly once', () => {
    const { container } = build();

    for (const [name, ctor] of Object.entries(CONSTRUCTED_ONCE)) {
      expect({ name, calls: jest.mocked(ctor).mock.calls.length }).toEqual({ name, calls: 1 });
    }

    // The single instances are the ones injected into their dependants.
    const r = container.repositories;
    expect(WatchService).toHaveBeenCalledWith(
      r.watches,
      container.parkStayService,
      container.notificationService
    );
    expect(SiteSniperService).toHaveBeenCalledWith(
      r.snipes,
      container.parkStayService,
      container.queueService,
      container.notificationService
    );
    expect(NotificationService).toHaveBeenCalledWith(r.notifications, container.notifierDispatcher);
    expect(ParkStayService).toHaveBeenCalledWith(container.queueService);
    expect(JobScheduler).toHaveBeenCalledWith(container.watchService, container.siteSniperService);
    expect(GmailOTPService).toHaveBeenCalledWith(jest.mocked(OAuth2Handler).mock.results[0].value);
    expect(NotificationDispatcher).toHaveBeenCalledWith(r.notifiers, [
      jest.mocked(SmtpEmailNotifier).mock.results[0].value,
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

  it('dispose stops the scheduler, then destroys the queue service, then closes the database, once', () => {
    const { container, db } = build();
    const stop = jest.spyOn(container.scheduler, 'stop');
    const destroy = jest.spyOn(container.queueService, 'destroy');
    const close = jest.spyOn(db, 'close');

    container.dispose();
    container.dispose();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(destroy.mock.invocationCallOrder[0]);
    expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
    expect(db.open).toBe(false);
  });
});
