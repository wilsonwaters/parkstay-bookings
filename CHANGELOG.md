# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
