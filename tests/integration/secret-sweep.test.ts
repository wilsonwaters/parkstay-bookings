/**
 * Secrets never cross to the renderer (architecture-notes §4, §7; tech-review #5).
 *
 * A container on an in-memory database with every handler registered: seed a ParkStay
 * password, a Gmail client secret and an SMTP password through IPC, invoke every read
 * channel, and check that none of the seeded strings is in any response or in any log line
 * (captured at debug level). Also: saving SMTP settings without a password keeps the stored
 * one, and the Gmail inbox channels are gone.
 */

import { Writable } from 'stream';
import winston from 'winston';
import { openDatabase } from '@main/database/connection';
import { createContainer, AppContainer } from '@main/app/container';
import { registerIpcHandlers } from '@main/ipc';
import { logger } from '@main/utils/logger';
import { contract } from '@shared/contracts';
import type { MethodDef } from '@shared/contracts/define';
import { NotifierChannel, SMTPPreset } from '@shared/types';
import type { APIResponse } from '@shared/types';
import { FakeIpcMain, fakeEvent, TEST_LOGS_DIR } from '@tests/utils/ipc-harness';

jest.mock('electron', () => jest.requireActual('@tests/utils/electron-mocks').electron());
jest.mock('electron-updater', () =>
  jest.requireActual('@tests/utils/electron-mocks').electronUpdater()
);
// A store that keeps what is written, so reads really come back from it
jest.mock('electron-store', () =>
  jest.fn().mockImplementation(() => {
    const data = new Map<string, unknown>();
    return {
      get: (key: string) => data.get(key),
      set: (key: string, value: unknown) => data.set(key, value),
      delete: (key: string) => data.delete(key),
      clear: () => data.clear(),
    };
  })
);
jest.mock('node-machine-id', () => ({ machineIdSync: () => 'test-machine-id' }));

const PASSWORD = 'Sweep-ParkStay-Passw0rd!';
const CLIENT_SECRET = 'GOCSPX-sweep-client-secret-7f3a';
const SMTP_PASS = 'sweep-smtp-app-password-q9z';
const SECRETS = [PASSWORD, CLIENT_SECRET, SMTP_PASS];

const SMTP_CONFIG = {
  preset: SMTPPreset.GMAIL,
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: 'me@example.com', pass: SMTP_PASS },
  toEmail: 'me@example.com',
};

/**
 * Every read channel and its payload. Only ParkStay's (network, no secrets) are left out;
 * a test below fails if a new get/list/status method is not added here.
 */
const READS: Array<[string, unknown]> = [
  ['auth:get-credentials', undefined],
  ['auth:validate-session', undefined],
  ['gmail:get-credentials', undefined],
  ['gmail:check-auth-status', undefined],
  ['notifiers:list', undefined],
  ['notifiers:get', { channel: NotifierChannel.EMAIL_SMTP }],
  ['settings:get', { key: 'launchOnStartup' }],
  ['settings:get-all', undefined],
  ['app:get-info', undefined],
  ['app:get-auto-launch', undefined],
  ['updater:get-status', undefined],
  ['queue:get-status', undefined],
  ['bookings:list', undefined],
  ['bookings:get', { id: 1 }],
  ['watches:list', undefined],
  ['watches:get', { id: 1 }],
  ['snipes:list', undefined],
  ['snipes:get', { id: 1 }],
  ['notifications:list', { limit: 50 }],
];

describe('secrets never reach the renderer', () => {
  let container: AppContainer;
  let ipc: FakeIpcMain;
  let logLines: string[];
  let capture: winston.transport;
  const levelBefore = logger.level;

  const call = <T = unknown>(channel: string, payload?: unknown): Promise<APIResponse<T>> =>
    ipc.invoke(channel, fakeEvent(), payload) as Promise<APIResponse<T>>;

  beforeEach(() => {
    // Capture every log line, debug included; keep the console quiet
    logLines = [];
    capture = new winston.transports.Stream({
      stream: new Writable({
        write(chunk, _encoding, done) {
          logLines.push(String(chunk));
          done();
        },
      }),
    });
    logger.add(capture);
    logger.level = 'debug';
    for (const transport of logger.transports) {
      if (transport !== capture) transport.silent = true;
    }

    container = createContainer({ db: openDatabase(':memory:'), logsDir: TEST_LOGS_DIR });
    container.profile.ensureLocalProfile();
    ipc = new FakeIpcMain();
    registerIpcHandlers(container, { isTrustedSender: () => true, ipc });
  });

  afterEach(() => {
    container.dispose();
    logger.remove(capture);
    logger.level = levelBefore;
    for (const transport of logger.transports) transport.silent = false;
  });

  async function seed(): Promise<unknown[]> {
    return [
      await call('auth:store-credentials', { email: 'me@example.com', password: PASSWORD }),
      await call('gmail:set-credentials', { clientId: 'client-123', clientSecret: CLIENT_SECRET }),
      await call('notifiers:configure', {
        channel: NotifierChannel.EMAIL_SMTP,
        displayName: 'Email (SMTP)',
        enabled: true,
        config: SMTP_CONFIG,
      }),
    ];
  }

  it('sweeps every read channel: no seeded secret in any response or log line', async () => {
    const responses: unknown[] = await seed();
    for (const [channel, payload] of READS) responses.push(await call(channel, payload));

    // The seeding worked and every read succeeded (a failing read would prove nothing)
    expect(responses.filter((response) => !(response as APIResponse).success)).toEqual([]);

    const serialised = JSON.stringify(responses);
    const logs = logLines.join('\n');
    expect(logs.length).toBeGreaterThan(0);
    for (const secret of SECRETS) {
      expect(serialised).not.toContain(secret);
      expect(logs).not.toContain(secret);
    }

    // What the renderer gets instead
    await expect(call('auth:get-credentials')).resolves.toEqual({
      success: true,
      data: { email: 'me@example.com', hasPassword: true },
    });
    await expect(call('gmail:get-credentials')).resolves.toEqual({
      success: true,
      data: { clientId: 'client-123', hasClientSecret: true },
    });
    const notifier = await call<Record<string, unknown>>('notifiers:get', {
      channel: NotifierChannel.EMAIL_SMTP,
    });
    expect(notifier.data).toMatchObject({
      hasPassword: true,
      config: { auth: { user: 'me@example.com' } },
    });
    expect((notifier.data?.config as { auth: object }).auth).not.toHaveProperty('pass');

    // The secrets are still stored for the main process to use
    await expect(container.authService.getCredentials()).resolves.toMatchObject({
      password: PASSWORD,
    });
  });

  it('the sweep covers every get/list/status channel outside ParkStay', () => {
    const swept = new Set(READS.map(([channel]) => channel));
    const reads = Object.entries(contract)
      .filter(([namespace]) => namespace !== 'parkstay')
      .flatMap(([, methods]) => Object.entries(methods as Record<string, MethodDef>))
      .filter(([method]) => /^(get|list|validate)/.test(method) || method === 'checkAuthStatus')
      .map(([, def]) => def.channel);

    expect(reads.filter((channel) => !swept.has(channel))).toEqual([]);
  });

  it('notifiers.configure without a password keeps the stored one, in the database and the dispatcher', async () => {
    await seed();
    const dispatcherPass = (): unknown =>
      (
        container.notifierDispatcher.getNotifier(NotifierChannel.EMAIL_SMTP)?.getConfig() as {
          auth: { pass: string };
        }
      ).auth.pass;

    const withoutPassword = {
      ...SMTP_CONFIG,
      toEmail: 'other@example.com',
      auth: { user: 'me@example.com' },
    };
    const blank = {
      ...SMTP_CONFIG,
      port: 465,
      secure: true,
      auth: { user: 'me@example.com', pass: '' },
    };

    for (const config of [withoutPassword, blank]) {
      const saved = await call<Record<string, unknown>>('notifiers:configure', {
        channel: NotifierChannel.EMAIL_SMTP,
        displayName: 'Email (SMTP)',
        enabled: true,
        config,
      });
      expect(saved).toMatchObject({ success: true, data: { hasPassword: true } });
      expect(JSON.stringify(saved)).not.toContain(SMTP_PASS);
      expect(dispatcherPass()).toBe(SMTP_PASS);
      expect(
        (
          container.repositories.notifiers.findByChannel(NotifierChannel.EMAIL_SMTP)?.config as {
            auth: { pass: string };
          }
        ).auth.pass
      ).toBe(SMTP_PASS);
    }

    // The other settings did change
    expect(
      container.notifierDispatcher.getNotifier(NotifierChannel.EMAIL_SMTP)?.getConfig()
    ).toMatchObject({
      port: 465,
      secure: true,
    });

    // A new password replaces it
    await call('notifiers:configure', {
      channel: NotifierChannel.EMAIL_SMTP,
      displayName: 'Email (SMTP)',
      enabled: true,
      config: { ...SMTP_CONFIG, auth: { user: 'me@example.com', pass: 'a-new-one' } },
    });
    expect(dispatcherPass()).toBe('a-new-one');
  });

  it('notifiers.configure with no stored password and none given is VALIDATION', async () => {
    await expect(
      call('notifiers:configure', {
        channel: NotifierChannel.EMAIL_SMTP,
        displayName: 'Email (SMTP)',
        enabled: true,
        config: { ...SMTP_CONFIG, auth: { user: 'me@example.com' } },
      })
    ).resolves.toEqual({ success: false, code: 'VALIDATION', error: 'A password is required' });
    expect(container.repositories.notifiers.findAll()).toEqual([]);
  });

  it('notifiers.configure validates the SMTP settings', async () => {
    const bad = await call('notifiers:configure', {
      channel: NotifierChannel.EMAIL_SMTP,
      displayName: 'Email (SMTP)',
      config: { ...SMTP_CONFIG, port: 'smtp', host: '' },
    });
    expect(bad).toMatchObject({ success: false, code: 'VALIDATION' });
    expect((bad as APIResponse).issues).toEqual(
      expect.arrayContaining(['config.port', 'config.host'])
    );
  });

  it('the Gmail inbox channels are not registered', async () => {
    for (const channel of [
      'gmail:get-recent-emails',
      'gmail:test-search',
      'gmail:wait-for-email',
    ]) {
      expect(ipc.registrations).not.toContain(channel);
      expect(() => ipc.invoke(channel, fakeEvent(), {})).toThrow(
        `No handler registered for ${channel}`
      );
    }
  });
});
