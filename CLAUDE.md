# Claude Code Context

This file provides important context for Claude Code sessions working on this codebase.

## Project Overview

WA ParkStay Bookings is an Electron + React + TypeScript desktop application that automates campground booking on the Western Australia ParkStay system. It monitors availability, sends notifications, handles the DBCA queue system, and supports automated rebooking.

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
| Scheduling | node-cron |
| HTTP Client | axios |
| Email | nodemailer, googleapis (Gmail OAuth2) |
| Validation | Zod |
| Styling | Tailwind CSS |
| Build | Vite 5, Electron Builder |
| Testing | Jest 29 + Playwright |
| Logging | Winston |

## Build & Run Commands

```bash
npm run dev          # Start dev (main + renderer concurrently)
npm run build        # Production build
npm run test         # Run Jest unit/integration tests
npm run test:coverage # Test with coverage report
npm run test:e2e     # Playwright E2E tests
npm run lint         # ESLint
npm run type-check   # TypeScript type checking
npm run dist:win     # Package Windows installer
```

## Architecture Overview

```text
src/
├── main/           # Electron main process (Node.js)
│   ├── database/   # SQLite connection, migrations, repositories
│   ├── services/   # Business logic (auth, booking, watch, stq, gmail, queue, notification, parkstay)
│   ├── scheduler/  # node-cron job scheduler
│   ├── ipc/        # IPC handlers (bridge to renderer)
│   └── utils/      # Logger, browser headers
├── preload/        # Secure context bridge (window.api)
├── renderer/       # React UI
│   ├── components/ # Reusable components (forms/, settings/, layouts/)
│   ├── pages/      # Dashboard, Login, Settings, Bookings/, Watches/, SkipTheQueue/ (Beat the Crowd)
│   └── styles/     # Tailwind CSS
└── shared/         # Cross-process code
    ├── constants/  # IPC channels, app constants
    ├── types/      # TypeScript type definitions
    └── schemas/    # Zod validation schemas
```

**Service initialization chain** (in `src/main/index.ts`):
Database → Repositories → NotificationDispatcher → QueueService → ParkStayService → AuthService → BookingService → NotificationService → WatchService → STQService → AutoUpdaterService → JobScheduler → IPC Handlers

## Database

**Single source of truth for database initialization and migrations:**

- `src/main/database/connection.ts`

All migrations must be added to the `runMigrations()` function in `connection.ts`. Do NOT create separate migration files or a Database.ts file.

### Current migrations (version 4)

1. **v1** — Initial schema (users, bookings, watches, skip_the_queue_entries, notifications, job_logs, settings)
2. **v2** — Add `last_availability` JSON column to watches
3. **v3** — Add `notification_providers` and `notification_delivery_logs` tables
4. **v4** — Add `queue_session` table for DBCA queue persistence

### Adding a new migration

1. Open `src/main/database/connection.ts`
2. Find the `runMigrations()` function
3. Check the current highest version number (currently 4)
4. Add a new `if (currentVersion < N)` block at the bottom
5. INSERT the new version into the migrations table

## Key Services

| Service | File | Purpose |
| --- | --- | --- |
| AuthService | `src/main/services/auth/AuthService.ts` | AES-256-GCM credential encryption |
| BookingService | `src/main/services/booking/BookingService.ts` | Booking CRUD and sync |
| WatchService | `src/main/services/watch/watch.service.ts` | Availability monitoring |
| STQService | `src/main/services/stq/stq.service.ts` | Beat the Crowd advance-booking (cancel & rebook within 180-day window) |
| ParkStayService | `src/main/services/parkstay/parkstay.service.ts` | ParkStay API client |
| QueueService | `src/main/services/queue/queue.service.ts` | DBCA queue system handler |
| NotificationService | `src/main/services/notification/notification.service.ts` | Desktop/in-app notifications |
| NotificationDispatcher | `src/main/services/notification/notification-dispatcher.ts` | External providers (email) |
| GmailOTPService | `src/main/services/gmail/GmailOTPService.ts` | Gmail OAuth2 OTP extraction |
| AutoUpdaterService | `src/main/services/updater/auto-updater.service.ts` | Auto-updates via GitHub Releases |
| JobScheduler | `src/main/scheduler/job-scheduler.ts` | Cron-based job execution |

## Notification System

- `NotificationService` handles desktop/in-app notifications
- `NotificationDispatcher` sends to external providers (email, etc.)
- Providers are in `src/main/services/notification/providers/`
- Provider configs are encrypted with AES-256-GCM in the database
- Email SMTP provider: `providers/email-smtp.provider.ts`

## IPC Pattern

- Channels defined in `src/shared/constants/ipc-channels.ts`
- Handlers in `src/main/ipc/handlers/` (12 handler files: app, auth, booking, gmail, notification, notification-provider, parkstay, queue, settings, stq, updater, watch)
- Exposed to renderer via `src/preload/index.ts`

## UI Status

- **Active pages:** Dashboard, Watches, Settings, Login
- **Disabled in sidebar:** Bookings and Beat the Crowd (formerly "Skip The Queue") show `ComingSoonBanner` (being finalized)
- **Settings page** includes email/SMTP configuration (`EmailSettingsCard`)
- **Key components:** AvailabilityGrid, QueueStatus, NotificationBell, WatchForm, STQForm, UpdateNotification, AboutDialog

## Testing

- **Framework:** Jest 29 (unit/integration), Playwright (E2E)
- **Config:** `jest.config.js` — coverage thresholds: branches 9%, functions 17%, lines 16%, statements 16%
- **Test locations:** `tests/unit/`, `tests/integration/`, `tests/e2e/`, plus co-located `*.test.tsx` in `src/`
- **Fixtures:** `tests/fixtures/` (users, bookings, watches, stq)
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
- `docs/ADVANCED_FEATURES_GUIDE.md` — Watch, Beat the Crowd (STQ), notification deep-dive
