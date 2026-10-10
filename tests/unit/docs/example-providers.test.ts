/**
 * @jest-environment node
 *
 * The worked examples of docs/providers/adding-a-provider.md
 * (`tests/fixtures/providers/example-{api,browser}`) are real providers: they compile under the
 * main process's tsconfig, register in a fresh `ProviderRegistry`, pass the provider contract
 * suite, list normalised `LocationSummary`s and answer availability as `NightStatus`es with
 * `YYYY-MM-DD` dates. The API example runs on `NodeHttpClient` against a loopback server; the
 * browser example on the fake browser (`tests/utils/fake-browser.ts`) over the example site.
 *
 * The regions marked `// #region docs:<name>` are code blocks of the guide
 * (`tests/unit/docs/docs-sync.test.ts`).
 */

import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import ts from 'typescript';
import { isAbortError, ProviderHttpError, ProviderParseError } from '@main/providers/sdk';
import { ProviderRegistry, type ProviderWith } from '@main/providers/registry';
import { isCalendarDate, type StayQuery } from '@shared/types/provider.types';
import { createFakeBrowser } from '@tests/utils/fake-browser';
import { createTestProviderContext } from '@tests/utils/fake-provider';
import { describeProviderContract } from '@tests/utils/provider-contract';
import {
  createExampleApiFactory,
  exampleApiFactory,
  exampleApiManifest,
} from '@tests/fixtures/providers/example-api';
import {
  createExampleBrowserFactory,
  exampleBrowserFactory,
  exampleBrowserManifest,
} from '@tests/fixtures/providers/example-browser';
import { renderExampleSite } from '@tests/fixtures/providers/example-browser/site';

const ROOT = path.resolve(__dirname, '../../..');
const API_FIXTURES = path.join(ROOT, 'tests/fixtures/providers/example-api/fixtures');
const STAY: StayQuery = { arrival: '2026-11-10', departure: '2026-11-12', adults: 2 };

// ---------------------------------------------------------------------------------------
// The API example's loopback server
// ---------------------------------------------------------------------------------------

interface FixtureServer {
  baseUrl: string;
  /** Path and query of every request, in order. */
  requests: string[];
  close(): Promise<void>;
}

/** The fixture file for a request path, or undefined (a 404). */
function fixtureFor(pathname: string): string | undefined {
  const routes: Array<[RegExp, (m: RegExpExecArray) => string]> = [
    [/^\/api\/parks$/, () => 'parks.json'],
    [/^\/api\/parks\/(\w+)$/, (m) => `park-${m[1]}.json`],
    [/^\/api\/parks\/(\w+)\/availability$/, (m) => `availability-${m[1]}.json`],
    [/^\/api\/availability$/, () => 'bulk.json'],
  ];
  for (const [pattern, file] of routes) {
    const match = pattern.exec(pathname);
    if (match && fs.existsSync(path.join(API_FIXTURES, file(match)))) return file(match);
  }
  return undefined;
}

/** A loopback HTTP server running `handler`. */
async function serve(handler: http.RequestListener): Promise<Omit<FixtureServer, 'requests'>> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Serves the API example's fixtures: `/api/parks`, `/api/parks/<id>`, its availability, bulk. */
async function startFixtureServer(): Promise<FixtureServer> {
  const requests: string[] = [];
  const server = await serve((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${url.pathname}${url.search}`);
    const file = fixtureFor(url.pathname);
    response.writeHead(file ? 200 : 404, { 'Content-Type': 'application/json' });
    response.end(file ? fs.readFileSync(path.join(API_FIXTURES, file)) : '{"error":"not found"}');
  });
  return { ...server, requests };
}

// ---------------------------------------------------------------------------------------
// Compiles
// ---------------------------------------------------------------------------------------

describe('the guide examples compile under the main tsconfig', () => {
  it('has no type errors in either example provider', () => {
    const tsconfig = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, ROOT);
    const files = ['example-api/index.ts', 'example-browser/index.ts'].map((file) =>
      path.join(ROOT, 'tests/fixtures/providers', file)
    );
    const program = ts.createProgram(files, { ...options, noEmit: true, types: ['node'] });
    const errors = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
// The API example
// ---------------------------------------------------------------------------------------

describe('example API provider', () => {
  let server: FixtureServer;
  let provider: ProviderWith<'bulkAvailability'>;

  beforeAll(async () => {
    server = await startFixtureServer();
    // #region docs:test-api
    // A fresh registry, a test context (NodeHttpClient, in-memory state, a fixed clock) and
    // the provider pointed at the loopback server that serves the JSON fixtures.
    const registry = new ProviderRegistry();
    const factory = createExampleApiFactory({ baseUrl: server.baseUrl });
    registry.register(factory, (manifest) => createTestProviderContext(manifest));
    provider = registry.require('example-api', 'bulkAvailability');
    // #endregion
  });

  afterAll(() => server.close());

  it('registers under its id with its manifest, and is the factory the guide registers', () => {
    const registry = new ProviderRegistry();
    registry.register(exampleApiFactory, (manifest) => createTestProviderContext(manifest));
    expect(registry.list().map((m) => m.id)).toEqual(['example-api']);
    expect(registry.get('example-api').manifest).toEqual(exampleApiManifest);
    expect(registry.withCapability('watches').map((p) => p.manifest.id)).toEqual(['example-api']);
  });

  it('lists normalised LocationSummary[]: keys, kinds, https-only photos, area', async () => {
    const locations = await provider.catalog!.listLocations!();
    expect(locations).toEqual([
      expect.objectContaining({
        key: 'example-api:101',
        providerId: 'example-api',
        externalId: '101',
        name: 'Granite Bay Campground',
        kind: 'campground',
        bookingMode: 'online',
        lat: -34.3321,
        lng: 115.1593,
        area: { name: 'Augusta', region: 'South West' },
        imageUrls: ['https://images.example-parks.test/101/main.jpg'],
        amenities: ['Toilets', 'Fire pits'],
        unitCount: 3,
        infoUrl: 'https://www.example-parks.test/parks/101',
      }),
      // An http photo is dropped: images must be https.
      expect.objectContaining({ key: 'example-api:102', kind: 'cabin', imageUrls: [] }),
      // A kind the provider does not map is `other`.
      expect.objectContaining({ key: 'example-api:103', kind: 'other' }),
    ]);
  });

  it('builds a detail with units and the raw description for main to sanitise', async () => {
    const detail = await provider.catalog!.getLocation('101');
    expect(detail).toMatchObject({
      key: 'example-api:101',
      descriptionHtml: '<p>Sheltered sites behind the dunes.</p>',
      units: [
        { unitId: 's1', unitName: 'Site 1', unitType: 'Powered', maxPeople: 6 },
        { unitId: 's2', unitName: 'Site 2', unitType: 'Unpowered', maxPeople: 4 },
        { unitId: 's3', unitName: 'Site 3', unitType: 'Unpowered', maxPeople: 4 },
      ],
    });
  });

  it('answers availability as NightStatus with YYYY-MM-DD dates, only the stay nights', async () => {
    const result = await provider.availability.check('101', {
      ...STAY,
      params: { siteType: 'powered' },
    });
    expect(result.key).toBe('example-api:101');
    expect(result.bookingUrl).toBe(
      'https://www.example-parks.test/book/101?from=2026-11-10&to=2026-11-12'
    );
    expect(result.units).toEqual([
      {
        unitId: 's1',
        unitName: 'Site 1',
        nights: [
          { date: '2026-11-10', state: 'available', price: 40 },
          { date: '2026-11-11', state: 'available', price: 45 },
        ],
        fullyAvailable: true,
        total: 85,
      },
      {
        unitId: 's2',
        unitName: 'Site 2',
        nights: [
          { date: '2026-11-10', state: 'available', price: 30 },
          { date: '2026-11-11', state: 'booked' },
        ],
        fullyAvailable: false,
        total: undefined,
      },
      {
        // An unknown word is `unknown`, and a missing night too: never `available`.
        unitId: 's3',
        unitName: 'Site 3',
        nights: [
          { date: '2026-11-10', state: 'unknown' },
          { date: '2026-11-11', state: 'unknown' },
        ],
        fullyAvailable: false,
        total: undefined,
      },
    ]);
    for (const night of result.units.flatMap((u) => u.nights)) {
      expect(isCalendarDate(night.date)).toBe(true);
    }
    expect(server.requests).toContain(
      '/api/parks/101/availability?arrival=2026-11-10&departure=2026-11-12&guests=2&siteType=powered'
    );
  });

  it('keeps only the units asked for', async () => {
    const result = await provider.availability.check('101', STAY, { unitIds: ['s2'] });
    expect(result.units.map((u) => u.unitId)).toEqual(['s2']);
  });

  it('answers bulk availability under location keys', async () => {
    await expect(provider.availability.search(STAY)).resolves.toEqual([
      { key: 'example-api:101', availableUnits: 1, bookableUnits: 3 },
      { key: 'example-api:102', availableUnits: 0, bookableUnits: 2 },
    ]);
  });

  it('turns a 404 into a ProviderHttpError and a wrong shape into a ProviderParseError', async () => {
    await expect(provider.catalog!.getLocation('999')).rejects.toBeInstanceOf(ProviderHttpError);
    // A server that answers every path with JSON of the wrong shape.
    const wrong = await serve((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"parks":[{"id":"not a number"}]}');
    });
    try {
      const registry = new ProviderRegistry();
      registry.register(createExampleApiFactory({ baseUrl: wrong.baseUrl }), (manifest) =>
        createTestProviderContext(manifest)
      );
      await expect(registry.get('example-api').catalog!.listLocations!()).rejects.toBeInstanceOf(
        ProviderParseError
      );
    } finally {
      await wrong.close();
    }
  });

  it('keeps no more than limits.maxConcurrentRequests requests in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const slow = await serve((_request, response) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      setTimeout(() => {
        inFlight--;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(fs.readFileSync(path.join(API_FIXTURES, 'bulk.json')));
      }, 30);
    });
    try {
      const registry = new ProviderRegistry();
      registry.register(createExampleApiFactory({ baseUrl: slow.baseUrl }), (manifest) =>
        createTestProviderContext(manifest)
      );
      const search = registry.require('example-api', 'bulkAvailability').availability.search;
      await Promise.all(Array.from({ length: 6 }, () => search(STAY)));
      expect(peak).toBe(exampleApiManifest.limits!.maxConcurrentRequests);
    } finally {
      await slow.close();
    }
  });
});

// #region docs:test-contract
describeProviderContract('example-api', async () => {
  const server = await startFixtureServer();
  const factory = createExampleApiFactory({ baseUrl: server.baseUrl });
  return {
    provider: factory(createTestProviderContext(factory.manifest)),
    sample: { externalId: '101', stay: STAY },
    unknownExternalId: '999',
    cleanup: () => server.close(),
  };
});
// #endregion

// ---------------------------------------------------------------------------------------
// The browser example
// ---------------------------------------------------------------------------------------

describe('example browser provider', () => {
  const fake = createFakeBrowser(renderExampleSite);
  let provider: ProviderWith<'availability'>;

  beforeAll(() => {
    const registry = new ProviderRegistry();
    registry.register(createExampleBrowserFactory(), (manifest) =>
      createTestProviderContext(manifest, { browser: fake })
    );
    provider = registry.require('example-browser', 'availability');
  });

  it('registers under its id with its polite limits', () => {
    const registry = new ProviderRegistry();
    registry.register(exampleBrowserFactory, (manifest) => createTestProviderContext(manifest));
    expect(registry.get('example-browser').manifest).toEqual(exampleBrowserManifest);
    expect(exampleBrowserManifest.limits).toMatchObject({ maxConcurrentRequests: 1 });
  });

  it('lists normalised LocationSummary[] read from the pages', async () => {
    await expect(provider.catalog!.listLocations!()).resolves.toEqual([
      {
        key: 'example-browser:sunset-bay',
        providerId: 'example-browser',
        externalId: 'sunset-bay',
        name: 'Sunset Bay Holiday Park',
        kind: 'holiday-park',
        bookingMode: 'online',
        lat: -33.6455,
        lng: 115.3459,
        area: { name: 'Busselton' },
        imageUrls: [],
        amenities: [],
        infoUrl: 'https://www.example-holiday.test/parks/sunset-bay',
      },
      expect.objectContaining({ key: 'example-browser:river-gums', kind: 'caravan-park' }),
    ]);
    expect(fake.openPages()).toBe(0);
    expect(fake.visits).toContain('https://www.example-holiday.test/parks');
  });

  it('answers availability as NightStatus with YYYY-MM-DD dates, only the stay nights', async () => {
    const result = await provider.availability.check('sunset-bay', STAY);
    expect(result.key).toBe('example-browser:sunset-bay');
    expect(result.units).toEqual([
      {
        unitId: 'c1',
        unitName: 'Beach Cabin 1',
        nights: [
          { date: '2026-11-10', state: 'available', price: 145 },
          { date: '2026-11-11', state: 'available', price: 155 },
        ],
        fullyAvailable: true,
      },
      {
        unitId: 'c2',
        unitName: 'Garden Cabin 2',
        nights: [
          { date: '2026-11-10', state: 'booked' },
          { date: '2026-11-11', state: 'available', price: 120 },
        ],
        fullyAvailable: false,
      },
    ]);
    for (const night of result.units.flatMap((u) => u.nights)) {
      expect(isCalendarDate(night.date)).toBe(true);
    }
  });

  it('turns a missing page into a ProviderHttpError and closes it', async () => {
    await expect(provider.catalog!.getLocation('nowhere')).rejects.toBeInstanceOf(
      ProviderHttpError
    );
    expect(fake.openPages()).toBe(0);
  });

  it('rejects with an AbortError when the caller aborts mid-call', async () => {
    const controller = new AbortController();
    const pending = provider.catalog!.listLocations!(controller.signal);
    controller.abort();
    const error = await pending.then(
      () => 'resolved',
      (rejection: unknown) => rejection
    );
    expect(isAbortError(error)).toBe(true);
  });
});

// #region docs:test-fake-browser
describeProviderContract('example-browser', () => {
  // Pages come from the example site, in jsdom: the provider's own page code runs.
  const fake = createFakeBrowser(renderExampleSite);
  const factory = createExampleBrowserFactory();
  return {
    provider: factory(createTestProviderContext(factory.manifest, { browser: fake })),
    sample: { externalId: 'sunset-bay', stay: STAY },
    unknownExternalId: 'nowhere',
    openPages: fake.openPages,
  };
});
// #endregion
