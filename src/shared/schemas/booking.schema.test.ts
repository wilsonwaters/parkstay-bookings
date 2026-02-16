import { bookingSchema } from './booking.schema';

describe('Booking Schema Validation', () => {
  describe('bookingSchema', () => {
    it('validates a valid booking input', () => {
      const validInput = {
        bookingReference: 'BK12345',
        parkName: 'Test Park',
        campgroundName: 'Test Campground',
        arrivalDate: new Date('2024-06-01'),
        departureDate: new Date('2024-06-03'),
        numGuests: 4,
      };

      const result = bookingSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('requires mandatory fields', () => {
      const invalidInput = {
        parkName: 'Test Park',
        // missing bookingReference, campgroundName, dates, numGuests
      };

      const result = bookingSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('validates number of guests is positive', () => {
      const invalidInput = {
        bookingReference: 'BK12345',
        parkName: 'Test Park',
        campgroundName: 'Test Campground',
        arrivalDate: new Date('2024-06-01'),
        departureDate: new Date('2024-06-03'),
        numGuests: 0,
      };

      const result = bookingSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('accepts optional fields', () => {
      const validInput = {
        bookingReference: 'BK12345',
        parkName: 'Test Park',
        campgroundName: 'Test Campground',
        siteNumber: '42',
        siteType: 'Powered',
        arrivalDate: new Date('2024-06-01'),
        departureDate: new Date('2024-06-03'),
        numGuests: 2,
        totalCost: 150.5,
        notes: 'Early check-in requested',
      };

      const result = bookingSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });
});
