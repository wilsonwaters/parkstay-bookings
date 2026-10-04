import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CATALOG_MAX_LIMIT,
  type CatalogQuery,
  type CatalogSearchResult,
  type CatalogStatus,
} from '../../shared/types/catalog.types';
import type { ProviderId } from '../../shared/types/provider.types';
import { unwrap } from './client';
import { useInvalidateOn } from './events';
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
