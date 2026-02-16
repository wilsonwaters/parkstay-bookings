import { watchSchema } from './watch.schema';

describe('Watch Schema Validation', () => {
  describe('watchSchema', () => {
    it('validates a valid watch input', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

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
        autoBook: false,
        notifyOnly: true,
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
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

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
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

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
        autoBook: true,
        notifyOnly: false,
      };

      const result = watchSchema.safeParse(validInput);
      if (!result.success) {
        console.error('Validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
    });
  });
});
