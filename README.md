# WA ParkStay Bookings

**Automated booking tool for Western Australia ParkStay campgrounds**

An Electron-based desktop application that automates the process of monitoring and booking campsites on the WA Parks and Wildlife Service ParkStay system.

## Features

- **Booking Management**: Import and manage your ParkStay bookings
- **Watch System**: Monitor campground availability automatically
- **Skip The Queue**: Automatically rebook cancelled bookings
- **Notifications**: Desktop and in-app notifications when sites become available
- **Auto-Booking**: Automatically create bookings when availability is found
- **Secure**: Credentials encrypted and stored locally
- **Privacy First**: All data stored locally, no cloud dependencies

## Status

**Current Status:** Architecture Phase Complete

This project is currently in the architecture and planning phase. The complete architecture documentation is available in the `docs/architecture/` directory.

## Architecture Documentation

Complete architecture documentation is available:

- **[Architecture Overview](docs/architecture/README.md)** - Start here for an overview
- **[ADR-001: UI Framework Choice](docs/architecture/ADR-001-ui-framework-choice.md)** - Decision: Electron + React
- **[System Architecture](docs/architecture/system-architecture.md)** - Complete system design
- **[Project Structure](docs/architecture/project-structure.md)** - Directory layout and organization
- **[Data Models](docs/architecture/data-models.md)** - Database schema and models
- **[Architecture Diagrams](docs/architecture/architecture-diagrams.md)** - Visual representations
- **[Implementation Roadmap](docs/architecture/implementation-roadmap.md)** - 12-week development plan

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Desktop Framework | Electron 28+ |
| UI Framework | React 18 |
| Language | TypeScript 5+ |
| Database | SQLite 3.43+ |
| Job Scheduler | node-cron |
| HTTP Client | axios |
| Styling | Tailwind CSS + shadcn/ui |
| Build Tool | Vite 5+ |
| Packaging | Electron Builder |
| Testing | Jest + Playwright |

## Key Features

### 1. Booking Management
- Import existing bookings using booking reference
- View all your bookings in one place
- Sync booking status with ParkStay
- Track booking details (dates, sites, costs)

### 2. Watch System
- Configure watches for desired campgrounds and dates
- Automatic availability checking at configurable intervals
- Notifications when availability is found
- Optional auto-booking when sites become available
- Multiple watches can run simultaneously

### 3. Skip The Queue
- Monitor cancelled bookings for rebooking opportunities
- Automatic rebooking attempts
- Configurable check intervals and max attempts
- Success notifications

### 4. Notifications
- Desktop notifications (native OS integration)
- In-app notification center
- System tray integration
- Optional sound alerts
- Clickable notifications navigate to relevant page

### 5. Security & Privacy
- Credentials encrypted with AES-256-GCM
- All data stored locally (no cloud)
- No telemetry or tracking
- Secure IPC communication
- Context isolation in Electron

## System Requirements

### Windows
- Windows 10 or later (64-bit)
- 4GB RAM minimum
- 500MB free disk space

### macOS
- macOS 10.13 (High Sierra) or later
- 4GB RAM minimum
- 500MB free disk space

## Installation

**Note:** Installers not yet available. Project is in development.

When ready, installation will be:

### Windows
1. Download `ParkStay-Bookings-Setup-1.0.0.exe`
2. Run installer
3. Follow installation wizard
4. Launch from Start Menu or Desktop shortcut

### macOS
1. Download `ParkStay-Bookings-1.0.0.dmg`
2. Open DMG file
3. Drag app to Applications folder
4. Launch from Applications

## Development

### Prerequisites

- Node.js 20 LTS or later
- npm 10 or later
- Git

### Setup

```bash
# Clone repository
git clone <repository-url>
cd parkstay-bookings

# Install dependencies
npm install

# Start development server
npm run dev
```

### Available Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run type-check       # Run TypeScript type checking
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint errors
npm run format          # Format code with Prettier

# Testing
npm run test            # Run unit tests
npm run test:watch      # Run tests in watch mode
npm run test:e2e        # Run end-to-end tests

# Building
npm run build           # Build for production
npm run build:win       # Build Windows installer
npm run build:mac       # Build macOS installer
```

### Project Structure

```
parkstay-bookings/
├── docs/                    # Documentation
│   └── architecture/       # Architecture documents
├── src/
│   ├── main/               # Electron main process (backend)
│   ├── preload/            # Preload scripts (security bridge)
│   ├── renderer/           # React UI (frontend)
│   └── shared/             # Shared code
├── tests/                  # Test files
├── resources/              # Icons, sounds, images
└── scripts/                # Build scripts
```

See [Project Structure](docs/architecture/project-structure.md) for complete details.

## Usage

**Note:** Application not yet implemented. These are planned features.

### First Time Setup

1. Launch application
2. Enter your ParkStay credentials
3. Credentials are encrypted and stored securely
4. Test connection to verify credentials

### Creating a Watch

1. Navigate to Watches page
2. Click "New Watch"
3. Select park and campground
4. Choose dates and number of guests
5. Set check interval (default: 5 minutes)
6. Choose notification preferences
7. Enable auto-booking if desired
8. Activate watch

### Using Skip The Queue

1. Import an existing booking (or create via watch)
2. Navigate to Skip The Queue page
3. Click "Enable STQ" on a booking
4. Set check interval (default: 2 minutes)
5. System will automatically attempt rebooking
6. Receive notification on success

### Managing Notifications

- Click bell icon to view notifications
- Click notification to navigate to related item
- Mark as read or dismiss
- Configure sound and desktop notifications in Settings

## Security Considerations

### Credential Storage

- Passwords encrypted with AES-256-GCM
- Encryption key derived from machine-specific ID
- Keys stored separately from encrypted data
- Credentials never transmitted to third parties (only to ParkStay)

### Data Privacy

- All data stored locally in SQLite database
- No cloud synchronization
- No telemetry or analytics
- No external API calls except to ParkStay

### Application Security

- Context isolation enabled in Electron
- Node integration disabled in renderer
- Content Security Policy enforced
- IPC messages validated
- Dependencies regularly updated

## Troubleshooting

**Note:** Application not yet released. Troubleshooting guide will be added.

Common issues and solutions will be documented in `docs/user-guide/troubleshooting.md`.

## Contributing

This project is currently in active development. Contributions are welcome!

### Development Process

1. Read the [Architecture Documentation](docs/architecture/README.md)
2. Check the [Implementation Roadmap](docs/architecture/implementation-roadmap.md)
3. Pick a task or create an issue
4. Fork the repository
5. Create a feature branch
6. Implement with tests
7. Submit a pull request

### Coding Standards

- Follow TypeScript best practices
- Write tests for new features
- Use ESLint and Prettier
- Follow the project structure
- Document complex logic
- Write clear commit messages

## Roadmap

See the complete [Implementation Roadmap](docs/architecture/implementation-roadmap.md) for details.

### Phase 1: Foundation (Weeks 1-2)
Project setup, database, infrastructure

### Phase 2: Core Services (Weeks 3-4)
Business logic, ParkStay API integration

### Phase 3: Job Scheduling (Week 5)
Background jobs, polling system

### Phase 4: User Interface (Weeks 6-8)
React components, pages, styling

### Phase 5: Integration (Week 9)
End-to-end integration, testing

### Phase 6: Polish (Week 10)
UX improvements, error handling

### Phase 7: Distribution (Weeks 11-12)
Packaging, installers, documentation

## License

[License to be determined]

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
- All contributors to this project

## Support

**Note:** Project in development, support not yet available.

When released:
- GitHub Issues: For bug reports and feature requests
- Discussions: For questions and community support
- Documentation: Check `docs/` directory

## Contact

[Contact information to be added]

---

**Current Version:** 0.1.0 (Architecture Phase)
**Last Updated:** 2025-10-31
