# Claude Code Context

This file provides important context for Claude Code sessions working on this codebase.

## Project Overview

WA ParkStay Bookings is an Electron + React + TypeScript desktop application that automates campground booking on the Western Australia ParkStay system. It monitors availability, sends notifications, handles the DBCA queue system, and supports automated rebooking.

- **Version:** 1.0.0
- **Entry point:** `src/main/index.ts`
- **Repo:** `https://github.com/wilsonwaters/parkstay-bookings.git`

## Tech Stack

| Component | Technology |
|-----------|-----------|
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

```
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
│   ├── pages/      # Dashboard, Login, Settings, Bookings/, Watches/, SkipTheQueue/
│   └── styles/     # Tailwind CSS
└── shared/         # Cross-process code
    ├── constants/  # IPC channels, app constants
    ├── types/      # TypeScript type definitions
    └── schemas/    # Zod validation schemas
```

**Service initialization chain** (in `src/main/index.ts`):
Database → Repositories → NotificationDispatcher → QueueService → ParkStayService → AuthService → BookingService → NotificationService → WatchService → STQService → JobScheduler → IPC Handlers

## Database

**Single source of truth for database initialization and migrations:**
- `src/main/database/connection.ts`

All migrations must be added to the `runMigrations()` function in `connection.ts`. Do NOT create separate migration files or a Database.ts file.

### Current migrations (version 4):
1. **v1** — Initial schema (users, bookings, watches, skip_the_queue_entries, notifications, job_logs, settings)
2. **v2** — Add `last_availability` JSON column to watches
3. **v3** — Add `notification_providers` and `notification_delivery_logs` tables
4. **v4** — Add `queue_session` table for DBCA queue persistence

### Adding a new migration:
1. Open `src/main/database/connection.ts`
2. Find the `runMigrations()` function
3. Check the current highest version number (currently 4)
4. Add a new `if (currentVersion < N)` block at the bottom
5. INSERT the new version into the migrations table

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| AuthService | `src/main/services/auth/AuthService.ts` | AES-256-GCM credential encryption |
| BookingService | `src/main/services/booking/BookingService.ts` | Booking CRUD and sync |
| WatchService | `src/main/services/watch/watch.service.ts` | Availability monitoring |
| STQService | `src/main/services/stq/stq.service.ts` | Skip-the-queue rebooking |
| ParkStayService | `src/main/services/parkstay/parkstay.service.ts` | ParkStay API client |
| QueueService | `src/main/services/queue/queue.service.ts` | DBCA queue system handler |
| NotificationService | `src/main/services/notification/notification.service.ts` | Desktop/in-app notifications |
| NotificationDispatcher | `src/main/services/notification/notification-dispatcher.ts` | External providers (email) |
| GmailOTPService | `src/main/services/gmail/GmailOTPService.ts` | Gmail OAuth2 OTP extraction |
| JobScheduler | `src/main/scheduler/job-scheduler.ts` | Cron-based job execution |

## Notification System

- `NotificationService` handles desktop/in-app notifications
- `NotificationDispatcher` sends to external providers (email, etc.)
- Providers are in `src/main/services/notification/providers/`
- Provider configs are encrypted with AES-256-GCM in the database
- Email SMTP provider: `providers/email-smtp.provider.ts`

## IPC Pattern

- Channels defined in `src/shared/constants/ipc-channels.ts`
- Handlers in `src/main/ipc/handlers/` (10 handler files: auth, booking, gmail, notification, notification-provider, parkstay, queue, settings, stq, watch)
- Exposed to renderer via `src/preload/index.ts`

## UI Status

- **Active pages:** Dashboard, Watches, Settings, Login
- **Disabled in sidebar:** Bookings and Skip The Queue show `ComingSoonBanner` (being finalized)
- **Settings page** includes email/SMTP configuration (`EmailSettingsCard`)
- **Key components:** AvailabilityGrid, QueueStatus, NotificationBell, WatchForm, STQForm

## Testing

- **Framework:** Jest 29 (unit/integration), Playwright (E2E)
- **Config:** `jest.config.js` — coverage threshold: 50% (branches, functions, lines, statements)
- **Test locations:** `tests/unit/`, `tests/integration/`, `tests/e2e/`, plus co-located `*.test.tsx` in `src/`
- **Fixtures:** `tests/fixtures/` (users, bookings, watches, stq)
- **Helpers:** `tests/utils/` (database-helper, mock-api, test-helpers)

## Further Reading

- `docs/` — User guide, installation, development, release process
- `docs/parkstay-api/` — ParkStay API endpoints, authentication flow
- `docs/gmail-otp-setup.md` — Gmail OAuth2 integration for OTP
- `docs/ADVANCED_FEATURES_GUIDE.md` — Watch, STQ, notification deep-dive
