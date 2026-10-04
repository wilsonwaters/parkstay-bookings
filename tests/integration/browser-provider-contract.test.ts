/**
 * The browser-driven FakeProvider (V7) through the provider conformance suite, on the real
 * `PlaywrightBrowserAutomation` with a mocked `playwright-core` whose pages render the fake
 * holiday-park site in jsdom. Proves the `ProviderContext.browser` contract end to end: the
 * provider's own DOM code runs, results map to the normalised types, calls are serialised on
 * one persistent context, and no call leaves a page open.
 */

jest.mock('playwright-core', () =>
  jest.requireActual('@tests/utils/fake-playwright').fakePlaywrightModule()
);

import path from 'path';
import type { PlaywrightBrowserAutomation } from '@main/providers/sdk';
import { ProviderRegistry } from '@main/providers/registry';
import { FAKE_SITE_PARKS, renderFakeSite } from '@tests/fixtures/fake-browser-site';
import {
  createFakeBrowserProviderFactory,
  FAKE_BROWSER_BASE_URL,
} from '@tests/utils/fake-browser-provider';
import { fakePlaywright } from '@tests/utils/fake-playwright';
import { createTestProviderContext, FIXED_NOW } from '@tests/utils/fake-provider';
import { describeProviderContract } from '@tests/utils/provider-contract';

fakePlaywright.reset();
fakePlaywright.site = renderFakeSite;

const STAY = { arrival: '2026-11-13', departure: '2026-11-16', adults: 2 };

describeProviderContract('fake-browser', () => {
  const factory = createFakeBrowserProviderFactory();
  const ctx = createTestProviderContext(factory.manifest);
  return {
    provider: factory(ctx),
    sample: { externalId: 'swan-valley', stay: STAY },
    openPages: () => fakePlaywright.openPages(),
    cleanup: () => ctx.browser.close(),
  };
});

describe('FakeBrowserProvider', () => {
  const factory = createFakeBrowserProviderFactory();
  const registry = new ProviderRegistry();
  const provider = registry.register(factory, (manifest) => createTestProviderContext(manifest));

  beforeAll(() => {
    fakePlaywright.reset();
    fakePlaywright.site = renderFakeSite;
  });

  afterAll(() => registry.disposeAll());

  it('lists the parks read from the page, mapped to LocationSummary', async () => {
    const locations = await provider.catalog!.listLocations!();

    expect(locations).toHaveLength(FAKE_SITE_PARKS.length);
    expect(locations[0]).toEqual({
      key: 'fake-browser:swan-valley',
      providerId: 'fake-browser',
      externalId: 'swan-valley',
      name: 'Swan Valley Holiday Park',
      kind: 'holiday-park',
      bookingMode: 'online',
      lat: -31.8481,
      lng: 116.0049,
      area: { name: 'Swan Valley', region: 'Perth' },
      summary: 'Cabins and powered sites among the vineyards.',
      imageUrls: [],
      amenities: [],
      infoUrl: `${FAKE_BROWSER_BASE_URL}/parks/swan-valley`,
      bookingUrl: `${FAKE_BROWSER_BASE_URL}/parks/swan-valley`,
    });
    expect(locations[1].kind).toBe('caravan-park');
  });

  it('reads a park and its units', async () => {
    const detail = await provider.catalog!.getLocation('swan-valley');
    expect(detail.units).toEqual([
      { unitId: 'c1', unitName: 'Cabin 1', unitType: 'Cabin', maxPeople: 4 },
      { unitId: 'p7', unitName: 'Powered site 7', unitType: 'Powered site', maxPeople: 6 },
    ]);
    expect(detail.unitCount).toBe(2);
    expect(detail.fetchedAt).toBe(FIXED_NOW.toISOString());
  });

  it("maps the site's night cells to NightStatus, with prices and totals", async () => {
    const result = await provider.availability!.check('swan-valley', STAY);

    expect(result.key).toBe('fake-browser:swan-valley');
    expect(result.bookingUrl).toBe(
      `${FAKE_BROWSER_BASE_URL}/parks/swan-valley/availability?arrival=2026-11-13&departure=2026-11-16`
    );
    const [cabin, site] = result.units;
    expect(cabin).toMatchObject({ unitId: 'c1', fullyAvailable: true, total: 435 });
    expect(cabin.nights.map((n) => [n.date, n.state, n.price])).toEqual([
      ['2026-11-13', 'available', 145],
      ['2026-11-14', 'available', 145],
      ['2026-11-15', 'available', 145],
    ]);
    // 13th odd → vacant, 14th a multiple of 7 → closed, 15th odd → vacant.
    expect(site.nights.map((n) => [n.state, n.label])).toEqual([
      ['available', '$48.50'],
      ['closed', 'Closed'],
      ['available', '$48.50'],
    ]);
    expect(site).toMatchObject({ fullyAvailable: false, total: undefined });

    const onlySite = await provider.availability!.check('swan-valley', STAY, { unitIds: ['p7'] });
    expect(onlySite.units.map((u) => u.unitId)).toEqual(['p7']);
  });

  it('does it all in one persistent context, at providers/fake-browser/browser, one page at a time', async () => {
    fakePlaywright.peakOpenPages = 0;
    const results = await Promise.all([
      provider.catalog!.listLocations!(),
      provider.catalog!.getLocation('busselton-jetty'),
      provider.availability!.check('busselton-jetty', STAY),
    ]);
    expect(results).toHaveLength(3);

    expect(fakePlaywright.chromium.launchPersistentContext).toHaveBeenCalledTimes(1);
    const [userDataDir, options] = fakePlaywright.chromium.launchPersistentContext.mock.calls[0];
    expect(userDataDir.endsWith(path.join('providers', 'fake-browser', 'browser'))).toBe(true);
    // The manifest's time zone reaches the browser.
    expect(options).toMatchObject({ timezoneId: 'Australia/Perth', locale: 'en-AU' });
    expect(fakePlaywright.peakOpenPages).toBe(1);
    expect(fakePlaywright.openPages()).toBe(0);
  });

  it('reports an unknown park as a 404 ProviderHttpError', async () => {
    await expect(provider.catalog!.getLocation('nowhere')).rejects.toMatchObject({
      name: 'ProviderHttpError',
      status: 404,
      url: `${FAKE_BROWSER_BASE_URL}/parks/nowhere`,
    });
  });

  it('turns "no browser installed" into the user-facing BrowserUnavailableError', async () => {
    const ctx = createTestProviderContext(factory.manifest);
    const lonely = factory(ctx);
    fakePlaywright.installed = new Set();

    await expect(lonely.catalog!.listLocations!()).rejects.toMatchObject({
      name: 'BrowserUnavailableError',
      reason: 'no-browser',
      message: 'WA Stay needs Microsoft Edge or Google Chrome installed to use Fake Holiday Parks',
    });
    await (ctx.browser as PlaywrightBrowserAutomation).close();
  });
});
