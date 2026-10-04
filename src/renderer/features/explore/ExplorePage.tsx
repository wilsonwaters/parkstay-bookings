import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CatalogQuery,
  CatalogSearchResult,
  LocationSummary,
} from '../../../shared/types/catalog.types';
import {
  normaliseCatalogQuery,
  toApiError,
  useCatalogAll,
  useCatalogRefresh,
  useCatalogSearch,
  useCatalogStatus,
  useCatalogUpdates,
  useProvidersWith,
} from '../../api';
import { placesLabel } from '../../components/locationFormat';
import { Button, Notice, useAnnounce, type Guests } from '../../components/ui';
import { buildFacets, type ExploreFilters } from './filters/facets';
import { FilterRow } from './filters/FilterRow';
import { cardId, ResultsList, type ResultsState } from './results/ResultsList';
import { SearchPill } from './search/SearchPill';
import { buildSuggestionIndex, type Suggestion } from './search/suggestions';
import { hasActiveFilters, type KnownValues } from './state/exploreParams';
import { createHighlightStore, HighlightContext } from './state/highlight';
import { useExploreParams } from './state/useExploreParams';
import { useOnline } from './state/useOnline';

const EMPTY: LocationSummary[] = [];
/** Results are announced this long after a search or filter change settles. */
export const ANNOUNCE_DELAY_MS = 500;
/** How often an empty catalogue's sync state is asked for. */
const STATUS_POLL_MS = 3000;

const unique = (values: Iterable<string | undefined>) =>
  [...new Set(values)].filter((v): v is string => Boolean(v)).sort();

/** The last results that loaded, kept on screen while a later search fails. */
function useLastResult(data: CatalogSearchResult | undefined, failed: boolean) {
  const last = useRef<CatalogSearchResult | undefined>(undefined);
  if (data && !failed) last.current = data;
  return last.current;
}

/**
 * Explore, the home screen (`/`): an Airbnb-style search pill and filter chips over a list of
 * every place to stay, from every catalogue provider.
 */
export default function ExplorePage() {
  useCatalogUpdates();
  const announce = useAnnounce();
  const online = useOnline();

  // ---- Catalogue and URL state -----------------------------------------------------------
  const providersQuery = useProvidersWith('catalog');
  const catalogProviders = providersQuery.data;
  const allQuery = useCatalogAll();
  const catalogue = allQuery.data?.items ?? EMPTY;

  const catalogueByKey = useMemo(
    () => new Map(catalogue.map((item) => [item.key, item])),
    [catalogue]
  );
  const known = useMemo<KnownValues>(() => {
    const loaded = catalogue.length > 0;
    return {
      providers: catalogProviders?.map((p) => p.id),
      regions: loaded ? unique(catalogue.map((i) => i.area?.region)) : undefined,
      amenities: loaded ? unique(catalogue.flatMap((i) => i.amenities)) : undefined,
      keys: loaded ? new Set(catalogueByKey.keys()) : undefined,
    };
  }, [catalogProviders, catalogue, catalogueByKey]);

  const { params, update } = useExploreParams(known);

  const filters: ExploreFilters = useMemo(
    () => ({
      providerIds: params.providers,
      kinds: params.kinds,
      regions: params.regions,
      amenities: params.amenities,
      bookingModes: params.online ? ['online'] : [],
    }),
    [params.providers, params.kinds, params.regions, params.amenities, params.online]
  );
  const query: CatalogQuery = useMemo(() => ({ text: params.q, ...filters }), [params.q, filters]);
  const queryKey = JSON.stringify(normaliseCatalogQuery(query));
  const searching = Boolean(params.q) || hasActiveFilters(params);

  const search = useCatalogSearch(query);
  const textSearch = useCatalogSearch({ text: params.q }, { enabled: Boolean(params.q) });
  const result = useLastResult(search.data, search.isError);
  const results = result?.items ?? EMPTY;
  // An empty catalogue is either waiting for its first sync (5 s after launch), syncing, or
  // failed: ask main which, and keep asking while it is empty.
  const catalogueEmpty = Boolean(allQuery.data && allQuery.data.total === 0);
  const status = useCatalogStatus({
    enabled: catalogueEmpty,
    refetchInterval: catalogueEmpty ? STATUS_POLL_MS : false,
  });
  const refresh = useCatalogRefresh();

  const facets = useMemo(
    () =>
      buildFacets(
        catalogue,
        params.q ? (textSearch.data?.items ?? catalogue) : catalogue,
        filters,
        (catalogProviders ?? []).map((p) => ({ id: p.id, name: p.name }))
      ),
    [catalogue, params.q, textSearch.data, filters, catalogProviders]
  );
  const suggestionIndex = useMemo(() => buildSuggestionIndex(catalogue), [catalogue]);

  // ---- Highlight and selection -----------------------------------------------------------
  const [highlight] = useState(createHighlightStore);
  const scrollTo = useRef<string | null>(null);

  const select = useCallback(
    (key: string | null, patch: { q?: string } = {}) => {
      scrollTo.current = key;
      update({ sel: key, ...patch });
    },
    [update]
  );

  // Bring the selected card into view once it is on the page.
  useEffect(() => {
    const key = scrollTo.current;
    if (!key || params.sel !== key) return;
    const card = document.getElementById(cardId(key));
    if (card) {
      card.scrollIntoView?.({ block: 'nearest' });
      scrollTo.current = null;
    }
  });

  const onSuggestion = (suggestion: Suggestion) => {
    if (suggestion.kind === 'region') update({ regions: [suggestion.target], q: '' });
    else if (suggestion.kind === 'area') update({ q: suggestion.target });
    else select(suggestion.target, { q: '' });
  };

  // ---- Actions ---------------------------------------------------------------------------
  const clearFilters = () =>
    update({ providers: [], kinds: [], regions: [], amenities: [], online: false });
  const clearSearch = () =>
    update({ q: '', providers: [], kinds: [], regions: [], amenities: [], online: false });
  const onDates = ({ arrival, departure }: { arrival?: string; departure?: string }) =>
    update({ arrival: arrival ?? null, departure: departure ?? null });
  const onGuests = (guests: Guests) =>
    update({ adults: guests.adults, children: guests.children, infants: guests.infants });
  const guests: Guests | undefined =
    params.adults !== null
      ? { adults: params.adults, children: params.children ?? 0, infants: params.infants ?? 0 }
      : undefined;

  // ---- Which state the results are in ------------------------------------------------------
  const searchError = search.isError ? toApiError(search.error) : null;
  let state: ResultsState;
  if (catalogProviders && catalogProviders.length === 0) state = { kind: 'no-providers' };
  else if (!result) {
    if (searchError?.code === 'NOT_IMPLEMENTED') state = { kind: 'unavailable' };
    else if (searchError) state = { kind: 'failed', retrying: refresh.isPending };
    else state = { kind: 'loading' };
  } else if (result.items.length === 0 && !searching) {
    // Nothing in the catalogue at all: syncing (or about to), or the sync failed.
    const providers = status.data?.providers ?? [];
    const failed =
      status.isError || (!providers.some((p) => p.syncing) && providers.some((p) => p.lastError));
    if (status.isPending && !status.isError) state = { kind: 'loading' };
    else if (failed) state = { kind: 'failed', retrying: refresh.isPending };
    else state = { kind: 'syncing' };
  } else if (result.items.length === 0) state = { kind: 'no-matches' };
  else state = { kind: 'results' };

  // ---- Announce the count after a search or filter change ----------------------------------
  const message =
    state.kind === 'results'
      ? placesLabel(results.length)
      : state.kind === 'no-matches'
        ? 'No places match your search'
        : null;
  const announcedQuery = useRef(queryKey);
  useEffect(() => {
    if (!message || search.isFetching || announcedQuery.current === queryKey) return undefined;
    const timer = setTimeout(() => {
      announcedQuery.current = queryKey;
      announce(message);
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [message, queryKey, search.isFetching, announce]);

  // ---- Notices -----------------------------------------------------------------------------
  const notices = (
    <>
      {!online && (
        <Notice tone="warning">
          You&apos;re offline. Showing saved places; photos and map tiles may not load.
        </Notice>
      )}
      {searchError && result && (
        <Notice
          tone="danger"
          title="We couldn't update the results"
          actions={
            <Button variant="secondary" size="sm" onClick={() => void search.refetch()}>
              Retry
            </Button>
          }
        >
          {searchError.message}
        </Notice>
      )}
    </>
  );
  const hasNotices = !online || Boolean(searchError && result);

  return (
    <HighlightContext.Provider value={highlight}>
      <div className="flex flex-col">
        <h1 className="sr-only">Explore places to stay</h1>

        <div className="sticky top-16 z-header border-b border-border bg-surface px-6 py-4 lg:px-8">
          <SearchPill
            query={params.q}
            index={suggestionIndex}
            dates={{
              arrival: params.arrival ?? undefined,
              departure: params.departure ?? undefined,
            }}
            guests={guests}
            onQueryChange={(q) => update({ q })}
            onSuggestion={onSuggestion}
            onDatesChange={onDates}
            onGuestsChange={onGuests}
          />
          <div className="mx-auto mt-4 w-full max-w-[860px]">
            <FilterRow
              params={params}
              facets={facets}
              showKinds={facets.kinds.length > 1}
              onChange={(patch) => update(patch)}
              onClearAll={clearFilters}
            />
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-6 pb-24 pt-8 lg:px-8">
          <ResultsList
            state={state}
            items={results}
            inMapArea={false}
            width="full"
            selectedKey={params.sel}
            resetKey={queryKey}
            onHighlight={highlight.set}
            onRetry={() => refresh.mutate(undefined)}
            onClearFilters={clearSearch}
            onShowAll={clearSearch}
            notices={hasNotices ? notices : undefined}
          />
        </div>
      </div>
    </HighlightContext.Provider>
  );
}
