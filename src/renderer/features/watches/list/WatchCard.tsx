import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProviderManifest } from '../../../../shared/types/provider.types';
import type { Watch } from '../../../../shared/types/watch.types';
import { ROUTES } from '../../../app/routes';
import { partyLabel, stayNightsLabel, stayDatesLabel } from '../../../components/stay/stayFormat';
import { relativeTime, timeInZone } from '../../../components/timeFormat';
import { Card, ProviderBadge, StatusPill } from '../../../components/ui';
import { DeleteWatchDialog } from '../shared/DeleteWatchDialog';
import { resultSummary } from '../shared/resultSummary';
import { useWatchActions } from '../shared/useWatchActions';
import { WatchActionsBar } from '../shared/WatchActionsBar';
import { statusPillFor, unitNameOf, unitNounFor, type WatchState } from '../shared/watchState';

export interface WatchCardProps {
  watch: Watch;
  state: WatchState;
  manifest: ProviderManifest | undefined;
  now: Date;
  today: string;
}

/** The hold, expired hold or booking line under a card, in the provider's time zone. */
export function HoldLine({
  watch,
  state,
  manifest,
}: Pick<WatchCardProps, 'watch' | 'state' | 'manifest'>) {
  const zone = manifest?.timezone ?? 'Australia/Perth';
  const provider = manifest?.shortName ?? 'the provider';
  const unit = unitNameOf(watch, watch.hold?.unitId, unitNounFor(manifest));
  const at = watch.hold ? timeInZone(new Date(watch.hold.expiresAt), zone) : undefined;
  if (state === 'held') {
    return (
      <p className="text-sm text-warning-fg">
        {unit} is held until {at}. Pay on {provider} before then to keep it.
      </p>
    );
  }
  if (state === 'hold-expired') {
    return (
      <p className="text-sm text-fg-secondary">
        {at ? `The hold expired at ${at}.` : 'The hold has expired.'} Create a new watch to look
        again.
      </p>
    );
  }
  if (state === 'booked') {
    return (
      <p className="text-sm text-fg-secondary">
        Booked on {provider}.{' '}
        <Link to={ROUTES.bookings()} className="font-semibold text-brand-strong hover:underline">
          See it in Bookings
        </Link>
      </p>
    );
  }
  return null;
}

/** One watch in the list: whose it is, where and when, what it found, and its actions. */
export function WatchCard({ watch, state, manifest, now, today }: WatchCardProps) {
  const headingId = useId();
  const actions = useWatchActions(watch, manifest);
  const [confirming, setConfirming] = useState(false);
  const { location, stay } = watch;
  const facts = [
    watch.lastCheckedAt ? `Checked ${relativeTime(new Date(watch.lastCheckedAt), now)}` : undefined,
    watch.isActive && watch.nextCheckAt && (state === 'active' || state === 'held')
      ? `Next check ${timeInZone(new Date(watch.nextCheckAt), manifest?.timezone ?? 'Australia/Perth', now)}`
      : undefined,
    watch.foundCount > 0
      ? `Found ${watch.foundCount} ${watch.foundCount === 1 ? 'time' : 'times'}`
      : undefined,
  ].filter(Boolean);

  return (
    <Card as="article" aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <ProviderBadge providerId={watch.providerId} size="sm" className="w-fit" />
          <h2 id={headingId} className="min-w-0 text-lg font-semibold text-fg">
            <Link
              to={ROUTES.watchDetail(watch.id)}
              className="block truncate rounded-sm hover:underline"
            >
              {watch.name}
            </Link>
          </h2>
          <p className="truncate text-sm text-fg-secondary">
            {[location.name, location.areaName].filter(Boolean).join(' · ')}
          </p>
          <p className="text-sm text-fg-secondary">
            {stayDatesLabel(stay.arrival, stay.departure, today)} ·{' '}
            {stayNightsLabel(stay.arrival, stay.departure)} · {partyLabel(stay)}
          </p>
        </div>
        <StatusPill {...statusPillFor(state)} className="shrink-0" />
      </div>
      <HoldLine watch={watch} state={state} manifest={manifest} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-sm text-fg-secondary">
          <span className="font-semibold text-fg">
            {resultSummary(watch, unitNounFor(manifest))}
          </span>
          {facts.map((fact) => (
            <span key={fact}> · {fact}</span>
          ))}
        </p>
        <WatchActionsBar
          watch={watch}
          state={state}
          manifest={manifest}
          actions={actions}
          onDelete={() => setConfirming(true)}
        />
      </div>
      <DeleteWatchDialog
        watch={watch}
        open={confirming}
        onConfirm={actions.deleteWatch}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}

export default WatchCard;
