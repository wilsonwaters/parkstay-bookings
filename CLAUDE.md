# Claude Code Context

This file provides important context for Claude Code sessions working on this codebase.

## Project Overview

WA ParkStay Bookings is an Electron + React + TypeScript desktop application that automates campground booking on the Western Australia ParkStay system. It monitors availability, sends notifications, handles the DBCA queue system, and auto-snipes high-demand sites the moment they are released (Site Sniper).

- **Version:** 1.0.0
- **Entry point:** `src/main/index.ts`
- **Repo:** `https://github.com/wilsonwaters/parkstay-bookings.git`

## Tech Stack

| Component | Technology |
| --- | --- |
| Desktop Framework | Electron 28 |
| UI Framework | React 18 |
| Language | TypeScript 5 |
| Database | SQLite via better-sqlite3 |
| Scheduling | Chained `setTimeout` timers (`src/main/scheduler/`) |
| HTTP Client | axios |
| Email | nodemailer, googleapis (Gmail OAuth2) |
| Validation | Zod |
| Styling | Tailwind CSS |
| Build | Vite 5, Electron Builder |
| Testing | Jest 29 + Playwright |
| Logging | Winston |

## Build & Run Commands

```bash
npm run dev          # Start dev (main + preload + renderer concurrently)
npm run build        # Production build
npm run test         # Run Jest unit/integration tests
npm run test:coverage # Test with coverage report
npm run test:e2e     # Playwright E2E tests
npm run test:electron # Live Electron tests (tests/electron/; xvfb on Linux; not in npm test)
npm run lint         # ESLint
npm run type-check   # TypeScript type checking
npm run dist:win     # Package Windows installer
```

## Architecture Overview

```text
src/
├── main/           # Electron main process (Node.js)
│   ├── app/        # Composition root (container.ts), local profile, renderer entry/origin
│   ├── core/       # Provider-agnostic domain services (catalog, watches, snipes, bookings, holds, notifications, accounts)
│   ├── database/   # SQLite connection, migrations, repositories
│   ├── providers/  # Provider SDK (sdk/), ProviderRegistry, built-in providers (parkstay/)
│   ├── services/   # Other services (gmail, updater)
│   ├── scheduler/  # Watch due-loop and per-snipe timer chains
│   ├── ipc/        # handle.ts, sender guard, renderer events, handlers/ (one per namespace)
│   └── utils/      # Logger
├── preload/        # Secure context bridge (window.api), bundled by esbuild, sandboxed
├── renderer/       # React UI
│   ├── components/ # Reusable components (forms/, settings/, layouts/)
│   ├── pages/      # Dashboard, Login, Settings, Bookings/, Watches/, SiteSniper/
│   └── styles/     # Tailwind CSS
└── shared/         # Cross-process code
    ├── contracts/  # IPC contract: channels, zod request schemas, response types, events
    ├── constants/  # App constants
    ├── types/      # TypeScript type definitions
    └── schemas/    # Zod validation schemas
```

**Composition root** (`src/main/app/container.ts`): `createContainer({ db })` builds every repository, service, notifier, dispatcher, scheduler, updater and Gmail service once, by constructor injection; nothing else in `src/main` calls `new` on them, and there are no singletons. `src/main/index.ts` opens the database, builds the container, runs `profile.ensureLocalProfile()`, registers the IPC handlers and starts the scheduler; `before-quit` calls `container.dispose()` (scheduler jobs aborted and awaited, providers and their queue gates, then the database).

**Local profile** (`src/main/app/profile.ts`): one `users` row is the local profile that owns every watch, snipe, booking and notification. Main resolves it (`requireUserId()`, or `NO_PROFILE`); the renderer never sends a `userId`. Since v9 the row is the profile only (email hint, names, phone). Nothing may delete it: a provider sign-out clears only that provider's session partition and `provider_accounts` row.

## Database

**Single source of truth for database initialization and migrations:**

- `src/main/database/connection.ts`

All migrations must be added to the `runMigrations()` function in `connection.ts`. Do NOT create separate migration files or a Database.ts file.

`connection.ts` exports `openDatabase(filePath)` (enables foreign keys and WAL, then migrates), `closeDatabase(db)` and `runMigrations(db)`. It has no module singleton: repositories receive the `Database` through their constructor (`repositories/base.repository.ts`), and services receive their repositories.

### Current migrations (version 9)

1. **v1** — Initial schema (users, bookings, watches, skip_the_queue_entries, notifications, job_logs, settings)
2. **v2** — Add `last_availability` JSON column to watches
3. **v3** — Add `notification_providers` and `notification_delivery_logs` tables
4. **v4** — Add `queue_session` table for DBCA queue persistence
5. **v5** — Add `allow_partial_match` column to watches (the released v1.2.0 schema)
6. **v6** — Add `site_snipes` table (Site Sniper) and widen `notifications` CHECK constraints (adds `snipe_held`/`snipe_booked` types and `snipe` related_type)
7. **v7** — Integrity: rebuild `notifications` without CHECK constraints (types are validated in `NotificationRepository`), rebuild `notification_delivery_logs` with a real FK to `notifications` (repairs v6) and `provider_channel` → `notifier_channel`, rename `notification_providers` → `notifiers`, drop `skip_the_queue_entries`
8. **v8** — Provider-aware data model (architecture-notes §5): rebuild `watches`, `site_snipes` and `bookings` with `provider_id`, generic location/stay/unit columns (`location_external_id`, `location_name`, `area_name`, `num_adults`…, `unit_ids` JSON, `stay_params` JSON for ParkStay's park id, gear type, vehicles and postcode) and calendar dates `YYYY-MM-DD`; bookings unique per `(provider_id, booking_reference)`; `site_snipes` drops the `release_mode` CHECK and renames `queue_enabled` → `access_gate_enabled`, `held_*` → `hold_*`; `notifications.provider_id`; `users` credential columns nullable plus the seeded local profile row (id 1); new `provider_accounts`, `provider_state` (the queue session moves there as `('parkstay', 'queue.session')`, `queue_session` dropped) and `locations` with the FTS5 index `locations_fts`
9. **v9** — Retire the legacy ParkStay credentials (architecture-notes §12.32): rebuild `users` without `encrypted_password` and the `encryption_*` columns (the email moved to the ParkStay account in v8); add `hold_reference`, `hold_expires_at`, `hold_unit_id`, `payment_url` and `last_error` to `watches` (§12.31) and `last_checked_at` to `provider_accounts`; create `maintenance` with a `vacuum-freed-pages` task. The runner sets `secure_delete` on around all steps, then VACUUMs the file (and truncates the WAL) and clears the task, so the dropped ciphertext is not left in free pages; a failed VACUUM is retried at each start while the task stays and the file has free pages. P7's `job_logs` drop takes v10

### Adding a new migration

1. Open `src/main/database/connection.ts`
2. Bump `LATEST_SCHEMA_VERSION` to the new version N (currently 9)
3. Find the `runMigrations()` function
4. Add a new `if (pending(N))` block at the bottom (`runMigrations(db, target)` stops at `target`; tests use it to build an older schema)
5. Wrap its body in `applyMigration(db, N, [tables it creates or rebuilds], () => { ... })`. It runs the body, `PRAGMA foreign_key_check` and the `INSERT INTO migrations` in one transaction, and throws `MigrationError(N)` on failure. The listed tables must be completely free of foreign-key violations when the step commits, and the step may not introduce a violation in any other table; violations that were already there only log a warning (rule in `assertForeignKeys`). Do not insert the version yourself, and do not set `PRAGMA foreign_keys` inside the body (it is a no-op in a transaction; the runner turns it off around all steps)
6. Rebuild a table as: create it under a temp name → copy → drop the old table → rename the new one → create its indexes. Never rename the old table aside: SQLite then rewrites other tables' foreign keys to the aside name
7. Add an upgrade test that starts from the v5 and v6 fixtures in `tests/fixtures/db/` (see its README)

## Key Services

| Service | File | Purpose |
| --- | --- | --- |
| BookingService | `src/main/core/bookings/booking.service.ts` | Booking CRUD on any provider, `manageUrl`, import through `bookingImport` |
| WatchService | `src/main/core/watches/watch.service.ts` | Availability monitoring through the provider registry (matching, partial runs, price rule, auto-hold) |
| SiteSniperService | `src/main/core/snipes/snipe.service.ts` | Site Sniper — auto-holds a high-demand site the instant it is released; release and queue rules come from the provider |
| ProviderRegistry | `src/main/providers/registry.ts` | Accommodation providers behind the SDK in `providers/sdk/` (manifests, capability checks); built-ins listed in `providers/index.ts` |
| LocationCatalogService | `src/main/core/catalog/location-catalog.service.ts` | Every provider's locations (`catalog.*`): 24 h catalogue sync into `locations` (single-flight, per-provider failure isolation, `catalog:updated`), FTS5 search with filters and facets, 6 h detail cache with stale fallback, bulk and per-location availability caches |
| ProviderAccountService | `src/main/core/accounts/provider-account.service.ts` | The person's account with each provider (`accounts.*`): status from the provider's signed-in check (single flight, 60 s cache (5 s for an answer that was not definite), definite answers only), in-app sign-in, pasted sign-in links, sign-out (`ACCOUNT_BUSY` while a snipe or hold needs the session), `ensureForHolds` for providers that require an account |
| HoldPaymentService | `src/main/core/holds/hold-payment.service.ts` | Pays for a snipe's or watch's hold in a payment window on the provider's partition (`snipes.openPayment`, `watches.openPayment`; `HOLD_EXPIRED`): passes the provider's queue first (60 s bound); a page the provider's `holds.bookedReference` takes as this hold's confirmation (ParkStay: `/success/` with the hold's `checkouthash`, showing its `PB` number, read with find-in-page) marks it booked and records the confirmed booking in one transaction |
| ProviderWindows | `src/main/app/provider-windows.ts` | Provider sign-in and payment windows on the provider's session partition (`persist:provider-<id>`, shared with its HttpClient): sandboxed, no script of ours, top-level origin allow-list, permissions/certificates refused; shown when ready or after 1.5 s; a blocked or failed first page closes the window with `PROVIDER_ERROR`; back to the target page after the provider's waiting room (`access.waitingRoomOrigins`) |
| ParkStay provider | `src/main/providers/parkstay/` | The ParkStay (DBCA) module: catalogue, availability (YYYY/MM/DD dates, per-night prices), DBCA queue access gate (`queue/`), release policy, `create_booking` holds, links, and sign-in (`auth.ts`: `/ssologin`, checked with `/api/profile`; the account is optional). Watches and snipes use it through the registry |
| NotificationService | `src/main/core/notifications/notification.service.ts` | Desktop/in-app notifications (desktop title `{shortName} · {title}`) |
| NotificationDispatcher | `src/main/core/notifications/notification-dispatcher.ts` | External notifiers (email) |
| GmailOTPService | `src/main/services/gmail/GmailOTPService.ts` | Gmail OAuth2 OTP extraction |
| AutoUpdaterService | `src/main/services/updater/auto-updater.service.ts` | Auto-updates via GitHub Releases |
| JobScheduler | `src/main/scheduler/job-scheduler.ts` | Watch due-loop (`next_check_at`, 2 per provider) + per-snipe timer chains (generation token, abort); re-arms on resume; bounded `stop()` on quit |

## Notification System

- `NotificationService` handles desktop/in-app notifications
- `NotificationDispatcher` sends to external **notifiers** (email, etc.). "Notifier" is the outbound channel; a "provider" is an accommodation source (architecture-notes §2)
- Notifiers are in `src/main/core/notifications/notifiers/` (`BaseNotifier`), built in `app/container.ts` and passed to the dispatcher
- Notifier configs (`notifiers` table, `NotifierRepository`) are encrypted with AES-256-GCM in the database
- Email SMTP notifier: `notifiers/email-smtp.notifier.ts` (`SmtpEmailNotifier`)

## IPC Pattern

- **Contract** in `src/shared/contracts/` is the single source of truth: one file per namespace (`bookings`, `watches`, `snipes`, `notifications`, `notifiers`, `gmail`, `settings`, `app`, `updater`, `providers`, `catalog`, `accounts`), and `index.ts` exports `contract` and `type WindowApi`. The DBCA queue state reaches the renderer only as `providers.accessStatus(id)` / `provider:access-status`. Each method declares a `channel` (`<namespace>:<kebab-method>`), a zod `request` schema (one object payload, or `z.void()`), the preload's positional `args` and the `response` type
- Channel and event names live in the zod-free `contracts/channels.ts`, the only contract module the preload loads at runtime. Event payloads are in `contracts/events.ts`
- `src/main/ipc/handle.ts`: `handle(def, fn)` is the only caller of `ipcMain.handle`. It checks the sender (a trusted webContents, its top frame, on the app origin — `ipc/sender-guard.ts`, `app/renderer-entry.ts`), parses the payload with the method's schema, and returns `APIResponse`: `{ success: true, data }` or `{ success: false, code, error }` with `code` `VALIDATION` (plus `issues` paths), `FORBIDDEN`, `NO_PROFILE`, `NOT_FOUND`, `INTERNAL` or `NOT_IMPLEMENTED`, and for provider errors (`main/providers/sdk/errors.ts` `toApiError`) `CAPABILITY`, `UNKNOWN_PROVIDER`, `PROVIDER_ERROR`, `ACCESS_GATE` or `AUTH_REQUIRED`, `ACCOUNT_BUSY` (sign-out refused) and `HOLD_EXPIRED` (no hold left to pay for). Throw `AppError(code)` (`main/utils/app-error.ts`) for a specific code. Logs never include payload values
- Handlers in `src/main/ipc/handlers/`, one file per namespace (`watches.handlers.ts`, …), each `registerXHandlers(handle, container)`; `registerIpcHandlers(container, { isTrustedSender })` in `ipc/index.ts` registers them all
- Events: main emits through `container.rendererEvents.emit(name, payload)` (`ipc/events.ts`), which reaches only trusted webContents. The renderer subscribes with `window.api.events.on(name, cb)`, which returns an unsubscribe function for that subscription only
- Settings keys are typed in `contracts/settings.ts` (`SETTING_KEYS`): main owns each key's `valueType` and `category`; add new keys there
- Exposed to renderer via `src/preload/index.ts`, which implements `WindowApi`; `src/preload/window.d.ts` types `window.api`. `scripts/build-preload.js` bundles it into `dist/preload/index.js` for the `sandbox: true` window and fails the build if it imports anything but `electron`
- Adding a method: add the channel to `channels.ts`, the definition to the namespace file, a handler with `handle()`, and the payload mapper in the preload. The parity tests fail until all four agree

## UI Status

- **Active pages:** Explore, Watches, Settings (no login gate)
- **Marked "Soon" in sidebar (greyed pill) but still usable:** Bookings and Site Sniper — both are navigable and show a `ComingSoonBanner` on the page (being finalized)
- **Settings** (`features/settings/`, `/settings/:section`): Accounts (one row per provider: connect in the in-app sign-in window, sign out, pasted sign-in link; ParkStay's account is optional), Notifications (desktop and sound switches, the email notifier with a write-only password and "Send test email"), App (launch at login, start minimised to the taskbar) and About. Typed settings are `SETTING_KEYS`; `launchOnStartup` and `app.startMinimised` are main-only (written by `app.setAutoLaunch`)
- **Key components:** StepFlow, ProviderPicker, LocationCombobox, ProviderStayFields, UnitPicker (shared create-flow blocks, U1), QueueStatus, NotificationBell, SiteSniperForm, UpdateNotification, AboutDialog

## Testing

- **Framework:** Jest 29 (unit/integration), Playwright (E2E)
- **Config:** `jest.config.js` — coverage thresholds: branches 9%, functions 17%, lines 16%, statements 16%
- **Test locations:** `tests/unit/`, `tests/integration/`, `tests/e2e/`, plus co-located `*.test.tsx` in `src/`
- **Fixtures:** `tests/fixtures/` (users, bookings, watches, site-sniper, and `db/` schema dumps for migration tests)
- **Helpers:** `tests/utils/` (database-helper, mock-api, test-helpers)

## Release Process

Windows-only for v1.0.0. Full details in `docs/release-process.md`.

```bash
# 1. Verify locally
npm run lint && npm run type-check && npm run test

# 2. Bump version (updates package.json, creates git tag, pushes tag)
npm run version:patch   # or version:minor / version:major

# 3. Update CHANGELOG.md, commit, tag, push
git add -A
git commit -m "chore: prepare release vX.X.X"
git tag vX.X.X
git push origin main --tags
```

Pushing a `v*` tag triggers GitHub Actions: **ci** (lint/test) -> **build-windows** (electron-builder) -> **release** (draft GitHub release with artifacts). Go to GitHub Releases to publish the draft.

Key scripts: `npm run dist:win` (local test build), `npm run release:win` (build + publish).

## Pre-Commit Checklist

Before committing any changes, **always** run these checks and fix any failures:

1. `npm run lint` — ESLint must pass with 0 errors (warnings are acceptable)
2. `npm run format:check` — Prettier formatting must pass; run `npx prettier --write "src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}"` to fix
3. `npm run type-check` — TypeScript must compile without errors
4. `npm run test` — All unit/integration tests must pass

Do NOT commit code that fails any of these checks. CI enforces all four.

## Git & PR Conventions

- Do NOT add `Co-Authored-By` trailers to commit messages.
- Do NOT add AI attribution lines to pull request descriptions.

## Further Reading

- `docs/` — User guide, installation, development, release process
- `docs/parkstay-api/` — ParkStay API endpoints, authentication flow
- `docs/gmail-otp-setup.md` — Gmail OAuth2 integration for OTP
- `docs/ADVANCED_FEATURES_GUIDE.md` — Watch, Site Sniper, notification deep-dive
- `docs/SITE_SNIPER.md` — Site Sniper feature guide, release regimes, and compliance
