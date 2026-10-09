/**
 * `LocationCatalogService`: one fast, offline-capable catalogue of every location from every
 * provider (architecture-notes §1, §4, §5), behind the `catalog.*` IPC namespace.
 *
 * - **Sync.** Each provider with `capabilities.catalog` and `catalogMode: 'full'` has its
 *   `catalog.listLocations` copied into `locations` (one transaction), at most once per
 *   `limits.catalogTtlHours` (24 h) unless forced. Syncs are single-flight per provider and
 *   run in parallel, so one provider's failure never blocks another's; a failed or empty
 *   sync keeps the cached rows and records `lastError`. The outcome is kept in
 *   `provider_state` as `('<providerId>', 'core.catalog.sync')` and announced as
 *   `catalog:updated`.
 * - **Search** runs on the cache (FTS5, filters, facets): `LocationRepository.search`.
 * - **Detail** is cached for 6 h; when the provider fails, the cached copy (or the summary)
 *   comes back marked `stale`.
 * - **Availability** fans out to every `bulkAvailability` provider (5 min cache) and reports
 *   each provider's failure separately. It never waits in a provider's queue: a gated
 *   provider answers with an `access-gate` error entry at once, and that error (or a
 *   `timeout`) is reused for 60 s per stay, so map pans during a queue ask nothing.
 * - **Automatic sync** (`start`) begins 5 s after the window is up and re-checks hourly,
 *   only for stale providers, and never while one of the provider's snipes is queueing or
 *   sniping (a 1.2 MB fetch must not compete with a release). While a provider has no cached
 *   locations at all (a first launch offline), a failed automatic sync is retried after
 *   1, 2 and 5 minutes before the hourly schedule takes over. Manual refresh always runs.
 * - **Freshness.** A timestamp in the future (the clock was set back) counts as stale.
 *
 * `catalogMode: 'search'` providers cannot list every location, so they are not synced:
 * they are the hook for providers that are searched by map area (`catalog.searchArea`,
 * §12.30). `status()` lists them with what is cached; `syncableMode` is where they join.
 */

import type {
  CatalogAvailabilityResult,
  CatalogProviderStatus,
  CatalogQuery,
  CatalogSearchResult,
  CatalogStatus,
  LocationDetail,
  LocationSummary,
} from '@shared/types/catalog.types';
import {
  providerLimits,
  type BulkAvailabilityEntry,
  type LocationAvailability,
  type ProviderId,
  type StayQuery,
} from '@shared/types/provider.types';
import type { EventSink } from '@shared/contracts/events';
import { makeLocationKey, parseLocationKey } from '@shared/utils/location-key';
import type { LocationRepository } from '../../database/repositories/location.repository';
import type { ProviderStateRepository } from '../../database/repositories/provider-state.repository';
import type { ProviderRegistry } from '../../providers/registry';
import type { ProviderLogger } from '../../providers/sdk/context';
import { sanitizeProviderHtml } from '../../providers/sdk/html';
import type { AccommodationProvider, FullCatalogModule } from '../../providers/sdk/provider';
import { AppError } from '../../utils/app-error';
import {
  catalogErrorCode,
  errorMessage,
  stayCacheKey,
  summaryFromHtml,
  withDeadline,
} from './catalog-helpers';

/** The `provider_state` key of a provider's last sync. */
export const CATALOG_SYNC_STATE_KEY = 'core.catalog.sync';

/** What `provider_state` keeps about a provider's catalogue sync. */
export interface CatalogSyncState {
  /** ISO timestamp of the last successful sync. */
  syncedAt?: string;
  /** Locations stored by that sync. */
  count?: number;
  /** Why the latest attempt failed; absent after a success. */
  lastError?: string;
}

export interface CatalogTimings {
  /** After `start()`, before the first automatic sync. */
  startDelayMs: number;
  /** Between automatic re-checks. */
  recheckMs: number;
  /** `catalog.listLocations`. */
  syncTimeoutMs: number;
  /** `catalog.getLocation`. */
  detailTimeoutMs: number;
  /** `availability.search` and `availability.check`. */
  availabilityTimeoutMs: number;
  /** How long a cached detail is served without asking the provider. */
  detailTtlMs: number;
  /** How long a provider's bulk availability for a stay is reused. */
  bulkTtlMs: number;
  /** How long a provider's `access-gate` or `timeout` error for a stay is reused. */
  bulkErrorTtlMs: number;
  /** How long a location's availability for a stay is reused. */
  checkTtlMs: number;
  /**
   * While a provider has no cached locations, the waits before retrying a failed automatic
   * sync, one after another; then only the hourly re-check.
   */
  emptyRetryMs: readonly number[];
}

export const DEFAULT_CATALOG_TIMINGS: Readonly<CatalogTimings> = Object.freeze({
  startDelayMs: 5_000,
  recheckMs: 3_600_000,
  syncTimeoutMs: 60_000,
  detailTimeoutMs: 20_000,
  availabilityTimeoutMs: 20_000,
  detailTtlMs: 6 * 3_600_000,
  bulkTtlMs: 5 * 60_000,
  bulkErrorTtlMs: 60_000,
  checkTtlMs: 60_000,
  emptyRetryMs: Object.freeze([60_000, 2 * 60_000, 5 * 60_000]),
});

export interface SyncOptions {
  /** Sync even when the last success is still fresh. */
  force?: boolean;
}

export interface CatalogAvailabilityFilter {
  providerIds?: ProviderId[];
  bbox?: CatalogQuery['bbox'];
}

export type CatalogLogger = Pick<ProviderLogger, 'debug' | 'info' | 'warn' | 'error'>;

export interface LocationCatalogServiceDeps {
  registry: ProviderRegistry;
  locations: LocationRepository;
  providerState: ProviderStateRepository;
  /** Where `catalog:updated` goes (the renderer events bus). */
  events: EventSink;
  logger: CatalogLogger;
  clock?: () => Date;
  /**
   * True while one of the provider's snipes is queueing or sniping. Automatic sync waits for
   * it; a manual refresh does not.
   */
  isReleaseInProgress?: (providerId: ProviderId) => boolean;
  timings?: Partial<CatalogTimings>;
}

interface Cached<T> {
  at: number;
  value: T;
}

export class LocationCatalogService {
  private readonly registry: ProviderRegistry;
  private readonly locations: LocationRepository;
  private readonly providerState: ProviderStateRepository;
  private readonly events: EventSink;
  private readonly logger: CatalogLogger;
  private readonly clock: () => Date;
  private readonly isReleaseInProgress: (providerId: ProviderId) => boolean;
  private readonly timings: CatalogTimings;

  /** Aborted by `stop()`: every provider call in flight is cancelled with it. */
  private readonly lifetime = new AbortController();
  private started = false;
  private startTimer?: ReturnType<typeof setTimeout>;
  private recheckTimer?: ReturnType<typeof setInterval>;
  /** Pending empty-cache retries, at most one per provider. */
  private readonly retryTimers = new Map<ProviderId, ReturnType<typeof setTimeout>>();
  /** Empty-cache retries used per provider; never reset, so they run once per launch. */
  private readonly retriesUsed = new Map<ProviderId, number>();

  private readonly syncs = new Map<ProviderId, Promise<void>>();
  private readonly details = new Map<string, Promise<LocationDetail>>();
  private readonly bulk = new Map<string, Promise<BulkAvailabilityEntry[]>>();
  private readonly bulkCache = new Map<string, Cached<BulkAvailabilityEntry[]>>();
  /** `access-gate` and `timeout` failures of bulk availability, by provider and stay. */
  private readonly bulkErrorCache = new Map<string, Cached<unknown>>();
  private readonly checks = new Map<string, Promise<LocationAvailability>>();
  private readonly checkCache = new Map<string, Cached<LocationAvailability>>();

  constructor(deps: LocationCatalogServiceDeps) {
    this.registry = deps.registry;
    this.locations = deps.locations;
    this.providerState = deps.providerState;
    this.events = deps.events;
    this.logger = deps.logger;
    this.clock = deps.clock ?? (() => new Date());
    this.isReleaseInProgress = deps.isReleaseInProgress ?? (() => false);
    this.timings = { ...DEFAULT_CATALOG_TIMINGS, ...deps.timings };
  }

  // -------------------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------------------

  /**
   * Starts automatic sync: stale providers sync `startDelayMs` (5 s) from now, then every
   * `recheckMs` (hourly). A provider still without any cached location after an automatic
   * attempt is retried after each of `emptyRetryMs` (1, 2, 5 min) in turn. Call it once the
   * main window is up. Safe to call twice.
   */
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.startTimer = setTimeout(() => {
      this.startTimer = undefined;
      this.autoSync();
      this.recheckTimer = setInterval(() => this.autoSync(), this.timings.recheckMs);
    }, this.timings.startDelayMs);
  }

  /**
   * Stops for good (on quit): no more automatic syncs, and every provider call in flight is
   * aborted, so nothing is written after the database closes.
   */
  stop(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.recheckTimer) clearInterval(this.recheckTimer);
    this.startTimer = undefined;
    this.recheckTimer = undefined;
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    this.lifetime.abort();
  }

  private get stopped(): boolean {
    return this.lifetime.signal.aborted;
  }

  // -------------------------------------------------------------------------------------
  // Sync
  // -------------------------------------------------------------------------------------

  /**
   * Syncs one catalogue provider, or every one. A provider whose last success is under its
   * `catalogTtlHours` old is skipped unless `force`. Never rejects for a provider's failure:
   * that is recorded and shows in `status()`. Throws `UnknownProviderError` or
   * `ProviderCapabilityError` for a `providerId` that cannot be synced.
   */
  async sync(providerId?: ProviderId, options: SyncOptions = {}): Promise<void> {
    const providers = providerId
      ? [this.registry.require(providerId, 'catalog')]
      : this.catalogProviders();
    await Promise.allSettled(providers.map((p) => this.syncProvider(p, options.force === true)));
  }

  /** `sync(providerId, { force: true })`, then the status. */
  async refresh(providerId?: ProviderId): Promise<CatalogStatus> {
    await this.sync(providerId, { force: true });
    return this.status();
  }

  /** Each catalogue provider's cache: count, last success, staleness, syncing, last error. */
  status(): CatalogStatus {
    const counts = this.locations.countByProvider();
    const providers = this.catalogProviders().map((provider): CatalogProviderStatus => {
      const id = provider.manifest.id;
      const state = this.syncState(id);
      return {
        providerId: id,
        count: counts[id] ?? 0,
        ...(state?.syncedAt ? { syncedAt: state.syncedAt } : {}),
        stale: this.syncableMode(provider) && !this.isFresh(provider, state),
        syncing: this.syncs.has(id),
        ...(state?.lastError ? { lastError: state.lastError } : {}),
      };
    });
    return { providers };
  }

  /**
   * The automatic sync: stale providers only (or just `only`), and none that is mid-release.
   * Each attempt, made or waiting, is followed by `retryWhileEmpty`.
   */
  private autoSync(only?: AccommodationProvider): void {
    if (this.stopped) return;
    const stale = (only ? [only] : this.catalogProviders()).filter(
      (provider) =>
        this.syncableMode(provider) && !this.isFresh(provider, this.syncState(provider.manifest.id))
    );
    for (const provider of stale) {
      const id = provider.manifest.id;
      if (this.isReleaseInProgress(id)) {
        this.logger.info(`Catalogue sync for ${id} waits: one of its snipes is in a release`);
        this.retryWhileEmpty(provider);
        continue;
      }
      void this.syncProvider(provider, false).then(() => this.retryWhileEmpty(provider));
    }
  }

  /**
   * After an automatic attempt: while the provider has no cached location and is still not
   * fresh (a first launch offline), schedules the next of `emptyRetryMs`. Bounded, one timer
   * per provider, and a no-op once rows exist, so it can never become a request loop.
   */
  private retryWhileEmpty(provider: AccommodationProvider): void {
    const id = provider.manifest.id;
    if (this.stopped || this.retryTimers.has(id) || this.hasRows(id)) return;
    if (this.isFresh(provider, this.syncState(id))) return;
    const used = this.retriesUsed.get(id) ?? 0;
    const delay = this.timings.emptyRetryMs[used];
    if (delay === undefined) return;
    this.retriesUsed.set(id, used + 1);
    this.logger.info(`Catalogue of ${id} is empty; retrying in ${Math.round(delay / 1000)} s`);
    this.retryTimers.set(
      id,
      setTimeout(() => {
        this.retryTimers.delete(id);
        if (!this.hasRows(id)) this.autoSync(provider);
      }, delay)
    );
  }

  private hasRows(id: ProviderId): boolean {
    return (this.locations.countByProvider()[id] ?? 0) > 0;
  }

  private syncProvider(provider: AccommodationProvider, force: boolean): Promise<void> {
    const id = provider.manifest.id;
    const running = this.syncs.get(id);
    if (running) return running;
    if (this.stopped || !this.syncableMode(provider)) return Promise.resolve();
    if (!force && this.isFresh(provider, this.syncState(id))) return Promise.resolve();

    const run = this.runSync(id, provider.catalog as FullCatalogModule).finally(() => {
      this.syncs.delete(id);
    });
    this.syncs.set(id, run);
    return run;
  }

  /** One sync. Resolves either way; a failure is recorded, never thrown. */
  private async runSync(id: ProviderId, catalog: FullCatalogModule): Promise<void> {
    try {
      const listed = await withDeadline(id, this.timings.syncTimeoutMs, this.lifetime.signal, (s) =>
        catalog.listLocations(s)
      );
      if (this.stopped) return;
      if (!Array.isArray(listed)) throw new Error(`${id} did not list its locations`);
      const cached = this.locations.countByProvider()[id] ?? 0;
      if (listed.length === 0 && cached > 0) {
        throw new Error(`${id} listed no locations; the ${cached} cached ones are kept`);
      }
      const at = this.clock();
      this.locations.upsertMany(id, listed, at);
      const syncedAt = at.toISOString();
      this.writeSyncState(id, { syncedAt, count: listed.length }, at);
      this.logger.info(`Catalogue of ${id} synced: ${listed.length} locations`);
      this.events.emit('catalog:updated', { providerId: id, count: listed.length, syncedAt });
    } catch (error) {
      // Quitting (stop aborted the call): the database is closing, so nothing is written.
      if (this.stopped) return;
      const lastError = errorMessage(error);
      this.logger.warn(`Catalogue sync for ${id} failed; the cached locations are kept`, error);
      const previous = this.syncState(id);
      this.writeSyncState(id, { ...previous, lastError }, this.clock());
    }
  }

  private catalogProviders(): AccommodationProvider[] {
    return this.registry.withCapability('catalog');
  }

  /** Whether the provider's catalogue is synced here (`full`) or searched live (`search`). */
  private syncableMode(provider: AccommodationProvider): boolean {
    return provider.manifest.capabilities.catalogMode === 'full';
  }

  private isFresh(provider: AccommodationProvider, state: CatalogSyncState | undefined): boolean {
    const syncedAt = state?.syncedAt ? Date.parse(state.syncedAt) : NaN;
    const ttlMs = providerLimits(provider.manifest).catalogTtlHours * 3_600_000;
    return this.within(syncedAt, ttlMs);
  }

  /**
   * Whether something from `at` (epoch ms) is under `ttlMs` old. A time in the future (the
   * clock was set back) or an invalid one is not.
   */
  private within(at: number, ttlMs: number): boolean {
    if (!Number.isFinite(at)) return false;
    const age = this.clock().getTime() - at;
    return age >= 0 && age < ttlMs;
  }

  private syncState(id: ProviderId): CatalogSyncState | undefined {
    return this.providerState.get<CatalogSyncState>(id, CATALOG_SYNC_STATE_KEY);
  }

  private writeSyncState(id: ProviderId, state: CatalogSyncState, at: Date): void {
    this.providerState.set(id, CATALOG_SYNC_STATE_KEY, state, at);
  }

  // -------------------------------------------------------------------------------------
  // Search and detail
  // -------------------------------------------------------------------------------------

  /** Searches the cached catalogues of the registered catalogue providers. */
  search(query: CatalogQuery): CatalogSearchResult {
    const scope = this.catalogProviders().map((p) => p.manifest.id);
    return this.locations.search(query, scope);
  }

  /**
   * A location's detail: the cached copy while it is under 6 h old, otherwise fresh from the
   * provider (sanitised again here, for every provider) and cached. When the provider fails,
   * the cached copy, or else the summary with no units, comes back with `stale: true`.
   * Throws `AppError('NOT_FOUND')` for a key that is not in a registered catalogue.
   */
  async get(key: string): Promise<LocationDetail> {
    const { providerId, externalId } = parseLocationKey(key);
    const provider = this.registry.tryGet(providerId);
    const summary = provider?.manifest.capabilities.catalog
      ? this.locations.get(providerId, externalId)
      : null;
    if (!provider?.catalog || !summary) {
      throw new AppError('NOT_FOUND', `There is no location ${key}`);
    }

    const cached = this.locations.getDetail(providerId, externalId);
    if (cached && this.within(cached.fetchedAt.getTime(), this.timings.detailTtlMs)) {
      return { ...cached.detail, fetchedAt: cached.fetchedAt.toISOString() };
    }

    const cacheKey = makeLocationKey(providerId, externalId);
    let pending = this.details.get(cacheKey);
    if (!pending) {
      pending = this.fetchDetail(provider, summary).finally(() => this.details.delete(cacheKey));
      this.details.set(cacheKey, pending);
    }
    try {
      return await pending;
    } catch (error) {
      if (this.stopped) throw error;
      this.logger.warn(`Detail of ${cacheKey} could not be fetched; serving the cache`, error);
      if (cached) {
        return { ...cached.detail, fetchedAt: cached.fetchedAt.toISOString(), stale: true };
      }
      return { ...summary, units: [], stale: true };
    }
  }

  private async fetchDetail(
    provider: AccommodationProvider,
    summary: LocationSummary
  ): Promise<LocationDetail> {
    const { providerId, externalId } = summary;
    const fetched = await withDeadline(
      providerId,
      this.timings.detailTimeoutMs,
      this.lifetime.signal,
      (signal) => provider.catalog!.getLocation(externalId, signal, { summary })
    );
    const at = this.clock();
    // Defence in depth: whatever the provider did, main sanitises before IPC.
    const descriptionHtml = fetched.descriptionHtml
      ? sanitizeProviderHtml(fetched.descriptionHtml, provider.manifest.website, {
          // The place's photos are its gallery; the description does not repeat them.
          dropImages: Array.isArray(fetched.imageUrls) ? fetched.imageUrls : [],
        })
      : undefined;
    const detail: LocationDetail = {
      ...fetched,
      key: summary.key,
      providerId,
      externalId,
      units: Array.isArray(fetched.units) ? fetched.units : [],
      fetchedAt: at.toISOString(),
    };
    if (descriptionHtml) detail.descriptionHtml = descriptionHtml;
    else delete detail.descriptionHtml;
    delete detail.stale;

    if (this.stopped) return detail;
    this.locations.setDetail(providerId, externalId, detail, at);
    const derived = summary.summary ? undefined : summaryFromHtml(descriptionHtml);
    if (derived) this.locations.setSummaryIfEmpty(providerId, externalId, derived);
    return detail;
  }

  // -------------------------------------------------------------------------------------
  // Availability
  // -------------------------------------------------------------------------------------

  /**
   * Bulk availability for `stay` from every `bulkAvailability` provider (or those in
   * `providerIds`; unknown ids are ignored), in parallel. Entries are limited to locations in
   * the catalogue, and to `bbox` when given. A provider that fails is listed in `errors`
   * while the others still answer. Each provider's answer is reused for 5 minutes per stay,
   * and its `access-gate` or `timeout` error for 60 s.
   */
  async availability(
    stay: StayQuery,
    filter: CatalogAvailabilityFilter = {}
  ): Promise<CatalogAvailabilityResult> {
    const wanted = filter.providerIds?.length ? new Set(filter.providerIds) : undefined;
    const providers = this.registry
      .withCapability('bulkAvailability')
      .filter((p) => !wanted || wanted.has(p.manifest.id));
    const stayKey = stayCacheKey(stay);

    const settled = await Promise.allSettled(
      providers.map((p) =>
        this.bulkFor(p.manifest.id, (signal) => p.availability.search(stay, signal), stayKey)
      )
    );

    const result: CatalogAvailabilityResult = { entries: [], errors: [] };
    settled.forEach((outcome, i) => {
      const providerId = providers[i].manifest.id;
      if (outcome.status === 'rejected') {
        result.errors.push({
          providerId,
          code: catalogErrorCode(outcome.reason),
          message: errorMessage(outcome.reason),
        });
        return;
      }
      const known = this.locations.externalIds(providerId, filter.bbox);
      for (const entry of outcome.value) {
        const parts = safeParseKey(entry.key);
        if (parts?.providerId === providerId && known.has(parts.externalId)) {
          result.entries.push(entry);
        }
      }
    });
    return result;
  }

  /**
   * One provider's bulk availability for a stay: cached, single-flight, with a deadline. An
   * `access-gate` or `timeout` failure is cached too (for `bulkErrorTtlMs`), so while a
   * queue is up the provider is not asked again for every map pan.
   */
  private bulkFor(
    providerId: ProviderId,
    search: (signal: AbortSignal) => Promise<BulkAvailabilityEntry[]>,
    stayKey: string
  ): Promise<BulkAvailabilityEntry[]> {
    const key = `${providerId}|${stayKey}`;
    const hit = this.bulkCache.get(key);
    if (hit && this.within(hit.at, this.timings.bulkTtlMs)) return Promise.resolve(hit.value);
    const failed = this.bulkErrorCache.get(key);
    if (failed && this.within(failed.at, this.timings.bulkErrorTtlMs)) {
      return Promise.reject(failed.value);
    }
    const running = this.bulk.get(key);
    if (running) return running;

    const run = withDeadline(
      providerId,
      this.timings.availabilityTimeoutMs,
      this.lifetime.signal,
      search
    )
      .then(
        (entries) => {
          // Keyed by the stay it answers, so a stay that changed meanwhile is never filled.
          this.bulkErrorCache.delete(key);
          this.remember(this.bulkCache, key, entries, this.timings.bulkTtlMs);
          return entries;
        },
        (error: unknown) => {
          const code = catalogErrorCode(error);
          if (!this.stopped && (code === 'access-gate' || code === 'timeout')) {
            this.remember(this.bulkErrorCache, key, error, this.timings.bulkErrorTtlMs);
          }
          throw error;
        }
      )
      .finally(() => this.bulk.delete(key));
    this.bulk.set(key, run);
    return run;
  }

  /**
   * One location's availability for `stay`, unit by unit and night by night. Reused for
   * 60 s per location and stay. Throws `UnknownProviderError`, `ProviderCapabilityError` or
   * the provider's error.
   */
  checkLocation(key: string, stay: StayQuery): Promise<LocationAvailability> {
    const { providerId, externalId } = parseLocationKey(key);
    const provider = this.registry.require(providerId, 'availability');
    const cacheKey = `${makeLocationKey(providerId, externalId)}|${stayCacheKey(stay)}`;
    const hit = this.checkCache.get(cacheKey);
    if (hit && this.within(hit.at, this.timings.checkTtlMs)) return Promise.resolve(hit.value);
    const running = this.checks.get(cacheKey);
    if (running) return running;

    const run = withDeadline(
      providerId,
      this.timings.availabilityTimeoutMs,
      this.lifetime.signal,
      (signal) => provider.availability.check(externalId, stay, { signal })
    )
      .then((availability) => {
        this.remember(this.checkCache, cacheKey, availability, this.timings.checkTtlMs);
        return availability;
      })
      .finally(() => this.checks.delete(cacheKey));
    this.checks.set(cacheKey, run);
    return run;
  }

  /** Caches `value` and drops entries that have expired, so the caches stay small. */
  private remember<T>(cache: Map<string, Cached<T>>, key: string, value: T, ttlMs: number): void {
    for (const [k, entry] of cache) if (!this.within(entry.at, ttlMs)) cache.delete(k);
    cache.set(key, { at: this.clock().getTime(), value });
  }
}

function safeParseKey(key: unknown): ReturnType<typeof parseLocationKey> | undefined {
  if (typeof key !== 'string') return undefined;
  try {
    return parseLocationKey(key);
  } catch {
    return undefined;
  }
}
