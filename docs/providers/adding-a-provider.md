# Adding a provider

A **provider** is a module that brings one accommodation source into WA Stay: ParkStay WA
today, RAC Parks & Resorts next, perhaps Hipcamp or a holiday-park chain later. This guide
takes you from an empty folder to a provider that shows up on Explore, in the create flows
and in Settings, with tests. You change nothing in the core services, the IPC contract or the
renderer: they find providers through the registry and read what each one can do from its
manifest.

Two worked examples run through the guide. Both are real, compiling providers in the test
tree:

- **Example Parks** (`tests/fixtures/providers/example-api/index.ts`), an **API provider**:
  JSON over `ctx.http`.
- **Example Holiday Parks** (`tests/fixtures/providers/example-browser/index.ts`), a
  **browser provider**: a website with no API, read through `ctx.browser`.

Every code block marked as coming from one of those files is a word-for-word copy of a region
of it. `tests/unit/docs/docs-sync.test.ts` fails if they drift, and
`tests/unit/docs/example-providers.test.ts` compiles both examples under the main process's
`tsconfig.json`, registers them in a fresh `ProviderRegistry`, and runs the provider contract
suite on them.

ParkStay (`src/main/providers/parkstay/`) is the full reference: an access gate, a release
policy, holds, payment and sign-in. See [the ParkStay provider](parkstay/README.md).

## Contents

- [Words](#words)
- [Before you start](#before-you-start)
- [How a provider plugs in](#how-a-provider-plugs-in)
- [1. Create the folder](#1-create-the-folder)
- [2. Write the manifest](#2-write-the-manifest)
- [3. Use the provider context](#3-use-the-provider-context)
- [4. Build the modules: an API provider](#4-build-the-modules-an-api-provider)
- [5. A browser provider](#5-a-browser-provider)
- [6. Optional modules](#6-optional-modules)
- [7. Register it](#7-register-it)
- [8. Test it](#8-test-it)
- [What the app does with it](#what-the-app-does-with-it)
- [Checklist](#checklist)

## Words

The same words are used in code, the database and the UI (architecture-notes §2):

| Word | Meaning | ParkStay |
| --- | --- | --- |
| Provider | An accommodation source module, with an id such as `parkstay` | ParkStay (DBCA) |
| Location | A bookable place shown on the map | A campground |
| Area | A location's parent grouping: park, town or region | A park, and its region |
| Unit | An individually bookable thing at a location: site, cabin, room | A campsite (or a class of sites) |
| Stay | Dates (`arrival`, `departure`, calendar dates `YYYY-MM-DD`) and party | |
| Watch | A recurring availability check that alerts | |
| Snipe | A timed attempt to hold a unit the moment it is released (Site Sniper) | |
| Hold | A temporary reservation that the person pays for on the provider's site | A 30-minute booking |
| Location key | `${providerId}:${externalId}`, unique across providers | `parkstay:20` |

## Before you start

- **Read the provider's terms of use** and record what they say about automated access in
  your module's header comment. If they forbid it, the provider can still be listed with links
  only, but not automated.
- **Prefer an API.** Open the site's network panel: many "no API" sites load their data from
  JSON endpoints `ctx.http` can call. Use browser automation only when there is none
  ([browser providers](browser-providers.md)).
- **WA Stay acts for one person**, for stays they mean to take: one account per person, one
  booking per night, holds only in their own name, payment always by the person on the
  provider's site. Your module must keep to that.
- **Be polite.** Ask for what the person's action needs, at the pace one careful person would.

## How a provider plugs in

1. Your folder exports a `ProviderFactory`, made with `defineProvider(manifest, create)`.
2. `src/main/providers/index.ts` lists it in `BUILT_IN_PROVIDERS`.
3. At start-up the composition root (`src/main/app/container.ts`) registers every factory in
   the `ProviderRegistry`. For each one the registry validates the manifest, builds the
   provider's `ProviderContext` from it, calls `create(ctx)`, and checks that every capability
   the manifest claims has its module.
4. Core services (`src/main/core/`) only ever ask the registry: `registry.withCapability('watches')`,
   `registry.require(id, 'holds')`. A capability that is not there is a typed
   `ProviderCapabilityError` (IPC code `CAPABILITY`), never a crash.
5. The renderer reads the manifests through `providers.list()` and renders generically:
   provider pickers, badges, stay fields, release modes. It contains no per-provider code.

A provider that fails to register is logged and skipped; the app starts with the others.

## 1. Create the folder

Everything specific to your provider lives in `src/main/providers/<id>/`, never in `core/`,
`shared/` or the renderer. ParkStay's layout is a good model:

```text
src/main/providers/<id>/
├── index.ts      # the manifest and the factory (defineProvider)
├── client.ts     # every request: headers, dates in the provider's format, error mapping
├── catalog.ts    # locations → LocationSummary / LocationDetail
├── availability.ts  # nights → NightStatus
├── links.ts      # the provider's own pages
└── types.ts      # raw response shapes; never exported to shared/
```

Inside `src/main/providers/<id>/` you can import the SDK as `../sdk`, as ParkStay does. The
examples live in the test tree, so they use the `@main` alias, which works in both places.

## 2. Write the manifest

The manifest says who the provider is and what it can do. It is plain data, it crosses IPC to
the renderer, and the registry validates it with `ProviderManifestSchema`
(`src/shared/types/provider.types.ts`), then freezes it.

<!-- region: tests/fixtures/providers/example-api/index.ts#api-manifest -->

```ts
export const exampleApiManifest: ProviderManifest = {
  id: 'example-api',
  name: 'Example Parks WA',
  shortName: 'Example Parks',
  description: 'Campgrounds and cabins from the Example Parks booking API.',
  website: 'https://www.example-parks.test',
  integration: 'api',
  // A coloured monogram badge: never a third-party logo. White text on it must pass AA.
  brand: { color: '#1F5A7A', monogram: 'EP' },
  locationKinds: ['campground', 'cabin', 'other'],
  timezone: 'Australia/Perth',
  currency: 'AUD',
  capabilities: {
    catalog: true,
    catalogMode: 'full',
    availability: true,
    bulkAvailability: true,
    watches: true,
    snipes: false,
    holds: false,
    bookingImport: false,
    accessGate: false,
    account: 'none',
  },
  limits: { minWatchIntervalMinutes: 30, maxConcurrentRequests: 2, catalogTtlHours: 24 },
  stayFields: [
    {
      key: 'siteType',
      label: 'Site type',
      type: 'select',
      options: [
        { value: 'any', label: 'Any' },
        { value: 'powered', label: 'Powered' },
        { value: 'unpowered', label: 'Unpowered' },
      ],
      default: 'any',
      appliesTo: ['availability', 'watch'],
    },
  ],
  // The bulk endpoint reads only the dates: a change of party or site type reuses its answer.
  bulkAvailabilityStayFields: ['arrival', 'departure'],
};
```

| Field | Rules |
| --- | --- |
| `id` | 2–32 lower-case letters, digits or hyphens, starting with a letter. It is stored in every watch, snipe, booking and notification, so it never changes. |
| `name`, `shortName` | Shown in pickers and badges. `shortName` (at most 24 characters) also prefixes desktop notifications: "Example Parks · …". |
| `description` | One line, shown in the provider step of the create flows. |
| `website` | An https URL. |
| `integration` | `api`, `browser` or `hybrid` ([choosing](browser-providers.md#choosing-api-browser-or-hybrid)). |
| `brand` | `color` as `#RRGGBB` and a `monogram` of 1–3 capitals or digits: the `ProviderBadge`. Never a third-party logo. Check that white text on the colour passes WCAG AA. |
| `locationKinds` | The `LocationKind`s your locations can have, at least one. Every location's `kind` must be one of them. |
| `timezone` | The IANA zone the provider's dates and release times are in. The context gives it to you as `ctx.timezone`. |
| `currency` | ISO 4217, e.g. `AUD`. Prices in `NightStatus.price` are in it. |
| `capabilities` | What the provider can do ([below](#capabilities)). |
| `limits` | How hard the app may use it ([below](#limits)). |
| `stayFields` | Provider-specific stay inputs ([below](#stay-fields)). |
| `releaseModes` | Site Sniper's release modes, when `capabilities.snipes` ([below](#release-modes)). |
| `bulkAvailabilityStayFields` | What bulk availability depends on ([below](#bulk-availability-stay-fields)). |

### Capabilities

Each flag turns on a part of the app. The registry refuses a provider whose flag has no module
behind it (`CONSISTENCY_RULES` and `MANIFEST_RULES` in `src/main/providers/registry.ts`).

| Capability | Needs | Turns on |
| --- | --- | --- |
| `catalog` | `catalog.getLocation`, and `listLocations` or `searchArea` per `catalogMode` | Explore's map and list, a location's detail page |
| `catalogMode` | `full`: `catalog.listLocations`; `search`: `catalog.searchArea` (and optionally `catalog.searchText`) | `full` catalogues are synced (every `catalogTtlHours`) and searched offline. `search` is for marketplaces too big to list: the catalogue service asks `searchArea` for the area Explore's map shows (all of WA without a map), at most 5 pages per area, and `searchText` for a name typed in Explore's "Where" or a location step. What it finds is stored and then works like a synced place (search, filters, the place page, availability, watches); each area or text is asked once per `catalogTtlHours`. See [Search-mode catalogues](browser-providers.md#search-mode-catalogues-catalogmode-search). |
| `availability` | `availability.check` | "Check availability" on a location's page |
| `bulkAvailability` | `availability.search` | Free-unit counts on Explore's pins and cards, "Available only" |
| `watches` | `availability.check` | The provider in Watches |
| `holds` | `holds.create` and `holds.paymentUrl` | "Hold a site automatically when found" on watches, and the payment window |
| `snipes` | `availability`, `holds` and `release`, plus at least one release mode that `release.supports()` accepts | The provider in Site Sniper |
| `bookingImport` | `bookings.get` | "Import booking" on the Bookings page |
| `accessGate` | `access` | Queue handling and the access-status chip; required by any release mode with `usesAccessGate` |
| `account` | `auth` unless `none` | A row in Settings → Accounts ([auth kinds](#auth)) |

`account` says how much the provider needs the person signed in:

| `account` | Meaning |
| --- | --- |
| `none` | No account. Settings shows "No account needed". |
| `optional` | Signing in helps (a quicker checkout) but nothing waits on it. ParkStay is `optional`, because its holds need no sign-in. |
| `required-for-holds` | Holds need it: a snipe created signed out stays paused, and a hold attempt is refused with `AUTH_REQUIRED` until the person connects. |
| `required` | Everything needs it. |

### Limits

`limits` is optional; without it the provider gets `DEFAULT_PROVIDER_LIMITS` (15, 4, 24). The
context gives the effective values as `ctx.limits`.

| Limit | What reads it |
| --- | --- |
| `minWatchIntervalMinutes` | The watch form offers no shorter interval, and the scheduler runs a shorter stored one at this interval (`core/watches/next-check.ts`). |
| `maxConcurrentRequests` | The watch loop runs at most `min(2, maxConcurrentRequests)` checks at once for the provider. **Your module enforces it for its own requests**, with `createLimiter` from the SDK, as both examples do. |
| `catalogTtlHours` | How long a synced catalogue stays fresh before the catalogue service syncs it again; for a `search` catalogue, how long an area or text search is not repeated. |

A browser provider should use `maxConcurrentRequests: 1` and generous intervals.

### Stay fields

`stayFields` are inputs a stay needs beyond dates and guests, such as gear type, vehicles or a
postcode. The renderer draws them generically (`components/stay/ProviderStayFields.tsx`);
values travel in `StayQuery.params` and are stored in `stay_params`. Main validates them
against the descriptor (type, options, `min`/`max`, `pattern`, `required`) and fills defaults
(`core/stay-params.ts`); an invalid value is a `VALIDATION` error on `stayParams.<key>`.

`appliesTo` says where the field shows: `availability` (a location's page), `watch`, `snipe`,
`hold`. Example Parks' `siteType` shows on the place page and in Watches, and its `check`
passes it on as a query parameter.

### Release modes

When `capabilities.snipes` is on, `releaseModes` describes how the provider releases dates:

```ts
interface ReleaseModeDescriptor {
  id: string; // lower case, e.g. 'daily_rollover'
  label: string; // "When new dates open"
  description: string;
  usesAccessGate: boolean; // a snipe in this mode waits in the provider's queue
  fields?: StayFieldDescriptor[]; // extra inputs this mode needs
}
```

Site Sniper shows them as choices, and the core asks your `release.computeReleaseAt({ mode,
… })` for the instant. A mode with `usesAccessGate` needs `capabilities.accessGate`.
ParkStay's modes are `daily_rollover`, `scheduled` and `cancellation`.

### Bulk availability stay fields

Bulk answers are cached by stay. `bulkAvailabilityStayFields` lists the stay fields your
`availability.search` actually reads (always both dates), so a change to anything else reuses
the cached answer instead of asking the provider again. Example Parks reads only the dates;
ParkStay reads the dates and the gear type, so changing the number of guests on Explore costs
no request.

## 3. Use the provider context

`create(ctx)` receives a `ProviderContext` (`src/main/providers/sdk/context.ts`), built from
your validated manifest. It is everything the provider gets from the app; a provider never
reaches for globals, never imports `electron`, an HTTP library, the database or the app logger.

| `ctx.` | What it is |
| --- | --- |
| `id`, `manifest`, `timezone`, `limits` | From your manifest (limits with defaults applied). |
| `http` | Your `HttpClient` ([below](#the-httpclient)). |
| `browser` | A `BrowserAutomation` that drives the installed Edge or Chrome, with your own persistent profile at `<userData>/providers/<id>/browser`. It costs nothing until first used ([browser providers](browser-providers.md)). |
| `state` | Your own key-value store (`provider_state` table, namespaced by your id). |
| `secrets` | Your encrypted secrets (`ScopedSecretVault`): ciphertext from the app's SecretVault (Electron `safeStorage`), stored in your state under `secret:<key>`, readable only by your provider. Never put a secret in `state`. |
| `logger` | A child logger tagged `{ provider: id }`. Never log cookies, tokens, form values or personal details; log URLs without query strings. |
| `clock` | The current time. Use it rather than `new Date()`, so tests can fix it. |

### The HttpClient

`ctx.http` has two implementations behind one interface (`src/main/providers/sdk/http.ts`):

- **In the app**, `ElectronSessionHttpClient`: Chromium's network stack on your session
  partition `persist:provider-<id>`. Your sign-in and payment windows use the same partition,
  so their cookies are your requests' cookies.
- **In tests**, `NodeHttpClient`: Node's `fetch` with an in-memory cookie jar.

Both behave the same:

- `request(method, url, options)`, `getJson(url)` (expects 2xx JSON) and `postForm(url, form)`
  (form-encoded, expects 2xx JSON); `withDefaults({ headers })` returns a client that adds
  headers to every request, on the same cookies.
- **https only** (plain http only to a loopback host, for tests). Anything else is refused
  before it is sent.
- **Cookies** come only from the client's cookie store (`http.cookies`); a `Cookie` header you
  set is ignored.
- **Redirects** are followed (at most 5) and the final URL reported; `redirect: 'manual'`
  returns the 3xx, `'error'` rejects.
- **Every request has a timeout** (30 s by default) and honours your `AbortSignal`.
- **Errors:** a non-2xx answer from `getJson`/`postForm` is a `ProviderHttpError` (with
  `status`), a body that is not JSON a `ProviderParseError`, a timeout a `ProviderTimeoutError`,
  no response a `ProviderHttpError` with status 0, an abort an `AbortError`. A 429 reaches the
  person as `RATE_LIMITED` and is never retried at once.

If the provider blocks library user agents, send a browser one (ParkStay's `headers.ts`). In
the app, the partition's user agent already matches Electron's Chromium.

## 4. Build the modules: an API provider

`create(ctx)` returns the provider's modules: `links` always, and a module for each capability.
An API provider talks to the provider only through `ctx.http` ([the HttpClient](#the-httpclient)).
ParkStay is the full-size example: every request goes through one client class
(`src/main/providers/parkstay/client.ts`) that adds the browser headers and the `Referer`,
converts dates to ParkStay's `YYYY/MM/DD`, caps requests in flight at the manifest's limit, and
turns the DBCA queue's page into an `AccessGateError` ([ParkStay endpoints](parkstay/endpoints.md)).
Example Parks is the same shape, small. From the top, the imports:

<!-- region: tests/fixtures/providers/example-api/index.ts#api-imports -->

```ts
import { z } from 'zod';
import {
  createLimiter,
  defineProvider,
  ProviderParseError,
  type ProviderContext,
  type ProviderFactory,
  type ProviderLinks,
} from '@main/providers/sdk';
import type { LocationDetail, LocationSummary } from '@shared/types/catalog.types';
import type {
  BulkAvailabilityEntry,
  LocationAvailability,
  LocationKind,
  NightState,
  NightStatus,
  ProviderManifest,
  StayQuery,
  UnitAvailability,
} from '@shared/types/provider.types';
import { eachNight } from '@shared/utils/calendar-date';
import { makeLocationKey } from '@shared/utils/location-key';
```

**Validate what the provider returns.** Its JSON is not a contract; a zod schema turns a
change on its side into a clear `ProviderParseError` instead of an `undefined` deep in your
mapping:

<!-- region: tests/fixtures/providers/example-api/index.ts#api-raw -->

```ts
/** What the API returns. Validated: a provider's JSON is not a contract. */
const RawPark = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  type: z.string(),
  lat: z.number(),
  lng: z.number(),
  town: z.string(),
  region: z.string().optional(),
  photos: z.array(z.string()),
  facilities: z.array(z.string()),
  siteCount: z.number().int().optional(),
});
const RawParkList = z.object({ parks: z.array(RawPark) });
const RawParkDetail = RawPark.extend({
  description: z.string().optional(),
  sites: z.array(
    z.object({ id: z.string(), name: z.string(), type: z.string(), sleeps: z.number() })
  ),
});
const RawAvailability = z.object({
  sites: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      nights: z.array(z.object({ date: z.string(), status: z.string(), price: z.number() })),
    })
  ),
});
const RawBulk = z.object({
  parks: z.array(z.object({ id: z.number().int(), free: z.number().int(), total: z.number() })),
});
type RawPark = z.infer<typeof RawPark>;
```

**Map the provider's words explicitly**, and fall back to the neutral value: an unknown kind
is `other`, an unknown night is `unknown`, never `available`. Return only the stay's own
nights, each a `YYYY-MM-DD` calendar date:

<!-- region: tests/fixtures/providers/example-api/index.ts#api-mapping -->

```ts
/** The API's words, mapped explicitly. An unknown word gets the neutral value. */
const KINDS: Record<string, LocationKind> = { campground: 'campground', cabin: 'cabin' };
const NIGHT_STATES: Record<string, NightState> = {
  open: 'available',
  booked: 'booked',
  closed: 'closed',
  'not-yet-open': 'not-released',
};

/** Only the stay's own nights, each `YYYY-MM-DD`; a night the API left out is `unknown`. */
function toNights(stay: StayQuery, raw: { date: string; status: string; price: number }[]) {
  const byDate = new Map(raw.map((night) => [night.date, night]));
  return eachNight(stay.arrival, stay.departure).map((date): NightStatus => {
    const night = byDate.get(date);
    const state = (night && NIGHT_STATES[night.status]) ?? 'unknown';
    return state === 'available' ? { date, state, price: night!.price } : { date, state };
  });
}
```

**The factory.** `defineProvider` pairs the manifest with `create`, which builds the modules
for one context:

<!-- region: tests/fixtures/providers/example-api/index.ts#api-factory -->

```ts
export function createExampleApiFactory({
  baseUrl = 'https://api.example-parks.test',
}: ExampleApiOptions = {}): ProviderFactory {
  return defineProvider(exampleApiManifest, (ctx: ProviderContext) => {
    // Every request: JSON, and no more in flight than the manifest's limit.
    const http = ctx.http.withDefaults({ headers: { Accept: 'application/json' } });
    const limit = createLimiter(ctx.limits.maxConcurrentRequests);

    async function get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
      const url = new URL(path, baseUrl).href;
      // A non-2xx answer is a ProviderHttpError, a non-JSON body a ProviderParseError.
      const body = await limit(() => http.getJson<unknown>(url, { signal }));
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new ProviderParseError({ providerId: ctx.id, url, message: `Unexpected ${path}` });
      }
      return parsed.data;
    }

    const links: ProviderLinks = {
      location: (externalId) => `https://www.example-parks.test/parks/${externalId}`,
      booking: (externalId, stay) =>
        stay
          ? `https://www.example-parks.test/book/${externalId}?from=${stay.arrival}&to=${stay.departure}`
          : `https://www.example-parks.test/book/${externalId}`,
    };

    function toSummary(raw: RawPark): LocationSummary {
      const externalId = String(raw.id);
      return {
        key: makeLocationKey(ctx.id, externalId),
        providerId: ctx.id,
        externalId,
        name: raw.name,
        kind: KINDS[raw.type] ?? 'other',
        bookingMode: 'online',
        lat: raw.lat,
        lng: raw.lng,
        area: { name: raw.town, region: raw.region },
        imageUrls: raw.photos.filter((url) => url.startsWith('https://')),
        amenities: raw.facilities,
        unitCount: raw.siteCount,
        infoUrl: links.location(externalId) ?? undefined,
        bookingUrl: links.booking(externalId) ?? undefined,
      };
    }

    return {
      links,
      catalog: {
        async listLocations(signal) {
          const { parks } = await get('/api/parks', RawParkList, signal);
          return parks.map(toSummary);
        },
        async getLocation(externalId, signal): Promise<LocationDetail> {
          const park = await get(
            `/api/parks/${encodeURIComponent(externalId)}`,
            RawParkDetail,
            signal
          );
          return {
            ...toSummary(park),
            // Raw provider HTML: main sanitises it before it crosses IPC.
            descriptionHtml: park.description,
            units: park.sites.map((site) => ({
              unitId: site.id,
              unitName: site.name,
              unitType: site.type,
              maxPeople: site.sleeps,
            })),
            fetchedAt: ctx.clock().toISOString(),
          };
        },
      },
      availability: {
        async check(externalId, stay, options = {}): Promise<LocationAvailability> {
          const siteType = stay.params?.siteType ?? 'any';
          const query = `arrival=${stay.arrival}&departure=${stay.departure}&guests=${stay.adults}&siteType=${siteType}`;
          const path = `/api/parks/${encodeURIComponent(externalId)}/availability?${query}`;
          const { sites } = await get(path, RawAvailability, options.signal);
          const wanted = options.unitIds?.length ? new Set(options.unitIds) : undefined;
          const units = sites
            .filter((site) => !wanted || wanted.has(site.id))
            .map((site): UnitAvailability => {
              const nights = toNights(stay, site.nights);
              const fullyAvailable = nights.every((night) => night.state === 'available');
              const total = fullyAvailable
                ? nights.reduce((sum, night) => sum + (night.price ?? 0), 0)
                : undefined;
              return { unitId: site.id, unitName: site.name, nights, fullyAvailable, total };
            });
          return {
            key: makeLocationKey(ctx.id, externalId),
            checkedAt: ctx.clock().toISOString(),
            units,
            bookingUrl: links.booking(externalId, stay) ?? undefined,
          };
        },
        async search(stay, signal): Promise<BulkAvailabilityEntry[]> {
          const path = `/api/availability?arrival=${stay.arrival}&departure=${stay.departure}`;
          const { parks } = await get(path, RawBulk, signal);
          return parks.map((park) => ({
            key: makeLocationKey(ctx.id, String(park.id)),
            availableUnits: park.free,
            bookableUnits: park.total,
          }));
        },
      },
    };
  });
}
```

The rules the normalised types carry (`src/shared/types/provider.types.ts`,
`catalog.types.ts`):

- **Keys.** `key` is always `makeLocationKey(ctx.id, externalId)`; use the provider's own
  stable id as `externalId`, never a position in a list.
- **`LocationSummary`** needs a `kind` from your `locationKinds`, a `bookingMode` (`online`,
  `offline`, `external` or `application`), coordinates, `imageUrls` (absolute https only) and
  `amenities` (plain words). `area`, `summary`, `unitCount`, `infoUrl` and `bookingUrl` are
  optional.
- **`LocationDetail`** adds `units` (`UnitSummary[]`), and optionally `descriptionHtml` and a
  `releaseInfo` sentence. Return the provider's HTML as you found it: main sanitises it
  (`sanitizeProviderHtml`) before it crosses IPC, and its links open in the system browser.
- **Availability.** `check` returns a `LocationAvailability`: one `UnitAvailability` per unit,
  each with one `NightStatus` per night of the stay (`available`, `booked`, `closed`,
  `not-released` or `unknown`, and `price` when known), `fullyAvailable` only when every night
  is `available`, and `total` when every night has a price. Honour `unitIds` (only those
  units) and set `bookingUrl` to a stay-specific deep link when the provider has one.
- **Dates and time zones.** Stays are calendar dates: never turn them into `Date` objects and
  back (a time zone shifts them). Convert to the provider's own format with a string
  transform, as ParkStay's `toParkStayDate` does (`2026-11-10` → `2026/11/10`). "Today" is
  today in `ctx.timezone` (`todayIn` from `@shared/utils/calendar-date`).
- **Errors** are `ProviderError`s (`src/main/providers/sdk/errors.ts`): an unknown location
  rejects (the HTTP 404 does it here), it never returns an empty result. Let an `AbortError`
  propagate.

## 5. A browser provider

Example Holiday Parks has no API, so it reads the site's pages in the person's installed Edge
or Chrome. [Browser providers](browser-providers.md) has the full detail (selectors, waiting,
politeness, bot walls, testing); here is what you need to start.

### When to choose browser automation

| Choose | When |
| --- | --- |
| HTTP (`integration: 'api'`, `ctx.http`) | The site has JSON (or plain HTML) endpoints that answer a normal request with the right headers. **Always prefer it**: faster, lighter on the person's computer and on the provider, and less fragile. ParkStay is an HTTP provider. |
| Browser automation (`integration: 'browser'`, `ctx.browser`) | There is no usable endpoint: the pages are built by scripts from data you cannot request, or the site only answers a real browser. Check the site's network panel first. |
| Both (`integration: 'hybrid'`) | Most data comes from endpoints, but one step needs a browser. |

And never when the provider's terms forbid automated access.

### The automation runtime

`ctx.browser` is a `PlaywrightBrowserAutomation` (`src/main/providers/sdk/browser-automation.ts`,
V7 #25) with one method you use, `withPage(fn, { headed?, timeoutMs?, signal? })`:

- **Lazy.** `playwright-core` is imported on the first `withPage`, so start-up, and providers that
  never automate, pay nothing for it. WA Stay bundles and downloads no browser.
- **The installed Edge or Chrome.** Channels are tried in platform order: `msedge` then `chrome`
  on Windows (Edge is on every Windows 10 and 11 machine), `chrome` then `msedge` elsewhere. The
  channel that worked is remembered in the provider's state (`browser.channel`) and tried first
  next time. Neither installed is a `BrowserUnavailableError` (`no-browser`), which the person
  sees as "WA Stay needs Microsoft Edge or Google Chrome installed to use {provider}".
- **Sandboxed.** Playwright would start Chromium with `--no-sandbox`; WA Stay always launches the
  person's browser with `chromiumSandbox: true`, because it visits third-party sites. Only a
  development `WA_STAY_BROWSER_PATH` (honoured only when the app runs from source) keeps
  Playwright's default, for CI and containers that run as root.
- **One persistent profile per provider**, at `<userData>/providers/<id>/browser`, so the
  provider's own cookies and sign-in survive between runs. It is not the person's own browser
  profile, and providers never share one. Chromium locks a profile, so a provider's `withPage`
  calls run one at a time.
- **Headless by default.** `headed: true` shows a window, for a step a person must do; the
  browser relaunches when the mode changes.
- **Lifecycle.** The browser closes after 5 minutes without a call. On quit, the quit hold
  (`src/main/app/quit-hold.ts`) hides the windows and waits up to 6 s while the registry closes
  every provider's browser (`close()` gives it 5 s, then kills it), so a profile is flushed
  rather than cut off. A `withPage` during the shutdown rejects (`closing`).
- **Sign-in by automation** would be `auth.kind: 'automation'` (`signIn(browser, signal)`). It is
  declared and validated (§12.30) but **not implemented**: the account service supports only
  `browser-session`. Until it is, a browser provider that needs an account cannot use Settings →
  Accounts' Connect.

### The example

<!-- region: tests/fixtures/providers/example-browser/index.ts#browser-imports -->

```ts
import type { Page } from 'playwright-core';
import {
  defineProvider,
  ProviderHttpError,
  type ProviderContext,
  type ProviderFactory,
  type ProviderLinks,
} from '@main/providers/sdk';
import type { LocationDetail, LocationSummary } from '@shared/types/catalog.types';
import type {
  LocationAvailability,
  LocationKind,
  NightState,
  NightStatus,
  ProviderManifest,
  UnitAvailability,
} from '@shared/types/provider.types';
import { eachNight } from '@shared/utils/calendar-date';
import { makeLocationKey } from '@shared/utils/location-key';
```

The manifest says `integration: 'browser'` and keeps the provider polite: one page at a time,
hourly at most, a catalogue that stays fresh for three days:

<!-- region: tests/fixtures/providers/example-browser/index.ts#browser-manifest -->

```ts
export const exampleBrowserManifest: ProviderManifest = {
  id: 'example-browser',
  name: 'Example Holiday Parks',
  shortName: 'Example Holiday',
  description: 'Holiday parks and cabins from the Example Holiday Parks website.',
  website: 'https://www.example-holiday.test',
  integration: 'browser',
  brand: { color: '#7A3B1F', monogram: 'EH' },
  locationKinds: ['holiday-park', 'caravan-park', 'cabin', 'other'],
  timezone: 'Australia/Perth',
  currency: 'AUD',
  capabilities: {
    catalog: true,
    catalogMode: 'full',
    availability: true,
    bulkAvailability: false,
    watches: false,
    snipes: false,
    holds: false,
    bookingImport: false,
    accessGate: false,
    account: 'none',
  },
  // A page visit costs the site far more than an API call: one page at a time, and rarely.
  limits: { minWatchIntervalMinutes: 60, maxConcurrentRequests: 1, catalogTtlHours: 72 },
};
```

**Page functions run inside the browser.** They may use only their arguments and browser
globals, never a Node variable or import, and they return plain data. Read data attributes,
roles and test ids, never CSS class names. The main process's `tsconfig.json` has no DOM types,
so the example describes the few element methods it uses:

<!-- region: tests/fixtures/providers/example-browser/index.ts#browser-read -->

```ts
/** What the park markup holds, read inside the page. */
interface RawPark {
  externalId: string;
  kind: string;
  lat: number;
  lng: number;
  name: string;
  town: string;
}

interface RawUnit {
  unitId: string;
  unitName: string;
  nights: { date: string; status: string; label: string }[];
}

/** The part of a DOM element the page functions read (main's tsconfig has no DOM types). */
interface PageElement {
  getAttribute(name: string): string | null;
  querySelector(selector: string): PageElement | null;
  querySelectorAll(selector: string): ArrayLike<PageElement>;
  readonly textContent: string | null;
}

/**
 * Runs inside the browser: it may use only its argument and browser globals, never a Node
 * variable or import. It reads data attributes and test ids, never CSS class names.
 */
function readParks(elements: PageElement[]): RawPark[] {
  const text = (root: PageElement, testId: string): string =>
    root.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
  return elements.map((el) => ({
    externalId: el.getAttribute('data-park') ?? '',
    kind: el.getAttribute('data-kind') ?? '',
    lat: Number(el.getAttribute('data-lat')),
    lng: Number(el.getAttribute('data-lng')),
    name: text(el, 'name'),
    town: text(el, 'town'),
  }));
}

/** Runs inside the browser, like `readParks`. */
function readUnits(rows: PageElement[]): RawUnit[] {
  return rows.map((row) => ({
    unitId: row.getAttribute('data-unit') ?? '',
    unitName: row.getAttribute('data-unit-name') ?? '',
    nights: Array.from(row.querySelectorAll('[data-night]')).map((cell) => ({
      date: cell.getAttribute('data-night') ?? '',
      status: cell.getAttribute('data-status') ?? '',
      label: cell.textContent?.trim() ?? '',
    })),
  }));
}
```

**Interpret in Node**, where it is easy to test:

<!-- region: tests/fixtures/providers/example-browser/index.ts#browser-mapping -->

```ts
const KINDS: Record<string, LocationKind> = {
  holiday: 'holiday-park',
  caravan: 'caravan-park',
  cabin: 'cabin',
};
const NIGHT_STATES: Record<string, NightState> = {
  vacant: 'available',
  booked: 'booked',
  closed: 'closed',
};

/** `$145.00` → 145; text without a price → undefined. Plain Node code, easy to unit test. */
function parsePrice(label: string): number | undefined {
  const match = /\$\s*([\d,]+(?:\.\d+)?)/.exec(label);
  return match ? Number(match[1].replace(/,/g, '')) : undefined;
}
```

**One unit of work per `withPage` call**, the signal passed through so an abort closes the
page, and an error page turned into an error:

<!-- region: tests/fixtures/providers/example-browser/index.ts#browser-factory -->

```ts
export function createExampleBrowserFactory({
  baseUrl = 'https://www.example-holiday.test',
}: ExampleBrowserOptions = {}): ProviderFactory {
  return defineProvider(exampleBrowserManifest, (ctx: ProviderContext) => {
    const url = (path: string): string => new URL(path, baseUrl).href;
    const parkPath = (externalId: string): string => `/parks/${encodeURIComponent(externalId)}`;

    const links: ProviderLinks = {
      location: (externalId) => url(parkPath(externalId)),
      booking: (externalId) => url(`${parkPath(externalId)}/book`),
    };

    /** Navigates, and turns an error page into an error: a page without data is not empty. */
    async function open(page: Page, path: string): Promise<void> {
      const response = await page.goto(url(path), { waitUntil: 'domcontentloaded' });
      const status = response?.status() ?? 0;
      if (status < 200 || status >= 300) {
        throw new ProviderHttpError({ providerId: ctx.id, status, url: url(path) });
      }
    }

    function toSummary(raw: RawPark): LocationSummary {
      return {
        key: makeLocationKey(ctx.id, raw.externalId),
        providerId: ctx.id,
        externalId: raw.externalId,
        name: raw.name,
        kind: KINDS[raw.kind] ?? 'other',
        bookingMode: 'online',
        lat: raw.lat,
        lng: raw.lng,
        area: { name: raw.town },
        imageUrls: [],
        amenities: [],
        infoUrl: links.location(raw.externalId) ?? undefined,
      };
    }

    return {
      links,
      catalog: {
        // One unit of work per withPage call; the signal closes the page when it aborts.
        listLocations: (signal) =>
          ctx.browser.withPage(
            async (page) => {
              await open(page, '/parks');
              return (await page.$$eval('[data-park]', readParks)).map(toSummary);
            },
            { signal }
          ),
        getLocation: (externalId, signal) =>
          ctx.browser.withPage(
            async (page): Promise<LocationDetail> => {
              await open(page, parkPath(externalId));
              const [park] = await page.$$eval('main[data-park]', readParks);
              const units = await page.$$eval('[data-unit]', (items) =>
                items.map((item) => ({
                  unitId: item.getAttribute('data-unit') ?? '',
                  unitName: item.textContent?.trim() ?? '',
                }))
              );
              return { ...toSummary(park), units, fetchedAt: ctx.clock().toISOString() };
            },
            { signal }
          ),
      },
      availability: {
        check: (externalId, stay, options = {}) =>
          ctx.browser.withPage(
            async (page): Promise<LocationAvailability> => {
              const query = `arrival=${stay.arrival}&departure=${stay.departure}&guests=${stay.adults}`;
              await open(page, `${parkPath(externalId)}/availability?${query}`);
              const rows = await page.$$eval('tr[data-unit]', readUnits);
              const wanted = options.unitIds?.length ? new Set(options.unitIds) : undefined;
              const units = rows
                .filter((row) => !wanted || wanted.has(row.unitId))
                .map((row): UnitAvailability => {
                  const byDate = new Map(row.nights.map((night) => [night.date, night]));
                  // Only the stay's nights, whatever else the page shows.
                  const nights = eachNight(stay.arrival, stay.departure).map(
                    (date): NightStatus => {
                      const night = byDate.get(date);
                      const state = (night && NIGHT_STATES[night.status]) ?? 'unknown';
                      const price = state === 'available' ? parsePrice(night!.label) : undefined;
                      return { date, state, ...(price !== undefined ? { price } : {}) };
                    }
                  );
                  const fullyAvailable = nights.every((night) => night.state === 'available');
                  return { unitId: row.unitId, unitName: row.unitName, nights, fullyAvailable };
                });
              return {
                key: makeLocationKey(ctx.id, externalId),
                checkedAt: ctx.clock().toISOString(),
                units,
              };
            },
            { signal: options.signal }
          ),
      },
    };
  });
}
```

The browser profile (`<userData>/providers/<id>/browser`) keeps the provider's own cookies and
sign-in between runs. It is a different cookie jar from `ctx.http`'s session partition: a
`hybrid` provider must not assume a sign-in in one is visible to the other.

## 6. Optional modules

Add these when the capability needs them. Their interfaces are in
`src/main/providers/sdk/provider.ts`; ParkStay implements every one.

### Access gate

A waiting room or virtual queue in front of the provider (`capabilities.accessGate`). ParkStay:
`queue/access-gate.ts`.

```ts
interface AccessGate {
  readonly waitingRoomOrigins?: readonly string[]; // e.g. ['https://queue.dbca.wa.gov.au']
  status(): AccessStatus; // idle | waiting (position, eta) | active (expiresAt) | expired | error
  ensure(options?: { signal?: AbortSignal; maxWaitMs?: number }): Promise<AccessStatus>;
  holdOpen(): () => void; // keeps the session alive until the release is called (ref-counted)
  onStatus(listener: (status: AccessStatus) => void): () => void;
  dispose(): void;
}
```

- When a request meets the gate, throw `AccessGateError`; the app reports `ACCESS_GATE` and
  shows the queue state.
- `waitingRoomOrigins` are the waiting room's top-level https origins (or
  `https://*.<domain>` patterns). A sign-in or payment window that passes through one is sent
  back to the page it was opened for when the waiting room lets the person through to the
  provider's home page.
- Status reaches the renderer only as `providers.accessStatus(id)` and the
  `provider:access-status` event. The registry disposes the gate on quit.

### Release policy

When dates become bookable, for Site Sniper (`release`). ParkStay: `release-policy.ts`.

- `supports(mode)` must accept every `releaseModes` id (the registry checks it).
- `computeReleaseAt({ mode, externalId, stay, params, requestedAt, now, signal })` returns the
  instant the stay opens, or `null` for "poll continuously" (a cancellation mode).
- `describe(externalId)` returns a sentence for the location's page, such as "Bookings open
  180 days ahead at 2:00 am AWST".
- `pollFloorMs: { window, continuous }` are the fastest the core may poll inside a release
  window and continuously. Pick them for the provider's capacity, not yours.

### Holds

A temporary reservation the person pays for (`holds`). ParkStay: `holds.ts`.

- `create({ externalId, unitId?, unitGroupId?, stay }, signal)` returns a `HoldSuccess`
  (`reference`, `expiresAt`, `unitId`) or a `HoldFailure` with a reason (`taken`,
  `in-progress`, `auth-required`, `closed`, `invalid`, `error`). A refusal is a result, not a
  rejection. The core's night guard has already made sure the person holds nothing else for
  those nights.
- `paymentUrl(hold)` is where the person pays; the app opens it in a payment window on your
  partition, after `access.ensure()` when you have a gate.
- `paymentOrigins` are the top-level origins the payment window may visit (sub-frames are not
  restricted, for card and 3-D Secure frames).
- `bookedReference(hold, page)` decides whether a page the payment window loaded is **this**
  hold's confirmation, using only `page.url` and `page.hasText(text)` (the browser's
  find-in-page; nothing runs in the page). Return the booking reference to record, or `null`.
  Without it the app cannot tell when a payment completes. Be strict: ParkStay requires its
  `/success/` page with this hold's hash and its booking number on the page.
- Never place a real hold in a test or a trial run (architecture-notes §12.33). Use fixtures.

### Bookings

`bookings.get(reference)` (and `list`) return `ExternalBooking`s, for "Import booking"
(`capabilities.bookingImport`). `links.manageBooking(reference)` gives "Manage on {shortName}"
on a booking.

### Auth

Required unless `capabilities.account` is `none`. `auth.isSignedIn(http, signal)` asks the
provider, with your partition's cookies, and returns `signed-in` (with email and name),
`signed-out`, or `unknown` with a reason when the answer was not definite (a queue, a 5xx, no
network). The app keeps the last definite answer.

| `kind` | How the person signs in | Status |
| --- | --- | --- |
| `browser-session` | On the provider's own pages, in an app window on your partition: `signInUrl`, `allowedOrigins` (every top-level https origin of the flow, identity provider and queue included), `completionUrlPatterns` (pages that mean "probably done"; the app confirms with `isSignedIn`). | Implemented (V6). ParkStay uses it ([sign-in](parkstay/authentication.md)). |
| `credentials` | The app asks for `fields` (`AccountFieldDescriptor`, secret ones kept in `ctx.secrets`) and calls `signIn(values, http)`. | Declared and validated; the account service does not implement it yet. |
| `automation` | `signIn(browser)` signs in through browser automation ([above](#the-automation-runtime)). | Declared and validated only (§12.30); the account service does not implement it. |

### Links and dispose

`links.location(externalId)` and `links.booking(externalId, stay?)` are required (return
`null` when there is no page); they must be absolute https URLs. `dispose()` is called on quit,
after the access gate's; the registry also closes your browser.

## 7. Register it

Add the factory to `BUILT_IN_PROVIDERS` in `src/main/providers/index.ts`: one line.

<!-- region: tests/fixtures/providers/example-api/index.ts#api-register -->

```ts
/** What `src/main/providers/index.ts` would list: `[parkstayFactory, exampleApiFactory]`. */
export const exampleApiFactory = createExampleApiFactory();
```

```ts
export const BUILT_IN_PROVIDERS: readonly ProviderFactory[] = [parkstayFactory, exampleFactory];
```

At start-up `registry.register(factory, makeContext)` checks, in order: the id (valid, not
taken), the manifest (schema, then the flag rules), the context, the provider's links and
`auth`, and a module behind every capability. Any failure is a `ProviderRegistrationError`
naming the provider and the rule; `registerBuiltInProviders` logs it and starts the app
without that provider.

## 8. Test it

### Fixtures and a fresh registry

Record a few of the provider's public responses (anonymously, politely, trimmed, with no
personal data) and serve them from a loopback server. `createTestProviderContext`
(`tests/utils/fake-provider.ts`) builds a context with a `NodeHttpClient`, in-memory state, a
fake secret vault and a fixed clock:

<!-- region: tests/unit/docs/example-providers.test.ts#test-api -->

```ts
// A fresh registry, a test context (NodeHttpClient, in-memory state, a fixed clock) and
// the provider pointed at the loopback server that serves the JSON fixtures.
const registry = new ProviderRegistry();
const factory = createExampleApiFactory({ baseUrl: server.baseUrl });
registry.register(factory, (manifest) => createTestProviderContext(manifest));
provider = registry.require('example-api', 'bulkAvailability');
```

Then test the mapping: normalised `LocationSummary`s, `NightStatus`es with `YYYY-MM-DD` dates
and only the stay's nights, unknown words read as `unknown`, an unknown location as a
`ProviderError`, the limiter.

### The contract suite

`describeProviderContract` (`tests/utils/provider-contract.ts`) is the conformance suite every
provider runs: a valid manifest, a module behind every capability, keys that round-trip, every
module honouring `AbortSignal`, `ProviderError`s for failures, https links, and registration in
a `ProviderRegistry`. Modules the provider lacks are skipped:

<!-- region: tests/unit/docs/example-providers.test.ts#test-contract -->

```ts
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
```

### A browser provider without a browser

Unit tests never start a browser. Give the context the fake browser from
`tests/utils/fake-browser.ts`: its pages load your fixture site into jsdom and run the site's
scripts, so your real page code runs against it. Pass `openPages` to the contract suite so it
checks that no call leaves a page open:

<!-- region: tests/unit/docs/example-providers.test.ts#test-fake-browser -->

```ts
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
```

For launch failures, crashes and a locked profile, mock `playwright-core` with
`tests/utils/fake-playwright.ts` and build the context with `createPlaywrightTestProviderContext`;
for a real-browser smoke test against a loopback site see
[browser providers](browser-providers.md#the-real-browser-smoke-test).

### The Electron smoke tests

The Electron smoke tests (`tests/e2e`) run the built app in network-free fixture mode: every
provider's `HttpClient` is a `FixtureHttpClient` that answers from
`tests/e2e/fixtures/http/<id>/manifest.json`. A provider with no folder there answers every
request with an error, so add your provider's recorded responses there if a journey shows its
locations ([tests/README.md](../../tests/README.md)).

## What the app does with it

Once registered, with no other change:

- **Explore** syncs a `full` catalogue (every `catalogTtlHours`), or searches a `search` one
  by the map's area as it moves, indexes it for search (FTS5), and shows its locations on the
  map and in the list with the provider's badge, the Provider, Type, Region and Facilities
  filters, and, with `bulkAvailability`, free counts for the chosen dates.
- **A location's page** shows the detail (cached for 6 hours), "Check availability" with your
  stay fields, the provider's links, and the create actions the capabilities allow.
- **Watches and Site Sniper** list the provider in their first step when it has the
  capability, with its stay fields and release modes.
- **Settings → Accounts** shows its row and sign-in.
- **Notifications** name the provider; desktop titles start with its `shortName`.

## Checklist

- [ ] Terms of use read; automated access allowed; noted in the module header.
- [ ] `id` final (it is stored in user data); `shortName` at most 24 characters.
- [ ] Brand colour with an AA-contrast white monogram; no third-party logo anywhere.
- [ ] `timezone` set; dates handled as `YYYY-MM-DD` strings; "today" in the provider's zone.
- [ ] `currency` set; prices in it.
- [ ] `limits` set for the provider's capacity; requests limited with `createLimiter`.
- [ ] Every capability has its module, and nothing is claimed that is not built.
- [ ] Raw responses validated; words mapped explicitly; unknown is never `available`.
- [ ] Only https image URLs; HTML left for main to sanitise.
- [ ] Every module honours its `AbortSignal`; failures are `ProviderError`s.
- [ ] No cookies, tokens or personal details in logs, fixtures or errors.
- [ ] Factory added to `BUILT_IN_PROVIDERS`; contract suite and mapping tests pass.
- [ ] No real hold, booking or payment in any test or trial run.
