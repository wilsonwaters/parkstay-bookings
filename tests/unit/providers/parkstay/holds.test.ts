/**
 * ParkStay holds (`create_booking`): the form ParkStay's page sends (YYYY/MM/DD dates, the
 * stay fields), the answers mapped to `HoldResult`s, and the payment hand-off.
 */

import { CampgroundFacts } from '@main/providers/parkstay/catalog';
import { createBookingForm } from '@main/providers/parkstay/holds';
import { AccessGateError, ProviderHttpError } from '@main/providers/sdk';
import {
  parkStayFixture,
  startParkStayFixtureServer,
  type ParkStayFixtureServer,
} from '@tests/utils/parkstay-fixture-server';
import {
  BUNGARRA_STAY,
  createTestParkStay,
  type TestParkStay,
} from '@tests/utils/parkstay-provider';

const SNIPE_STAY = {
  ...BUNGARRA_STAY,
  adults: 2,
  children: 1,
  params: { gearType: 'tent', numVehicles: 2, postcode: '6000' },
};

describe('ParkStay holds', () => {
  let server: ParkStayFixtureServer;
  let parkstay: TestParkStay;

  beforeAll(async () => {
    server = await startParkStayFixtureServer();
  });

  beforeEach(() => {
    server.createBooking = { status: 200, body: parkStayFixture('create-booking-success.json') };
    server.views.clear();
    parkstay = createTestParkStay(server);
  });

  afterAll(async () => {
    await server.close();
  });

  const lastPost = () => new URLSearchParams(server.requestsTo('/api/create_booking').at(-1)!.body);

  it('posts arrival=2026/11/10 with campsite=3, the party and the stay fields, form-encoded', async () => {
    await parkstay.provider.holds.create({ externalId: '20', unitId: '3', stay: SNIPE_STAY });
    const post = server.requestsTo('/api/create_booking').at(-1)!;
    expect(post.method).toBe('POST');
    expect(post.headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    expect(post.headers.origin).toBe('https://parkstay.dbca.wa.gov.au');
    expect(Object.fromEntries(lastPost())).toEqual({
      arrival: '2026/11/10',
      departure: '2026/11/12',
      num_adult: '2',
      num_concession: '0',
      num_child: '1',
      num_infant: '0',
      num_vehicle: '2',
      num_campervan: '0',
      num_caravan: '0',
      num_motorcycle: '0',
      num_trailer: '0',
      campground: '20',
      change_booking_id: '',
      postcode: '6000',
      campsite: '3',
    });
  });

  it('maps success to an ok hold for 30 minutes on the unit', async () => {
    const hold = await parkstay.provider.holds.create({
      externalId: '20',
      unitId: '3',
      stay: SNIPE_STAY,
    });
    expect(hold).toEqual({
      ok: true,
      reference: '1234567',
      expiresAt: new Date('2026-10-02T02:30:00.000Z'),
      unitId: '3',
    });
  });

  it('maps an in-progress booking in the session to in-progress', async () => {
    server.createBooking = { status: 400, body: parkStayFixture('create-booking-inprogress.json') };
    expect(
      await parkstay.provider.holds.create({ externalId: '20', unitId: '3', stay: SNIPE_STAY })
    ).toEqual({ ok: false, reason: 'in-progress', message: 'You have an in-progress booking.' });
  });

  it('maps a 400 refusal (the site went) to taken, with ParkStay’s words', async () => {
    server.createBooking = { status: 400, body: parkStayFixture('create-booking-error.json') };
    const hold = await parkstay.provider.holds.create({
      externalId: '20',
      unitId: '3',
      stay: SNIPE_STAY,
    });
    expect(hold).toMatchObject({ ok: false, reason: 'taken' });
    expect(hold.ok ? '' : hold.message).toContain("Someone hit 'Book now' before you");
    expect(hold.ok ? '' : hold.message).not.toContain('<BR>');
  });

  it('maps "closed for bookings" to closed', async () => {
    server.createBooking = {
      status: 400,
      body: { status: 'error', msg: 'The system is currently closed for bookings.' },
    };
    expect(
      await parkstay.provider.holds.create({ externalId: '20', unitId: '3', stay: SNIPE_STAY })
    ).toMatchObject({ ok: false, reason: 'closed' });
  });

  it('rejects HTTP 500 with ProviderHttpError (an error, not a refusal)', async () => {
    server.createBooking = { status: 500, body: {} };
    await expect(
      parkstay.provider.holds.create({ externalId: '20', unitId: '3', stay: SNIPE_STAY })
    ).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it('rejects the DBCA queue page with AccessGateError', async () => {
    server.queueGate = 'html';
    await expect(
      parkstay.provider.holds.create({ externalId: '20', unitId: '3', stay: SNIPE_STAY })
    ).rejects.toBeInstanceOf(AccessGateError);
    server.queueGate = 'off';
  });

  it('without a unit, holds the first site free for the whole stay', async () => {
    const hold = await parkstay.provider.holds.create({ externalId: '20', stay: BUNGARRA_STAY });
    expect(hold).toMatchObject({ ok: true, unitId: '3' });
    expect(lastPost().get('campsite')).toBe('3');
  });

  it('without a unit, and with none free, is taken without posting', async () => {
    const view = parkStayFixture('campsite_availablity_view_20.json');
    server.views.set('20', { ...view, sites: view.sites.slice(0, 2) });
    const before = server.requestsTo('/api/create_booking').length;
    expect(
      await parkstay.provider.holds.create({ externalId: '20', stay: BUNGARRA_STAY })
    ).toMatchObject({
      ok: false,
      reason: 'taken',
    });
    expect(server.requestsTo('/api/create_booking')).toHaveLength(before);
  });

  it('pays on ParkStay’s booking page, in the same session', () => {
    expect(
      parkstay.provider.holds.paymentUrl({ ok: true, reference: '1', expiresAt: new Date() })
    ).toBe('https://parkstay.dbca.wa.gov.au/booking/');
    expect(parkstay.provider.holds.paymentOrigins).toEqual(['https://parkstay.dbca.wa.gov.au']);
  });
});

describe('createBookingForm', () => {
  const stay = { arrival: '2026-11-10', departure: '2026-11-12', adults: 1 };

  it('defaults to one vehicle and no postcode', () => {
    const form = createBookingForm({ externalId: '20', unitId: '3', stay });
    expect(form).toMatchObject({ num_vehicle: '1', campsite: '3' });
    expect(form).not.toHaveProperty('postcode');
  });

  it('books a class (campground + campsite_class) when asked for one', () => {
    expect(createBookingForm({ externalId: '41', unitGroupId: '7', stay })).toMatchObject({
      campground: '41',
      campsite_class: '7',
    });
  });

  it('books by class at a campground the view listed by class, falling back from the unit', () => {
    const facts = new CampgroundFacts();
    const view = parkStayFixture('campsite_availablity_view_20.json');
    facts.rememberView(
      '41',
      { ...view, id: 41, site_type: 1, sites: [{ ...view.sites[0], id: 900, type: 7 }] },
      new Date()
    );
    const form = createBookingForm({ externalId: '41', unitId: '900', stay }, facts);
    expect(form).toMatchObject({ campground: '41', campsite_class: '7' });
    expect(form).not.toHaveProperty('campsite');
  });
});
