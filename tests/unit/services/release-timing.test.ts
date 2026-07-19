/**
 * release-timing unit tests (pure functions).
 *
 * AWST = UTC+8 (no DST). 00:00 AWST on day D = (D 00:00 UTC - 8h).
 * 10:00 AWST on day D = D 02:00 UTC.
 */

import {
  computeDailyRolloverReleaseAt,
  nextFirstTuesday1000Awst,
  isWithinSnipeWindow,
  msUntil,
} from '@main/services/sitesniper/release-timing';

describe('release-timing', () => {
  describe('computeDailyRolloverReleaseAt', () => {
    it('opens 180 days before arrival at 00:00 AWST (16:00 UTC previous day)', () => {
      const arrival = new Date('2026-07-19T00:00:00Z');
      const now = new Date('2026-01-01T00:00:00Z');

      const releaseAt = computeDailyRolloverReleaseAt(arrival, now);

      // 2026-07-19 minus 180 days = 2026-01-20; 00:00 AWST = 2026-01-19T16:00:00Z
      expect(releaseAt.toISOString()).toBe('2026-01-19T16:00:00.000Z');
    });

    it('respects a custom booking window', () => {
      const arrival = new Date('2026-07-19T00:00:00Z');
      const now = new Date('2026-01-01T00:00:00Z');

      // window of 1 day → release day is 2026-07-18, 00:00 AWST = 2026-07-17T16:00:00Z
      const releaseAt = computeDailyRolloverReleaseAt(arrival, now, 1);
      expect(releaseAt.toISOString()).toBe('2026-07-17T16:00:00.000Z');
    });

    it('returns the (past) instant unchanged when release is already past', () => {
      const arrival = new Date('2026-07-19T00:00:00Z');
      const now = new Date('2026-06-01T00:00:00Z'); // well after the release instant

      const releaseAt = computeDailyRolloverReleaseAt(arrival, now);
      expect(releaseAt.toISOString()).toBe('2026-01-19T16:00:00.000Z');
      expect(releaseAt.getTime()).toBeLessThan(now.getTime());
    });

    it('is independent of the time-of-day component of the arrival date', () => {
      const a1 = new Date('2026-07-19T00:00:00Z');
      const a2 = new Date('2026-07-19T23:59:59Z');
      const now = new Date('2026-01-01T00:00:00Z');

      expect(computeDailyRolloverReleaseAt(a1, now).toISOString()).toBe(
        computeDailyRolloverReleaseAt(a2, now).toISOString()
      );
    });
  });

  describe('nextFirstTuesday1000Awst', () => {
    it('returns the next first-Tuesday 10:00 AWST (02:00 UTC) after `from`', () => {
      // July 2026 first Tuesday is Jul 7; by Jul 15 the next is Aug 4.
      const from = new Date('2026-07-15T00:00:00Z');
      const result = nextFirstTuesday1000Awst(from);
      expect(result.toISOString()).toBe('2026-08-04T02:00:00.000Z');
    });

    it('is strictly after `from` even when `from` equals a first-Tuesday release', () => {
      const from = new Date('2026-08-04T02:00:00Z'); // exactly Aug's release
      const result = nextFirstTuesday1000Awst(from);
      // Next is September; Sep 1 2026 is itself a Tuesday.
      expect(result.toISOString()).toBe('2026-09-01T02:00:00.000Z');
    });

    it('always lands on a Tuesday within the first 7 days at 02:00 UTC', () => {
      const result = nextFirstTuesday1000Awst(new Date('2026-02-10T00:00:00Z'));
      expect(result.getUTCDay()).toBe(2); // Tuesday
      expect(result.getUTCDate()).toBeLessThanOrEqual(7);
      expect(result.getUTCHours()).toBe(2);
    });
  });

  describe('isWithinSnipeWindow', () => {
    const releaseAt = new Date('2026-01-19T16:00:00Z');
    const windowMs = 15 * 60 * 1000; // 15 min

    it('is true at the release instant', () => {
      expect(isWithinSnipeWindow(releaseAt, windowMs, new Date('2026-01-19T16:00:00Z'))).toBe(true);
    });

    it('is true inside the window', () => {
      expect(isWithinSnipeWindow(releaseAt, windowMs, new Date('2026-01-19T16:10:00Z'))).toBe(true);
    });

    it('is false before release', () => {
      expect(isWithinSnipeWindow(releaseAt, windowMs, new Date('2026-01-19T15:59:59Z'))).toBe(
        false
      );
    });

    it('is false at/after the window end (exclusive)', () => {
      expect(isWithinSnipeWindow(releaseAt, windowMs, new Date('2026-01-19T16:15:00Z'))).toBe(
        false
      );
    });
  });

  describe('msUntil', () => {
    it('returns positive ms for a future target', () => {
      const now = new Date('2026-01-19T16:00:00Z');
      const target = new Date('2026-01-19T16:00:10Z');
      expect(msUntil(target, now)).toBe(10000);
    });

    it('returns negative ms for a past target', () => {
      const now = new Date('2026-01-19T16:00:10Z');
      const target = new Date('2026-01-19T16:00:00Z');
      expect(msUntil(target, now)).toBe(-10000);
    });
  });
});
