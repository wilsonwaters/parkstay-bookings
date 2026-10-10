/**
 * The legacy booking forms' mapping to the provider-aware inputs (V2): what the forms send
 * passes the IPC contract, with calendar dates `YYYY-MM-DD`.
 */

import { contract } from '../../../shared/contracts';
import type { BookingSchemaType } from '../../../shared/schemas/booking.schema';
import { bookingFormToInput, partySize, stayDate, toCalendarDate } from './legacy-mapping';

/** What `<input type="date">` with `valueAsDate` holds for a picked day: its UTC midnight. */
const picked = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

describe('legacy form mapping', () => {
  it('maps the manual booking form, with the site number as the unit', () => {
    const form: BookingSchemaType = {
      bookingReference: 'PS0012345',
      parkName: 'Cape Range National Park',
      campgroundName: 'Osprey Bay',
      siteNumber: '12',
      siteType: '',
      arrivalDate: picked('2026-01-10'),
      departureDate: picked('2026-01-13'),
      numGuests: 2,
      totalCost: 85.5,
      notes: 'Ocean side',
    };

    const input = bookingFormToInput(form);

    expect(input).toEqual({
      providerId: 'parkstay',
      bookingReference: 'PS0012345',
      location: { name: 'Osprey Bay', areaName: 'Cape Range National Park' },
      stay: { arrival: '2026-01-10', departure: '2026-01-13', adults: 2 },
      unitIds: ['12'],
      stayParams: {},
      totalCost: 85.5,
      notes: 'Ocean side',
    });
    expect(contract.bookings.create.request.parse(input)).toEqual(input);
    expect(bookingFormToInput({ ...form, siteNumber: '' }).unitIds).toEqual([]);
  });

  it('converts picked dates to calendar dates', () => {
    expect(toCalendarDate(picked('2028-02-29'))).toBe('2028-02-29');
    expect(
      partySize({ arrival: '', departure: '', adults: 2, children: 1, infants: 1, concessions: 1 })
    ).toBe(5);
  });

  describe.each(['UTC', 'Australia/Perth', 'America/Los_Angeles'])('on a host in %s', (zone) => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = zone;
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    it('shows a stay date as the day it names', () => {
      const date = stayDate('2026-12-13');
      expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
        2026, 11, 13, 0,
      ]);
      expect(Number.isNaN(stayDate('garbage').getTime())).toBe(true);
    });
  });
});
