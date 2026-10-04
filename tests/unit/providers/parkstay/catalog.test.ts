/**
 * The ParkStay catalogue: `/api/campground_map/` features as `LocationSummary`s, the type-2
 * kind heuristic, and a campground's detail from `campsite_availablity_view`.
 */

import { kindFromName, toLocationSummary } from '@main/providers/parkstay/catalog';
import type { RawCampgroundFeature } from '@main/providers/parkstay/types';
import { ProviderError } from '@main/providers/sdk';
import type { LocationSummary } from '@shared/types/catalog.types';
import { createMemoryLogger } from '@tests/utils/fake-provider';
import {
  parkStayFixture,
  startParkStayFixtureServer,
  type ParkStayFixtureServer,
} from '@tests/utils/parkstay-fixture-server';
import { createTestParkStay, type TestParkStay } from '@tests/utils/parkstay-provider';

const features = (): RawCampgroundFeature[] => parkStayFixture('campground_map.json').features;

describe('ParkStay catalogue', () => {
  let server: ParkStayFixtureServer;
  let parkstay: TestParkStay;
  let byId: Map<string, LocationSummary>;

  beforeAll(async () => {
    server = await startParkStayFixtureServer();
    parkstay = createTestParkStay(server);
    const locations = await parkstay.provider.catalog.listLocations!();
    byId = new Map(locations.map((l) => [l.externalId, l]));
  });

  afterAll(async () => {
    await server.close();
  });

  it('maps the six fixture campgrounds, in the map’s order, under parkstay keys', async () => {
    expect([...byId.keys()]).toEqual(['20', '18', '85', '5', '16', '182']);
    for (const [id, location] of byId) {
      expect(location.key).toBe(`parkstay:${id}`);
      expect(location.providerId).toBe('parkstay');
    }
    expect(server.requestsTo('/api/campground_map/')).toHaveLength(1);
    expect(server.requestsTo('/api/search_suggest')).toHaveLength(0);
  });

  it('maps Bungarra (20): online, with a booking link, images, amenities and its region', () => {
    expect(byId.get('20')).toEqual({
      key: 'parkstay:20',
      providerId: 'parkstay',
      externalId: '20',
      name: 'Bungarra',
      kind: 'campground',
      bookingMode: 'online',
      lat: -22.247,
      lng: 113.84,
      area: { name: 'Cape Range National Park', region: 'Pilbara' },
      imageUrls: [
        'https://parkstay.dbca.wa.gov.au/media/parkstay/campground_images/25f050a7-6c3.jpg',
      ],
      amenities: ['Toilet', 'Road access for 2WD/SUV'],
      unitCount: 3,
      infoUrl: 'https://exploreparks.dbca.wa.gov.au/site/bungarra',
      bookingUrl: 'https://parkstay.dbca.wa.gov.au/search-availability/campground/?site_id=20',
    });
    expect(byId.get('20')!.imageUrls[0]).toMatch(/^https:\/\/parkstay\.dbca\.wa\.gov\.au\/media\//);
    // The map's description is empty for every campground: no summary.
    expect(byId.get('20')).not.toHaveProperty('summary');
  });

  it('maps the booking modes from campground_type', () => {
    expect(byId.get('18')!.bookingMode).toBe('online');
    expect(byId.get('85')!.bookingMode).toBe('offline');
    expect(byId.get('5')!.bookingMode).toBe('external');
    expect(byId.get('16')!.bookingMode).toBe('application');
    expect(byId.get('182')!.bookingMode).toBe('external');
  });

  it('gives a booking link only to campgrounds bookable online', () => {
    expect(byId.get('18')!.bookingUrl).toBeDefined();
    for (const id of ['85', '5', '16', '182']) expect(byId.get(id)!.bookingUrl).toBeUndefined();
  });

  it('maps Woodman Point (5): an external holiday park with no booking link and no sites', () => {
    expect(byId.get('5')).toMatchObject({ kind: 'holiday-park', bookingMode: 'external' });
    expect(byId.get('5')!.bookingUrl).toBeUndefined();
    expect(byId.get('5')!.unitCount).toBeUndefined();
    expect(byId.get('5')!.imageUrls).toHaveLength(2);
  });

  it('maps Yeagarup Hut (182) as a hut with no info link', () => {
    expect(byId.get('182')).toMatchObject({ kind: 'hut', name: 'Yeagarup Hut' });
    expect(byId.get('182')!.infoUrl).toBeUndefined();
    expect(byId.get('182')).not.toHaveProperty('infoUrl');
  });

  it('keeps campgrounds of types 0, 1 and 4 as campgrounds', () => {
    expect(byId.get('16')).toMatchObject({ kind: 'campground', bookingMode: 'application' });
    expect(byId.get('85')).toMatchObject({ kind: 'campground', bookingMode: 'offline' });
  });

  it('rounds coordinates to 6 decimal places from [lng, lat]', () => {
    expect(byId.get('18')).toMatchObject({ lat: -22.177481, lng: 113.859409 });
    expect(byId.get('182')).toMatchObject({ lat: -34.571734, lng: 115.848597 });
  });

  describe('detail', () => {
    it('returns Bungarra with its sanitised description, sites and release sentence', async () => {
      const detail = await parkstay.provider.catalog.getLocation('20');
      expect(detail).toMatchObject({ ...byId.get('20'), fetchedAt: '2026-10-02T02:00:00.000Z' });
      expect(detail.descriptionHtml).toContain('This campground is in the Gascoyne Region');
      expect(detail.descriptionHtml).not.toMatch(/<style|style=|class=/);
      expect(detail.units).toHaveLength(5);
      expect(detail.units[0]).toEqual({
        unitId: '1',
        unitName: 'CAMPSITE 01',
        maxPeople: 6,
        maxVehicles: 3,
        equipment: ['tent', 'campervan', 'caravan', 'vehicle', 'motorcycle', 'trailer'],
        description: '12m x 7m reverse-in compacted gravel site.',
      });
      // `classes: { "null": null }` means no classes: no unit type.
      expect(detail.units.every((u) => u.unitType === undefined)).toBe(true);
      // Bungarra's release period runs to 2027-04-01.
      expect(detail.releaseInfo).toBe(
        'Bookable up to 31 March 2027; later dates are released in blocks — use a scheduled snipe'
      );
    });

    it('probes a one-night stay from tomorrow (Perth) for one adult, with ParkStay dates', async () => {
      const before = server.requestsTo('/api/campsite_availablity_view/20/').length;
      await parkstay.provider.catalog.getLocation('20');
      const probe = server.requestsTo('/api/campsite_availablity_view/20/')[before];
      expect(Object.fromEntries(probe.query)).toMatchObject({
        arrival: '2026/10/03',
        departure: '2026/10/04',
        num_adult: '1',
        gear_type: 'all',
      });
    });

    it('describes a release window in days and the campground’s release time when there is no release period', async () => {
      const view = parkStayFixture('campsite_availablity_view_20.json');
      server.views.set('18', { ...view, id: 18, release_date: null });
      const fresh = createTestParkStay(server);
      const detail = await fresh.provider.catalog.getLocation('18');
      expect(detail.releaseInfo).toBe('Bookings open 180 days ahead at 2:00 am AWST');
      server.views.delete('18');
    });

    it('does not ask for the availability of a campground ParkStay does not book online', async () => {
      const before = server.requests.length;
      const detail = await parkstay.provider.catalog.getLocation('5');
      expect(detail.units).toEqual([]);
      expect(detail.descriptionHtml).toBeUndefined();
      expect(detail.releaseInfo).toBeUndefined();
      expect(server.requests.slice(before).map((r) => r.path)).toEqual([]);
    });

    it('reads an offline campground’s description, with no sites and no release', async () => {
      const detail = await parkstay.provider.catalog.getLocation('85');
      expect(detail).toMatchObject({ bookingMode: 'offline', units: [] });
      expect(detail.descriptionHtml).toBe('<p>Book with the park office.</p>');
      expect(detail.releaseInfo).toBeUndefined();
    });

    it('rejects a campground that is not in the map with a ProviderError', async () => {
      await expect(parkstay.provider.catalog.getLocation('999')).rejects.toBeInstanceOf(
        ProviderError
      );
    });
  });
});

describe('toLocationSummary', () => {
  const bungarra = (): RawCampgroundFeature => features()[0];

  it('drops a campground without coordinates, with a warning', () => {
    const logger = createMemoryLogger();
    const feature = { ...bungarra(), geometry: { type: 'Point' as const, coordinates: null } };
    expect(toLocationSummary(feature, logger)).toBeUndefined();
    expect(logger.lines).toEqual([
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('coordinates') }),
    ]);
    expect(toLocationSummary({ ...bungarra(), geometry: null }, logger)).toBeUndefined();
  });

  it('maps an unknown campground_type to offline, with a warning', () => {
    const logger = createMemoryLogger();
    const feature = bungarra();
    feature.properties.campground_type = 9;
    expect(toLocationSummary(feature, logger)).toMatchObject({
      bookingMode: 'offline',
      kind: 'campground',
    });
    expect(toLocationSummary(feature, logger)!.bookingUrl).toBeUndefined();
    expect(logger.lines[0]).toMatchObject({ level: 'warn' });
  });

  it('de-duplicates images, keeps absolute https ones, and gives [] without images', () => {
    const feature = bungarra();
    feature.properties.images = [
      { image: '/media/a.jpg' },
      { image: '/media/a.jpg' },
      { image: 'https://cdn.example/b.jpg' },
      { image: 'http://insecure.example/c.jpg' },
    ];
    expect(toLocationSummary(feature)!.imageUrls).toEqual([
      'https://parkstay.dbca.wa.gov.au/media/a.jpg',
      'https://cdn.example/b.jpg',
    ]);
    feature.properties.images = [];
    expect(toLocationSummary(feature)!.imageUrls).toEqual([]);
  });

  it('gives a summary only when the map has a description', () => {
    const feature = bungarra();
    feature.properties.description = '  A quiet bay.  ';
    expect(toLocationSummary(feature)!.summary).toBe('A quiet bay.');
  });
});

describe('kindFromName (other operators)', () => {
  it.each([
    ['Woodman Point Holiday Park', 'holiday-park'],
    ['Lake Brockman Tourist Park & Logue Brook', 'holiday-park'],
    ['RAC Margaret River Caravan Park', 'caravan-park'],
    ['Dwellingup Chalets and Caravan Park', 'caravan-park'],
    ['Wellington Forest Cottages and Conference Centre', 'cabin'],
    ['Myalup Pines Cottages', 'cabin'],
    ['Yeagarup Hut', 'hut'],
    ['Gnaraloo Homestead', 'farm-stay'],
    ['Quobba Station', 'farm-stay'],
    ['Karijini Eco Retreat', 'glamping'],
    ['Sal Salis Ningaloo Reef', 'glamping'],
    ['Yanchep Inn', 'other'],
    ['Hutt Lagoon', 'other'],
  ])('%s → %s', (name, kind) => {
    expect(kindFromName(name)).toBe(kind);
  });
});
