/**
 * FakeProvider: an in-memory `AccommodationProvider` with every module, for tests of the
 * registry, IPC and (later) the core services.
 *
 *   const fake = createFakeProvider();                       // id 'fake', every capability
 *   const fake2 = createFakeProvider({ id: 'fake2' });       // a second provider
 *   registry.register(fake.factory, createTestProviderContext(fake.manifest));
 *
 * `capabilities: { catalogMode: 'search' }` gives it `catalog.searchArea` (pages of two)
 * instead of `catalog.listLocations`.
 *
 * Knobs:
 * - `failNext(module, error)`: the next call into that module rejects with `error`;
 * - `delayMs`: every async call waits this long first (abortable);
 * - `calls`: every call, in order;
 * - `accessStates`: the states the access gate steps through on `ensure()`.
 *
 * Every async method honours its `AbortSignal` and rejects with an `AbortError`.
 */

import os from 'os';
import path from 'path';
import {
  AccessGateError,
  createAbortError,
  defineProvider,
  FakeSecretVault,
  InMemoryKeyValueStore,
  NodeHttpClient,
  ProviderError,
  ProviderHttpError,
  createProviderContext,
  type AccessGate,
  type AccommodationProvider,
  type CatalogModule,
  type ExternalBooking,
  type HoldResult,
  type HoldSuccess,
  type ProviderContext,
  type ProviderFactory,
  type ProviderLogger,
} from '@main/providers/sdk';
import type {
  AccessState,
  AccessStatus,
  AccountRequirement,
  AccountStatus,
  LocationAvailability,
  NightState,
  ProviderCapabilities,
  ProviderManifest,
  StayQuery,
} from '@shared/types/provider.types';
import type { LocationDetail, LocationSummary } from '@shared/types/catalog.types';
import { SnipeReleaseMode } from '@shared/types/common.types';
import { makeLocationKey } from '@shared/utils/location-key';

export type FakeModule =
  | 'catalog'
  | 'availability'
  | 'access'
  | 'release'
  | 'holds'
  | 'bookings'
  | 'auth';

export interface FakeCall {
  module: FakeModule;
  method: string;
  args: unknown[];
}

export interface FakeLocationSeed {
  externalId: string;
  name: string;
}

export interface FakeProviderOptions {
  id?: string;
  name?: string;
  shortName?: string;
  /** Turned-off capabilities also leave out the modules only they need. */
  capabilities?: Partial<ProviderCapabilities>;
  locations?: FakeLocationSeed[];
  /**
   * Night states by `externalId` → unit id → state for every night. Units default to
   * `u1` (available) and `u2` (booked).
   */
  availability?: Record<string, Record<string, NightState>>;
  /** The signed-in state `auth.isSignedIn` reports. */
  account?: AccountStatus['state'];
  accessStates?: AccessState[];
  bookings?: ExternalBooking[];
  delayMs?: number;
}

export interface FakeProvider extends AccommodationProvider {
  readonly factory: ProviderFactory;
  readonly calls: FakeCall[];
  delayMs: number;
  /** The context the factory was called with. */
  ctx?: ProviderContext;
  failNext(module: FakeModule, error: Error): void;
  /** How many `holdOpen()` releases are outstanding. */
  readonly holdCount: number;
  readonly disposed: boolean;
}

export const FAKE_PRICE = 30;

/** The generic snipe release modes, which the fake (like ParkStay) describes and supports. */
const RELEASE_MODES: readonly string[] = Object.values(SnipeReleaseMode);

const DEFAULT_LOCATIONS: FakeLocationSeed[] = [
  { externalId: '1', name: 'Banksia Camp' },
  { externalId: '2', name: 'Karri Grove' },
  // An external id containing ":" must survive the location key round trip.
  { externalId: 'area:3', name: 'Tingle Hut' },
];

const ALL_ON: ProviderCapabilities = {
  catalog: true,
  catalogMode: 'full',
  availability: true,
  bulkAvailability: true,
  watches: true,
  snipes: true,
  holds: true,
  bookingImport: true,
  accessGate: true,
  account: 'optional',
};

/** Calendar dates from `arrival` up to (not including) `departure`. */
export function eachNight(stay: Pick<StayQuery, 'arrival' | 'departure'>): string[] {
  const nights: string[] = [];
  const end = Date.parse(`${stay.departure}T00:00:00Z`);
  for (let t = Date.parse(`${stay.arrival}T00:00:00Z`); t < end; t += 86_400_000) {
    nights.push(new Date(t).toISOString().slice(0, 10));
  }
  return nights;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError(signal));
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(createAbortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createFakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  const id = options.id ?? 'fake';
  const capabilities: ProviderCapabilities = { ...ALL_ON, ...options.capabilities };
  const seeds = options.locations ?? DEFAULT_LOCATIONS;
  const accountState = options.account ?? 'signed-in';
  const accessStates = options.accessStates ?? ['waiting', 'active'];
  const bookings = options.bookings ?? [];
  const failures = new Map<FakeModule, Error>();
  const calls: FakeCall[] = [];
  let holdCount = 0;
  let holdSequence = 0;
  let disposed = false;

  const manifest: ProviderManifest = {
    id,
    name: options.name ?? `Fake ${id}`,
    shortName: options.shortName ?? (id === 'fake' ? 'Fake' : id),
    description: 'An in-memory provider for tests.',
    website: `https://${id}.example`,
    integration: 'api',
    brand: { color: '#2F5D50', monogram: 'FK' },
    locationKinds: ['campground', 'cabin'],
    timezone: 'Australia/Perth',
    currency: 'AUD',
    capabilities,
    limits: { minWatchIntervalMinutes: 5, maxConcurrentRequests: 2, catalogTtlHours: 1 },
    stayFields: [
      {
        key: 'gearType',
        label: 'Gear',
        type: 'select',
        options: [
          { value: 'tent', label: 'Tent' },
          { value: 'caravan', label: 'Caravan' },
        ],
        default: 'tent',
        appliesTo: ['availability', 'watch', 'snipe'],
      },
    ],
    releaseModes: capabilities.snipes
      ? [
          {
            id: SnipeReleaseMode.DAILY_ROLLOVER,
            label: 'Daily rollover',
            description: 'Opens 180 days ahead.',
            usesAccessGate: capabilities.accessGate,
          },
          {
            id: SnipeReleaseMode.SCHEDULED,
            label: 'Scheduled',
            description: 'Opens at a time you set.',
            usesAccessGate: capabilities.accessGate,
          },
          {
            id: SnipeReleaseMode.CANCELLATION,
            label: 'Cancellation',
            description: 'Polls for a freed unit.',
            usesAccessGate: false,
          },
        ]
      : undefined,
  };

  /** Records the call, honours the signal and the delay, and fires a scripted failure. */
  async function enter(
    module: FakeModule,
    method: string,
    args: unknown[],
    signal?: AbortSignal
  ): Promise<void> {
    calls.push({ module, method, args });
    // Always yields to a timer, so an abort right after the call still lands.
    await wait(fake.delayMs, signal);
    const failure = failures.get(module);
    if (failure) {
      failures.delete(module);
      throw failure;
    }
  }

  function seedFor(externalId: string): FakeLocationSeed {
    const seed = seeds.find((s) => s.externalId === externalId);
    if (!seed) {
      throw new ProviderHttpError({
        providerId: id,
        status: 404,
        url: `https://${id}.example/locations/${encodeURIComponent(externalId)}`,
      });
    }
    return seed;
  }

  function summary(seed: FakeLocationSeed, index: number): LocationSummary {
    return {
      key: makeLocationKey(id, seed.externalId),
      providerId: id,
      externalId: seed.externalId,
      name: seed.name,
      kind: 'campground',
      bookingMode: 'online',
      lat: -34 + index * 0.1,
      lng: 116 + index * 0.1,
      area: { name: 'Fake National Park', region: 'South West' },
      imageUrls: [`https://${id}.example/img/${index}.jpg`],
      amenities: ['Toilets'],
      unitCount: 2,
      bookingUrl: links.location(seed.externalId) ?? undefined,
    };
  }

  function unitStates(externalId: string): Record<string, NightState> {
    return options.availability?.[externalId] ?? { u1: 'available', u2: 'booked' };
  }

  function checkNow(externalId: string, stay: StayQuery, unitIds?: string[]): LocationAvailability {
    seedFor(externalId);
    const nights = eachNight(stay);
    const units = Object.entries(unitStates(externalId))
      .filter(([unitId]) => !unitIds || unitIds.includes(unitId))
      .map(([unitId, state]) => {
        const fullyAvailable = state === 'available';
        return {
          unitId,
          unitName: `Site ${unitId}`,
          unitType: 'Tent site',
          nights: nights.map((date) => ({
            date,
            state,
            price: state === 'available' ? FAKE_PRICE : undefined,
          })),
          fullyAvailable,
          total: fullyAvailable ? FAKE_PRICE * nights.length : undefined,
        };
      });
    return {
      key: makeLocationKey(id, externalId),
      checkedAt: clock().toISOString(),
      units,
      release: { open: true },
      bookingUrl: links.booking(externalId, stay) ?? undefined,
    };
  }

  const clock = (): Date => fake.ctx?.clock() ?? new Date();

  const links = {
    location: (externalId: string) =>
      `https://${id}.example/locations/${encodeURIComponent(externalId)}`,
    booking: (externalId: string, stay?: StayQuery) =>
      `https://${id}.example/book/${encodeURIComponent(externalId)}` +
      (stay ? `?arrival=${stay.arrival}&departure=${stay.departure}` : ''),
    manageBooking: (reference: string) =>
      `https://${id}.example/bookings/${encodeURIComponent(reference)}`,
  };

  // ---- access gate: steps through `accessStates` on ensure(), one step per tick ----
  const listeners = new Set<(status: AccessStatus) => void>();
  let accessStatus: AccessStatus = {
    providerId: id,
    state: 'idle',
    updatedAt: new Date().toISOString(),
  };
  const setAccess = (state: AccessState): void => {
    accessStatus = { providerId: id, state, updatedAt: clock().toISOString() };
    listeners.forEach((listener) => listener(accessStatus));
  };
  const access: AccessGate = {
    status: () => accessStatus,
    async ensure({ signal, maxWaitMs } = {}) {
      await enter('access', 'ensure', [{ maxWaitMs }], signal);
      for (const state of accessStates) {
        await wait(0, signal);
        setAccess(state);
        if (state === 'active') return accessStatus;
      }
      throw new AccessGateError(id, accessStatus.state);
    },
    holdOpen() {
      holdCount++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holdCount--;
      };
    },
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
    },
  };

  function catalogModule(): CatalogModule {
    const catalog: CatalogModule = {
      async getLocation(externalId, signal) {
        await enter('catalog', 'getLocation', [externalId], signal);
        const seed = seedFor(externalId);
        const detail: LocationDetail = {
          ...summary(seed, seeds.indexOf(seed)),
          descriptionHtml: `<p>${seed.name}</p>`,
          units: Object.keys(unitStates(externalId)).map((unitId) => ({
            unitId,
            unitName: `Site ${unitId}`,
            unitType: 'Tent site',
            maxPeople: 6,
            equipment: ['tent'],
          })),
          releaseInfo: 'Bookings open 180 days ahead.',
          fetchedAt: clock().toISOString(),
        };
        return detail;
      },
    };
    if (capabilities.catalogMode === 'search') {
      // Pages of two; the cursor is the index of the next location.
      catalog.searchArea = async (query, signal) => {
        await enter('catalog', 'searchArea', [query], signal);
        const start = Number(query.cursor ?? 0);
        const items = seeds.map(summary).slice(start, start + 2);
        const next = start + items.length;
        return next < seeds.length ? { items, nextCursor: String(next) } : { items };
      };
    } else {
      catalog.listLocations = async (signal) => {
        await enter('catalog', 'listLocations', [], signal);
        return seeds.map(summary);
      };
    }
    return catalog;
  }

  const fake: FakeProvider = {
    manifest,
    links,
    calls,
    delayMs: options.delayMs ?? 0,
    factory: defineProvider(manifest, (ctx) => {
      fake.ctx = ctx;
      return fake;
    }),
    failNext(module, error) {
      failures.set(module, error);
    },
    get holdCount() {
      return holdCount;
    },
    get disposed() {
      return disposed;
    },

    catalog: capabilities.catalog ? catalogModule() : undefined,

    availability:
      capabilities.availability || capabilities.watches || capabilities.snipes
        ? {
            async check(externalId, stay, { unitIds, signal } = {}) {
              await enter('availability', 'check', [externalId, stay, { unitIds }], signal);
              return checkNow(externalId, stay, unitIds);
            },
            search: capabilities.bulkAvailability
              ? async (stay, signal) => {
                  await enter('availability', 'search', [stay], signal);
                  return seeds.map((seed) => {
                    const states = Object.values(unitStates(seed.externalId));
                    return {
                      key: makeLocationKey(id, seed.externalId),
                      availableUnits: states.filter((s) => s === 'available').length,
                      bookableUnits: states.length,
                    };
                  });
                }
              : undefined,
          }
        : undefined,

    access: capabilities.accessGate ? access : undefined,

    release: capabilities.snipes
      ? {
          supports: (mode) => RELEASE_MODES.includes(mode),
          async computeReleaseAt({ mode, externalId, stay, requestedAt, signal }) {
            await enter('release', 'computeReleaseAt', [{ mode, externalId, stay }], signal);
            if (mode === SnipeReleaseMode.CANCELLATION) return null;
            if (mode === SnipeReleaseMode.SCHEDULED) {
              if (!requestedAt) {
                throw new ProviderError({
                  providerId: id,
                  message: 'A scheduled release needs a time',
                });
              }
              return requestedAt;
            }
            if (mode === SnipeReleaseMode.DAILY_ROLLOVER) {
              return new Date(Date.parse(`${stay.arrival}T00:00:00Z`) - 180 * 86_400_000);
            }
            throw new ProviderError({ providerId: id, message: `Unknown release mode ${mode}` });
          },
          async describe(externalId, signal) {
            await enter('release', 'describe', [externalId], signal);
            return 'Bookings open 180 days ahead.';
          },
          suggestScheduledAt: (_externalId, now) => new Date(now.getTime() + 7 * 86_400_000),
          pollFloorMs: { window: 500, continuous: 3000 },
        }
      : undefined,

    holds: capabilities.holds
      ? {
          async create(request, signal): Promise<HoldResult> {
            await enter('holds', 'create', [request], signal);
            if (accountState !== 'signed-in' && requiresAccountForHolds(capabilities.account)) {
              return {
                ok: false,
                reason: 'auth-required',
                message: `Sign in to ${manifest.shortName}`,
              };
            }
            const result = checkNow(
              request.externalId,
              request.stay,
              request.unitId ? [request.unitId] : undefined
            );
            const unit = result.units.find((u) => u.fullyAvailable);
            if (!unit)
              return { ok: false, reason: 'taken', message: 'No unit is free for the stay' };
            holdSequence++;
            return {
              ok: true,
              reference: `${id.toUpperCase()}-${holdSequence}`,
              expiresAt: new Date(clock().getTime() + 30 * 60_000),
              unitId: unit.unitId,
            };
          },
          paymentUrl: (hold: HoldSuccess) => `https://${id}.example/pay/${hold.reference}`,
          paymentOrigins: [`https://${id}.example`],
        }
      : undefined,

    bookings: capabilities.bookingImport
      ? {
          async list(signal) {
            await enter('bookings', 'list', [], signal);
            return bookings;
          },
          async get(reference, signal) {
            await enter('bookings', 'get', [reference], signal);
            const booking = bookings.find((b) => b.reference === reference);
            if (!booking) {
              throw new ProviderHttpError({
                providerId: id,
                status: 404,
                url: links.manageBooking(reference),
              });
            }
            return booking;
          },
        }
      : undefined,

    auth:
      capabilities.account !== 'none'
        ? {
            kind: 'browser-session',
            signInUrl: `https://${id}.example/sign-in`,
            allowedOrigins: [`https://${id}.example`],
            completionUrlPatterns: [`https://${id}.example/signed-in*`],
            async isSignedIn(_http, signal) {
              await enter('auth', 'isSignedIn', [], signal);
              return accountState === 'signed-in'
                ? { state: 'signed-in', email: `person@${id}.example`, displayName: 'Pat Person' }
                : { state: accountState };
            },
          }
        : undefined,

    async dispose() {
      disposed = true;
      access.dispose();
    },
  };

  return fake;
}

function requiresAccountForHolds(requirement: AccountRequirement): boolean {
  return requirement === 'required' || requirement === 'required-for-holds';
}

/** A logger that records every line, for tests that assert on logging. */
export interface MemoryLogger extends ProviderLogger {
  readonly lines: Array<{ level: string; message: string; meta: unknown[]; context: object }>;
}

export function createMemoryLogger(
  context: object = {},
  lines: MemoryLogger['lines'] = []
): MemoryLogger {
  const log =
    (level: string) =>
    (message: string, ...meta: unknown[]): void => {
      lines.push({ level, message, meta, context });
    };
  return {
    lines,
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (meta) => createMemoryLogger({ ...context, ...meta }, lines),
  };
}

export const FIXED_NOW = new Date('2026-10-02T02:00:00.000Z');

/**
 * Where test contexts keep provider browser profiles. Nothing is created there unless a test
 * really launches a browser (the opt-in smoke test uses its own temporary folder).
 */
export const TEST_PROVIDERS_DIR = path.join(os.tmpdir(), 'wa-stay-test', 'providers');

/** A minimal valid manifest for `id`, with every capability off. */
export function testManifest(
  id: string,
  overrides: Partial<ProviderManifest> = {}
): ProviderManifest {
  return {
    id,
    name: `Test ${id}`,
    shortName: id,
    description: 'A provider for tests.',
    website: `https://${id}.example`,
    integration: 'api',
    brand: { color: '#2F5D50', monogram: 'T' },
    locationKinds: ['campground'],
    timezone: 'Australia/Perth',
    currency: 'AUD',
    capabilities: {
      catalog: false,
      catalogMode: 'full',
      availability: false,
      bulkAvailability: false,
      watches: false,
      snipes: false,
      holds: false,
      bookingImport: false,
      accessGate: false,
      account: 'none',
    },
    ...overrides,
  };
}

/**
 * A provider context built from in-memory parts: Node HTTP, KV store, fake vault, fixed
 * clock, and browser automation with its profile under `TEST_PROVIDERS_DIR` (tests mock
 * `playwright-core` before using it). Pass the provider's manifest, or an id for a context
 * built from `testManifest(id)`.
 */
export function createTestProviderContext(
  manifestOrId: ProviderManifest | string,
  overrides: Partial<Omit<ProviderContext, 'id'>> = {}
): ProviderContext {
  const manifest = typeof manifestOrId === 'string' ? testManifest(manifestOrId) : manifestOrId;
  const context = createProviderContext(manifest, {
    createHttp: (providerId) => new NodeHttpClient({ providerId }),
    createState: () => new InMemoryKeyValueStore(),
    vault: new FakeSecretVault(),
    logger: createMemoryLogger(),
    providersDir: TEST_PROVIDERS_DIR,
    clock: () => FIXED_NOW,
  });
  return { ...context, ...overrides };
}
