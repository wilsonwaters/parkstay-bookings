# WA ParkStay Bookings - Project Structure

**Version:** 1.0
**Date:** 2025-10-31

## Overview

This document outlines the complete directory structure and organization for the WA ParkStay Bookings application. The project follows a monorepo structure with clear separation between Electron main process, renderer process, and shared code.

## Root Directory Structure

```
parkstay-bookings/
├── .github/                    # GitHub workflows and templates
│   └── workflows/
│       ├── ci.yml             # Continuous integration
│       ├── build.yml          # Build and release
│       └── test.yml           # Automated testing
├── .husky/                     # Git hooks
│   ├── pre-commit             # Run linting and tests
│   └── pre-push               # Additional checks
├── docs/                       # Documentation
│   ├── architecture/          # Architecture documents
│   ├── api/                   # API documentation
│   ├── user-guide/            # End-user documentation
│   └── development/           # Developer guides
├── resources/                  # Static resources
│   ├── icons/                 # Application icons
│   │   ├── icon.icns         # macOS icon
│   │   ├── icon.ico          # Windows icon
│   │   └── icon.png          # Linux icon
│   ├── sounds/               # Notification sounds
│   └── images/               # UI images
├── scripts/                   # Build and utility scripts
│   ├── build.js              # Custom build scripts
│   ├── notarize.js           # macOS notarization
│   └── clean.js              # Cleanup script
├── src/                      # Source code
│   ├── main/                 # Electron main process
│   ├── preload/              # Preload scripts
│   ├── renderer/             # React UI (renderer process)
│   └── shared/               # Shared code
├── tests/                    # Test files
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
├── .eslintrc.json           # ESLint configuration
├── .prettierrc              # Prettier configuration
├── .gitignore               # Git ignore rules
├── electron-builder.json    # Electron Builder config
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript base config
├── tsconfig.main.json       # Main process TypeScript config
├── tsconfig.renderer.json   # Renderer process TypeScript config
├── vite.config.ts           # Vite configuration
├── jest.config.js           # Jest configuration
└── README.md                # Project README
```

## Source Code Structure (`src/`)

### Main Process (`src/main/`)

The main process handles backend logic, database operations, job scheduling, and native OS integration.

```
src/main/
├── index.ts                    # Main entry point
├── app.ts                      # Application lifecycle
├── config/                     # Configuration management
│   ├── index.ts               # Export all configs
│   ├── app-config.ts          # Application settings
│   ├── database-config.ts     # Database configuration
│   └── constants.ts           # Application constants
├── database/                   # Database layer
│   ├── index.ts               # Database initialization
│   ├── connection.ts          # SQLite connection
│   ├── schema.sql             # Database schema (source reference; inlined into connection.ts for builds)
│   ├── migrations/            # Schema migrations
│   │   ├── index.ts           # Migration runner
│   │   ├── 001-initial.ts     # Initial schema
│   │   ├── 002-add-indexes.ts # Add indexes
│   │   └── ...               # More migrations
│   ├── models/                # Data models (TypeScript interfaces)
│   │   ├── index.ts
│   │   ├── user.model.ts
│   │   ├── booking.model.ts
│   │   ├── watch.model.ts
│   │   ├── stq.model.ts
│   │   └── notification.model.ts
│   └── repositories/          # Data access layer
│       ├── index.ts
│       ├── base.repository.ts
│       ├── user.repository.ts
│       ├── booking.repository.ts
│       ├── watch.repository.ts
│       ├── stq.repository.ts
│       ├── notification.repository.ts
│       └── settings.repository.ts
├── services/                   # Business logic services
│   ├── index.ts
│   ├── auth/                  # Authentication service
│   │   ├── index.ts
│   │   ├── auth.service.ts
│   │   ├── credential-store.ts
│   │   └── session-manager.ts
│   ├── parkstay/              # ParkStay API integration
│   │   ├── index.ts
│   │   ├── parkstay.service.ts
│   │   ├── api-client.ts
│   │   ├── parser.ts          # HTML/JSON parsing
│   │   └── types.ts           # API types
│   ├── booking/               # Booking management
│   │   ├── index.ts
│   │   ├── booking-manager.service.ts
│   │   ├── booking-sync.service.ts
│   │   └── booking-validator.ts
│   ├── watch/                 # Watch management
│   │   ├── index.ts
│   │   ├── watch-manager.service.ts
│   │   ├── watch-executor.service.ts
│   │   └── watch-validator.ts
│   ├── stq/                   # Skip The Queue management
│   │   ├── index.ts
│   │   ├── stq-manager.service.ts
│   │   ├── stq-executor.service.ts
│   │   └── stq-validator.ts
│   └── notification/          # Notification service
│       ├── index.ts
│       ├── notification.service.ts
│       ├── desktop-notifier.ts
│       └── sound-player.ts
├── scheduler/                  # Job scheduling
│   ├── index.ts
│   ├── job-scheduler.ts       # Main scheduler
│   ├── job-queue.ts           # Job queue management
│   ├── jobs/                  # Job definitions
│   │   ├── index.ts
│   │   ├── base-job.ts
│   │   ├── watch-poll-job.ts
│   │   ├── stq-check-job.ts
│   │   └── cleanup-job.ts
│   └── strategies/            # Retry strategies
│       ├── exponential-backoff.ts
│       └── rate-limiter.ts
├── ipc/                       # Inter-process communication
│   ├── index.ts               # IPC handler registration
│   ├── handlers/              # IPC handler modules
│   │   ├── auth.handlers.ts
│   │   ├── booking.handlers.ts
│   │   ├── watch.handlers.ts
│   │   ├── stq.handlers.ts
│   │   ├── notification.handlers.ts
│   │   └── settings.handlers.ts
│   └── events.ts              # Event emitters
├── utils/                     # Utility functions
│   ├── index.ts
│   ├── crypto.utils.ts
│   ├── date.utils.ts
│   ├── validation.utils.ts
│   ├── error-handler.ts
│   └── logger.ts
├── windows/                   # Window management
│   ├── main-window.ts
│   └── tray.ts               # System tray
└── types/                     # TypeScript type definitions
    ├── index.ts
    ├── ipc.types.ts
    ├── service.types.ts
    └── global.d.ts
```

### Preload Scripts (`src/preload/`)

Preload scripts expose a secure API to the renderer process.

```
src/preload/
├── index.ts                   # Main preload script
├── api/                       # API definitions
│   ├── auth.api.ts
│   ├── booking.api.ts
│   ├── watch.api.ts
│   ├── stq.api.ts
│   ├── notification.api.ts
│   └── settings.api.ts
└── types/                     # Type definitions for API
    └── window.d.ts           # Window interface extension
```

### Renderer Process (`src/renderer/`)

The renderer process contains the React UI application.

```
src/renderer/
├── index.html                 # HTML entry point
├── main.tsx                   # React entry point
├── App.tsx                    # Root component
├── pages/                     # Page components
│   ├── Dashboard/
│   │   ├── index.tsx
│   │   ├── Dashboard.tsx
│   │   ├── DashboardStats.tsx
│   │   └── RecentActivity.tsx
│   ├── Bookings/
│   │   ├── index.tsx
│   │   ├── BookingsList.tsx
│   │   ├── BookingCard.tsx
│   │   ├── BookingDetails.tsx
│   │   └── ImportBooking.tsx
│   ├── Watches/
│   │   ├── index.tsx
│   │   ├── WatchesList.tsx
│   │   ├── WatchCard.tsx
│   │   ├── CreateWatch.tsx
│   │   └── EditWatch.tsx
│   ├── SkipTheQueue/
│   │   ├── index.tsx
│   │   ├── STQList.tsx
│   │   ├── STQCard.tsx
│   │   └── CreateSTQ.tsx
│   ├── Settings/
│   │   ├── index.tsx
│   │   ├── Settings.tsx
│   │   ├── AccountSettings.tsx
│   │   ├── NotificationSettings.tsx
│   │   └── AppSettings.tsx
│   └── NotFound/
│       └── index.tsx
├── components/                # Reusable components
│   ├── ui/                    # Base UI components (shadcn/ui)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown.tsx
│   │   ├── table.tsx
│   │   ├── toast.tsx
│   │   └── ...
│   ├── forms/                 # Form components
│   │   ├── BookingForm.tsx
│   │   ├── WatchForm.tsx
│   │   ├── CredentialsForm.tsx
│   │   └── FormField.tsx
│   ├── modals/                # Modal dialogs
│   │   ├── ConfirmDialog.tsx
│   │   ├── BookingModal.tsx
│   │   └── ErrorModal.tsx
│   ├── layouts/               # Layout components
│   │   ├── MainLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── notifications/         # Notification components
│   │   ├── NotificationBell.tsx
│   │   ├── NotificationList.tsx
│   │   └── NotificationItem.tsx
│   └── common/                # Common components
│       ├── LoadingSpinner.tsx
│       ├── ErrorBoundary.tsx
│       ├── EmptyState.tsx
│       └── StatusBadge.tsx
├── hooks/                     # Custom React hooks
│   ├── useBookings.ts
│   ├── useWatches.ts
│   ├── useSTQ.ts
│   ├── useNotifications.ts
│   ├── useAuth.ts
│   ├── useSettings.ts
│   ├── useDebounce.ts
│   └── useLocalStorage.ts
├── services/                  # Frontend services (IPC wrappers)
│   ├── index.ts
│   ├── booking.service.ts
│   ├── watch.service.ts
│   ├── stq.service.ts
│   ├── notification.service.ts
│   └── settings.service.ts
├── stores/                    # State management (optional, if needed)
│   ├── index.ts
│   ├── auth.store.ts
│   └── ui.store.ts
├── router/                    # Routing configuration
│   ├── index.tsx
│   └── routes.tsx
├── types/                     # TypeScript types
│   ├── index.ts
│   ├── booking.types.ts
│   ├── watch.types.ts
│   ├── stq.types.ts
│   └── common.types.ts
├── utils/                     # Utility functions
│   ├── index.ts
│   ├── format.ts             # Formatting utilities
│   ├── validation.ts         # Validation utilities
│   ├── date.ts               # Date utilities
│   └── constants.ts          # Frontend constants
├── styles/                    # Global styles
│   ├── index.css             # Main stylesheet
│   ├── globals.css           # Global styles
│   └── variables.css         # CSS variables
└── assets/                    # Static assets
    ├── images/
    └── fonts/
```

### Shared Code (`src/shared/`)

Code shared between main and renderer processes.

```
src/shared/
├── types/                     # Shared TypeScript types
│   ├── index.ts
│   ├── booking.types.ts
│   ├── watch.types.ts
│   ├── stq.types.ts
│   ├── notification.types.ts
│   └── api.types.ts
├── constants/                 # Shared constants
│   ├── index.ts
│   ├── app-constants.ts
│   └── ipc-channels.ts
├── schemas/                   # Validation schemas (Zod)
│   ├── index.ts
│   ├── booking.schema.ts
│   ├── watch.schema.ts
│   └── settings.schema.ts
└── utils/                     # Shared utility functions
    ├── index.ts
    ├── date.utils.ts
    └── format.utils.ts
```

## Test Structure (`tests/`)

```
tests/
├── unit/                      # Unit tests
│   ├── main/
│   │   ├── services/
│   │   │   ├── auth.service.test.ts
│   │   │   ├── booking-manager.test.ts
│   │   │   └── ...
│   │   ├── repositories/
│   │   │   ├── booking.repository.test.ts
│   │   │   └── ...
│   │   └── utils/
│   │       └── crypto.utils.test.ts
│   └── renderer/
│       ├── components/
│       │   ├── BookingCard.test.tsx
│       │   └── ...
│       └── hooks/
│           └── useBookings.test.ts
├── integration/               # Integration tests
│   ├── booking-flow.test.ts
│   ├── watch-execution.test.ts
│   └── stq-execution.test.ts
├── e2e/                      # End-to-end tests
│   ├── booking-management.spec.ts
│   ├── watch-creation.spec.ts
│   └── user-journey.spec.ts
├── fixtures/                 # Test fixtures
│   ├── bookings.json
│   ├── watches.json
│   └── mock-responses.json
└── helpers/                  # Test helpers
    ├── setup.ts
    ├── db-helper.ts
    └── mock-api.ts
```

## Documentation Structure (`docs/`)

```
docs/
├── architecture/             # Architecture documents
│   ├── ADR-001-ui-framework-choice.md
│   ├── system-architecture.md
│   ├── project-structure.md
│   └── data-models.md
├── api/                     # API documentation
│   ├── ipc-api.md
│   └── parkstay-api.md
├── user-guide/              # End-user documentation
│   ├── installation.md
│   ├── getting-started.md
│   ├── creating-watches.md
│   ├── skip-the-queue.md
│   └── troubleshooting.md
└── development/             # Developer guides
    ├── setup.md
    ├── contributing.md
    ├── coding-standards.md
    ├── testing.md
    └── deployment.md
```

## Configuration Files

### `package.json`

```json
{
  "name": "parkstay-bookings",
  "version": "1.0.0",
  "description": "Automated booking tool for WA ParkStay",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && electron-builder",
    "build:win": "npm run build -- --win",
    "build:mac": "npm run build -- --mac",
    "preview": "vite preview",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,css,md}\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "playwright test",
    "type-check": "tsc --noEmit",
    "prepare": "husky install"
  },
  "keywords": ["parkstay", "booking", "automation", "electron"],
  "author": "Your Name",
  "license": "MIT"
}
```

### `tsconfig.json` (Base)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@shared/*": ["src/shared/*"],
      "@preload/*": ["src/preload/*"]
    }
  }
}
```

### `tsconfig.main.json` (Main Process)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist/main",
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/shared/**/*", "src/preload/**/*"]
}
```

### `tsconfig.renderer.json` (Renderer Process)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "dist/renderer",
    "types": ["vite/client"]
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: 3000,
  },
});
```

### `electron-builder.json`

```json
{
  "appId": "com.parkstay.bookings",
  "productName": "ParkStay Bookings",
  "directories": {
    "output": "release",
    "buildResources": "resources"
  },
  "files": [
    "dist/**/*",
    "package.json"
  ],
  "mac": {
    "category": "public.app-category.utilities",
    "target": ["dmg", "zip"],
    "icon": "resources/icons/icon.icns",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "resources/entitlements.mac.plist",
    "entitlementsInherit": "resources/entitlements.mac.plist"
  },
  "win": {
    "target": ["nsis"],
    "icon": "resources/icons/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  },
  "linux": {
    "target": ["AppImage"],
    "icon": "resources/icons/icon.png",
    "category": "Utility"
  }
}
```

### `.eslintrc.json`

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    }
  },
  "plugins": ["@typescript-eslint", "react", "react-hooks"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off"
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
```

### `.prettierrc`

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

### `.gitignore`

```
# Dependencies
node_modules/
package-lock.json
yarn.lock

# Build output
dist/
release/
out/
*.js.map

# Database
*.db
*.db-shm
*.db-wal

# Logs
logs/
*.log

# Environment
.env
.env.local
.env.*.local

# Editor
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/

# Electron
*.asar
```

## Module Organization Principles

### 1. Separation of Concerns
- **Main Process**: Backend logic, data persistence, system integration
- **Renderer Process**: UI, user interactions, presentation logic
- **Preload**: Secure bridge between main and renderer
- **Shared**: Common code used by both processes

### 2. Layered Architecture
```
┌─────────────────────────────────────┐
│         Presentation Layer          │  (React Components)
├─────────────────────────────────────┤
│         Application Layer           │  (Hooks, State Management)
├─────────────────────────────────────┤
│         Service Layer               │  (Business Logic)
├─────────────────────────────────────┤
│         Data Access Layer           │  (Repositories)
├─────────────────────────────────────┤
│         Persistence Layer           │  (SQLite Database)
└─────────────────────────────────────┘
```

### 3. Dependency Rules
- Higher layers depend on lower layers
- Lower layers never depend on higher layers
- Shared code has no dependencies on main or renderer
- Use dependency injection for testability

### 4. Module Boundaries
- Each module has a single responsibility
- Modules communicate through well-defined interfaces
- Internal implementation details are hidden
- Use barrel exports (index.ts) for clean imports

### 5. Naming Conventions

**Files:**
- Components: `PascalCase.tsx` (e.g., `BookingCard.tsx`)
- Services: `kebab-case.service.ts` (e.g., `booking-manager.service.ts`)
- Repositories: `kebab-case.repository.ts` (e.g., `user.repository.ts`)
- Types: `kebab-case.types.ts` (e.g., `booking.types.ts`)
- Tests: `<filename>.test.ts(x)` or `<filename>.spec.ts(x)`

**Variables/Functions:**
- camelCase for variables and functions
- PascalCase for classes and React components
- UPPER_SNAKE_CASE for constants
- Prefix boolean variables with `is`, `has`, `should`

**TypeScript:**
- Interfaces: `PascalCase` with `I` prefix optional (e.g., `Booking` or `IBooking`)
- Types: `PascalCase` (e.g., `BookingStatus`)
- Enums: `PascalCase` with members in `UPPER_SNAKE_CASE`

## Configuration Management

### Application Settings

Settings stored in `electron-store` at:
- **Windows**: `%APPDATA%\parkstay-bookings\config.json`
- **macOS**: `~/Library/Application Support/parkstay-bookings/config.json`

```typescript
interface AppSettings {
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
  };
  watches: {
    defaultInterval: number;
    maxConcurrent: number;
  };
  stq: {
    defaultInterval: number;
    maxAttempts: number;
  };
  ui: {
    theme: 'light' | 'dark';
    startMinimized: boolean;
    minimizeToTray: boolean;
  };
}
```

### Environment Variables

For development, use `.env` file:

```
NODE_ENV=development
VITE_API_BASE_URL=https://parkstay.dbca.wa.gov.au
LOG_LEVEL=debug
DATABASE_PATH=./data/parkstay-dev.db
```

### Build Configuration

Different configurations for development, staging, and production:
- `electron-builder.dev.json`
- `electron-builder.staging.json`
- `electron-builder.json` (production)

## Build and Distribution

### Development Workflow

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run linting
npm run lint

# Run tests
npm run test

# Type checking
npm run type-check
```

### Production Build

```bash
# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac
```

### Output Structure

```
release/
├── win-unpacked/              # Windows unpacked files
├── mac/                       # macOS unpacked files
├── ParkStay Bookings-1.0.0.exe  # Windows installer
├── ParkStay Bookings-1.0.0.dmg  # macOS installer
└── latest.yml                 # Update metadata
```

## Best Practices

### Code Organization
1. Keep files small and focused (< 300 lines)
2. Use barrel exports for clean imports
3. Co-locate related files (component + styles + tests)
4. Separate business logic from UI logic

### TypeScript
1. Avoid `any` type - use `unknown` if necessary
2. Define explicit return types for functions
3. Use interfaces for public APIs, types for internal
4. Enable strict mode in tsconfig

### React
1. Use functional components with hooks
2. Keep components pure when possible
3. Extract custom hooks for reusable logic
4. Use React.memo for expensive components

### Testing
1. Write tests alongside code
2. Aim for 80%+ code coverage
3. Mock external dependencies
4. Test user interactions, not implementation

### Performance
1. Lazy load routes and components
2. Use React.memo and useMemo appropriately
3. Virtualize long lists
4. Optimize database queries with indexes

### Security
1. Never expose sensitive APIs to renderer
2. Validate all IPC messages
3. Sanitize user inputs
4. Keep dependencies updated

## Conclusion

This project structure provides a solid foundation for building a maintainable, scalable Electron application. It follows industry best practices and separates concerns clearly between different layers of the application.
