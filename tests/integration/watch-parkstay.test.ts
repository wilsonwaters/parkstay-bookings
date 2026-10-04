/**
 * The rewired WatchService against the real ParkStay module and a fixture server: real
 * nightly prices from Bungarra's live sample, and partial matches from the same single
 * availability request.
 */

import type Database from 'better-sqlite3';
import { openDatabase } from '@main/database/connection';
import { WatchRepository } from '@main/database/repositories';
import { insertUser } from '@tests/utils/database-helper';
import { NightGuard } from '@main/core/holds/night-guard';
import { WatchService } from '@main/core/watches/watch.service';
import { SiteSniperRepository } from '@main/database/repositories';
import { WatchResult } from '@shared/types/common.types';
import type { WatchInput } from '@shared/types';
import { FIXED_NOW } from '@tests/utils/fake-provider';
import {
  parkStayFixture,
  startParkStayFixtureServer,
  type ParkStayFixtureServer,
} from '@tests/utils/parkstay-fixture-server';
import { createTestParkStay } from '@tests/utils/parkstay-provider';

// Only `Date` is faked (2 Oct 2026), so the fixture's November stay is in the future.
const REAL_TIMERS = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

describe('WatchService on ParkStay (fixture server)', () => {
  let server: ParkStayFixtureServer;
  let db: Database.Database;
  let notifications: { notifyWatchFound: jest.Mock; notifyWatchPartialFound: jest.Mock };
  let service: WatchService;
  let userId: number;

  beforeAll(async () => {
    server = await startParkStayFixtureServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW, doNotFake: [...REAL_TIMERS] });
    server.requests.length = 0;
    server.views.clear();
    db = openDatabase(':memory:');
    userId = insertUser(db, 'me@example.com').id;
    notifications = {
      notifyWatchFound: jest.fn().mockResolvedValue(undefined),
      notifyWatchPartialFound: jest.fn().mockResolvedValue(undefined),
    };
    const watches = new WatchRepository(db);
    service = new WatchService({
      watches,
      providers: createTestParkStay(server).registry,
      notifications: { ...notifications, notifyWatchHeld: jest.fn() },
      nightGuard: new NightGuard(new SiteSniperRepository(db), watches),
    });
  });

  afterEach(() => {
    db.close();
    jest.useRealTimers();
  });

  const bungarra = (overrides: Partial<WatchInput> = {}): WatchInput => ({
    providerId: 'parkstay',
    name: 'Bungarra',
    location: { externalId: '20', name: 'Bungarra', areaName: 'Cape Range National Park' },
    stay: { arrival: '2026-11-10', departure: '2026-11-12', adults: 1 },
    stayParams: { gearType: 'all' },
    ...overrides,
  });

  it('finds the free sites with their real nightly price ($30, not 0)', async () => {
    const watch = await service.create(userId, bungarra());

    const result = await service.execute(watch.id);

    expect(result.found).toBe(true);
    expect(result.matches).toEqual(
      ['3', '4', '5'].map((id) => ({
        unitId: id,
        unitName: `CAMPSITE 0${id}`,
        arrival: '2026-11-10',
        departure: '2026-11-12',
        partial: false,
        priceKnown: true,
        total: 60,
      }))
    );
    expect(server.requestsTo('/api/campsite_availablity_view/20/')).toHaveLength(1);
    expect((await service.get(watch.id))?.lastResult).toBe(WatchResult.FOUND);
  });

  it('applies the price limit to the real prices', async () => {
    const watch = await service.create(userId, bungarra({ maxPrice: 25 }));
    expect((await service.execute(watch.id)).found).toBe(false);
  });

  it('reports partial matches from the same single request', async () => {
    // Site 1 is free on the first night only; the others are booked both nights.
    const view = parkStayFixture('campsite_availablity_view_20.json');
    const free = [true, '$30.00', '30.00', null, null, '2026-11-10'];
    const booked = (date: string) => [false, 'Unavailable', '30.00', null, null, date];
    server.views.set('20', {
      ...view,
      sites: view.sites.map((site: { id: number }) => ({
        ...site,
        availability:
          site.id === 1
            ? [free, booked('2026-11-11')]
            : [booked('2026-11-10'), booked('2026-11-11')],
      })),
    });
    const watch = await service.create(userId, bungarra({ allowPartialMatch: true }));

    const result = await service.execute(watch.id);

    expect(result.found).toBe(true);
    expect(result.matches).toEqual([
      {
        unitId: '1',
        unitName: 'CAMPSITE 01',
        arrival: '2026-11-10',
        departure: '2026-11-11',
        partial: true,
        priceKnown: true,
        total: 30,
      },
    ]);
    expect(server.requestsTo('/api/campsite_availablity_view/20/')).toHaveLength(1);
    expect(notifications.notifyWatchPartialFound).toHaveBeenCalledTimes(1);
    expect((await service.get(watch.id))?.lastResult).toBe(WatchResult.PARTIAL_FOUND);
  });
});
