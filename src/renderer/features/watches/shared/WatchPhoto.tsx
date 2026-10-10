import { useMemo } from 'react';
import type { LocationSummary } from '../../../../shared/types/catalog.types';
import { useCatalogAll, useCatalogUpdates } from '../../../api';
import { LocationPhoto } from '../../../components/LocationCard';
import { Skeleton } from '../../../components/ui';
import { cx } from '../../../components/ui/cx';

/** What a watch's photo needs from the catalogue's record of its place. */
export type WatchPlace = Pick<LocationSummary, 'imageUrls' | 'kind'>;

export interface WatchPhotoProps {
  /** The place's name: the photo's alt text, and the placeholder's label. */
  name: string;
  /** The catalogue's record of the place (summary or detail); undefined when it has none. */
  place?: WatchPlace;
  /** The catalogue is still answering: a skeleton, rather than a placeholder that then changes. */
  loading?: boolean;
  /** Sets the size and corners; the photo fills it. */
  className?: string;
}

/**
 * A watch's place photo: E1's LocationPhoto (https only, lazy, no referrer, the placeholder
 * when there is none), named by the place. The photo URL comes from the catalogue; the only
 * request it makes is for the image itself.
 */
export function WatchPhoto({ name, place, loading = false, className }: WatchPhotoProps) {
  if (loading) return <Skeleton shape="fill" className={cx('shrink-0', className)} />;
  return (
    <LocationPhoto
      location={{ name, kind: place?.kind, imageUrls: place?.imageUrls ?? [] }}
      alt={name}
      className={cx('shrink-0', className)}
    />
  );
}

/**
 * Every catalogued place by key, for the list's photos: one `catalog.search` answered by main
 * from its local catalogue (the unfiltered search Explore caches too), never a request per
 * watch, refreshed when a provider's catalogue syncs. A place of a provider without a
 * catalogue is simply absent.
 */
export function useCatalogPlaces(enabled: boolean) {
  // A first sync (a new profile) can finish after the list opened: the photos follow it.
  useCatalogUpdates();
  const all = useCatalogAll({ enabled });
  const byKey = useMemo(
    () => new Map((all.data?.items ?? []).map((place) => [place.key, place])),
    [all.data]
  );
  return { byKey, loading: all.isLoading };
}

export default WatchPhoto;
