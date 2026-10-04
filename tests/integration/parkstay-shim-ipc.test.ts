/**
 * The transitional `parkstay` namespace: the legacy forms' campground pickers, served from
 * the ParkStay provider's catalogue (the campground map) with a 10-minute cache. Campgrounds
 * only: never the parks and promo areas `search_suggest` mixed in, which is no longer called.
 */

import type { AppContainer } from '@main/app/container';
import { createHandle } from '@main/ipc/handle';
import {
  CAMPGROUND_CACHE_MS,
  registerParkStayHandlers,
} from '@main/ipc/handlers/parkstay.handlers';
import type { APIResponse, CampgroundSearchResult } from '@shared/types';
import { FakeIpcMain, fakeEvent } from '@tests/utils/ipc-harness';
import {
  startParkStayFixtureServer,
  type ParkStayFixtureServer,
} from '@tests/utils/parkstay-fixture-server';
import { createTestParkStay } from '@tests/utils/parkstay-provider';

describe('parkstay.* (transitional campground pickers)', () => {
  let server: ParkStayFixtureServer;
  let ipc: FakeIpcMain;
  let now: number;

  const call = <T>(channel: string, payload?: unknown) =>
    ipc.invoke(channel, fakeEvent(), payload) as Promise<APIResponse<T>>;

  beforeAll(async () => {
    server = await startParkStayFixtureServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    now = Date.parse('2026-10-02T02:00:00Z');
    ipc = new FakeIpcMain();
    const { registry } = createTestParkStay(server);
    registerParkStayHandlers(
      createHandle({ isTrustedSender: () => true, ipc }),
      { providers: registry } as unknown as AppContainer,
      () => now
    );
  });

  it('registers only the two pickers (checkAvailability is gone)', () => {
    expect(ipc.registrations).toEqual([
      'parkstay:search-campgrounds',
      'parkstay:get-all-campgrounds',
    ]);
  });

  it('getAllCampgrounds returns the six campgrounds of the map, in the legacy shape', async () => {
    const response = await call<CampgroundSearchResult[]>('parkstay:get-all-campgrounds');

    expect(response.success).toBe(true);
    expect(response.data!.map((c) => [c.id, c.name])).toEqual([
      ['20', 'Bungarra'],
      ['18', 'Kurrajong (Cape Range)'],
      ['85', 'Lake Mason Homestead'],
      ['5', 'Woodman Point Holiday Park'],
      ['16', 'North Kurrajong & T-Bone (Cape Range)'],
      ['182', 'Yeagarup Hut'],
    ]);
    expect(response.data![0]).toEqual({
      id: '20',
      name: 'Bungarra',
      type: 'Campground',
      parkName: 'Cape Range National Park',
      region: 'Pilbara',
      facilities: ['Toilet', 'Road access for 2WD/SUV'],
      imageUrl: 'https://parkstay.dbca.wa.gov.au/media/parkstay/campground_images/25f050a7-6c3.jpg',
      coordinates: [113.84, -22.247],
    });
    // Never parks or promo areas.
    expect(response.data!.every((c) => c.type === 'Campground')).toBe(true);
    expect(server.requestsTo('/api/search_suggest')).toEqual([]);
    expect(server.requestsTo('/api/campground_map/')).toHaveLength(1);
  });

  it('searchCampgrounds filters by name from two characters, from the same cached map', async () => {
    const kurrajong = await call<CampgroundSearchResult[]>('parkstay:search-campgrounds', {
      query: 'kurr',
    });
    expect(kurrajong.data!.map((c) => c.id)).toEqual(['18', '16']);

    const short = await call<CampgroundSearchResult[]>('parkstay:search-campgrounds', {
      query: 'k',
    });
    expect(short.data).toHaveLength(6);
    expect(server.requestsTo('/api/campground_map/')).toHaveLength(1);
  });

  it('reloads the map after 10 minutes', async () => {
    await call('parkstay:get-all-campgrounds');
    now += CAMPGROUND_CACHE_MS - 1;
    await call('parkstay:get-all-campgrounds');
    expect(server.requestsTo('/api/campground_map/')).toHaveLength(1);
    now += 1;
    await call('parkstay:get-all-campgrounds');
    expect(server.requestsTo('/api/campground_map/')).toHaveLength(2);
  });

  it('shares one load between callers that ask at the same time', async () => {
    await Promise.all([
      call('parkstay:get-all-campgrounds'),
      call('parkstay:search-campgrounds', { query: 'bay' }),
    ]);
    expect(server.requestsTo('/api/campground_map/')).toHaveLength(1);
  });

  it('answers the DBCA queue page as ACCESS_GATE', async () => {
    server.queueGate = 'html';
    try {
      expect(await call('parkstay:get-all-campgrounds')).toMatchObject({
        success: false,
        code: 'ACCESS_GATE',
      });
    } finally {
      server.queueGate = 'off';
    }
  });
});
