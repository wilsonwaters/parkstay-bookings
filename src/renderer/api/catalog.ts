import { useCallback, useMemo, useRef } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type Query,
} from '@tanstack/react-query';
import {
  CATALOG_MAX_LIMIT,
  type CatalogErrorCode,
  type CatalogQuery,
  type CatalogSearchResult,
  type CatalogStatus,
  type LocationDetail,
  type LocationSummary,
} from '../../shared/types/catalog.types';
import type {
  BulkAvailabilityEntry,
  LocationAvailability,
  ProviderId,
  StayQuery,
} from '../../shared/types/provider.types';
import { parseLocationKey } from '../../shared/utils/location-key';
import { stayKeyFor } from '../../shared/utils/stay-key';
import { ApiError, toApiError, unwrap } from './client';
import { useApiEvent } from './events';
import { useProvidersWith } from './providers';
import { queryKeys } from './queryKeys';

// Vite replaces `process.env.NODE_ENV` in renderer code; Jest runs on Node (as in ui/dev.ts).
declare const process: { env: { NODE_ENV?: string } };

/** Catalogues change when a provider syncs (`catalog:updated`), so results keep for 5 minutes. */
export const CATALOG_STALE_TIME_MS = 5 * 60_000;

/**
 * The query as it is sent and cached: empty filters and blank text left out, `limit` 5000
 * ("everything", §12.15), so equal searches share one cache entry. The map area (`bbox`) is
 * never sent: Explore filters by area in the renderer, so panning makes no request.
 */
export function normaliseCatalogQuery(query: CatalogQuery): CatalogQuery {
  const out: CatalogQuery = {};
  const text = query.text?.trim();
  if (text) out.text = text;
  if (query.providerIds?.length) out.providerIds = [...query.providerIds].sort();
  if (query.kinds?.length) out.kinds = [...query.kinds].sort();
  if (query.regions?.length) out.regions = [...query.regions].sort();
  if (query.amenities?.length) out.amenities = [...query.amenities].sort();
  if (query.bookingModes?.length) out.bookingModes = [...query.bookingModes].sort();
  if (query.sort) out.sort = query.sort;
  out.limit = CATALOG_MAX_LIMIT;
  return out;
}

/**
 * DEV only: `#/?devFixture=5000` answers searches from that many synthetic places instead of
 * the catalogue, for checking Explore's speed by hand. The constant condition drops this from
 * production builds.
 */
function devFixtureSize(): number | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null;
  const match = /[?&]devFixture=(\d{1,5})\b/.exec(window.location.hash);
  return match ? Math.min(Number(match[1]), 20_000) : null;
}

async function searchCatalog(query: CatalogQuery): Promise<CatalogSearchResult> {
  if (process.env.NODE_ENV !== 'production') {
    const size = devFixtureSize();
    if (size) {
      const { searchDevFixture } = await import('../features/explore/dev/devFixture');
      return searchDevFixture(query, size);
    }
  }
  return unwrap((api) => api.catalog.search(query));
}

/**
 * `catalog.search` for Explore's results. While a new search loads, the previous results stay
 * on screen (`keepPreviousData`): check `isPlaceholderData` to tell.
 */
export function useCatalogSearch(query: CatalogQuery, options: { enabled?: boolean } = {}) {
  const normalised = normaliseCatalogQuery(query);
  return useQuery({
    queryKey: queryKeys.catalog.search(normalised),
    queryFn: () => searchCatalog(normalised),
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE_TIME_MS,
    enabled: options.enabled ?? true,
  });
}

/** The whole catalogue, unfiltered: what the filter options and "Where" suggestions come from. */
export function useCatalogAll(options: { enabled?: boolean } = {}) {
  return useCatalogSearch({}, options);
}

/**
 * Every catalogued place by key, for a list's photos (watches, snipes, bookings): one
 * `catalog.search` answered by main from its local catalogue (the unfiltered search Explore
 * caches too), never a request per row, refreshed when a provider's catalogue syncs. A place
 * of a provider without a catalogue is simply absent.
 */
export function useCatalogPlaces(enabled: boolean): {
  byKey: Map<string, LocationSummary>;
  loading: boolean;
} {
  // A first sync (a new profile) can finish after the list opened: the photos follow it.
  useCatalogUpdates();
  const all = useCatalogAll({ enabled });
  const byKey = useMemo(
    () => new Map((all.data?.items ?? []).map((place) => [place.key, place])),
    [all.data]
  );
  return { byKey, loading: all.isLoading };
}

/**
 * Each catalogue provider's sync state: syncing, synced, or failed. Pass `refetchInterval` to
 * keep asking while waiting for a first sync.
 */
export function useCatalogStatus(
  options: { enabled?: boolean; refetchInterval?: number | false } = {}
) {
  return useQuery<CatalogStatus>({
    queryKey: queryKeys.catalog.status(),
    queryFn: () => unwrap((api) => api.catalog.status()),
    staleTime: CATALOG_STALE_TIME_MS,
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
  });
}

/**
 * Every catalogue query except bulk availability: a catalogue sync changes the places, not
 * whether they are free, and each availability call is a request to the provider. (Places a
 * sync adds read "unknown" until the stay's availability is next asked for.)
 */
const catalogQueriesButAvailability = {
  queryKey: queryKeys.catalog.all,
  predicate: (query: Query) => query.queryKey[1] !== 'availability',
};

/**
 * Re-syncs one provider's catalogue, or all of them; afterwards every catalogue query reloads
 * (bulk availability excepted).
 */
export function useCatalogRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId?: ProviderId) => unwrap((api) => api.catalog.refresh(providerId)),
    onSettled: () => queryClient.invalidateQueries(catalogQueriesButAvailability),
  });
}

/**
 * Reloads catalogue queries when a provider finishes a sync (bulk availability excepted). The
 * results already on screen stay until the new ones arrive, so nothing flickers.
 */
export function useCatalogUpdates(): void {
  const queryClient = useQueryClient();
  useApiEvent('catalog:updated', () => {
    void queryClient.invalidateQueries(catalogQueriesButAvailability);
  });
}

/** A place's detail keeps 10 minutes here; main caches it for 6 hours. */
export const LOCATION_DETAIL_STALE_TIME_MS = 10 * 60_000;
/** A check of one place's availability keeps a minute, as main's own check cache does. */
export const LOCATION_CHECK_STALE_TIME_MS = 60_000;

/**
 * The place's summary from a catalogue search already in the cache (Explore's), as a detail
 * with no units yet: the page shows its name, photos and facilities at once while the detail
 * loads. `isPlaceholderData` tells it apart from the real detail.
 */
function cachedSummary(
  queryClient: ReturnType<typeof useQueryClient>,
  key: string
): LocationDetail | undefined {
  const searches = queryClient.getQueriesData<CatalogSearchResult>({
    queryKey: [...queryKeys.catalog.all, 'search'],
  });
  for (const [, data] of searches) {
    const item = data?.items?.find((candidate) => candidate.key === key);
    if (item) return { ...item, units: [] };
  }
  return undefined;
}

/**
 * `catalog.get(key)`: one place's detail (description, units, release rules). Main serves it
 * from its 6-hour cache when it can, so opening a place again costs the provider nothing.
 * `key` null (or `enabled: false`) asks nothing.
 */
export function useLocationDetail(key: string | null, options: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useQuery<LocationDetail>({
    queryKey: queryKeys.catalog.detail(key ?? ''),
    queryFn: () => unwrap((api) => api.catalog.get(key as string)),
    staleTime: LOCATION_DETAIL_STALE_TIME_MS,
    enabled: Boolean(key) && (options.enabled ?? true),
    placeholderData: () => (key ? cachedSummary(queryClient, key) : undefined),
  });
}

/**
 * Reloads the detail of `key`, in place, when its provider's catalogue syncs. Only the detail:
 * a sync never re-checks availability (each check is a request to the provider).
 */
export function useLocationDetailUpdates(key: string | null): void {
  const queryClient = useQueryClient();
  useApiEvent('catalog:updated', (event) => {
    if (!key) return;
    let providerId: string;
    try {
      providerId = parseLocationKey(key).providerId;
    } catch {
      return;
    }
    if (event.providerId !== providerId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.detail(key), exact: true });
  });
}

/**
 * `catalog.checkLocation(key, stay)`: each unit's nights for the stay. It asks only once a
 * stay is given (the person pressed Check), and each stay is its own cache entry. A failed
 * check is not retried by itself: the person retries, so a busy provider is not asked twice.
 */
export function useLocationCheck(key: string | null, stay: StayQuery | null) {
  return useQuery<LocationAvailability>({
    queryKey: queryKeys.catalog.check(key ?? '', stay),
    queryFn: () => unwrap((api) => api.catalog.checkLocation(key as string, stay as StayQuery)),
    staleTime: LOCATION_CHECK_STALE_TIME_MS,
    enabled: Boolean(key && stay),
    retry: false,
    // Coming back online never re-asks the provider by itself either.
    refetchOnReconnect: false,
  });
}

/** The most places a location picker lists at once; the total says how many matched. */
export const LOCATION_SEARCH_LIMIT = 20;
/** A location picker searches from this many characters. */
export const LOCATION_SEARCH_MIN_CHARS = 2;

/**
 * A location picker's search: one provider's places matching `text`, best first (main's
 * full-text ranking), at most `LOCATION_SEARCH_LIMIT`. Runs from 2 characters; while the next
 * search loads, the previous results stay (`isPlaceholderData`).
 */
export function useLocationSearch({
  providerId,
  text,
}: {
  providerId: ProviderId | undefined;
  text: string;
}) {
  const trimmed = text.trim();
  const query: CatalogQuery = {
    text: trimmed,
    providerIds: providerId ? [providerId] : [],
    limit: LOCATION_SEARCH_LIMIT,
    sort: 'relevance',
  };
  return useQuery({
    queryKey: queryKeys.catalog.search(query),
    queryFn: () => unwrap((api) => api.catalog.search(query)),
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE_TIME_MS,
    enabled: Boolean(providerId) && trimmed.length >= LOCATION_SEARCH_MIN_CHARS,
  });
}

// ---------------------------------------------------------------------------------------
// Bulk availability (E3)
// ---------------------------------------------------------------------------------------

/** A stay's bulk availability is asked again after 2 minutes, if the stay is applied again. */
export const BULK_AVAILABILITY_STALE_TIME_MS = 2 * 60_000;
/** It stays in the cache for 15 minutes, so dates switched back to show at once. */
export const BULK_AVAILABILITY_GC_TIME_MS = 15 * 60_000;

/**
 * A stay as one cache key, `arrival_departure_adults_children_infants`. Guests are part of it
 * although ParkStay's bulk call ignores them: other providers may not.
 */
export function stayKey(stay: StayQuery): string {
  return [stay.arrival, stay.departure, stay.adults, stay.children ?? 0, stay.infants ?? 0].join(
    '_'
  );
}

/** What one provider answered: its entries, or that it has no bulk availability after all. */
interface ProviderBulkAvailability {
  entries: BulkAvailabilityEntry[];
  supported: boolean;
}

/** `catalog.availability`'s per-provider error codes, as the renderer's error codes. */
const BULK_ERROR_CODES: Record<CatalogErrorCode, string> = {
  'access-gate': 'ACCESS_GATE',
  timeout: 'TIMEOUT',
  http: 'PROVIDER_ERROR',
  parse: 'PROVIDER_ERROR',
  unknown: 'PROVIDER_ERROR',
};

/**
 * One provider's bulk availability: `catalog.availability(stay, { providerIds: [id] })`. Its
 * failure (listed in the result's `errors`) is thrown, so each provider fails on its own. A
 * provider main says has no bulk availability (`CAPABILITY`) is not a failure.
 */
async function providerBulkAvailability(
  stay: StayQuery,
  providerId: ProviderId
): Promise<ProviderBulkAvailability> {
  try {
    const result = await unwrap((api) =>
      api.catalog.availability(stay, { providerIds: [providerId] })
    );
    const failure = result.errors.find((error) => error.providerId === providerId);
    if (failure) throw new ApiError(failure.message, BULK_ERROR_CODES[failure.code]);
    const prefix = `${providerId}:`;
    return { entries: result.entries.filter((e) => e.key.startsWith(prefix)), supported: true };
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.code === 'CAPABILITY') return { entries: [], supported: false };
    throw apiError;
  }
}

/**
 * What a provider's bulk availability is doing for the stay:
 * `idle` (offline, nothing cached), `loading`, `success`, `error`, or `unsupported`.
 */
export type BulkAvailabilityStatus = 'idle' | 'loading' | 'success' | 'error' | 'unsupported';

export interface BulkAvailability {
  /** The stay's entries from every provider that answered, by location key. */
  byKey: ReadonlyMap<string, BulkAvailabilityEntry>;
  /** Each bulk provider's status for the stay; empty with no stay. */
  statusByProvider: Readonly<Record<ProviderId, BulkAvailabilityStatus>>;
  /** Why each failed provider failed. */
  errors: Readonly<Record<ProviderId, ApiError>>;
  /** Asks one provider again (Retry), and no other. */
  refetch(providerId: ProviderId): void;
}

export interface BulkAvailabilityOptions {
  /**
   * False while the stay is still changing (debounced by the caller): nothing is asked, but a
   * stay already in the cache shows at once and the others read `loading`.
   */
  settled?: boolean;
  /** False when offline: nothing is asked, and providers with nothing cached read `idle`. */
  online?: boolean;
}

const EMPTY_ENTRIES: ReadonlyMap<string, BulkAvailabilityEntry> = new Map();

/**
 * Bulk availability for `stay` (null: no stay) from every catalogue provider with
 * `bulkAvailability`: one query per provider, so one failing or slow provider never holds up
 * another. Keyed by provider and the stay fields it reads: a stay keeps its answers for 15
 * minutes, and an answer is only ever shown for a stay it answers. Nothing is retried or refetched by itself
 * (no retry, no refetch on reconnect or focus): a failed provider is asked again by `refetch`,
 * and a stale stay when it is applied again.
 */
export function useBulkAvailability(
  stay: StayQuery | null,
  options: BulkAvailabilityOptions = {}
): BulkAvailability {
  const { settled = true, online = true } = options;
  const providersQuery = useProvidersWith('bulkAvailability');
  const providers = useMemo(
    () => (providersQuery.data ?? []).filter((p) => p.capabilities.catalog),
    [providersQuery.data]
  );
  const providerIds = useMemo(() => providers.map((p) => p.id), [providers]);
  // Each provider's answer is keyed by the stay fields it reads (its manifest's
  // `bulkAvailabilityStayFields`), so a change it ignores (the guests, for ParkStay) shows the
  // answer already in the cache and asks nothing.
  const keys = stay ? providers.map((p) => stayKeyFor(stay, p.bulkAvailabilityStayFields)) : [];
  const key = keys.join('\n');
  const enabled = Boolean(stay) && settled && online;

  const results = useQueries({
    queries: stay
      ? providers.map((provider, i) => ({
          queryKey: queryKeys.catalog.availability(keys[i], provider.id),
          queryFn: () => providerBulkAvailability(stay, provider.id),
          enabled,
          staleTime: BULK_AVAILABILITY_STALE_TIME_MS,
          gcTime: BULK_AVAILABILITY_GC_TIME_MS,
          retry: false,
          refetchOnReconnect: false,
          refetchOnWindowFocus: false,
        }))
      : [],
  });
  const latest = useRef(results);
  latest.current = results;

  // Rebuilt only when a query's state changes. (Not with `combine`: on the render after the
  // stay changes it can still return the previous stay's result.)
  const signature = [
    key,
    ...results.map((r) => `${r.status}|${r.fetchStatus}|${r.dataUpdatedAt}|${r.errorUpdatedAt}`),
  ].join('\n');
  const combined = useMemo(() => {
    const byKey = new Map<string, BulkAvailabilityEntry>();
    const statusByProvider: Record<ProviderId, BulkAvailabilityStatus> = {};
    const errors: Record<ProviderId, ApiError> = {};
    latest.current.forEach((result, i) => {
      const id = providerIds[i];
      if (!id) return;
      if (result.data) {
        // An answer in the cache shows, even while it is asked again.
        statusByProvider[id] = result.data.supported ? 'success' : 'unsupported';
        for (const entry of result.data.entries) byKey.set(entry.key, entry);
      } else if (result.isFetching) statusByProvider[id] = 'loading';
      else if (result.isError) {
        statusByProvider[id] = 'error';
        errors[id] = toApiError(result.error);
      } else statusByProvider[id] = online ? 'loading' : 'idle';
    });
    return { byKey: byKey.size ? byKey : EMPTY_ENTRIES, statusByProvider, errors };
    // `signature` stands for the results (a new array every render), read through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, providerIds, online]);

  const refetch = useCallback(
    (providerId: ProviderId) => {
      const index = providerIds.indexOf(providerId);
      if (index >= 0) void latest.current[index]?.refetch();
    },
    [providerIds]
  );

  return useMemo(() => ({ ...combined, refetch }), [combined, refetch]);
}
