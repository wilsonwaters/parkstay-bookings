import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { List, Map as MapIcon } from 'lucide-react';
import type {
  BoundingBox,
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
import { hasMapLocation, placesLabel } from '../../components/locationFormat';
import { Button, Notice, Spinner, useAnnounce, type Guests } from '../../components/ui';
import { cx } from '../../components/ui/cx';
import { useMinWidth } from '../../components/ui/useMinWidth';
import { buildFacets, type ExploreFilters } from './filters/facets';
import { FilterRow } from './filters/FilterRow';
import { boundsOf, WA_BOUNDS, withinBbox } from './map/geo';
import { detectMapSupport } from './map/mapSupport';
import type { FitRequest, FlyRequest } from './map/MapView';
import type { MapViewState } from './map/types';
import { cardId, ResultsList, type ResultsState } from './results/ResultsList';
import { SearchPill } from './search/SearchPill';
import { buildSuggestionIndex, type Suggestion } from './search/suggestions';
import { hasActiveFilters, type KnownValues } from './state/exploreParams';
import { createHighlightStore, HighlightContext } from './state/highlight';
import { useExploreParams } from './state/useExploreParams';
import { useOnline } from './state/useOnline';

// Vite replaces `process.env.NODE_ENV` in renderer code; Jest runs on Node (as in ui/dev.ts).
declare const process: { env: { NODE_ENV?: string } };

const MapView = lazy(() => import('./map/MapView'));

const EMPTY: LocationSummary[] = [];
const WA_BBOX: BoundingBox = [WA_BOUNDS[0][0], WA_BOUNDS[0][1], WA_BOUNDS[1][0], WA_BOUNDS[1][1]];
/** Results are announced this long after a search or filter change settles. */
export const ANNOUNCE_DELAY_MS = 500;
/** How often an empty catalogue's sync state is asked for. */
const STATUS_POLL_MS = 3000;
const HEADER_HEIGHT = 64;

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
 * places beside a Mapbox map of Western Australia. The map and the list stay in step: hovering
 * either highlights the other, choosing a pin selects its card, and "Search as I move the map"
 * narrows the list to the visible area. Without a Mapbox token or WebGL it is a list.
 */
export default function ExplorePage() {
  useCatalogUpdates();
  const announce = useAnnounce();
  const online = useOnline();
  const wide = useMinWidth(1024);

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

  const { params, update, setCamera } = useExploreParams(known);

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

  // ---- Map ---------------------------------------------------------------------------
  const [support] = useState(detectMapSupport);
  const [mapFailure, setMapFailure] = useState<Error | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);
  const mapMode = support.available && !mapFailure;

  const [liveBbox, setLiveBbox] = useState<BoundingBox | null>(null);
  const [appliedArea, setAppliedArea] = useState<BoundingBox | null>(null);
  const area = mapMode ? (params.follow ? liveBbox : appliedArea) : null;
  const visible = useMemo(
    () => (area ? results.filter((item) => withinBbox(item, area)) : results),
    [results, area]
  );

  const requestId = useRef(0);
  const [fitRequest, setFitRequest] = useState<FitRequest | null>(null);
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null);
  const fit = useCallback((bbox: BoundingBox, maxZoom?: number) => {
    requestId.current += 1;
    setFitRequest({ id: requestId.current, bbox, maxZoom });
  }, []);

  // A new search (text or filters, not the map area) fits the map to its results.
  const settledQuery = useRef(queryKey);
  const noFitFor = useRef<string | null>(null);
  useEffect(() => {
    if (!search.isSuccess || search.isPlaceholderData || settledQuery.current === queryKey) return;
    settledQuery.current = queryKey;
    setAppliedArea(null);
    if (noFitFor.current === queryKey) {
      noFitFor.current = null;
      return;
    }
    const bbox = boundsOf(search.data.items);
    if (bbox) fit(bbox);
  }, [queryKey, search.isSuccess, search.isPlaceholderData, search.data, fit]);

  const onView = useCallback(
    (view: MapViewState) => {
      setLiveBbox(view.bbox);
      setCamera(view.camera);
    },
    [setCamera]
  );

  // ---- Highlight and selection -----------------------------------------------------------
  const [highlight] = useState(createHighlightStore);
  const scrollTo = useRef<string | null>(null);

  const select = useCallback(
    (key: string | null) => {
      scrollTo.current = key;
      update({ sel: key });
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
    if (suggestion.kind === 'region') {
      const unchanged =
        !params.q && params.regions.length === 1 && params.regions[0] === suggestion.target;
      if (unchanged) {
        const bbox = boundsOf(results);
        if (bbox) fit(bbox);
      } else update({ regions: [suggestion.target], q: '' });
    } else if (suggestion.kind === 'area') {
      update({ q: suggestion.target });
    } else {
      const place = catalogueByKey.get(suggestion.target);
      // The text typed to find the place is cleared; that is not a new search to fit to.
      if (params.q)
        noFitFor.current = JSON.stringify(normaliseCatalogQuery({ ...query, text: '' }));
      scrollTo.current = suggestion.target;
      update({ sel: suggestion.target, q: '' });
      if (place && hasMapLocation(place)) {
        requestId.current += 1;
        setFlyRequest({ id: requestId.current, lng: place.lng, lat: place.lat });
      }
    }
  };

  // ---- Actions ---------------------------------------------------------------------------
  const clearFilters = () =>
    update({ providers: [], kinds: [], regions: [], amenities: [], online: false });
  const clearSearch = () =>
    update({ q: '', providers: [], kinds: [], regions: [], amenities: [], online: false });
  const showAll = () => {
    setAppliedArea(null);
    fit(WA_BBOX);
  };
  const setFollow = (follow: boolean) => {
    setAppliedArea(follow ? null : liveBbox);
    update({ follow });
  };

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
  else if (area && visible.length === 0) state = { kind: 'empty-area' };
  else state = { kind: 'results' };

  // ---- Announce the count after a search or filter change ----------------------------------
  const message =
    state.kind === 'results'
      ? `${placesLabel(visible.length)}${area ? ' in map area' : ''}`
      : state.kind === 'no-matches'
        ? 'No places match your search'
        : state.kind === 'empty-area'
          ? 'No places in this part of the map'
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

  // ---- Below 1024 px: one pane at a time --------------------------------------------------
  const listPaneRef = useRef<HTMLDivElement>(null);
  const mapHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusPane = useRef<'map' | 'list' | null>(null);
  const toggleView = () => {
    const next = params.view === 'map' ? 'list' : 'map';
    focusPane.current = next;
    update({ view: next });
  };
  useEffect(() => {
    if (focusPane.current !== params.view) return;
    focusPane.current = null;
    const heading =
      params.view === 'map' ? mapHeadingRef.current : listPaneRef.current?.querySelector('h2');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus();
  }, [params.view]);
  const mapShown = mapMode && (wide || params.view === 'map');

  // ---- The sticky search bar's height, for the sticky map and card scroll margins ----------
  const subheaderRef = useRef<HTMLDivElement>(null);
  const [subheaderHeight, setSubheaderHeight] = useState(140);
  useLayoutEffect(() => {
    const element = subheaderRef.current;
    if (!element) return undefined;
    const measure = () => {
      if (element.offsetHeight) setSubheaderHeight(element.offsetHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const stickyStyle = {
    '--explore-sticky': `${HEADER_HEIGHT + subheaderHeight}px`,
  } as CSSProperties;

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
      {!support.available && (
        <Notice tone="info">
          {support.reason === 'no-token'
            ? "The map isn't available in this build, so places are shown as a list."
            : "This computer can't show the map, so places are shown as a list."}
          {support.reason === 'no-token' && process.env.NODE_ENV !== 'production' && (
            <> Set MAPBOX_ACCESS_TOKEN in .env to enable it.</>
          )}
        </Notice>
      )}
      {support.available && mapFailure && (
        <Notice
          tone="warning"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setMapFailure(null);
                setMapAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          The map couldn&apos;t load, so places are shown as a list.
        </Notice>
      )}
    </>
  );
  const hasNotices = !online || Boolean(searchError && result) || !support.available || mapFailure;

  return (
    <HighlightContext.Provider value={highlight}>
      <div className="flex flex-col" style={stickyStyle}>
        <h1 className="sr-only">Explore places to stay</h1>

        <div
          ref={subheaderRef}
          className="sticky top-16 z-header border-b border-border bg-surface px-6 py-4 lg:px-8"
        >
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

        <div
          className={cx(
            mapMode && 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-start'
          )}
        >
          <div
            ref={listPaneRef}
            className={cx(
              'px-6 pb-24 pt-8 lg:px-8',
              mapMode ? params.view === 'map' && 'max-lg:hidden' : 'mx-auto w-full max-w-7xl'
            )}
          >
            <ResultsList
              state={state}
              items={visible}
              inMapArea={Boolean(area)}
              width={mapMode ? 'split' : 'full'}
              selectedKey={params.sel}
              resetKey={queryKey}
              onHighlight={highlight.set}
              onRetry={() => refresh.mutate(undefined)}
              onClearFilters={clearSearch}
              onShowAll={showAll}
              notices={hasNotices ? notices : undefined}
            />
          </div>

          {mapMode && support.available && (
            <section
              aria-labelledby="explore-map-heading"
              className={cx(
                'isolate bg-canvas',
                'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-[var(--explore-sticky)]',
                'lg:sticky lg:top-[var(--explore-sticky)] lg:h-[calc(100vh-var(--explore-sticky))]',
                !wide && params.view !== 'map' && 'invisible'
              )}
            >
              <h2 id="explore-map-heading" ref={mapHeadingRef} tabIndex={-1} className="sr-only">
                Map of places
              </h2>
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Spinner label="Loading map" />
                  </div>
                }
              >
                <MapView
                  key={mapAttempt}
                  token={support.token}
                  items={results}
                  lookup={(key) => catalogueByKey.get(key) ?? results.find((r) => r.key === key)}
                  initialCamera={params.map}
                  selectedKey={params.sel}
                  follow={params.follow}
                  shown={mapShown}
                  fitRequest={fitRequest}
                  flyRequest={flyRequest}
                  onView={onView}
                  onSelect={select}
                  onFollowChange={setFollow}
                  onSearchArea={setAppliedArea}
                  onFailed={setMapFailure}
                />
              </Suspense>
            </section>
          )}
        </div>

        {mapMode && !wide && (
          <button
            type="button"
            onClick={toggleView}
            className="fixed bottom-6 left-1/2 z-header inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-surface-inverse px-5 text-sm font-semibold text-fg-inverse shadow-pill transition-colors duration-fast ease-standard hover:bg-surface-inverse/90"
          >
            {params.view === 'map' ? (
              <>
                <List size={18} aria-hidden="true" />
                Show list
              </>
            ) : (
              <>
                <MapIcon size={18} aria-hidden="true" />
                Show map
              </>
            )}
          </button>
        )}
      </div>
    </HighlightContext.Provider>
  );
}
