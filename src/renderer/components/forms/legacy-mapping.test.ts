/**
 * The legacy forms' mapping to the provider-aware inputs (V2): what the forms send passes the
 * IPC contract, with calendar dates `YYYY-MM-DD`, and an existing watch or snipe fills the
 * forms as before.
 */

import { contract } from '../../../shared/contracts';
import { SnipeReleaseMode } from '../../../shared/types';
import type { SiteSnipe, Watch } from '../../../shared/types';
import type { BookingSchemaType } from '../../../shared/schemas/booking.schema';
import type { SiteSnipeSchemaType } from '../../../shared/schemas/site-sniper.schema';
import type { WatchSchemaType } from '../../../shared/schemas/watch.schema';
import {
  bookingFormToInput,
  formDate,
  partySize,
  snipeFormToInput,
  snipeToFormValues,
  stayDate,
  toCalendarDate,
  watchFormToInput,
  watchFormToUpdate,
  watchToFormValues,
} from './legacy-mapping';

/** What `<input type="date">` with `valueAsDate` holds for a picked day: its UTC midnight. */
const picked = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

const watchForm: WatchSchemaType = {
  name: 'Easter',
  parkId: '34',
  parkName: 'Osprey Bay',
  campgroundId: '34',
  campgroundName: 'Osprey Bay',
  arrivalDate: picked('2099-04-03'),
  departureDate: picked('2099-04-06'),
  numGuests: 3,
  siteType: 'tent,caravan',
  checkIntervalMinutes: 60,
  autoBook: false,
  notifyOnly: true,
  allowPartialMatch: true,
  notes: '',
};

const snipeForm: SiteSnipeSchemaType = {
  name: 'July',
  campgroundId: '34',
  campgroundName: 'Osprey Bay',
  targetSiteIds: ['136'],
  siteType: 'campervan',
  arrivalDate: picked('2099-07-19'),
  departureDate: picked('2099-07-21'),
  numAdult: 2,
  numConcession: 1,
  numChild: 1,
  numInfant: 0,
  numVehicle: 2,
  postcode: '6530',
  releaseMode: SnipeReleaseMode.DAILY_ROLLOVER,
  queueEnabled: true,
  leadTimeSeconds: 120,
  pollIntervalMs: 1500,
  windowDurationMs: 900000,
  maxAttempts: 0,
};

describe('legacy form mapping', () => {
  it('maps the watch form to a ParkStay watch the contract accepts', () => {
    const input = watchFormToInput(watchForm);

    expect(input).toEqual({
      providerId: 'parkstay',
      name: 'Easter',
      location: { externalId: '34', name: 'Osprey Bay', areaName: 'Osprey Bay' },
      stay: { arrival: '2099-04-03', departure: '2099-04-06', adults: 3 },
      stayParams: { parkId: '34', gearType: 'tent,caravan' },
      checkIntervalMinutes: 60,
      autoBook: false,
      notifyOnly: true,
      allowPartialMatch: true,
      notes: '',
    });
    expect(contract.watches.create.request.parse(input)).toEqual(input);
  });

  it('leaves an empty site type out of the stay params, and the provider out of updates', () => {
    const update = watchFormToUpdate({ ...watchForm, siteType: '' });

    expect(update).not.toHaveProperty('providerId');
    expect(update.stayParams).toEqual({ parkId: '34' });
    expect(contract.watches.update.request.parse({ id: 1, updates: update }).updates).toEqual(
      update
    );
  });

  it('fills the watch form from a watch as the form held it before', () => {
    const watch: Partial<Watch> = {
      name: 'Easter',
      location: { externalId: '34', name: 'Osprey Bay', areaName: 'Cape Range' },
      stay: {
        arrival: '2099-04-03',
        departure: '2099-04-06',
        adults: 2,
        children: 1,
        infants: 0,
        concessions: 0,
      },
      stayParams: { parkId: '17', gearType: 'tent' },
    };

    expect(watchToFormValues(watch)).toEqual({
      name: 'Easter',
      parkId: '17',
      parkName: 'Cape Range',
      campgroundId: '34',
      campgroundName: 'Osprey Bay',
      arrivalDate: picked('2099-04-03'),
      departureDate: picked('2099-04-06'),
      numGuests: 3,
    });
    expect(watchToFormValues(undefined)).toMatchObject({ campgroundId: '', numGuests: 2 });
  });

  it('maps the snipe form, with the queue as the access gate and the ParkStay stay fields', () => {
    const input = snipeFormToInput(snipeForm);

    expect(input).toEqual({
      providerId: 'parkstay',
      name: 'July',
      location: { externalId: '34', name: 'Osprey Bay' },
      stay: {
        arrival: '2099-07-19',
        departure: '2099-07-21',
        adults: 2,
        children: 1,
        infants: 0,
        concessions: 1,
      },
      unitIds: ['136'],
      stayParams: { gearType: 'campervan', numVehicles: 2, postcode: '6530' },
      releaseMode: SnipeReleaseMode.DAILY_ROLLOVER,
      accessGateEnabled: true,
      leadTimeSeconds: 120,
      pollIntervalMs: 1500,
      windowDurationMs: 900000,
      maxAttempts: 0,
    });
    expect(contract.snipes.create.request.parse(input)).toEqual(input);
    expect(
      snipeFormToInput({ ...snipeForm, postcode: undefined, campgroundName: undefined })
    ).toMatchObject({
      location: { externalId: '34', name: '' },
      stayParams: { gearType: 'campervan', numVehicles: 2 },
    });
  });

  it('fills the snipe form from a snipe', () => {
    const snipe: Partial<SiteSnipe> = {
      location: { externalId: '34', name: 'Osprey Bay' },
      stay: {
        arrival: '2099-07-19',
        departure: '2099-07-21',
        adults: 2,
        children: 0,
        infants: 1,
        concessions: 0,
      },
      unitIds: ['136', '137'],
      stayParams: { gearType: 'tent', numVehicles: 2, postcode: '6000' },
      accessGateEnabled: true,
    };

    expect(snipeToFormValues(snipe)).toEqual({
      campgroundId: '34',
      campgroundName: 'Osprey Bay',
      targetSiteIds: ['136', '137'],
      siteType: 'tent',
      arrivalDate: picked('2099-07-19'),
      departureDate: picked('2099-07-21'),
      numAdult: 2,
      numConcession: 0,
      numChild: 0,
      numInfant: 1,
      numVehicle: 2,
      postcode: '6000',
      queueEnabled: true,
    });
    expect(snipeToFormValues(undefined)).toMatchObject({ siteType: 'all', numVehicle: 1 });
  });

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

  it('converts between picked dates and calendar dates both ways', () => {
    expect(toCalendarDate(picked('2028-02-29'))).toBe('2028-02-29');
    expect(formDate('2028-02-29')).toEqual(picked('2028-02-29'));
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
