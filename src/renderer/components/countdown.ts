/**
 * How a countdown reads (D1 voice, tabular numbers). Pure, so the formats are tested without a
 * clock. A countdown never shows a negative value.
 */

const MINUTE_MS = 60_000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

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
    const minutes = Math.ceil(left / MINUTE_MS);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)} min`;
  }
  if (left <= 0) return 'now';
  // Whole seconds left, rounded up, decide the format: 59:59.5 is "1h 00m", never "60:00".
  const seconds = Math.ceil(left / 1000);
  if (seconds >= DAY_S) {
    return `${Math.floor(seconds / DAY_S)}d ${Math.floor((seconds % DAY_S) / HOUR_S)}h`;
  }
  if (seconds >= HOUR_S) {
    return `${Math.floor(seconds / HOUR_S)}h ${pad(Math.floor((seconds % HOUR_S) / MINUTE_S))}m`;
  }
  return `${pad(Math.floor(seconds / MINUTE_S))}:${pad(seconds % MINUTE_S)}`;
}
