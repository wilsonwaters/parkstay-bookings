import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CATALOG_MAX_LIMIT,
  type CatalogQuery,
  type CatalogSearchResult,
  type CatalogStatus,
  type LocationDetail,
} from '../../shared/types/catalog.types';
import type {
  LocationAvailability,
  ProviderId,
  StayQuery,
} from '../../shared/types/provider.types';
import { parseLocationKey } from '../../shared/utils/location-key';
import { unwrap } from './client';
import { useApiEvent, useInvalidateOn } from './events';
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

/** Re-syncs one provider's catalogue, or all of them; afterwards every catalogue query reloads. */
export function useCatalogRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId?: ProviderId) => unwrap((api) => api.catalog.refresh(providerId)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
  });
}

/**
 * Reloads catalogue queries when a provider finishes a sync. The results already on screen
 * stay until the new ones arrive, so nothing flickers.
 */
export function useCatalogUpdates(): void {
  useInvalidateOn('catalog:updated', queryKeys.catalog.all);
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
