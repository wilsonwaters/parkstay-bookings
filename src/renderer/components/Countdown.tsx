import { useNow } from '../hooks/useNow';
import { formatCountdown, type CountdownFormat } from './countdown';
import { cx } from './ui/cx';

export interface CountdownProps {
  /** The instant counted down to: an ISO timestamp or a Date. */
  to: string | Date;
  /** `clock` (default): "4h 05m", "23:10"; `minutes`: "12 min". */
  format?: CountdownFormat;
  className?: string;
}

/**
 * The time left until `to`, as a `role="timer"` (not a live region: changes are announced, if
 * at all, by whoever owns the countdown). Every countdown on screen re-renders from one shared
 * one-second ticker (`useNow`), and only this leaf re-renders on each tick. Never negative.
 */
export function Countdown({ to, format = 'clock', className }: CountdownProps) {
  const now = useNow(1000);
  const target = typeof to === 'string' ? Date.parse(to) : to.getTime();
  return (
    <span role="timer" className={cx('tabular-nums', className)}>
      {formatCountdown(target - now.getTime(), format)}
    </span>
  );
}

export default Countdown;
