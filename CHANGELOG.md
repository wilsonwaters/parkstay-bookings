# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- ParkStay sign-in happens in the app, on ParkStay's own sign-in page (Settings → Connect ParkStay). Connect ParkStay once in Settings; the old saved password is no longer used. Signing in is optional: holds work without it, and you can sign in on the payment page.
- A held site is paid for in the app: "Complete payment" opens ParkStay's payment page on the session that holds the site, and once ParkStay confirms the payment the snipe (or watch) shows as booked and the booking appears under Bookings.
- Notifications, and the record of each notification email sent, are deleted automatically once they are 30 days old.

### Removed
- Gmail OTP sign-in. Nothing used it any more. WA Stay deletes any saved Gmail sign-in from its own data folder on start. If you used Gmail OTP in v1.x, a copy of that sign-in (`gmail-oauth.json`, with a still-valid access token) remains in the old v1 data folder (`%APPDATA%\parkstay-bookings`), which WA Stay keeps untouched as your backup; it is safe to delete that file. To revoke the access you gave the app, remove it from your Google account at https://myaccount.google.com/permissions.

## [1.2.0] - 2026-05-18

### Added
- Watches UI: partial match indicator highlights sites/dates that only meet some search criteria (#5)

### Fixed
- Watch results now show real site labels and only the dates that are actually available (#9)
- Launch on startup no longer registers in dev mode — previously the dev electron.exe was added to Windows startup, which launched the generic Electron welcome screen instead of the app (#10)
- Auto-update no longer 404s on Windows artifact lookups — installer/blockmap names are now hardcoded so electron-updater can find them (#8)

## [1.1.0] - 2026-04-12

### Added
- Launch on startup setting with option to start minimised to system tray
- `/release` Claude command for automated release workflow

### Fixed
- Queue API types aligned with live DBCA queue response format

### Changed
- Release process documentation updated with branch freshness check

## [1.0.0] - 2026-02-10

### Added
- **Watch System**: Monitor campground availability with configurable intervals, desktop/email notifications, and optional auto-booking
- **Queue Handling**: Automatic detection and handling of the DBCA queue system with session persistence
- **Gmail OTP Integration**: OAuth2-based Gmail integration for automatic OTP code extraction from ParkStay emails
- **Email Notifications**: SMTP-based email notification provider with encrypted configuration
- **Notification Center**: In-app notification bell with read/unread tracking and desktop notifications
- **Dashboard**: Overview of active watches, recent activity, and system statistics
- **Credential Security**: AES-256-GCM encryption for all stored credentials, derived from machine-specific ID
- **Settings Page**: Full settings with account, Gmail, notification, app, and advanced configuration tabs
- **About Dialog**: Application info, system details, and quick links (GitHub, issues, logs)
- **Auto-Updates**: In-app update notifications with download progress and restart-to-update flow via GitHub Releases
- **Portable Build**: Standalone .exe that runs without installation

### Security
- Context isolation enabled, node integration disabled in renderer
- IPC messages validated with Zod schemas
- All credentials encrypted at rest with AES-256-GCM
- No telemetry, no cloud dependencies, all data stored locally in SQLite

### Notes
- Bookings import and Skip The Queue pages are included but disabled in the UI (coming in v1.1.0)
- Windows x64 only for this release; macOS and Linux support planned
