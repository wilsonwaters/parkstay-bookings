import { Link } from 'react-router-dom';
import type { ProviderManifest } from '../../../../shared/types/provider.types';
import type { Watch } from '../../../../shared/types/watch.types';
import { ROUTES } from '../../../app/routes';
import { timeInZone } from '../../../components/timeFormat';
import { Button, Notice } from '../../../components/ui';
import type { WatchActions } from '../shared/useWatchActions';
import { unitNameOf, unitNounFor, type WatchState } from '../shared/watchState';

export interface HoldNoticeProps {
  watch: Watch;
  state: WatchState;
  manifest: ProviderManifest | undefined;
  actions: WatchActions;
}

/**
 * The watch's automatic hold: pay before it runs out (the page's one coral button), that it
 * ran out, or that it was booked.
 */
export function HoldNotice({ watch, state, manifest, actions }: HoldNoticeProps) {
  const provider = manifest?.shortName ?? 'the provider';
  const unit = unitNameOf(watch, watch.hold?.unitId, unitNounFor(manifest));
  const at = watch.hold
    ? timeInZone(new Date(watch.hold.expiresAt), manifest?.timezone ?? 'Australia/Perth')
    : undefined;
  if (state === 'held') {
    return (
      <Notice
        tone="warning"
        title={`${unit} is held until ${at}`}
        actions={
          <Button variant="primary" onClick={actions.payNow} loading={actions.paying}>
            Pay now
          </Button>
        }
      >
        Pay on {provider} before then to keep it. The payment page opens in its own window.
      </Notice>
    );
  }
  if (state === 'hold-expired') {
    return (
      <Notice tone="info" title={at ? `The hold expired at ${at}` : 'The hold has expired'}>
        {unit} was released. Create a new watch to look again.
      </Notice>
    );
  }
  if (state === 'booked') {
    return (
      <Notice tone="success" title={`Booked on ${provider}`}>
        <Link to={ROUTES.bookings()} className="font-semibold underline">
          See it in Bookings
        </Link>
      </Notice>
    );
  }
  return null;
}

export default HoldNotice;
