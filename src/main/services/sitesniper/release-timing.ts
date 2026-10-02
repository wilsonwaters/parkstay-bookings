/**
 * Release timing helpers for Site Sniper (PURE functions).
 *
 * All timing is computed in UTC milliseconds to avoid host-timezone bugs.
 *
 * AWST (Australian Western Standard Time) = UTC+8, and Western Australia does
 * NOT observe daylight saving, so the offset is a constant +8 hours year round.
 * Therefore 00:00 AWST on calendar day D is the UTC instant `D 00:00 UTC - 8h`,
 * and 10:00 AWST is `D 10:00 UTC - 8h` (i.e. `D 02:00 UTC`).
 */

const AWST_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8
const DAY_MS = 24 * 60 * 60 * 1000;
const BOOKING_WINDOW_DAYS_DEFAULT = 180;

/**
 * Compute the UTC instant at which a given arrival date first becomes bookable
 * under the daily-rollover regime.
 *
 * A new arrival date (today + bookingWindowDays) opens at 00:00 AWST every day,
 * so `arrivalDate` opens at 00:00 AWST on `arrivalDate - bookingWindowDays`.
 *
 * If that instant is already in the past relative to `now`, the past instant is
 * returned unchanged (the caller treats it as "open now").
 *
 * @param arrivalDate - the intended arrival calendar date (interpreted by its UTC Y/M/D)
 * @param now - current time (for reference; the result may be in the past)
 * @param bookingWindowDays - size of the rolling booking window (default 180)
 */
export function computeDailyRolloverReleaseAt(
  arrivalDate: Date,
  now: Date,
  bookingWindowDays: number = BOOKING_WINDOW_DAYS_DEFAULT
): Date {
  // 00:00 UTC on the arrival calendar day.
  const arrivalUtcMidnight = Date.UTC(
    arrivalDate.getUTCFullYear(),
    arrivalDate.getUTCMonth(),
    arrivalDate.getUTCDate()
  );

  // 00:00 UTC on the release calendar day (arrival - window days).
  const releaseUtcMidnight = arrivalUtcMidnight - bookingWindowDays * DAY_MS;

  // 00:00 AWST on the release day = 00:00 UTC on that day minus 8 hours.
  const releaseAtMs = releaseUtcMidnight - AWST_OFFSET_MS;

  // now is accepted for API symmetry / potential future clamping; the instant is
  // returned even when already past so the caller can treat it as "open now".
  void now;

  return new Date(releaseAtMs);
}

/**
 * Compute the next "first Tuesday of the month at 10:00 AWST" strictly after
 * `from`. Used to prefill the Ningaloo scheduled-release default.
 *
 * @param from - reference instant; the returned instant is > from
 */
export function nextFirstTuesday1000Awst(from: Date): Date {
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();

  // Try the current month first, then advance until we find one after `from`.
  for (let i = 0; i < 24; i++) {
    const candidate = firstTuesday1000AwstFor(year, month);
    if (candidate.getTime() > from.getTime()) {
      return candidate;
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  // Fallback (should never hit): one month out from `from`.
  return firstTuesday1000AwstFor(from.getUTCFullYear(), from.getUTCMonth() + 1);
}

/**
 * The UTC instant of 10:00 AWST on the first Tuesday of the given year/month.
 */
function firstTuesday1000AwstFor(year: number, month: number): Date {
  // Day-of-week of the 1st (0=Sun ... 6=Sat) in the AWST calendar. Since we only
  // need the calendar weekday, UTC components are sufficient.
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  // Tuesday = 2. Offset to the first Tuesday.
  const firstTuesdayDate = 1 + ((2 - firstDow + 7) % 7);
  // 10:00 AWST = 02:00 UTC on the same calendar day.
  return new Date(Date.UTC(year, month, firstTuesdayDate, 2, 0, 0, 0));
}

/**
 * Whether `now` is inside the snipe window [releaseAt, releaseAt + windowMs).
 */
export function isWithinSnipeWindow(releaseAt: Date, windowMs: number, now: Date): boolean {
  const start = releaseAt.getTime();
  const end = start + windowMs;
  const t = now.getTime();
  return t >= start && t < end;
}

/**
 * Milliseconds from `now` until `target` (negative if target is in the past).
 */
export function msUntil(target: Date, now: Date): number {
  return target.getTime() - now.getTime();
}
