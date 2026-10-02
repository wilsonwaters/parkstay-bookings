/**
 * ProviderRegistry: registration checks (id, duplicates, manifest, the eight capability →
 * module rules), lookup errors, capability queries, disposal, and built-in registration
 * that survives a broken provider.
 */

import { BUILT_IN_PROVIDERS, registerBuiltInProviders } from '@main/providers';
import { parkstayFactory } from '@main/providers/parkstay';
import { CONSISTENCY_RULES, ProviderRegistry } from '@main/providers/registry';
import {
  defineProvider,
  ProviderCapabilityError,
  ProviderRegistrationError,
  UnknownProviderError,
  type AccommodationProvider,
} from '@main/providers/sdk';
import {
  createFakeProvider,
  createMemoryLogger,
  createTestProviderContext,
  type FakeProvider,
} from '@tests/utils/fake-provider';

function register(registry: ProviderRegistry, provider: FakeProvider): AccommodationProvider {
  return registry.register(provider.factory, createTestProviderContext(provider.manifest.id));
}

/** Registering `provider` must fail with a ProviderRegistrationError mentioning `message`. */
function expectRegistrationError(provider: FakeProvider, message: RegExp): void {
  const registry = new ProviderRegistry();
  let error: unknown;
  try {
    register(registry, provider);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ProviderRegistrationError);
  expect((error as ProviderRegistrationError).providerId).toBe(provider.manifest.id);
  expect((error as Error).message).toMatch(message);
  expect(registry.tryGet(provider.manifest.id)).toBeUndefined();
}

describe('ProviderRegistry.register', () => {
  it('registers a consistent provider and hands the factory its context', () => {
    const registry = new ProviderRegistry();
    const fake = createFakeProvider();
    const ctx = createTestProviderContext('fake');

    expect(registry.register(fake.factory, ctx)).toBe(fake);
    expect(fake.ctx).toBe(ctx);
    expect(registry.get('fake')).toBe(fake);
  });

  it('throws ProviderRegistrationError for a duplicate id', () => {
    const registry = new ProviderRegistry();
    register(registry, createFakeProvider());

    expect(() => register(registry, createFakeProvider())).toThrow(ProviderRegistrationError);
    expect(() => register(registry, createFakeProvider())).toThrow(/already registered/);
  });

  it('throws for an invalid id (ParkStay)', () => {
    const registry = new ProviderRegistry();
    const fake = createFakeProvider({ id: 'ParkStay' });
    const ctx = { ...createTestProviderContext('parkstay'), id: 'ParkStay' };

    expect(() => registry.register(fake.factory, ctx)).toThrow(ProviderRegistrationError);
    expect(() => registry.register(fake.factory, ctx)).toThrow(/invalid provider id/);
  });

  it('throws when the manifest id differs from the factory id, or the context is for another provider', () => {
    const registry = new ProviderRegistry();
    const fake = createFakeProvider({ id: 'fake' });
    const misnamed = defineProvider('other', () => fake);

    expect(() => registry.register(misnamed, createTestProviderContext('other'))).toThrow(
      /manifest id "fake" does not match/
    );
    expect(() => registry.register(fake.factory, createTestProviderContext('fake2'))).toThrow(
      /context belongs to "fake2"/
    );
  });

  it('throws, naming the provider, when the manifest is invalid, and disposes what was built', () => {
    const fake = createFakeProvider();
    (fake.manifest.brand as { color: string }).color = 'green';

    expectRegistrationError(fake, /invalid manifest \(brand\.color/);
    expect(fake.disposed).toBe(true);
  });

  it('throws, naming the provider, when its factory throws', () => {
    const registry = new ProviderRegistry();
    const broken = defineProvider('broken', () => {
      throw new Error('no network');
    });

    let error: unknown;
    try {
      registry.register(broken, createTestProviderContext('broken'));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ProviderRegistrationError);
    expect(error).toMatchObject({ providerId: 'broken', code: 'registration' });
    expect((error as Error).message).toBe(
      'Provider "broken" could not be registered: its factory threw: no network'
    );
  });

  it('throws when the provider has no links', () => {
    const fake = createFakeProvider();
    (fake as { links?: unknown }).links = undefined;
    expectRegistrationError(fake, /no links/);
  });

  describe('capability → module consistency (one case per rule)', () => {
    type Mutation = (p: FakeProvider) => void;
    const cases: Array<[rule: string, breakIt: Mutation, message: RegExp]> = [
      ['catalog', (p) => delete p.catalog, /catalog needs catalog/],
      [
        'availability/watches',
        (p) => delete p.availability,
        /availability\/watches needs availability\.check/,
      ],
      [
        'bulkAvailability',
        (p) => delete p.availability!.search,
        /bulkAvailability needs availability\.search/,
      ],
      ['holds', (p) => delete p.holds, /holds needs holds/],
      ['snipes', (p) => delete p.release, /snipes needs availability, holds and release/],
      ['accessGate', (p) => delete p.access, /accessGate needs access/],
      ['account', (p) => delete p.auth, /account needs auth/],
      ['bookingImport', (p) => delete p.bookings!.get, /bookingImport needs bookings\.get/],
    ];

    it('covers all eight rules', () => {
      expect(cases.map(([rule]) => rule)).toEqual(CONSISTENCY_RULES.map((r) => r.rule));
      expect(cases).toHaveLength(8);
    });

    it.each(cases)('%s: a missing module is rejected', (_rule, breakIt, message) => {
      const fake = createFakeProvider();
      breakIt(fake);
      expectRegistrationError(fake, message);
    });

    it('watches alone also needs availability.check', () => {
      const fake = createFakeProvider({
        capabilities: { availability: false, bulkAvailability: false, snipes: false },
      });
      delete fake.availability;
      expectRegistrationError(fake, /availability\/watches needs availability\.check/);
    });

    it('turning a capability off lets the module go', () => {
      const registry = new ProviderRegistry();
      const fake = createFakeProvider({
        capabilities: { holds: false, snipes: false, account: 'none' },
      });
      expect(fake.holds).toBeUndefined();
      expect(fake.auth).toBeUndefined();
      expect(register(registry, fake)).toBe(fake);
    });
  });
});

describe('ProviderRegistry lookups', () => {
  let registry: ProviderRegistry;
  let fake: FakeProvider;
  let fake2: FakeProvider;

  beforeEach(() => {
    registry = new ProviderRegistry();
    fake2 = createFakeProvider({
      id: 'fake2',
      name: 'Another Fake',
      capabilities: { holds: false, snipes: false },
    });
    fake = createFakeProvider({ id: 'fake', name: 'Zebra Fake' });
    register(registry, fake);
    register(registry, fake2);
  });

  it('get("nope") throws UnknownProviderError; tryGet returns undefined', () => {
    expect(() => registry.get('nope')).toThrow(UnknownProviderError);
    expect(() => registry.get('nope')).toThrow('Unknown provider "nope"');
    expect(registry.tryGet('nope')).toBeUndefined();
    expect(registry.tryGet('fake')).toBe(fake);
  });

  it('list() returns the manifests sorted by name', () => {
    expect(registry.list().map((m) => m.name)).toEqual(['Another Fake', 'Zebra Fake']);
    expect(registry.list()[0]).toBe(fake2.manifest);
  });

  it('withCapability returns only providers with it, sorted by name', () => {
    expect(registry.withCapability('holds')).toEqual([fake]);
    expect(registry.withCapability('catalog')).toEqual([fake2, fake]);
  });

  it('require returns the provider when it has the capability', () => {
    const provider = registry.require('fake', 'holds');
    expect(provider).toBe(fake);
    expect(typeof provider.holds.create).toBe('function');
  });

  it('require("fake", "holds") on a provider without holds throws ProviderCapabilityError', () => {
    const withoutHolds = new ProviderRegistry();
    register(withoutHolds, createFakeProvider({ capabilities: { holds: false, snipes: false } }));

    let error: unknown;
    try {
      withoutHolds.require('fake', 'holds');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ProviderCapabilityError);
    expect(error).toMatchObject({ providerId: 'fake', capability: 'holds', code: 'capability' });
    expect((error as Error).message).toBe('fake does not support holds');
    // The same in a two-provider registry
    expect(() => registry.require('fake2', 'holds')).toThrow(ProviderCapabilityError);
  });

  it('require on an unknown provider throws UnknownProviderError', () => {
    expect(() => registry.require('nope', 'catalog')).toThrow(UnknownProviderError);
  });
});

describe('ProviderRegistry.disposeAll', () => {
  it('disposes every provider even when one rejects or throws, logs the failures and never rejects', async () => {
    const logger = createMemoryLogger();
    const registry = new ProviderRegistry({ logger });
    const rejecting = createFakeProvider({ id: 'rejects' });
    const throwing = createFakeProvider({ id: 'throws' });
    const fine = createFakeProvider({ id: 'fine' });
    rejecting.dispose = jest.fn(() => Promise.reject(new Error('socket stuck')));
    throwing.dispose = jest.fn(() => {
      throw new Error('sync boom');
    });
    const fineDispose = jest.spyOn(fine, 'dispose');
    for (const p of [rejecting, throwing, fine]) register(registry, p);

    await expect(registry.disposeAll()).resolves.toBeUndefined();

    expect(rejecting.dispose).toHaveBeenCalledTimes(1);
    expect(throwing.dispose).toHaveBeenCalledTimes(1);
    expect(fineDispose).toHaveBeenCalledTimes(1);
    expect(logger.lines.filter((l) => l.level === 'error').map((l) => l.message)).toEqual([
      'Provider rejects failed to dispose',
      'Provider throws failed to dispose',
    ]);
    expect(registry.list()).toEqual([]);
  });

  it('starts every dispose synchronously', () => {
    const registry = new ProviderRegistry();
    const fake = createFakeProvider();
    register(registry, fake);

    void registry.disposeAll();

    expect(fake.disposed).toBe(true);
  });
});

describe('registerBuiltInProviders', () => {
  it('registers ParkStay by default', () => {
    expect(BUILT_IN_PROVIDERS).toEqual([parkstayFactory]);
    const registry = new ProviderRegistry();

    const result = registerBuiltInProviders(registry, (id) => createTestProviderContext(id));

    expect(result).toEqual({ registered: ['parkstay'], failed: [] });
    expect(registry.list().map((m) => m.id)).toEqual(['parkstay']);
  });

  it('keeps going past a provider whose factory or context throws, and logs it by name', () => {
    const logger = createMemoryLogger();
    const registry = new ProviderRegistry();
    const broken = defineProvider('broken', () => {
      throw new Error('bad config');
    });
    const noContext = defineProvider('no-context', () => createFakeProvider({ id: 'no-context' }));
    const fake = createFakeProvider();

    const result = registerBuiltInProviders(
      registry,
      (id) => {
        if (id === 'no-context') throw new Error('partition unavailable');
        return createTestProviderContext(id);
      },
      { factories: [broken, noContext, fake.factory], logger }
    );

    expect(result.registered).toEqual(['fake']);
    expect(result.failed.map((e) => [e.constructor.name, e.providerId])).toEqual([
      ['ProviderRegistrationError', 'broken'],
      ['ProviderRegistrationError', 'no-context'],
    ]);
    expect(logger.lines.map((l) => l.message)).toEqual([
      'Provider "broken" could not be registered: its factory threw: bad config',
      'Provider "no-context" could not be registered: partition unavailable',
    ]);
    expect(registry.get('fake')).toBe(fake);
  });
});
