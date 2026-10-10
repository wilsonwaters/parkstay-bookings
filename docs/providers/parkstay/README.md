# ParkStay WA provider

ParkStay WA is DBCA's booking system for campgrounds in Western Australia's national parks,
and WA Stay's first provider. Everything DBCA-specific lives in
`src/main/providers/parkstay/`; the rest of the app reaches it only through the provider SDK
and the registry ([provider guide](../adding-a-provider.md)).

- [Endpoints](endpoints.md): what the module requests, verification status, the availability
  tuple, the DBCA queue, holds and payment.
- [Sign-in](authentication.md): the in-app sign-in window and the signed-in check.

## Manifest

`parkstayManifest` in `src/main/providers/parkstay/index.ts`:

| Field | Value |
| --- | --- |
| `id`, `name`, `shortName` | `parkstay`, ParkStay WA, ParkStay |
| `integration` | `api` (JSON endpoints through `ctx.http`; no browser automation) |
| `brand` | `#2F5D50` with the monogram `PS` (no DBCA logo) |
| `locationKinds` | campground, holiday-park, caravan-park, cabin, hut, glamping, farm-stay, other |
| `timezone`, `currency` | `Australia/Perth`, `AUD` |
| `limits` | watches every 15 min at most, 4 requests in flight, catalogue fresh for 24 h |
| `stayFields` | `gearType` "Camping with" (Any, Tent, Campervan, Caravan; watches and snipes), `numVehicles` "Vehicles" 0–5 (snipes and holds), `postcode` (four digits; snipes and holds) |
| `bulkAvailabilityStayFields` | `arrival`, `departure`, `equipment`, `params.gearType`: the bulk view ignores the party, so changing guests reuses its answer |
| `releaseModes` | `daily_rollover` "When new dates open" and `scheduled` "At a scheduled time" (both through the DBCA queue), `cancellation` "When someone cancels" |

| Capability | | Module |
| --- | --- | --- |
| `catalog` (`catalogMode: 'full'`) | yes | `catalog.ts`: all 169 campgrounds from `campground_map`; a detail from the availability view |
| `availability` | yes | `availability.ts`: one campground's sites night by night, with prices |
| `bulkAvailability` | yes | `availability.ts`: every campground's free-site count for a stay, for Explore's pins |
| `watches` | yes | uses `availability` |
| `snipes` | yes (Site Sniper is marked "coming soon") | `release-policy.ts` + `holds.ts` + the queue |
| `holds` | yes | `holds.ts`: 30-minute `create_booking` holds and the payment page |
| `accessGate` | yes | `queue/`: the DBCA virtual queue |
| `bookingImport` | no | bookings are added by hand; "Manage on ParkStay" links to `/mybookings/` |
| `account` | `optional` | `auth.ts` ([sign-in](authentication.md)) |

## Releases

`ParkStayReleasePolicy` (`release-policy.ts`) tells Site Sniper when a stay becomes bookable:

- **Daily rollover.** Each campground takes bookings `max_advance_booking` days ahead (180).
  A new arrival date opens every day at the campground's own release time, Perth time
  (`api.py:1358-1372`): Bungarra's is 2:00 am. The time is read from the availability view and
  kept in the provider state (`release.time.<id>`); until it is known, midnight is assumed.
- **Scheduled.** Dates released in blocks, such as the Ningaloo coast's, at a time the person
  sets. The suggested default is the next first Tuesday of a month at 10:00 am AWST; DBCA can
  change it, so it is never hard-coded.
- **Cancellation.** No release: poll continuously, at a polite floor.

## Data and images

Campground data and photos are fetched live from ParkStay's public endpoints and image URLs
at runtime, and never redistributed. The catalogue is cached in the local database
(`locations`) and synced at most once a day; a location's detail is cached for 6 hours.
Provider HTML (`long_description`) is sanitised in the main process before it reaches the
window, and links in it open in the system browser.

## DBCA's terms

WA Stay follows DBCA's booking terms, and so must its users:

- one account per person, and bookings in the name of someone who will stay;
- one booking per night (WA Stay's night guard refuses a second hold for a night already held
  by a snipe or a watch);
- genuine intent: hold only what you will use;
- no booking for others, no transfer or resale;
- payment is always completed by the person, on ParkStay's own pages.

## Tests

- `tests/unit/providers/parkstay/`: each module against the loopback fixture server
  (`tests/utils/parkstay-fixture-server.ts`), which serves the trimmed live samples in
  `tests/fixtures/parkstay/` and behaves as the DBCA backend does where tests depend on it
  (HTTP 500 without the Referer or with `YYYY-MM-DD` dates, the queue's redirect page).
- `tests/integration/parkstay-provider-contract.test.ts`: the provider contract suite.
- `tests/unit/providers/parkstay-manifest.test.ts`: the manifest.
- `npm run test:electron`: the module on the production transport (`ElectronSessionHttpClient`),
  still against the loopback server.
- The Electron smoke tests (`tests/e2e`) use recorded responses in `tests/e2e/fixtures/http/parkstay/`.

No test or agent run ever places a real hold, booking or payment on ParkStay; live checks
are anonymous, read-only and a handful of requests.
