# WA ParkStay Bookings

**Automated booking tool for Western Australia ParkStay campgrounds**

An Electron-based desktop application that automates the process of monitoring and booking campsites on the WA Parks and Wildlife Service ParkStay system.

## Download

**[Download the latest release](https://github.com/wilsonwaters/parkstay-bookings/releases/latest)** - Windows only for v1.0.0.

- **Installer**: `WA-ParkStay-Bookings-Setup-x.x.x.exe` - Recommended, includes auto-updates
- **Portable**: `WA-ParkStay-Bookings-Portable-x.x.x.exe` - No installation required

> **Note:** The app is not yet code-signed. Windows SmartScreen may show a warning — click "More info" then "Run anyway" to proceed.

**macOS and Linux builds coming soon.** For now, Windows users can download pre-built installers. macOS/Linux users can [build from source](#building-from-source).

## Features

### Current

- **Watch System**: Monitor campground availability automatically with configurable intervals, notifications when sites are found, and optional auto-booking
- **Notifications**: Desktop notifications, in-app notification center, and email notifications via SMTP
- **Queue Handling**: Automatic handling of the ParkStay/DBCA queue system with session persistence
- **Gmail Integration**: OAuth2-based Gmail integration for extracting OTP codes from ParkStay emails
- **Credential Security**: AES-256-GCM encryption for all credentials, stored locally
- **Settings**: Full settings page with email/SMTP configuration, notification preferences, and account management
- **Dashboard**: Overview of active watches, recent activity, upcoming bookings, and statistics
- **Privacy First**: All data stored locally in SQLite, no cloud dependencies, no telemetry

- **Auto-Updates**: In-app update notifications with one-click install via GitHub Releases
- **About Dialog**: Version info, system details, and quick access to logs

### Coming Soon

- **Booking Management**: Import and manage ParkStay bookings (page temporarily disabled)
- **Skip The Queue**: Automated rebooking of cancelled reservations (page temporarily disabled)

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Desktop Framework | Electron 28 |
| UI Framework | React 18 |
| Language | TypeScript 5 |
| Database | SQLite (better-sqlite3) |
| Job Scheduler | node-cron |
| HTTP Client | axios |
| Email | nodemailer, googleapis |
| Validation | Zod |
| Styling | Tailwind CSS |
| Build Tool | Vite 5 |
| Packaging | Electron Builder |
| Testing | Jest 29 + Playwright |

## System Requirements

### Windows (v1.0.0)
- Windows 10 or later (64-bit)
- 4GB RAM minimum
- 500MB free disk space

### macOS & Linux (Coming Soon)
- Support planned for future releases
- Can build from source in the meantime

## Installation

### Windows Installer (Recommended)

1. Download the latest `.exe` installer from [GitHub Releases](https://github.com/wilsonwaters/parkstay-bookings/releases/latest)
2. Run the installer. If SmartScreen appears, click **"More info"** then **"Run anyway"**
3. Follow the setup wizard (choose install location, create shortcuts)
4. Launch the app and enter your ParkStay credentials

See [docs/installation.md](docs/installation.md) for detailed instructions.

### Building from Source

```bash
# Clone repository
git clone https://github.com/wilsonwaters/parkstay-bookings.git
cd parkstay-bookings

# Install dependencies
npm install

# Start development server
npm run dev

# Or build a Windows installer
npm run dist:win
```

## Development

### Prerequisites

- Node.js 20 LTS or later
- npm 10 or later
- Git

### Available Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload (main + renderer)
npm run type-check       # Run TypeScript type checking
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint errors
npm run format           # Format code with Prettier

# Testing
npm run test             # Run unit tests
npm run test:coverage    # Run tests with coverage report
npm run test:e2e         # Run end-to-end tests

# Building
npm run build            # Build for production
npm run dist:win         # Build Windows installer
npm run dist:mac         # Build macOS installer
```

### Project Structure

```
parkstay-bookings/
├── docs/                       # Documentation
│   ├── architecture/           # Architecture documents
│   ├── parkstay-api/           # ParkStay API documentation
│   ├── gmail-otp-setup.md      # Gmail OAuth2 integration
│   ├── user-guide.md           # User guide
│   └── ...
├── src/
│   ├── main/                   # Electron main process
│   │   ├── database/           # SQLite connection, migrations, repositories
│   │   ├── services/           # Business logic services
│   │   │   ├── auth/           # Credential encryption
│   │   │   ├── booking/        # Booking management
│   │   │   ├── gmail/          # Gmail OAuth2 OTP
│   │   │   ├── notification/   # Notifications + providers
│   │   │   ├── parkstay/       # ParkStay API client
│   │   │   ├── queue/          # DBCA queue handler
│   │   │   ├── stq/            # Skip The Queue
│   │   │   └── watch/          # Availability monitoring
│   │   ├── scheduler/          # node-cron job scheduler
│   │   ├── ipc/                # IPC handlers
│   │   └── utils/              # Logger, helpers
│   ├── preload/                # Preload scripts (security bridge)
│   ├── renderer/               # React UI
│   │   ├── components/         # Reusable components
│   │   │   ├── forms/          # WatchForm, STQForm, ImportBookingForm
│   │   │   ├── settings/       # EmailSettingsCard, SMTPSetupInstructions
│   │   │   └── layouts/        # MainLayout
│   │   ├── pages/              # Dashboard, Login, Settings, Watches/, Bookings/, SkipTheQueue/
│   │   └── styles/             # Tailwind CSS
│   └── shared/                 # Shared code
│       ├── constants/          # IPC channels, app constants
│       ├── types/              # TypeScript type definitions
│       └── schemas/            # Zod validation schemas
├── tests/                      # Test files
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   ├── e2e/                    # E2E tests (Playwright)
│   ├── fixtures/               # Test data
│   └── utils/                  # Test helpers
└── resources/                  # Icons, assets
```

## Usage

### First Time Setup

1. Launch the application
2. Enter your ParkStay credentials on the login page
3. Credentials are encrypted and stored securely on your machine

### Creating a Watch

1. Navigate to the Watches page from the sidebar
2. Click "Create New Watch"
3. Select a park and campground
4. Choose your dates and guest details
5. Set the check interval (default: 5 minutes)
6. Choose notification preferences
7. Optionally enable auto-booking
8. Activate the watch

The app will check for availability at the configured interval and notify you when sites become available.

### Email Notifications

1. Go to Settings
2. Configure your SMTP email settings (or use Gmail OAuth2)
3. Test the connection
4. Email notifications will be sent alongside desktop notifications when watches find availability

### Managing Notifications

- Click the bell icon in the header to view notifications
- Click a notification to navigate to the related item
- Mark as read or dismiss notifications
- Configure notification preferences in Settings

## Security

### Credential Storage
- Passwords encrypted with AES-256-GCM
- Encryption key derived from machine-specific ID
- Keys stored separately from encrypted data
- Credentials never transmitted to third parties (only to ParkStay)

### Data Privacy
- All data stored locally in SQLite database
- No cloud synchronization
- No telemetry or analytics
- No external API calls except to ParkStay and Gmail (if configured)

### Application Security
- Context isolation enabled in Electron
- Node integration disabled in renderer
- Content Security Policy enforced
- IPC messages validated with Zod schemas
- Dependencies regularly updated

## Troubleshooting

### Common Issues

**"Invalid credentials" error:**
Update your credentials in Settings. Verify you can log in to ParkStay directly.

**Watch shows "Error" status:**
Check the app logs for details. Usually caused by network issues or ParkStay being down. The watch will retry automatically.

**Notifications not working:**
Check notification settings in the app. Ensure system notifications are enabled for the app in your OS settings.

**Email notifications not sending:**
Verify SMTP settings in the Settings page. Use the "Test Connection" button to diagnose issues.

### Logs

Logs are stored in:
- **Windows:** `%APPDATA%\parkstay-bookings\logs\`
- **macOS:** `~/Library/Application Support/parkstay-bookings/logs/`

## Contributing

Contributions are welcome! See the [Development Guide](docs/development.md) for setup instructions.

1. Read the [Architecture Documentation](docs/architecture/README.md)
2. Fork the repository
3. Create a feature branch
4. Implement with tests
5. Submit a pull request

## License

MIT

## Disclaimer

This application is an unofficial tool and is not affiliated with, endorsed by, or connected to the Western Australia Parks and Wildlife Service or the Department of Biodiversity, Conservation and Attractions (DBCA).

Use this application responsibly:
- Respect the ParkStay terms of service
- Don't abuse the system with excessive requests
- Don't create bookings you don't intend to use
- Follow all camping regulations and booking policies

The developers are not responsible for any issues arising from the use of this application, including but not limited to booking conflicts, account issues, or violations of ParkStay policies.

## Acknowledgments

- Western Australia Parks and Wildlife Service for the ParkStay system
- The Electron, React, and open-source communities

## Support

- **GitHub Issues:** [Report bugs and request features](https://github.com/wilsonwaters/parkstay-bookings/issues)
- **Documentation:** See `docs/` directory

---

**Current Version:** 1.0.0
**Last Updated:** 2026-02-10
