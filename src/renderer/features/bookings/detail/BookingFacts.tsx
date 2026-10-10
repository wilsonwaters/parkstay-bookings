import { useId, type ReactNode } from 'react';
import type { Booking } from '../../../../shared/types/booking.types';
import type { UnitSummary } from '../../../../shared/types/catalog.types';
import type { ProviderManifest } from '../../../../shared/types/provider.types';
import { partyLabel } from '../../../components/stay/stayFormat';
import { Card } from '../../../components/ui';
import {
  formatCost,
  fullDayLabel,
  stayParamRows,
  tripNightsLabel,
  unitLabel,
} from '../shared/bookingFormat';
import { CopyReference } from './CopyReference';

export interface BookingFactsProps {
  booking: Booking;
  manifest: ProviderManifest | undefined;
  /** The place's units from the catalogue, for their names. */
  units?: readonly UnitSummary[];
}

/** One labelled section of the facts card: its heading beside its content from `sm`. */
function FactSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-1 p-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <h2 id={id} className="text-sm font-semibold text-fg-secondary">
        {title}
      </h2>
      <div className="min-w-0 text-base text-fg">{children}</div>
    </section>
  );
}

/** Label and value pairs, as a description list. */
function Facts({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-fg-secondary">{row.label}</dt>
          <dd className="font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The booking's facts in one card: Stay, Unit, Guests, Cost (when known, in the booking's
 * currency) and the Reference with its copy button; then the Notes.
 */
export function BookingFacts({ booking, manifest, units }: BookingFactsProps) {
  const { stay } = booking;
  const nights = tripNightsLabel(stay);
  const unit = unitLabel(booking, manifest, units);
  const params = stayParamRows(booking.stayParams, manifest);
  const notesId = useId();

  return (
    <>
      <Card padding="none" className="divide-y divide-border">
        <FactSection title="Stay">
          <Facts
            rows={[
              { label: 'Check-in', value: fullDayLabel(stay.arrival) },
              { label: 'Check-out', value: fullDayLabel(stay.departure) },
              ...(nights ? [{ label: 'Length', value: nights }] : []),
            ]}
          />
        </FactSection>
        {(unit || params.length > 0) && (
          <FactSection title="Unit">
            {unit && <p className="font-medium">{unit}</p>}
            {params.length > 0 && <Facts rows={params} />}
          </FactSection>
        )}
        <FactSection title="Guests">{partyLabel(stay)}</FactSection>
        {booking.totalCost !== undefined && booking.totalCost !== null && (
          <FactSection title="Cost">
            <span className="font-medium">{formatCost(booking.totalCost, booking.currency)}</span>
          </FactSection>
        )}
        <FactSection title="Reference">
          <CopyReference reference={booking.bookingReference} />
        </FactSection>
      </Card>
      {booking.notes && (
        <section aria-labelledby={notesId} className="flex flex-col gap-2">
          <h2 id={notesId} className="text-xl font-semibold text-fg">
            Notes
          </h2>
          <p className="max-w-2xl whitespace-pre-line text-base text-fg-secondary">
            {booking.notes}
          </p>
        </section>
      )}
    </>
  );
}

export default BookingFacts;
