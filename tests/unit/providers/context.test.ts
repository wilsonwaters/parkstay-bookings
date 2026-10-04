/**
 * The per-provider context: KV store, scoped secrets (ciphertext only, per provider),
 * child logger, default browser automation, id validation.
 */

import {
  BrowserUnavailableError,
  createProviderContext,
  createScopedSecretVault,
  FakeSecretVault,
  InMemoryKeyValueStore,
  NodeHttpClient,
  type ProviderContextDeps,
} from '@main/providers/sdk';
import { DEFAULT_PROVIDER_LIMITS } from '@shared/types/provider.types';
import { createMemoryLogger, testManifest } from '@tests/utils/fake-provider';
import { removeUserData, testVault } from '@tests/utils/fake-safe-storage';

function deps(overrides: Partial<ProviderContextDeps> = {}): ProviderContextDeps {
  return {
    createHttp: (providerId) => new NodeHttpClient({ providerId }),
    createState: () => new InMemoryKeyValueStore(),
    vault: new FakeSecretVault(),
    logger: createMemoryLogger(),
    ...overrides,
  };
}

describe('InMemoryKeyValueStore', () => {
  it('stores JSON copies, lists by prefix in key order, and deletes', async () => {
    const store = new InMemoryKeyValueStore();
    const session = { key: 'ABC', expiresAt: '2026-10-02T03:00:00Z' };
    await store.set('queue.session', session);
    await store.set('release.time.20', '02:00');
    await store.set('release.time.18', '10:00');
    session.key = 'mutated';

    expect(await store.get('queue.session')).toEqual({
      key: 'ABC',
      expiresAt: '2026-10-02T03:00:00Z',
    });
    expect(await store.list('release.')).toEqual([
      { key: 'release.time.18', value: '10:00' },
      { key: 'release.time.20', value: '02:00' },
    ]);
    expect((await store.list()).map((e) => e.key)).toHaveLength(3);

    await store.delete('queue.session');
    await store.set('release.time.18', undefined);
    expect(await store.get('queue.session')).toBeUndefined();
    expect((await store.list()).map((e) => e.key)).toEqual(['release.time.20']);
  });
});

describe('ScopedSecretVault', () => {
  it("secrets.set('token', 'abc') on fake writes ciphertext under secret:token; get returns abc; fake2 cannot read it", async () => {
    const vault = new FakeSecretVault();
    const fakeContext = createProviderContext(testManifest('fake'), deps({ vault }));
    const fake2Context = createProviderContext(testManifest('fake2'), deps({ vault }));

    await fakeContext.secrets.set('token', 'abc');

    const stored = await fakeContext.state.get<string>('secret:token');
    expect(typeof stored).toBe('string');
    expect(stored).not.toBe('abc');
    expect(stored).not.toContain('abc');
    expect(await fakeContext.secrets.get('token')).toBe('abc');

    // fake2 has its own store: nothing to read.
    expect(await fake2Context.secrets.get('token')).toBeUndefined();
    // Even the copied ciphertext does not read as fake2's secret.
    await fake2Context.state.set('secret:token', stored);
    await expect(fake2Context.secrets.get('token')).rejects.toThrow(
      'Secret "token" was not written by fake2'
    );
  });

  it('a ciphertext moved to another key is refused, and delete removes the entry', async () => {
    const store = new InMemoryKeyValueStore();
    const secrets = createScopedSecretVault({
      providerId: 'fake',
      vault: new FakeSecretVault(),
      store,
    });
    await secrets.set('token', 'abc');
    await store.set('secret:other', await store.get('secret:token'));

    await expect(secrets.get('other')).rejects.toThrow(/not written by fake/);
    await secrets.delete('token');
    expect(await store.get('secret:token')).toBeUndefined();
  });

  it('a ciphertext that decrypts to something other than a sealed secret is refused without quoting it', async () => {
    const vault = new FakeSecretVault();
    const store = new InMemoryKeyValueStore();
    const secrets = createScopedSecretVault({ providerId: 'fake', vault, store });

    for (const plaintext of ['raw-secret-token-91f', '{"provider":"fake","key":"token"}']) {
      await store.set('secret:token', vault.encrypt(plaintext));
      const error = await secrets.get('token').then(
        () => null,
        (e: Error) => e
      );
      expect(error?.message).toBe('Secret "token" is damaged');
      expect(error?.message).not.toContain('raw-secret-token-91f');
    }
  });

  it("on the app's SecretVault: stores vault envelopes, and re-encrypts a local-key secret to OS encryption once available", async () => {
    const t = testVault();
    try {
      t.safeStorage.available = false;
      const store = new InMemoryKeyValueStore();
      const secrets = createScopedSecretVault({ providerId: 'fake', vault: t.vault, store });
      await secrets.set('token', 'abc');
      expect(await store.get('secret:token')).toMatch(/^vault:v1:local:/);

      t.safeStorage.available = true;
      expect(await secrets.get('token')).toBe('abc');
      const resealed = await store.get<string>('secret:token');
      expect(resealed).toMatch(/^vault:v1:os:/);
      expect(await secrets.get('token')).toBe('abc');
      expect(await store.get('secret:token')).toBe(resealed); // no further rewrite
    } finally {
      removeUserData(t.userDataDir);
    }
  });

  it('FakeSecretVault round-trips and rejects foreign ciphertext', () => {
    const vault = new FakeSecretVault();
    const ciphertext = vault.encrypt('pässword');
    expect(ciphertext).not.toContain('pässword');
    expect(vault.decrypt(ciphertext)).toBe('pässword');
    expect(() => vault.decrypt('plain')).toThrow('Unreadable secret');
  });
});

describe('createProviderContext', () => {
  it('builds per-provider parts: http, state, child logger, clock, unavailable browser', async () => {
    const logger = createMemoryLogger();
    const createHttp = jest.fn((providerId: string) => new NodeHttpClient({ providerId }));
    const ctx = createProviderContext(
      testManifest('fake'),
      deps({ logger, createHttp, clock: () => new Date(0) })
    );

    expect(createHttp).toHaveBeenCalledWith('fake');
    expect(ctx.http.providerId).toBe('fake');
    expect(ctx.clock().getTime()).toBe(0);
    expect(Object.isFrozen(ctx)).toBe(true);

    ctx.logger.warn('queue slow');
    expect(logger.lines).toEqual([
      { level: 'warn', message: 'queue slow', meta: [], context: { provider: 'fake' } },
    ]);

    expect(await ctx.browser.isAvailable()).toEqual({ available: false, reason: 'not-configured' });
    await expect(ctx.browser.withPage(async () => 1)).rejects.toBeInstanceOf(
      BrowserUnavailableError
    );
    await expect(ctx.browser.close()).resolves.toBeUndefined();
  });

  it('gives each provider its own state store', async () => {
    const shared = deps();
    const a = createProviderContext(testManifest('fake'), shared);
    const b = createProviderContext(testManifest('fake2'), shared);
    await a.state.set('k', 1);
    expect(await b.state.get('k')).toBeUndefined();
  });

  it('rejects an invalid provider id or manifest', () => {
    expect(() => createProviderContext(testManifest('ParkStay'), deps())).toThrow();
    expect(() =>
      createProviderContext(testManifest('fake', { timezone: 'Mars/Olympus' }), deps())
    ).toThrow();
  });

  it('is built from the manifest: a frozen copy, its time zone and its limits', () => {
    const manifest = testManifest('fake', {
      timezone: 'Australia/Sydney',
      limits: { minWatchIntervalMinutes: 30, maxConcurrentRequests: 1, catalogTtlHours: 12 },
    });
    const ctx = createProviderContext(manifest, deps());

    expect(ctx.manifest).toEqual(manifest);
    expect(ctx.manifest).not.toBe(manifest);
    expect(Object.isFrozen(ctx.manifest.capabilities)).toBe(true);
    expect(ctx.timezone).toBe('Australia/Sydney');
    expect(ctx.limits).toEqual({
      minWatchIntervalMinutes: 30,
      maxConcurrentRequests: 1,
      catalogTtlHours: 12,
    });
  });

  it('falls back to the default limits when the manifest sets none', () => {
    const ctx = createProviderContext(testManifest('fake'), deps());
    expect(ctx.limits).toEqual(DEFAULT_PROVIDER_LIMITS);
    expect(Object.isFrozen(ctx.limits)).toBe(true);
  });
});
