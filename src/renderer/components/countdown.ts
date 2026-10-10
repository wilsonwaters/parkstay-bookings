/**
 * How a countdown reads (D1 voice, tabular numbers). Pure, so the formats are tested without a
 * clock. A countdown never shows a negative value.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type CountdownFormat = 'clock' | 'minutes';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The time left until an instant, `ms` from now:
 * - `clock`: "2d 4h", "4h 05m", "23:10", and "now" once it has passed;
 * - `minutes`: "12 min" (rounded up, so the last minute reads "1 min"), "1 h 05 min", and
 *   "0 min" once it has passed.
 */
export function formatCountdown(ms: number, format: CountdownFormat = 'clock'): string {
  const left = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (format === 'minutes') {
    const minutes = Math.ceil(left / MINUTE);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)} min`;
  }
  if (left <= 0) return 'now';
  const seconds = Math.ceil(left / SECOND);
  if (left >= DAY) {
    return `${Math.floor(left / DAY)}d ${Math.floor((left % DAY) / HOUR)}h`;
  }
  if (left >= HOUR) {
    return `${Math.floor(left / HOUR)}h ${pad(Math.floor((left % HOUR) / MINUTE))}m`;
  }
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}
