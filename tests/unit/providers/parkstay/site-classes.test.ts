/**
 * Campgrounds ParkStay lists by site class (#21): Lucky Bay's recorded view (one class of 56
 * sites, one free each night but never the same one) through `availability.check`, the
 * catalogue detail and holds, against the fixture server. No live request.
 */

import {
  bookableClassNights,
  classIdOfUnit,
  classUnitId,
  isClassListing,
} from '@main/providers/parkstay/site-classes';
import { PARKSTAY_LOCATIONS } from '@tests/fixtures/catalog/parkstay-locations';
import {
  startParkStayFixtureServer,
  type ParkStayFixtureServer,
} from '@tests/utils/parkstay-fixture-server';
import {
  createTestParkStay,
  LUCKY_BAY_CLASS,
  LUCKY_BAY_STAY,
  luckyBayView,
  type TestParkStay,
} from '@tests/utils/parkstay-provider';

const LUCKY_BAY = PARKSTAY_LOCATIONS.find((l) => l.key === 'parkstay:43')!;

describe('bookableClassNights', () => {
  const T = true;
  const F = false;

  /** Whether every run of chosen nights is free on one site (runs are apart by definition). */
  const valid = (free: boolean[][], chosen: boolean[]): boolean => {
    for (let start = 0; start < chosen.length; ) {
      if (!chosen[start]) {
        start++;
        continue;
      }
      let end = start;
      while (end < chosen.length && chosen[end]) end++;
      if (!free.some((site) => site.slice(start, end).every(Boolean))) return false;
      start = end;
    }
    return true;
  };
  const count = (chosen: boolean[]): number => chosen.filter(Boolean).length;

  it.each([
    ['one site free every night: every night', [[T, T, T]], [T, T, T]],
    ['no site free: no night', [[F, F, F]], [F, F, F]],
    [
      'a different site each night: every other night',
      [
        [T, F, F],
        [F, T, F],
        [F, F, T],
      ],
      [T, F, T],
    ],
    ['runs on one site with a gap: both', [[T, F, T, T]], [T, F, T, T]],
    [
      'the longest run on any site',
      [
        [T, T, F],
        [F, T, T],
        [T, T, T],
      ],
      [T, T, T],
    ],
  ])('%s', (_name, free, expected) => {
    expect(bookableClassNights(free, expected.length)).toEqual(expected);
  });

  it('two sites that hand over: all but one night, never both runs side by side', () => {
    const free = [
      [T, T, F, F],
      [F, F, T, T],
    ];
    const chosen = bookableClassNights(free, 4);
    expect(count(chosen)).toBe(3);
    expect(valid(free, chosen)).toBe(true);
  });

  it('chooses as many nights as any valid choice, every run on one site (all 3-site, 5-night cases)', () => {
    const sites = 3;
    const nights = 5;
    const cells = sites * nights;
    for (let bits = 0; bits < 2 ** cells; bits += 11) {
      const free = Array.from({ length: sites }, (_, s) =>
        Array.from({ length: nights }, (_, n) => ((bits >> (s * nights + n)) & 1) === 1)
      );
      let most = 0;
      for (let pick = 0; pick < 2 ** nights; pick++) {
        const option = Array.from({ length: nights }, (_, n) => ((pick >> n) & 1) === 1);
        if (valid(free, option)) most = Math.max(most, count(option));
      }
      const chosen = bookableClassNights(free, nights);
      expect(valid(free, chosen)).toBe(true);
      expect(count(chosen)).toBe(most);
    }
  });
});

describe('class unit ids', () => {
  it('names a class by its id, never by the site the view gave', () => {
    expect(classUnitId({ type: 117 })).toBe('class:117');
    expect(classIdOfUnit('class:117')).toBe('117');
    expect(classIdOfUnit('309')).toBeUndefined();
    expect(classIdOfUnit(undefined)).toBeUndefined();
    expect(isClassListing({ site_type: 2 })).toBe(true);
    expect(isClassListing({ site_type: 1 })).toBe(true);
    expect(isClassListing({ site_type: 0 })).toBe(false);
    expect(isClassListing({})).toBe(false);
  });
});

describe('ParkStay campgrounds listed by class (Lucky Bay, 43)', () => {
  let server: ParkStayFixtureServer;
  let parkstay: TestParkStay;

  beforeAll(async () => {
    server = await startParkStayFixtureServer();
  });

  beforeEach(() => {
    server.views.clear();
    server.classHolds.length = 0;
    server.views.set('43', luckyBayView());
    parkstay = createTestParkStay(server);
  });

  afterAll(async () => {
    await server.close();
  });

  const check = (options = {}) =>
    parkstay.provider.availability.check('43', LUCKY_BAY_STAY, options);
  const lastPost = () => new URLSearchParams(server.requestsTo('/api/create_booking').at(-1)!.body);

  describe('availability', () => {
    it('returns the class as one unit, class:117, with no unit type', async () => {
      const result = await check();
      expect(result.units).toHaveLength(1);
      expect(result.units[0]).toMatchObject({
        unitId: LUCKY_BAY_CLASS,
        unitName: 'One site - select on arrival',
      });
      expect(result.units[0]).not.toHaveProperty('unitType');
    });

    it('fills every night, priced: one site free on 6 and 8 Nov, 7 Nov free only on another site', async () => {
      // The recording: site 21 is free on the 6th, site 23 on the 7th, five sites on the 8th.
      const [unit] = (await check()).units;
      expect(unit.nights).toEqual([
        { date: '2026-11-06', state: 'available', price: 20, label: '$20.00' },
        { date: '2026-11-07', state: 'unknown', price: 20, label: '$20.00' },
        { date: '2026-11-08', state: 'available', price: 20, label: '$20.00' },
      ]);
      // No site is free for all three nights, so the class is not either.
      expect(unit.fullyAvailable).toBe(false);
      expect(unit).not.toHaveProperty('total');
    });

    it('is fully available, at $60, while a site is free for the whole stay', async () => {
      server.views.set('43', luckyBayView(330));
      const [unit] = (await check()).units;
      expect(unit.nights.map((n) => [n.date, n.state, n.price])).toEqual([
        ['2026-11-06', 'available', 20],
        ['2026-11-07', 'available', 20],
        ['2026-11-08', 'available', 20],
      ]);
      expect(unit).toMatchObject({ unitId: LUCKY_BAY_CLASS, fullyAvailable: true, total: 60 });
    });

    it('keeps the unit id across polls while the site the view names changes', async () => {
      const ids: string[] = [];
      for (const view of [luckyBayView(), luckyBayView(330), luckyBayView(352), luckyBayView()]) {
        server.views.set('43', view);
        ids.push(...(await check()).units.map((u) => u.unitId));
      }
      expect(ids).toEqual(Array(4).fill(LUCKY_BAY_CLASS));
    });

    it('reads nights with no free site as booked, or not released past the horizon', async () => {
      const view = luckyBayView();
      const entry = view.sites[0];
      // 7 Nov: every site booked. 8 Nov: booked and closed sites (as on 24 Nov, live).
      entry.availability[1] = [false, 'Booked', '20.00', null, [56, 0, 0], '2026-11-07'];
      entry.availability[2] = [false, 'Unavailable', '20.00', null, [53, 3, 0], '2026-11-08'];
      for (const row of entry.breakdown) {
        row.availability[1] = [false, 'Unavailable', '20.00', null];
        row.availability[2] = [false, 'Unavailable', '20.00', null];
      }
      server.views.set('43', view);
      const [unit] = (await check()).units;
      expect(unit.nights.map((n) => [n.date, n.state, n.label])).toEqual([
        ['2026-11-06', 'available', '$20.00'],
        ['2026-11-07', 'booked', 'Booked'],
        ['2026-11-08', 'booked', 'Unavailable'],
      ]);

      // A release period from 8 Nov: that night is not released yet.
      server.views.set('43', { ...view, release_date: '2026-11-08' });
      const [later] = (await check()).units;
      expect(later.nights.map((n) => n.state)).toEqual(['available', 'booked', 'not-released']);
    });

    it('without a breakdown, reads the class’s own labels as a site’s', async () => {
      const view = luckyBayView();
      delete view.sites[0].breakdown;
      server.views.set('43', view);
      const [unit] = (await check()).units;
      // Bookable only when every site is free; a price label alone cannot say which.
      expect(unit.nights.map((n) => n.state)).toEqual(['unknown', 'unknown', 'unknown']);
      expect(unit.fullyAvailable).toBe(false);
    });

    it('filters by the class unit id, and by a site id an earlier view gave for the class', async () => {
      expect((await check({ unitIds: [LUCKY_BAY_CLASS] })).units).toHaveLength(1);
      // 309 is the site the recorded view named (unit ids stored before #21 were such ids).
      server.views.set('43', luckyBayView(330));
      expect((await check({ unitIds: ['309'] })).units.map((u) => u.unitId)).toEqual([
        LUCKY_BAY_CLASS,
      ]);
      expect((await check({ unitIds: ['330'] })).units).toHaveLength(1);
      expect((await check({ unitIds: ['999'] })).units).toEqual([]);
    });
  });

  describe('detail', () => {
    it('lists the class as the unit, from the stored summary without the map', async () => {
      const detail = await parkstay.provider.catalog.getLocation('43', undefined, {
        summary: LUCKY_BAY,
      });
      expect(detail.units).toEqual([
        {
          unitId: LUCKY_BAY_CLASS,
          unitName: 'One site - select on arrival',
          maxPeople: 8,
          maxVehicles: 2,
          equipment: ['tent', 'campervan', 'caravan'],
          description: '11m x 6m compacted crushed rock reverse-in site.',
        },
      ]);
      expect(detail.releaseInfo).toBe('Bookings open 180 days ahead at 12:00 am AWST');
      expect(server.requestsTo('/api/campground_map/')).toHaveLength(0);
    });
  });

  describe('holds (fixture server only)', () => {
    it('holds the class: posts campsite_class=117 and no site, and ParkStay picks a free site', async () => {
      server.views.set('43', luckyBayView(330));
      const hold = await parkstay.provider.holds.create({
        externalId: '43',
        unitId: LUCKY_BAY_CLASS,
        stay: LUCKY_BAY_STAY,
      });
      expect(hold).toMatchObject({ ok: true, reference: '1234567', unitId: LUCKY_BAY_CLASS });
      expect(lastPost().get('campsite_class')).toBe('117');
      expect(lastPost().get('campground')).toBe('43');
      expect(lastPost().has('campsite')).toBe(false);
      expect(server.classHolds).toEqual([{ campground: '43', campsiteClass: '117', site: 330 }]);
    });

    it('without a unit, takes the class that is free for the whole stay', async () => {
      server.views.set('43', luckyBayView(330));
      const hold = await parkstay.provider.holds.create({ externalId: '43', stay: LUCKY_BAY_STAY });
      expect(hold).toMatchObject({ ok: true, unitId: LUCKY_BAY_CLASS });
      expect(lastPost().get('campsite_class')).toBe('117');
      expect(server.classHolds).toEqual([{ campground: '43', campsiteClass: '117', site: 330 }]);
    });

    it('without a unit, and no site free for the whole stay, is taken without posting', async () => {
      const before = server.requestsTo('/api/create_booking').length;
      expect(
        await parkstay.provider.holds.create({ externalId: '43', stay: LUCKY_BAY_STAY })
      ).toMatchObject({ ok: false, reason: 'taken' });
      expect(server.requestsTo('/api/create_booking')).toHaveLength(before);
    });

    it('is taken, in ParkStay’s words, when no site of the class is free for the whole stay', async () => {
      const hold = await parkstay.provider.holds.create({
        externalId: '43',
        unitId: LUCKY_BAY_CLASS,
        stay: LUCKY_BAY_STAY,
      });
      expect(hold).toMatchObject({ ok: false, reason: 'taken' });
      expect(hold.ok ? '' : hold.message).toContain(
        'Campsite class unavailable for specified time period.'
      );
      expect(server.classHolds).toEqual([]);
    });

    it('holds by class for a site id stored before #21, once a view named it', async () => {
      await check();
      server.views.set('43', luckyBayView(330));
      const hold = await parkstay.provider.holds.create({
        externalId: '43',
        unitId: '309',
        stay: LUCKY_BAY_STAY,
      });
      expect(hold).toMatchObject({ ok: true });
      expect(lastPost().get('campsite_class')).toBe('117');
      expect(lastPost().has('campsite')).toBe(false);
    });
  });
});
