/**
 * The `providers` and `accounts` namespaces through P3's harness: a real container (with the
 * built-in ParkStay provider), every handler registered through handle(), and invokes from
 * the trusted fake renderer. `catalog` has its own suite (`catalog.test.ts`).
 */

import { EventEmitter } from 'events';
import { openDatabase } from '@main/database/connection';
import { createContainer, AppContainer } from '@main/app/container';
import { createAppUrlMatcher } from '@main/app/renderer-entry';
import { registerIpcHandlers } from '@main/ipc';
import { createSenderGuard } from '@main/ipc/sender-guard';
import {
  ProviderManifestSchema,
  type AccessStatus,
  type ProviderManifest,
} from '@shared/types/provider.types';
import type { APIResponse } from '@shared/types';
import {
  APP_INDEX_PATH,
  FakeIpcMain,
  fakeEvent,
  fakeWebContents,
  FakeWebContents,
  TEST_LOGS_DIR,
  TRUSTED_SENDER_ID,
} from '@tests/utils/ipc-harness';
import {
  createFakeProvider,
  createTestProviderContext,
  type FakeProvider,
} from '@tests/utils/fake-provider';

import { containerSecrets } from '@tests/utils/fake-safe-storage';

jest.mock('electron', () => jest.requireActual('@tests/utils/electron-mocks').electron());
jest.mock('electron-updater', () =>
  jest.requireActual('@tests/utils/electron-mocks').electronUpdater()
);
jest.mock('node-machine-id', () => ({ machineIdSync: () => 'test-machine-id' }));

const { autoUpdater } = jest.requireMock('electron-updater') as { autoUpdater: EventEmitter };
const { session } = jest.requireMock('electron') as { session: { fromPartition: jest.Mock } };

describe('providers / accounts over IPC', () => {
  let container: AppContainer;
  let ipc: FakeIpcMain;
  let mainWindow: FakeWebContents;

  const call = <T = unknown>(channel: string, payload?: unknown): Promise<APIResponse<T>> =>
    ipc.invoke(channel, fakeEvent(), payload) as Promise<APIResponse<T>>;

  /** Builds the container, lets `before` add providers, then registers the handlers. */
  function start(before?: (c: AppContainer) => void): void {
    container = createContainer({
      db: openDatabase(':memory:'),
      logsDir: TEST_LOGS_DIR,
      ...containerSecrets(),
    });
    before?.(container);
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
    // As at startup, so dispose stops what it started
    container.scheduler.start();
  }

  afterEach(() => {
    container.dispose();
    autoUpdater.removeAllListeners();
  });

  describe('with the built-in providers', () => {
    beforeEach(() => start());

    it('providers.list() returns one manifest, parkstay, that passes the manifest schema', async () => {
      const response = await call<ProviderManifest[]>('providers:list');

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      const [manifest] = response.data!;
      expect(manifest.id).toBe('parkstay');
      expect(ProviderManifestSchema.safeParse(manifest).success).toBe(true);
      // The extensibility fields reach the renderer (§12.30).
      expect(manifest).toMatchObject({
        currency: 'AUD',
        limits: { minWatchIntervalMinutes: 15, maxConcurrentRequests: 4, catalogTtlHours: 24 },
        capabilities: { catalogMode: 'full' },
      });
      // It survives structured cloning to the renderer: plain data, no functions.
      expect(structuredClone(manifest)).toEqual(manifest);
    });

    it('the container gave ParkStay its own session partition', () => {
      expect(session.fromPartition).toHaveBeenCalledWith('persist:provider-parkstay');
    });

    it("providers.accessStatus('parkstay') is idle while no snipe uses the DBCA queue", async () => {
      const response = await call<AccessStatus>('providers:access-status', {
        providerId: 'parkstay',
      });

      expect(response).toMatchObject({
        success: true,
        data: { providerId: 'parkstay', state: 'idle' },
      });
      expect(Number.isNaN(Date.parse(response.data!.updatedAt))).toBe(false);
      // Position, ETA, expiry and state only: never the queue session key.
      expect(Object.keys(response.data!).sort()).toEqual(['providerId', 'state', 'updatedAt']);
    });

    it('the transitional queue namespace is gone', async () => {
      expect(ipc.registrations.filter((c) => c.startsWith('queue:'))).toEqual([]);
      expect(ipc.registrations).not.toContain('parkstay:check-availability');
    });

    it("providers.accessStatus('nope') fails with UNKNOWN_PROVIDER", async () => {
      expect(await call('providers:access-status', { providerId: 'nope' })).toEqual({
        success: false,
        code: 'UNKNOWN_PROVIDER',
        error: 'Unknown provider "nope"',
      });
    });

    it('providers.accessStatus validates the provider id', async () => {
      expect(await call('providers:access-status', { providerId: 'ParkStay' })).toMatchObject({
        success: false,
        code: 'VALIDATION',
        issues: ['providerId'],
      });
    });

    it('accounts.* validates, then answers NOT_IMPLEMENTED until accounts land', async () => {
      for (const [channel, payload] of [
        ['accounts:list', undefined],
        ['accounts:status', { providerId: 'parkstay' }],
        ['accounts:sign-in', { providerId: 'parkstay' }],
        ['accounts:sign-out', { providerId: 'parkstay' }],
        [
          'accounts:open-sign-in-link',
          { providerId: 'parkstay', url: 'https://dbcab2c.b2clogin.com/x' },
        ],
      ] as Array<[string, unknown]>) {
        expect([channel, (await call(channel, payload)).code]).toEqual([
          channel,
          'NOT_IMPLEMENTED',
        ]);
      }

      expect(
        await call('accounts:open-sign-in-link', {
          providerId: 'parkstay',
          url: 'http://evil.example/x',
        })
      ).toMatchObject({ code: 'VALIDATION', issues: ['url'] });
    });
  });

  describe('with providers that have access gates', () => {
    let fake: FakeProvider;
    let fake2: FakeProvider;

    beforeEach(() => {
      fake = createFakeProvider({ id: 'fake', name: 'Fake One' });
      fake2 = createFakeProvider({
        id: 'fake2',
        name: 'Fake Two',
        capabilities: { accessGate: false },
      });
      start((c) => {
        c.providers.register(fake.factory, createTestProviderContext);
        c.providers.register(fake2.factory, createTestProviderContext);
      });
    });

    it('lists every provider sorted by name', async () => {
      const response = await call<ProviderManifest[]>('providers:list');
      expect(response.data!.map((m) => m.id)).toEqual(['fake', 'fake2', 'parkstay']);
    });

    it("returns a gate's status, and unsupported for a provider without one", async () => {
      expect(
        (await call<AccessStatus>('providers:access-status', { providerId: 'fake' })).data
      ).toMatchObject({
        providerId: 'fake',
        state: 'idle',
      });
      expect(
        (await call<AccessStatus>('providers:access-status', { providerId: 'fake2' })).data
      ).toMatchObject({
        providerId: 'fake2',
        state: 'unsupported',
      });
    });

    it('forwards gate status changes as provider:access-status events', async () => {
      await fake.access!.ensure();

      const events = mainWindow.sent.filter(([name]) => name === 'provider:access-status');
      expect(events.map(([, payload]) => (payload as AccessStatus).state)).toEqual([
        'waiting',
        'active',
      ]);
      expect(events.every(([, payload]) => (payload as AccessStatus).providerId === 'fake')).toBe(
        true
      );
    });

    it('disposes the providers when the container is disposed', () => {
      container.dispose();
      expect(fake.disposed).toBe(true);
      expect(fake2.disposed).toBe(true);
    });
  });
});
