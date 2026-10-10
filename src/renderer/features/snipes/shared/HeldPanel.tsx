import { Timer } from 'lucide-react';
import type { ProviderManifest } from '../../../../shared/types/provider.types';
import type { SiteSnipe } from '../../../../shared/types/site-sniper.types';
import { Countdown } from '../../../components/Countdown';
import { timeInZone } from '../../../components/timeFormat';
import { Button } from '../../../components/ui';
import { cx } from '../../../components/ui/cx';
import { useHasPassed } from '../../../hooks/useNow';
import { HOLD_EXPIRED_MESSAGE, type SnipeActions } from './useSnipeActions';
import { unitLabel, unitNounFor } from './snipeState';

export interface HeldPanelProps {
  snipe: SiteSnipe;
  manifest: ProviderManifest | undefined;
  actions: Pick<SnipeActions, 'payNow' | 'paying'>;
  /** The place's own unit names, when known, for "Site 12 (powered)". */
  unitNames?: ReadonlyMap<string, string>;
  /** `page`: the page's one coral button; `card`: a quieter one in a list. */
  variant?: 'page' | 'card';
  className?: string;
}

/**
 * A held site and the time left to pay for it: "Held until 10:42 am · 23:10 left", with "Pay
 * now" opening the provider's payment window on the session that holds the site (V6). Once the
 * hold runs out the button goes and it says so. A hold without an expiry shows no timer.
 */
export function HeldPanel({
  snipe,
  manifest,
  actions,
  unitNames,
  variant = 'page',
  className,
}: HeldPanelProps) {
  const expiresAt = snipe.holdExpiresAt ? new Date(snipe.holdExpiresAt) : undefined;
  const expired = useHasPassed(expiresAt);
  const provider = manifest?.shortName ?? 'the provider';
  const unit = unitLabel(snipe.holdUnitId, unitNounFor(manifest), unitNames);
  const page = variant === 'page';
  const frame = cx(
    'flex flex-col gap-3 rounded-lg border p-4',
    expired ? 'border-border bg-surface-subtle' : 'border-warning-fg/30 bg-warning-subtle',
    className
  );

  if (expired) {
    return (
      <section aria-label="Hold" className={frame}>
        <p className="text-sm font-semibold text-fg">{HOLD_EXPIRED_MESSAGE}</p>
        <p className="text-sm text-fg-secondary">
          The hold on {unit} ran out before it was paid for.
        </p>
      </section>
    );
  }
  return (
    <section aria-label="Hold" className={frame}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-2 text-base font-semibold text-warning-fg">
            <Timer size={18} aria-hidden="true" />
            {unit} is held for you
          </p>
          {expiresAt ? (
            <p className="text-sm text-warning-fg">
              Held until {timeInZone(expiresAt, manifest?.timezone ?? 'Australia/Perth')} ·{' '}
              <Countdown
                to={expiresAt}
                label={(left) => `${left} left to pay`}
                className="font-semibold"
              />{' '}
              <span aria-hidden="true">left</span>
            </p>
          ) : null}
        </div>
        <Button
          variant={page ? 'primary' : 'secondary'}
          size={page ? 'md' : 'sm'}
          onClick={actions.payNow}
          loading={actions.paying}
        >
          Pay now
        </Button>
      </div>
      {page && (
        <p className="text-sm text-fg-secondary">
          Complete payment on {provider} before the hold runs out. The payment page opens in its own
          window, where {provider} may ask you to sign in.
        </p>
      )}
    </section>
  );
}

export default HeldPanel;
