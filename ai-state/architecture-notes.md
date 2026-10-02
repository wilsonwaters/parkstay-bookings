# Architecture Notes — WA Stay (binding for all streams)

These are front-loaded decisions. Planning and implementation agents must conform to them. To change one, raise it in OPEN-QUESTIONS.md. Do not drift.

## 1. Target source layout

```
src/
├── main/
│   ├── app/                 # composition root & Electron shell concerns
│   │   ├── container.ts     # builds every service once; the only place `new` is called for services
│   │   ├── main-window.ts   # BrowserWindow creation, CSP, window-open/navigation guards
│   │   ├── single-instance.ts
│   │   └── paths.ts         # userData / db path resolution (WA Stay), legacy paths
│   ├── core/                # provider-agnostic domain services (no provider-specific code)
│   │   ├── catalog/         # LocationCatalogService (sync, search, detail, bulk availability)
│   │   ├── watches/         # WatchService
│   │   ├── snipes/          # SiteSniperService (generic orchestration; release rules come from provider)
│   │   ├── bookings/        # BookingService
│   │   ├── accounts/        # ProviderAccountService (sign-in windows, status)
│   │   └── notifications/   # NotificationService, NotificationDispatcher, notifiers/ (email-smtp, …)
│   ├── providers/
│   │   ├── sdk/             # AccommodationProvider interface, ProviderContext, HttpClient, BrowserAutomation, errors
│   │   ├── registry.ts      # ProviderRegistry (register, get, list manifests, capability queries)
│   │   ├── index.ts         # registers built-in providers: [parkstay]
│   │   └── parkstay/        # ParkStay module — everything DBCA/ParkStay-specific lives here
│   │       ├── index.ts     # manifest + factory
│   │       ├── client.ts    # HTTP calls (dates YYYY/MM/DD, Referer, browser UA)
│   │       ├── catalog.ts   # /api/campground_map/ → ProviderLocation[]
│   │       ├── availability.ts  # bulk + per-campground availability → normalised NightStatus
│   │       ├── queue/       # DBCA virtual queue (access gate)
│   │       ├── release-policy.ts # daily rollover / scheduled / cancellation
│   │       ├── holds.ts     # /api/create_booking temporary hold + payment hand-off URL
│   │       ├── auth.ts      # browser-session sign-in definition
│   │       └── types.ts     # raw ParkStay response types (never exported to shared/)
│   ├── database/
│   │   ├── connection.ts    # ONLY place for schema + migrations (CLAUDE.md rule)
│   │   └── repositories/    # one BaseRepository style: injected `Database`, parameterised SQL only
│   ├── ipc/
│   │   ├── handle.ts        # typed handle(channel, zodSchema, fn) + sender validation + APIResponse mapping
│   │   └── handlers/        # one file per namespace
│   ├── scheduler/           # JobScheduler (watch cron + precise snipe timers)
│   ├── security/            # SecretVault (safeStorage), legacy decryptors
│   ├── migration/           # legacy-install.ts (ParkStay Bookings → WA Stay first-run migration)
│   └── utils/               # logger, dates (calendar-date helpers), etc.
├── preload/                 # bundled & sandboxed; exposes window.api (typed from shared contract)
├── renderer/
│   ├── app/                 # App shell, routes, top navigation, providers/query client
│   ├── api/                 # React Query hooks wrapping window.api (the only place window.api is touched)
│   ├── components/ui/       # design-system primitives (Button, Dialog, Field, ProviderBadge, …)
│   ├── components/          # shared domain components (LocationCard, AvailabilityGrid, …)
│   ├── features/            # explore/, watches/, snipes/, bookings/, settings/, notifications/
│   └── styles/
└── shared/
    ├── contracts/           # IPC contract: channel names + request/response types + zod schemas per namespace
    ├── types/               # domain types (provider.types.ts, catalog.types.ts, watch.types.ts, …)
    ├── constants/
    └── utils/               # pure helpers shared by both sides (calendar dates, formatting)
```

Existing files move into this layout as their stream touches them. Do not leave a duplicate behind: move, update imports, delete the old file.

## 2. Vocabulary (use these words in code, DB and UI)

| Term | Meaning | ParkStay mapping |
|---|---|---|
| **Provider** | An accommodation source module (`parkstay`, later `rac`, `airbnb`, …) | ParkStay (DBCA) |
| **Location** | A bookable place shown on the map: campground, holiday park, property | Campground |
| **Area** | The parent grouping of a location: park, town or region | Park (+ district/region) |
| **Unit** | An individually bookable thing at a location: site, cabin, room | Campsite |
| **Stay** | The dates and party: `arrival`, `departure` (calendar dates `YYYY-MM-DD`), guests | — |
| **Watch** | Recurring availability check with notifications | same |
| **Snipe** | Timed attempt to hold a unit the instant it is released ("Site Sniper" in UI) | same |
| **Hold** | Temporary reservation pending payment on the provider's site | 30-min ParkStay hold |
| **Notifier** | Outbound notification channel (email SMTP, …). Was "notification provider". | — |
| **Location key** | `${providerId}:${externalId}`, the globally unique location id | `parkstay:123` |

## 3. Provider SDK contract (V1 implements; everyone codes against it)

```ts
// shared/types/provider.types.ts  (serialisable — crosses IPC)
type ProviderId = string;                     // validated against the registry; never a hard-coded union
interface ProviderManifest {
  id: ProviderId;                             // 'parkstay'
  name: string;                               // 'ParkStay WA'
  shortName: string;                          // 'ParkStay'
  description: string;                        // one line, shown in provider pickers
  website: string;                            // https://parkstay.dbca.wa.gov.au
  integration: 'api' | 'browser' | 'hybrid';
  brand: { color: string; monogram: string }; // ProviderBadge: coloured monogram (no third-party logos)
  locationKinds: LocationKind[];              // e.g. ['campground']
  timezone: string;                           // 'Australia/Perth'
  capabilities: ProviderCapabilities;
}
interface ProviderCapabilities {
  catalog: boolean;            // listLocations → shows on Explore map
  availability: boolean;       // check availability for one location + stay
  bulkAvailability: boolean;   // availability for many locations in one call (map pins)
  watches: boolean;            // usable in Watches
  snipes: boolean;             // usable in Site Sniper (requires release policy + holds)
  holds: boolean;
  bookingImport: boolean;
  account: 'none' | 'optional' | 'required-for-holds' | 'required';
}
type LocationKind = 'campground' | 'caravan-park' | 'holiday-park' | 'cabin' | 'hut' | 'glamping' | 'farm-stay' | 'home' | 'other';
type BookingMode = 'online' | 'offline' | 'external' | 'application';
interface LocationSummary {
  key: string; providerId: ProviderId; externalId: string;
  name: string; kind: LocationKind; bookingMode: BookingMode;
  lat: number; lng: number;
  area?: { name: string; region?: string };
  summary?: string; imageUrls: string[]; amenities: string[];
  unitCount?: number; infoUrl?: string; bookingUrl?: string;
}
interface LocationDetail extends LocationSummary {
  descriptionHtml?: string;   // sanitised in main before crossing IPC
  units: UnitSummary[];
  releaseInfo?: string;       // human sentence, e.g. "Bookings open 180 days ahead at midnight AWST"
}
interface StayQuery { arrival: string; departure: string; adults: number; children?: number; infants?: number; concessions?: number; equipment?: string }
type NightState = 'available' | 'booked' | 'closed' | 'not-released' | 'unknown';
interface NightStatus { date: string; state: NightState; price?: number; label?: string }
interface UnitAvailability { unitId: string; unitName: string; unitType?: string; nights: NightStatus[]; fullyAvailable: boolean; total?: number }
interface LocationAvailability { key: string; checkedAt: string; units: UnitAvailability[]; release?: { opensAt?: string; open: boolean } }
interface BulkAvailabilityEntry { key: string; availableUnits: number; bookableUnits: number }
```

```ts
// main/providers/sdk/provider.ts  (main-process only)
interface AccommodationProvider {
  readonly manifest: ProviderManifest;
  catalog?: { listLocations(signal?): Promise<LocationSummary[]>; getLocation(externalId, signal?): Promise<LocationDetail> };
  availability?: { check(externalId, stay, opts?: { unitIds?: string[]; signal? }): Promise<LocationAvailability>;
                   search?(stay, signal?): Promise<BulkAvailabilityEntry[]> };
  access?: AccessGate;          // waiting room / virtual queue (ParkStay: DBCA queue)
  release?: ReleasePolicy;      // when units for a date become bookable (ParkStay: 180-day rollover, Ningaloo)
  holds?: { create(req: HoldRequest, signal?): Promise<HoldResult>; paymentUrl(hold: HoldResult): string };
  bookings?: { list?(): Promise<ExternalBooking[]>; get?(reference): Promise<ExternalBooking> };
  auth?: ProviderAuth;          // { kind: 'browser-session'; signInUrl; isSignedIn(session): Promise<AccountStatus>; accountLabel?(...) }
  links: { location(externalId): string | null; booking(externalId, stay?): string | null };
  dispose?(): Promise<void>;
}
type ProviderFactory = (ctx: ProviderContext) => AccommodationProvider;
interface ProviderContext {
  id: ProviderId;
  http: HttpClient;             // bound to Electron session partition `persist:provider-<id>`; cookies shared with sign-in + payment windows
  browser: BrowserAutomation;   // lazy playwright-core (installed Edge/Chrome), persistent profile at userData/providers/<id>/browser
  state: KeyValueStore;         // provider_state table, namespaced by provider
  secrets: ScopedSecretVault;   // safeStorage-backed, namespaced by provider
  logger: Logger;               // child logger { provider: id }
  clock: () => Date;
}
```

- `HttpClient` is an interface with two implementations. `ElectronSessionHttpClient` is used in production (`session.fromPartition('persist:provider-<id>').fetch`, verified available in Electron 28). `NodeHttpClient` is used in tests and has an in-memory cookie jar. Provider code never imports `electron` or `axios` directly.
- Core services only ever do `registry.get(providerId)` and check `manifest.capabilities` or the presence of the optional module. A missing capability is a typed `ProviderCapabilityError`, never a crash.
- Adding a provider = create `src/main/providers/<id>/`, export a factory, and add one line to `providers/index.ts`. No changes to core, IPC or renderer.

## 4. IPC / preload surface (renderer sees only this)

`window.api` namespaces. Each method returns `Promise<APIResponse<T>>` and request payloads are zod-validated in main.

| Namespace | Methods (indicative) |
|---|---|
| `providers` | `list()` → `ProviderManifest[]`; `accessStatus(id)` |
| `catalog` | `search(CatalogQuery)` → `{ items: LocationSummary[], total }`; `get(key)` → `LocationDetail`; `availability(stay, { providerIds?, bbox? })` → `BulkAvailabilityEntry[]`; `checkLocation(key, stay)` → `LocationAvailability`; `refresh(providerId?)`; `status()` |
| `accounts` | `list()` → `ProviderAccount[]`; `signIn(providerId)` (opens in-app window, resolves when signed in or closed); `signOut(providerId)`; `status(providerId)` |
| `watches` | `list(filter?: { providerId? })`, `get`, `create`, `update`, `delete`, `activate`, `deactivate`, `runNow` |
| `snipes` | `list(filter?)`, `get`, `create`, `update`, `delete`, `activate`, `deactivate`, `runNow`, `openPayment(id)` |
| `bookings` | `list(filter?)`, `get`, `create`, `update`, `delete`, `import(providerId, reference)` |
| `notifications` | `list`, `markRead`, `markAllRead`, `delete`, `clearAll`, `unreadCount` |
| `notifiers` | email/SMTP notifier config (was `notificationProvider`). Secrets are write-only and return `hasPassword: boolean`. |
| `gmail` | OAuth connect/disconnect/status (no inbox reads exposed) |
| `settings`, `app`, `updater` | as today, cleaned up |
| `events` | `on(event, cb)` → `unsubscribe()`. Events: `notification:created`, `watch:updated`, `snipe:updated`, `booking:updated`, `catalog:updated`, `provider:access-status`, `account:updated`, `updater:*` |

- `userId` is never passed from the renderer. Main resolves the single local profile.
- Secrets never cross to the renderer.
- Channel names live in `shared/contracts/`. The preload is generated or typed from the same contract, so the renderer and main cannot drift.

## 5. Data model (migrations in `connection.ts`)

- **v7 (P2): integrity.** Rebuild `notification_delivery_logs` with an FK to `notifications`. Drop the `notifications` CHECK constraints (validate in code). Drop the dead `skip_the_queue_entries` table and trigger. Wrap migrations in transactions. Add a `PRAGMA foreign_key_check` assertion in tests.
- **v8 (V2): provider-aware.**
  - `watches`, `site_snipes` and `bookings` gain `provider_id TEXT NOT NULL DEFAULT 'parkstay'` and generic location columns (`location_external_id`, `location_name`, `area_name`, `unit_ids` JSON, `stay_params` JSON for provider-specific extras such as gear type and postcode). Existing ParkStay columns map into these with no data loss.
  - `bookings` becomes unique on `(provider_id, booking_reference)`.
  - `notifications` gains nullable `provider_id`.
  - New `provider_accounts(provider_id PK, status, display_name, email, last_signed_in_at, created_at, updated_at)`. The existing `users` row migrates into the `parkstay` account; the profile (name, phone) is kept.
  - New `provider_state(provider_id, key, value JSON, updated_at, PK(provider_id,key))`. `queue_session` migrates into it.
  - New `locations(provider_id, external_id, name, kind, booking_mode, lat, lng, area_name, region, summary, description_html, image_urls JSON, amenities JSON, unit_count, info_url, booking_url, raw JSON, fetched_at, PK(provider_id, external_id))` plus an FTS5 `locations_fts(name, area_name, region, summary)`.
  - Calendar dates are stored as `YYYY-MM-DD` text.
- Migrations must be idempotent, transactional, and covered by a test that starts from a real v6 database fixture.

## 6. Upgrade path (B-stream)

- `appId` stays `com.parkstay.bookings`. `productName` becomes `WA Stay` and package `name` becomes `wa-stay`.
- `app.setPath('userData', <appData>/WA Stay)` is called before `ready`. On first run, if the new DB is absent and the legacy `<appData>/parkstay-bookings/parkstay.db` exists, it is copied with better-sqlite3 `backup()` to `<userData>/wa-stay.db`. `gmail-oauth.json` is copied too. A `migration.json` marker is written. The legacy folder is left untouched.
- The installer removes legacy `WA ParkStay Bookings` shortcuts. Uninstall data cleanup targets `WA Stay`.
- Auto-launch is re-registered under the new name and the legacy entry is removed.
- Publish target is `wilsonwaters/wa-stay`. v1 clients reach it through GitHub's rename redirect.

## 7. Security baseline (P-stream)

- `sandbox: true` with a bundled preload, `contextIsolation: true`, a CSP (dev and prod variants), a `setWindowOpenHandler` that denies and opens http(s) links via `shell.openExternal`, `will-navigate` blocking, single-instance lock, and IPC sender-frame validation.
- Provider sign-in and payment windows use the provider partition, have no preload and no node integration, and are restricted to the provider's origins plus its identity provider.
- Secrets live in `SecretVault` (`safeStorage`, versioned envelope). Legacy PBKDF2 ciphertexts are decrypted once and re-encrypted.

## 8. Renderer conventions

- Data access goes only through `renderer/api/*` hooks (React Query). Components never call `window.api` directly.
- UI is built only from `components/ui` primitives and design tokens (no raw hex, no `bg-blue-600`).
- Icons come from `lucide-react` (stroke 1.75). No emoji as icons.
- Every list or detail item for a watch, snipe, booking, notification or location renders a `<ProviderBadge providerId>`.
- Create flows start with a **provider step** that lists `providers.list()` filtered by the capability the flow needs. If exactly one provider qualifies it is pre-selected but still shown.
- Navigation: **Explore** (home `/`), **Watches**, **Site Sniper** (Soon pill), **Bookings** (Soon pill), then **Settings** in the account menu. No login gate.
- Tests assert behaviour, roles and accessible names, never CSS class names.

## 9. Design direction (D1 elaborates in `docs/design/`)

- **Reference:** Airbnb's calm, photo-first layout, a centred search pill, and map plus list split. The WA mood comes from the stakeholder's tourism mark: **Indian Ocean blue** brushstroke, **sun gold**, **black-swan ink**, **coral** beak. Add warm **sand** neutrals and **eucalypt** green for "available".
- **Not AI-looking:** no purple/indigo gradients, no glassmorphism, no emoji, no rainbow buttons, no generic three-feature-card heroes. Use one accent CTA colour, generous whitespace, real photography, restrained motion, and a distinctive but sparing hand-drawn brushstroke motif (e.g. under the active nav item and in the logo).
- **Type:** **Figtree** for UI and **Fraunces** for display, used sparingly (page heroes, location names). Both are bundled locally with `@fontsource-variable` so the app works offline.
- **Contrast:** AA minimum. Coral for text or small UI must use a darkened shade.
- **Logo:** original. Never reproduce the WA Tourism Commission swan.

## 10. Dependencies (installed on the feature branch in commit `chore(deps)`; don't re-add)

- **Runtime (`dependencies`):**
  - `playwright-core@1.56.1`: browser automation runtime, no bundled browsers. It is pinned because Electron 28 runs Node 18 and newer releases need Node 20 or later.
  - `sanitize-html@^2.17`: the main process sanitises provider HTML before it crosses IPC. 2.18 and later need Node 22 or later.
- **Renderer, bundled by Vite (`devDependencies`, following the `@tanstack/react-query` precedent):** `mapbox-gl@^3` (ships its own types), `lucide-react`, `@fontsource-variable/figtree` (UI sans, the closest free analogue to Airbnb Cereal) and `@fontsource-variable/fraunces` (display face, used sparingly).
- **Native module ABI:** Electron 28 runs Node 18.18. Any new main-process dependency must support Node 18.
- Anything else needs a reason recorded in the task notes.

## 11. Git conventions for this project

- Author is the stakeholder (repo git config already set). **Never** add `Co-Authored-By`, `Claude-Session`, "Generated with Claude Code" or any AI attribution to commits, files or GitHub text.
- Use conventional commits with the issue number: `feat(providers): add provider registry (#12)`. One commit (or a small series) per task.
