/**
 * The IPC layer end to end: a container on a migrated in-memory database, every handler
 * registered through handle() on a fake ipcMain, and invokes from a trusted (or untrusted)
 * fake renderer.
 */

import { EventEmitter } from 'events';
import { openDatabase } from '@main/database/connection';
import { createContainer, AppContainer } from '@main/app/container';
import { createAppUrlMatcher } from '@main/app/renderer-entry';
import { registerIpcHandlers } from '@main/ipc';
import { createSenderGuard } from '@main/ipc/sender-guard';
import { NotifierChannel, SMTPPreset, Watch } from '@shared/types';
import type { APIResponse } from '@shared/types';
import { createMockWatchInput } from '@tests/fixtures/watches';
import { mockUserInput } from '@tests/fixtures/users';
import {
  APP_INDEX_PATH,
  FakeIpcMain,
  fakeEvent,
  fakeWebContents,
  FakeWebContents,
  TRUSTED_SENDER_ID,
} from '@tests/utils/ipc-harness';

jest.mock('electron', () => jest.requireActual('@tests/utils/electron-mocks').electron());
jest.mock('electron-updater', () =>
  jest.requireActual('@tests/utils/electron-mocks').electronUpdater()
);
jest.mock('electron-store', () =>
  jest.requireActual('@tests/utils/electron-mocks').electronStore()
);
jest.mock('node-machine-id', () => ({ machineIdSync: () => 'test-machine-id' }));

const { autoUpdater } = jest.requireMock('electron-updater') as { autoUpdater: EventEmitter };

describe('IPC through the container', () => {
  let container: AppContainer;
  let ipc: FakeIpcMain;
  let mainWindow: FakeWebContents;

  /** Invokes a channel from the trusted main window. */
  const call = <T = unknown>(channel: string, payload?: unknown): Promise<APIResponse<T>> =>
    ipc.invoke(channel, fakeEvent(), payload) as Promise<APIResponse<T>>;

  beforeEach(() => {
    container = createContainer({ db: openDatabase(':memory:') });
    mainWindow = fakeWebContents(TRUSTED_SENDER_ID);
    container.trustedWebContents.register(mainWindow);
    ipc = new FakeIpcMain();
    registerIpcHandlers(container, {
      isTrustedSender: createSenderGuard({
        isTrustedWebContents: (id) => container.trustedWebContents.isTrusted(id),
        isAppUrl: createAppUrlMatcher({ kind: 'file', path: APP_INDEX_PATH }),
      }),
      ipc,
    });
    // As at startup, so dispose stops every job the handlers schedule
    container.scheduler.start();
  });

  afterEach(() => {
    container.dispose();
    autoUpdater.removeAllListeners();
  });

  describe('with the local profile', () => {
    beforeEach(() => {
      container.profile.ensureLocalProfile();
    });

    it('watches.create then watches.list round-trips, owned by the local profile', async () => {
      const input = createMockWatchInput({ name: 'Round trip' });

      // A userId smuggled into the payload is not part of the contract and is dropped
      const created = await call<Watch>('watches:create', { ...input, userId: 999 });
      expect(created).toMatchObject({ success: true, data: { name: 'Round trip', userId: 1 } });

      const listed = await call<Watch[]>('watches:list');
      expect(listed.success).toBe(true);
      expect(listed.data).toHaveLength(1);
      expect(listed.data?.[0]).toMatchObject({
        id: created.data?.id,
        name: 'Round trip',
        userId: 1,
        arrivalDate: input.arrivalDate,
      });
    });

    it('notifiers.configure then notifiers.get round-trips the (encrypted) SMTP config', async () => {
      const config = {
        preset: SMTPPreset.GMAIL,
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: 'me@example.com', pass: 'app-password' },
        toEmail: 'me@example.com',
      };

      const configured = await call('notifiers:configure', {
        channel: NotifierChannel.EMAIL_SMTP,
        displayName: 'Email (SMTP)',
        enabled: true,
        config,
      });
      expect(configured).toMatchObject({ success: true });

      await expect(call('notifiers:get', { channel: NotifierChannel.EMAIL_SMTP })).resolves.toEqual(
        {
          success: true,
          data: expect.objectContaining({ channel: 'email_smtp', enabled: true, config }),
        }
      );
      const stored = container.db.prepare('SELECT channel, config FROM notifiers').get() as {
        channel: string;
        config: string;
      };
      expect(stored.channel).toBe('email_smtp');
      expect(stored.config).not.toContain('app-password');
    });

    it('Logout (auth.deleteCredentials) keeps the profile and its watches', async () => {
      await expect(call('auth:store-credentials', mockUserInput)).resolves.toMatchObject({
        success: true,
      });
      await call('watches:create', createMockWatchInput());

      await expect(call('auth:delete-credentials')).resolves.toEqual({ success: true, data: true });

      await expect(call('auth:validate-session')).resolves.toEqual({ success: true, data: false });
      const listed = await call<Watch[]>('watches:list');
      expect(listed.data).toHaveLength(1);
      expect(container.repositories.users.findAll()).toHaveLength(1);
    });

    it('a missing record is NOT_FOUND', async () => {
      await expect(call('watches:delete', { id: 404 })).resolves.toMatchObject({
        success: false,
        code: 'NOT_FOUND',
      });
      await expect(
        call('watches:update', { id: 404, updates: { name: 'Gone' } })
      ).resolves.toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Watch not found' });
      await expect(call('bookings:delete', { id: 404 })).resolves.toMatchObject({
        success: false,
        code: 'NOT_FOUND',
      });
    });
  });

  it('with no users row, watches.create returns NO_PROFILE', async () => {
    expect(container.repositories.users.findAll()).toEqual([]);

    await expect(call('watches:create', createMockWatchInput())).resolves.toEqual({
      success: false,
      code: 'NO_PROFILE',
      error: 'No local profile exists',
    });
    expect(container.repositories.watches.findAll()).toEqual([]);
  });

  describe('settings (typed keys)', () => {
    const row = (key: string) =>
      container.db
        .prepare('SELECT value, value_type, category FROM settings WHERE key = ?')
        .get(key);

    it("settings.set('unknown.key', 1) is VALIDATION", async () => {
      await expect(call('settings:set', { key: 'unknown.key', value: 1 })).resolves.toMatchObject({
        success: false,
        code: 'VALIDATION',
        issues: ['key'],
      });
      expect(row('unknown.key')).toBeUndefined();
    });

    it("settings.set('launchOnStartup', 'yes') is VALIDATION", async () => {
      await expect(
        call('settings:set', { key: 'launchOnStartup', value: 'yes' })
      ).resolves.toMatchObject({ success: false, code: 'VALIDATION', issues: ['value'] });
      expect(row('launchOnStartup')).toBeUndefined();
    });

    it("a valid set stores the registry's valueType and category, ignoring any sent", async () => {
      await expect(
        call('settings:set', {
          key: 'launchOnStartup',
          value: true,
          valueType: 'json',
          category: 'advanced',
        })
      ).resolves.toEqual({ success: true, data: true });

      expect(row('launchOnStartup')).toEqual({
        value: 'true',
        value_type: 'boolean',
        category: 'general',
      });
      await expect(call('settings:get', { key: 'launchOnStartup' })).resolves.toEqual({
        success: true,
        data: true,
      });
    });
  });

  it('refuses an untrusted renderer before any handler runs', async () => {
    container.profile.ensureLocalProfile();
    const stranger = fakeEvent({ senderId: 42 });

    await expect(
      ipc.invoke('watches:create', stranger, createMockWatchInput())
    ).resolves.toMatchObject({ code: 'FORBIDDEN' });
    expect(container.repositories.watches.findAll()).toEqual([]);
  });

  it('queue and updater events reach only trusted webContents', () => {
    const untrusted = fakeWebContents(7); // exists, but was never registered

    container.queueService.emit('status', { type: 'session_active' });
    autoUpdater.emit('update-available', { version: '2.0.0', releaseNotes: 'Notes' });
    autoUpdater.emit('download-progress', {
      percent: 40,
      bytesPerSecond: 10,
      transferred: 4,
      total: 10,
    });

    expect(mainWindow.sent).toEqual([
      ['queue:status', { type: 'session_active' }],
      ['updater:available', { version: '2.0.0', releaseNotes: 'Notes' }],
      ['updater:progress', { percent: 40, bytesPerSecond: 10, transferred: 4, total: 10 }],
    ]);
    expect(untrusted.sent).toEqual([]);

    // After the window closes, events are dropped without error
    mainWindow.destroy();
    expect(() => container.queueService.emit('status', { type: 'status_changed' })).not.toThrow();
    expect(mainWindow.sent).toHaveLength(3);
  });
});
