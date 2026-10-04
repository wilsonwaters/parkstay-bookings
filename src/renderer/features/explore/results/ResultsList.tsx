import { forwardRef, memo, useEffect, useState, type ReactNode } from 'react';
import { CircleAlert, Compass, LoaderCircle, MapPinned, SearchX, Store } from 'lucide-react';
import type { LocationSummary } from '../../../../shared/types/catalog.types';
import { LocationCard } from '../../../components/LocationCard';
import { placesLabel } from '../../../components/locationFormat';
import { Button, EmptyState, Skeleton } from '../../../components/ui';
import { cx } from '../../../components/ui/cx';
import { useMinWidth } from '../../../components/ui/useMinWidth';
import { useIsHighlighted } from '../state/highlight';

/** Cards rendered at first, and added by each "Show more places". */
export const PAGE_SIZE = 40;
const SKELETON_COUNT = 8;

export type ResultsState =
  | { kind: 'loading' }
  | { kind: 'syncing' }
  | { kind: 'failed'; retrying: boolean }
  | { kind: 'unavailable' }
  | { kind: 'no-providers' }
  | { kind: 'no-matches' }
  | { kind: 'empty-area' }
  | { kind: 'results' };

export interface ResultsListProps {
  state: ResultsState;
  /** The places to list (already narrowed to the map area when following the map). */
  items: readonly LocationSummary[];
  /** "Search as I move the map" is narrowing the list. */
  inMapArea: boolean;
  /** `split`: beside the map; `full`: the whole width (list-only, or a narrow window). */
  width: 'split' | 'full';
  selectedKey: string | null;
  /** Changes when a new search replaces the results, so the list starts again at 40. */
  resetKey: string;
  onHighlight: (key: string | null) => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onShowAll: () => void;
  /** Notices shown above the heading (offline, search error, list-only). */
  notices?: ReactNode;
}

/** The DOM id of a location's card, so a pin can scroll it into view. */
export function cardId(key: string): string {
  return `place-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/** A card that re-renders only when its own highlight or selection changes. */
const ResultCard = memo(function ResultCard({
  location,
  selected,
  layout,
  onHighlight,
}: {
  location: LocationSummary;
  selected: boolean;
  layout: 'stack' | 'row';
  onHighlight: (key: string | null) => void;
}) {
  const highlighted = useIsHighlighted(location.key);
  return (
    <LocationCard
      id={cardId(location.key)}
      location={location}
      highlighted={highlighted}
      selected={selected}
      layout={layout}
      onHighlight={onHighlight}
    />
  );
});

function CardSkeleton({ layout }: { layout: 'stack' | 'row' }) {
  return (
    <div className={cx('flex', layout === 'row' ? 'flex-row gap-4' : 'flex-col gap-3')}>
      <Skeleton
        className={cx(
          'aspect-[4/3] rounded-lg',
          layout === 'row' ? 'w-2/5 max-w-[15rem] shrink-0' : 'w-full'
        )}
      />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <Skeleton shape="text" className="h-4 w-3/4" />
        <Skeleton shape="text" className="w-1/2" />
        <Skeleton shape="text" className="w-1/3" />
      </div>
    </div>
  );
}

const Heading = forwardRef<HTMLHeadingElement, { children: ReactNode }>(function Heading(
  { children },
  ref
) {
  return (
    <h2 ref={ref} tabIndex={-1} className="text-xl font-semibold text-fg">
      {children}
    </h2>
  );
});

/**
 * Explore's results: a heading with the count, a grid of LocationCards (40 at a time, with
 * "Show more places"), and every state the list can be in: loading, the catalogue syncing or
 * failing, nothing matching, and nothing in the map area.
 */
export function ResultsList({
  state,
  items,
  inMapArea,
  width,
  selectedKey,
  resetKey,
  onHighlight,
  onRetry,
  onClearFilters,
  onShowAll,
  notices,
}: ResultsListProps) {
  const lg = useMinWidth(1024);
  const xl = useMinWidth(1280);
  // Beside the map there is one column from 1024 to 1280 px: the photo sits beside the text
  // there. Below 1024 px the list has the whole width (the map is a separate pane).
  const layout = width === 'split' && lg && !xl ? 'row' : 'stack';
  const grid =
    width === 'split'
      ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => setShown(PAGE_SIZE), [resetKey]);

  // A place selected on the map must have its card on the page.
  useEffect(() => {
    if (!selectedKey) return;
    const index = items.findIndex((item) => item.key === selectedKey);
    if (index >= shown) setShown(Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
  }, [selectedKey, items, shown]);

  const busy = state.kind === 'loading' || state.kind === 'syncing';
  const count = items.length;

  let body: ReactNode;
  switch (state.kind) {
    case 'loading':
      body = (
        <>
          <Heading>Loading places</Heading>
          <ul role="list" className={cx('mt-6 grid gap-x-6 gap-y-8', grid)}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <li key={i}>
                <CardSkeleton layout={layout} />
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'syncing':
      body = (
        <EmptyState
          size="md"
          icon={<LoaderCircle size={24} className="animate-spin" />}
          accent="sun"
          title="Getting places ready"
          description="WA Stay is loading places from your providers. This takes a few seconds the first time."
        />
      );
      break;
    case 'failed':
      body = (
        <EmptyState
          size="md"
          icon={<CircleAlert size={24} />}
          title="We couldn't load places"
          description="Check your internet connection, then try again."
          actions={
            <Button variant="secondary" loading={state.retrying} onClick={onRetry}>
              Try again
            </Button>
          }
        />
      );
      break;
    case 'unavailable':
      body = (
        <EmptyState
          size="md"
          icon={<Compass size={24} />}
          title="Places aren't available yet"
          description="This version of WA Stay can't list places yet. Watches and Site Sniper still work."
        />
      );
      break;
    case 'no-providers':
      body = (
        <EmptyState
          size="md"
          icon={<Store size={24} />}
          title="No providers with places are installed"
          description="Places appear here once a provider that lists them is added to WA Stay."
        />
      );
      break;
    case 'no-matches':
      body = (
        <EmptyState
          size="md"
          icon={<SearchX size={24} />}
          title="No places match your search"
          description="Try fewer filters or different words."
          actions={
            <Button variant="secondary" onClick={onClearFilters}>
              Clear filters
            </Button>
          }
        />
      );
      break;
    case 'empty-area':
      body = (
        <EmptyState
          size="md"
          icon={<MapPinned size={24} />}
          title="No places in this part of the map"
          description="Move the map or zoom out to see more."
          actions={
            <Button variant="secondary" onClick={onShowAll}>
              Show all of WA
            </Button>
          }
        />
      );
      break;
    case 'results':
      body = (
        <>
          <Heading>{inMapArea ? `${placesLabel(count)} in map area` : placesLabel(count)}</Heading>
          <ul role="list" className={cx('mt-6 grid gap-x-6 gap-y-8', grid)}>
            {items.slice(0, shown).map((item) => (
              <li key={item.key} className="scroll-mt-[var(--explore-sticky,8rem)]">
                <ResultCard
                  location={item}
                  selected={item.key === selectedKey}
                  layout={layout}
                  onHighlight={onHighlight}
                />
              </li>
            ))}
          </ul>
          {count > shown && (
            <div className="mt-10 flex flex-col items-center gap-3">
              <p className="text-sm text-fg-muted">
                Showing {shown} of {count}
              </p>
              <Button variant="secondary" onClick={() => setShown(shown + PAGE_SIZE)}>
                Show more places
              </Button>
            </div>
          )}
        </>
      );
      break;
  }

  return (
    <section aria-label="Results" aria-busy={busy || undefined} className="flex flex-col">
      {notices && <div className="mb-6 flex flex-col gap-3">{notices}</div>}
      {body}
    </section>
  );
}
