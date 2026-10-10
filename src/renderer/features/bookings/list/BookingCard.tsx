import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Ellipsis, Trash2 } from 'lucide-react';
import type { Booking } from '../../../../shared/types/booking.types';
import type { ProviderManifest } from '../../../../shared/types/provider.types';
import { ROUTES } from '../../../app/routes';
import { partyLabel } from '../../../components/stay/stayFormat';
import {
  Badge,
  Card,
  IconButton,
  Menu,
  MenuItem,
  ProviderBadge,
  StatusPill,
  statusPresets,
} from '../../../components/ui';
// U1's photo-led card pattern: the place's photo from the local catalogue, never a request.
import { WatchPhoto, type WatchPlace } from '../../watches/shared/WatchPhoto';
import { tripDatesLabel, tripNightsLabel, unitLabel } from '../shared/bookingFormat';
import { isHappeningNow } from './tripBuckets';

export interface BookingCardProps {
  booking: Booking;
  manifest: ProviderManifest | undefined;
  /** Today in the provider's time zone. */
  today: string;
  /** The catalogue's record of the place, for its photo; undefined when it has none. */
  place?: WatchPlace;
  /** The catalogue is still answering. */
  placeLoading?: boolean;
  /** Opens the "Remove from WA Stay" confirmation. */
  onRemove: (booking: Booking) => void;
}

/**
 * One trip, photo first: whose and where, the dates and party, the unit and reference, its
 * status, and a "More actions" menu. The place's name links to the booking's page.
 */
export function BookingCard({
  booking,
  manifest,
  today,
  place,
  placeLoading,
  onRemove,
}: BookingCardProps) {
  const headingId = useId();
  const { location, stay } = booking;
  const unit = unitLabel(booking, manifest);
  const when = [tripDatesLabel(stay, today), tripNightsLabel(stay), partyLabel(stay)];
  const now = isHappeningNow(booking, today);

  return (
    <Card
      as="article"
      aria-labelledby={headingId}
      padding="none"
      className="flex flex-col gap-3 p-3 sm:flex-row sm:gap-4"
    >
      <WatchPhoto
        name={location.name}
        place={place}
        loading={placeLoading}
        className="aspect-[16/9] w-full rounded-md sm:aspect-[4/3] sm:w-36 sm:self-start"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="min-w-0 text-base font-semibold text-fg">
            <Link
              to={ROUTES.bookingDetail(booking.id)}
              className="block truncate rounded-sm hover:underline"
            >
              {location.name}
            </Link>
          </h2>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {now && <Badge tone="sun">Happening now</Badge>}
            <StatusPill {...statusPresets.booking[booking.status]} />
          </div>
        </div>
        <p className="flex min-w-0 items-center gap-2 text-sm text-fg-secondary">
          <ProviderBadge providerId={booking.providerId} size="sm" className="shrink-0" />
          {location.areaName && <span className="truncate">{location.areaName}</span>}
        </p>
        <p className="text-sm text-fg-secondary">{when.filter(Boolean).join(' · ')}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <p className="min-w-0 text-sm text-fg-secondary">
            {unit && <span className="text-fg">{unit} · </span>}
            Ref <span className="font-semibold text-fg">{booking.bookingReference}</span>
          </p>
          <Menu
            align="end"
            trigger={
              <IconButton
                label={`More actions for ${location.name}`}
                icon={<Ellipsis />}
                variant="ghost"
                size="sm"
              />
            }
          >
            <MenuItem icon={<Trash2 size={16} />} tone="danger" onSelect={() => onRemove(booking)}>
              Remove from WA Stay
            </MenuItem>
          </Menu>
        </div>
      </div>
    </Card>
  );
}

export default BookingCard;
