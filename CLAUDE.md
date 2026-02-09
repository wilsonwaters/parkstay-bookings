# Claude Code Context

This file provides important context for Claude Code sessions working on this codebase.

## Database

**Single source of truth for database initialization and migrations:**
- `src/main/database/connection.ts`

All migrations must be added to the `runMigrations()` function in `connection.ts`. Do NOT create separate migration files or a Database.ts file.

### Adding a new migration:
1. Open `src/main/database/connection.ts`
2. Find the `runMigrations()` function
3. Check the current highest version number
4. Add a new `if (currentVersion < N)` block at the bottom
5. INSERT the new version into the migrations table

## Architecture Notes

### Notification System
- `NotificationService` handles desktop/in-app notifications
- `NotificationDispatcher` sends to external providers (email, etc.)
- Providers are in `src/main/services/notification/providers/`
- Provider configs are encrypted with AES-256-GCM in the database

### IPC Pattern
- Channels defined in `src/shared/constants/ipc-channels.ts`
- Handlers in `src/main/ipc/handlers/`
- Exposed to renderer via `src/preload/index.ts`
