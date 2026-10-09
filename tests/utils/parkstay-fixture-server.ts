/**
 * A local ParkStay + DBCA queue, serving the trimmed live samples in `tests/fixtures/parkstay/`
 * (captured 2 Oct 2026) and behaving as the DBCA backend does where tests depend on it:
 *
 * - `campsite_availablity_view` answers HTTP 500 without a ParkStay `Referer`
 *   (`api.py:1224-1240`) or with dates that are not `YYYY/MM/DD` (`serialisers.py:56-57`),
 *   400 for campgrounds that are not bookable online, 500 for an unknown campground;
 * - `queueGate: 'html'` answers every `/api/` request with the queue middleware's redirect
 *   page (a 200 `text/html`, `queue_middleware.py:99,116`), and `'redirect'` with a 302 to
 *   the waiting room;
 * - `create_booking` and `check-create-session` answer what the test sets, except at a
 *   campground whose view (set in `views`) lists site classes, where `create_booking` does
 *   what ParkStay does: it refuses a `campsite` (`api.py:3112-3123`) and, for a
 *   `campsite_class`, holds a site of the class free for the whole stay (the class entry's
 *   `id` when all its nights are bookable, recorded in `classHolds`) or refuses the class
 *   (`utils.py:186-202`).
 *
 * `campsite_availablity_view_43_classes.json` is Lucky Bay (43), a campground listed by class,
 * for 6–9 Nov 2026, recorded live on 9 Oct 2026 (its description trimmed; no booking or
 * person in it): one class, 56 sites, one free each night but never the same one.
 *
 * It runs under Jest and inside Electron (`tests/electron/`), so it uses only Node's `http`.
 * Every request is recorded, and `maxInFlight` is the most it ever handled at once.
 */

import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import type { ParkStayEndpoints } from '../../src/main/providers/parkstay/client';

const FIXTURE_DIRS = [
  path.resolve(__dirname, '../fixtures/parkstay'),
  path.resolve(process.cwd(), 'tests/fixtures/parkstay'),
];

export const PARKSTAY_FIXTURES_DIR =
  FIXTURE_DIRS.find((dir) => fs.existsSync(dir)) ?? FIXTURE_DIRS[0];

/** A fixture file's text. */
export function readParkStayFixture(name: string): string {
  return fs.readFileSync(path.join(PARKSTAY_FIXTURES_DIR, name), 'utf8');
}

/** A JSON fixture, parsed (a fresh copy each time). */
export function parkStayFixture<T = any>(name: string): T {
  return JSON.parse(readParkStayFixture(name)) as T;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface FixtureAnswer {
  status: number;
  body: unknown;
}

/** What the server reads of a view that lists campsite classes. */
interface ClassListing {
  site_type?: number;
  sites: Array<{ id: number; type: number; availability: unknown[][] }>;
}

/** A class hold the server placed: the site of the class it picked. */
export interface ClassHold {
  campground: string;
  campsiteClass: string;
  site: number;
}

export interface ParkStayFixtureServer {
  /** `http://127.0.0.1:<port>` */
  readonly url: string;
  readonly endpoints: ParkStayEndpoints;
  readonly requests: RecordedRequest[];
  /** The most requests handled at the same time. */
  readonly maxInFlight: number;
  /** Answer `/api/` requests as the DBCA queue does while it is on. */
  queueGate: 'off' | 'html' | 'redirect';
  /** Wait this long before answering each request. */
  delayMs: number;
  /** `create_booking`'s answer. Default: the success fixture. */
  createBooking: FixtureAnswer;
  /** `check-create-session` answers in order; the last one repeats. Default: active. */
  queueAnswers: FixtureAnswer[];
  /** Replaces `campsite_availablity_view` bodies, by campground id. */
  views: Map<string, unknown>;
  /** Forces an answer for a path (`/api/campground_map/`). */
  overrides: Map<string, FixtureAnswer>;
  /** The class holds placed at campgrounds listed by class, in order. */
  readonly classHolds: ClassHold[];
  /** Requests to paths that start with `prefix`. */
  requestsTo(prefix: string): RecordedRequest[];
  close(): Promise<void>;
}

const PARKSTAY_REFERER = 'https://parkstay.dbca.wa.gov.au';
const SLASH_DATE = /^\d{4}\/\d{2}\/\d{2}$/;
const WAITING_ROOM = '/site-queue/waiting-room/parkstayv2/';

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function startParkStayFixtureServer(): Promise<ParkStayFixtureServer> {
  const map = parkStayFixture('campground_map.json');
  const types = new Map<string, number>(
    map.features.map((f: any) => [String(f.id), f.properties.campground_type])
  );
  const requests: RecordedRequest[] = [];
  const classHolds: ClassHold[] = [];
  let inFlight = 0;
  let queueCalls = 0;

  const state = {
    queueGate: 'off' as ParkStayFixtureServer['queueGate'],
    delayMs: 0,
    maxInFlight: 0,
    createBooking: { status: 200, body: parkStayFixture('create-booking-success.json') },
    queueAnswers: [{ status: 200, body: parkStayFixture('queue-active.json') }],
    views: new Map<string, unknown>(),
    overrides: new Map<string, FixtureAnswer>(),
  };

  function route(req: http.IncomingMessage, res: http.ServerResponse, record: RecordedRequest) {
    const { path: p, query, headers } = record;
    const forced = state.overrides.get(p);
    if (forced) return json(res, forced.status, forced.body);

    if (p.startsWith('/api/check-create-session/')) {
      const answer = state.queueAnswers[Math.min(queueCalls++, state.queueAnswers.length - 1)];
      return json(res, answer.status, answer.body);
    }
    if (p === WAITING_ROOM) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<html><body>DBCA waiting room</body></html>');
    }
    if (p.startsWith('/api/') && state.queueGate === 'html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(readParkStayFixture('queue-interstitial.html'));
    }
    if (p.startsWith('/api/') && state.queueGate === 'redirect') {
      res.writeHead(302, { location: WAITING_ROOM });
      return res.end();
    }
    if (p === '/api/campground_map/' && req.method === 'GET') return json(res, 200, map);
    if (p === '/api/campground_availabilty_view/' && req.method === 'GET') {
      return json(res, 200, parkStayFixture('campground_availabilty_view.json'));
    }
    const view = /^\/api\/campsite_availablity_view\/(\d+)\/$/.exec(p);
    if (view && req.method === 'GET') {
      const referer = String(headers.referer ?? '');
      const arrival = query.get('arrival') ?? '';
      const departure = query.get('departure') ?? '';
      if (
        !referer.startsWith(PARKSTAY_REFERER) ||
        !SLASH_DATE.test(arrival) ||
        !SLASH_DATE.test(departure)
      ) {
        return json(res, 500, {});
      }
      const id = view[1];
      if (state.views.has(id)) return json(res, 200, state.views.get(id));
      const type = types.get(id);
      if (type === undefined) {
        res.writeHead(500, { 'content-type': 'text/html' });
        return res.end('<h1>Server Error (500)</h1>');
      }
      if (type !== 0 && type !== 1) {
        return json(res, 400, { error: "Campground doesn't support online bookings" });
      }
      if (type === 1) {
        const feature = map.features.find((f: any) => String(f.id) === id);
        return json(res, 200, {
          id: Number(id),
          name: feature.properties.name,
          long_description: '<p>Book with the park office.</p>',
          campground_type: 1,
          map: null,
          ongoing_booking: false,
          ongoing_booking_id: null,
          arrival,
          days: 1,
          adults: 1,
          children: 0,
          maxAdults: 30,
          maxChildren: 30,
          sites: [],
          classes: {},
        });
      }
      const body = parkStayFixture('campsite_availablity_view_20.json');
      return json(res, 200, { ...body, id: Number(id) });
    }
    if (p.startsWith('/api/create_booking') && req.method === 'POST') {
      const form = new URLSearchParams(record.body);
      const campground = form.get('campground') ?? '';
      const listing = state.views.get(campground) as ClassListing | undefined;
      if (listing && (listing.site_type === 1 || listing.site_type === 2)) {
        return classBooking(res, campground, listing, form);
      }
      return json(res, state.createBooking.status, state.createBooking.body);
    }
    if (p === '/api/search_suggest')
      return json(res, 200, { type: 'FeatureCollection', features: [] });
    json(res, 404, { detail: 'Not found.' });
  }

  /** `create_booking` at a campground listed by class, as ParkStay answers it. */
  function classBooking(
    res: http.ServerResponse,
    campground: string,
    view: ClassListing,
    form: URLSearchParams
  ): void {
    const refuse = (msg: unknown) => json(res, 400, { status: 'error', msg });
    if (form.get('campsite')) return refuse("Campground doesn't support per-site bookings.");
    const campsiteClass = form.get('campsite_class') ?? '';
    if (!campsiteClass) return refuse('Must specify campsite_class and campground.');
    const entry = view.sites.find((site) => String(site.type) === campsiteClass);
    // ParkStay reads the class's first site before checking there is one (`utils.py:68`).
    if (!entry) return json(res, 500, {});
    if (!entry.availability.every((night) => night[0] === true)) {
      return refuse({ error: "['Campsite class unavailable for specified time period.']" });
    }
    classHolds.push({ campground, campsiteClass, site: entry.id });
    json(res, state.createBooking.status, state.createBooking.body);
  }

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const record: RecordedRequest = {
        method: req.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      requests.push(record);
      inFlight++;
      state.maxInFlight = Math.max(state.maxInFlight, inFlight);
      const answer = (): void => {
        res.on('close', () => inFlight--);
        try {
          route(req, res, record);
        } catch (error) {
          json(res, 500, { error: String(error) });
        }
      };
      if (state.delayMs > 0) setTimeout(answer, state.delayMs);
      else answer();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    endpoints: { apiBaseUrl: `${url}/api`, queueBaseUrl: url },
    requests,
    get maxInFlight() {
      return state.maxInFlight;
    },
    get queueGate() {
      return state.queueGate;
    },
    set queueGate(value) {
      state.queueGate = value;
    },
    get delayMs() {
      return state.delayMs;
    },
    set delayMs(value) {
      state.delayMs = value;
    },
    get createBooking() {
      return state.createBooking;
    },
    set createBooking(value) {
      state.createBooking = value;
    },
    get queueAnswers() {
      return state.queueAnswers;
    },
    set queueAnswers(value) {
      queueCalls = 0;
      state.queueAnswers = value;
    },
    views: state.views,
    overrides: state.overrides,
    classHolds,
    requestsTo: (prefix) => requests.filter((r) => r.path.startsWith(prefix)),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
