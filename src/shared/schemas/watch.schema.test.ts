import { watchSchema } from './watch.schema';

// The schema compares arrival dates with local midnight "today", so the clock is pinned.
// Mid-day UTC keeps the local calendar day the same from UTC-11 to UTC+11, and every date
// below is built from the same pinned instant, so UTC+14 passes too.
const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * DAY_MS);
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Watch Schema Validation', () => {
  describe('watchSchema', () => {
    it('validates a valid watch input', () => {
      const tomorrow = daysFromNow(1);
      const nextWeek = daysFromNow(7);

      const validInput = {
        name: 'Summer Camping Watch',
        parkId: 'park123',
        parkName: 'Test Park',
        campgroundId: 'camp123',
        campgroundName: 'Test Campground',
        arrivalDate: tomorrow,
        departureDate: nextWeek,
        numGuests: 4,
        checkIntervalMinutes: 60,
        autoHold: false,
        notifyOnly: true,
        allowPartialMatch: false,
      };

      const result = watchSchema.safeParse(validInput);
      if (!result.success) {
        console.error('Validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
    });

    it('requires mandatory fields', () => {
      const invalidInput = {
        name: 'Test Watch',
        // missing other required fields
      };

      const result = watchSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('validates check interval is positive', () => {
      const tomorrow = daysFromNow(1);
      const nextWeek = daysFromNow(7);

      const invalidInput = {
        name: 'Test Watch',
        parkId: 'park123',
        parkName: 'Test Park',
        campgroundId: 'camp123',
        campgroundName: 'Test Campground',
        arrivalDate: tomorrow,
        departureDate: nextWeek,
        numGuests: 2,
        checkIntervalMinutes: -10,
      };

      const result = watchSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('accepts optional site type and auto-book', () => {
      const tomorrow = daysFromNow(1);
      const nextWeek = daysFromNow(7);

      const validInput = {
        name: 'Test Watch',
        parkId: 'park123',
        parkName: 'Test Park',
        campgroundId: 'camp123',
        campgroundName: 'Test Campground',
        arrivalDate: tomorrow,
        departureDate: nextWeek,
        numGuests: 2,
        siteType: 'tent',
        checkIntervalMinutes: 60,
        autoHold: true,
        notifyOnly: false,
        allowPartialMatch: false,
      };

      const result = watchSchema.safeParse(validInput);
      if (!result.success) {
        console.error('Validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
    });
  });
});
