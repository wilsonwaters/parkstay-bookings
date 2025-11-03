# WA ParkStay Bookings - System Architecture

**Version:** 1.0
**Date:** 2025-10-31
**Status:** Draft

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Technology Stack](#technology-stack)
4. [Component Architecture](#component-architecture)
5. [Data Architecture](#data-architecture)
6. [Service Layer](#service-layer)
7. [Job Scheduling System](#job-scheduling-system)
8. [Notification System](#notification-system)
9. [Security Architecture](#security-architecture)
10. [Deployment Architecture](#deployment-architecture)

## Overview

### Purpose

The WA ParkStay Bookings application is a desktop tool that automates campground bookings on the Western Australia Parks and Wildlife Service ParkStay system. It provides users with the ability to:

- Set up automated booking watches for desired campsites
- Automatically rebook cancellations using "Skip The Queue"
- Manage existing bookings
- Receive notifications for booking events
- Store and manage ParkStay credentials securely

### Design Principles

1. **Local-First**: All functionality runs locally, no cloud dependencies
2. **User Privacy**: All data stored locally, credentials encrypted
3. **Reliability**: Robust error handling and retry mechanisms
4. **Simplicity**: Easy to install, configure, and use
5. **Transparency**: Clear logging and user notifications
6. **Maintainability**: Clean architecture, well-documented code

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop Application                       │
│                      (Electron)                              │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │           Renderer Process (React UI)              │    │
│  │                                                     │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐          │    │
│  │  │Dashboard │ │Bookings  │ │Settings  │ ...      │    │
│  │  │          │ │          │ │          │          │    │
│  │  └──────────┘ └──────────┘ └──────────┘          │    │
│  │                                                     │    │
│  │              ↕️ IPC Communication                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │             Main Process (Node.js)                 │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────┐     │    │
│  │  │         Service Layer                    │     │    │
│  │  │  ┌────────────┐  ┌──────────────┐      │     │    │
│  │  │  │ParkStay    │  │Booking       │      │     │    │
│  │  │  │Service     │  │Manager       │ ...  │     │    │
│  │  │  └────────────┘  └──────────────┘      │     │    │
│  │  └──────────────────────────────────────────┘     │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────┐     │    │
│  │  │       Job Scheduler (node-cron)          │     │    │
│  │  │  - Watch Polling                         │     │    │
│  │  │  - Skip The Queue Checks                 │     │    │
│  │  │  - Retry Jobs                            │     │    │
│  │  └──────────────────────────────────────────┘     │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────┐     │    │
│  │  │      Data Layer (SQLite)                 │     │    │
│  │  │  - Bookings                              │     │    │
│  │  │  - Watches                               │     │    │
│  │  │  - Credentials (encrypted)               │     │    │
│  │  │  - Logs                                  │     │    │
│  │  └──────────────────────────────────────────┘     │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────┐     │    │
│  │  │    External Integration                  │     │    │
│  │  │  - ParkStay API Client                   │     │    │
│  │  │  - HTTP Client (axios)                   │     │    │
│  │  └──────────────────────────────────────────┘     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           ↕️
                    Network (HTTPS)
                           ↕️
              ┌───────────────────────┐
              │   ParkStay Website    │
              │  (parkstay.dbca.wa.   │
              │     gov.au)           │
              └───────────────────────┘
```

## Technology Stack

### Core Technologies

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Desktop Framework | Electron | 28+ | Desktop application wrapper |
| UI Framework | React | 18+ | User interface |
| Language | TypeScript | 5+ | Type-safe development |
| Runtime | Node.js | 20 LTS | Backend runtime |
| Database | SQLite | 3.43+ | Local data storage |
| Build Tool | Vite | 5+ | Fast builds and HMR |
| Packaging | Electron Builder | 24+ | Distribution packaging |

### Key Libraries

#### Frontend
- **React Router** - Navigation and routing
- **Tailwind CSS** - Utility-first styling
- **Shadcn/ui** - Component library
- **React Hook Form** - Form management
- **Zod** - Schema validation
- **TanStack Query** - Data fetching and caching
- **date-fns** - Date manipulation
- **Recharts** - Data visualization

#### Backend
- **better-sqlite3** - Fast SQLite access
- **node-cron** - Job scheduling
- **axios** - HTTP client
- **cheerio** - HTML parsing (if needed)
- **crypto (built-in)** - Encryption
- **electron-store** - Configuration storage
- **winston** - Logging

### Development Tools

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Jest** - Unit testing
- **Playwright** - E2E testing
- **TypeScript** - Type checking
- **Husky** - Git hooks

## Component Architecture

### Frontend Components

```
src/renderer/
├── pages/                    # Page-level components
│   ├── Dashboard.tsx        # Main dashboard
│   ├── Bookings.tsx         # Booking management
│   ├── Watches.tsx          # Watch configuration
│   ├── SkipTheQueue.tsx     # STQ management
│   └── Settings.tsx         # Application settings
├── components/              # Reusable components
│   ├── ui/                  # Base UI components
│   ├── forms/               # Form components
│   ├── modals/              # Modal dialogs
│   └── layouts/             # Layout components
├── hooks/                   # Custom React hooks
├── services/                # Frontend services (IPC wrappers)
├── stores/                  # State management
├── types/                   # TypeScript types
└── utils/                   # Utility functions
```

### Backend Components

```
src/main/
├── services/                # Business logic services
│   ├── parkstay/           # ParkStay API integration
│   ├── booking/            # Booking management
│   ├── watch/              # Watch management
│   ├── auth/               # Authentication
│   └── notification/       # Notifications
├── database/               # Database layer
│   ├── repositories/       # Data access objects
│   ├── migrations/         # Schema migrations
│   └── models/             # Data models
├── scheduler/              # Job scheduling
│   ├── jobs/              # Job definitions
│   └── queue/             # Job queue management
├── ipc/                   # IPC handlers
├── config/                # Configuration
└── utils/                 # Utility functions
```

## Data Architecture

### Database Schema

#### Users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    encrypted_password TEXT NOT NULL,
    encryption_key TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Bookings Table
```sql
CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    booking_reference TEXT UNIQUE NOT NULL,
    park_name TEXT NOT NULL,
    campground_name TEXT NOT NULL,
    site_number TEXT,
    arrival_date DATE NOT NULL,
    departure_date DATE NOT NULL,
    num_guests INTEGER NOT NULL,
    total_cost DECIMAL(10,2),
    status TEXT NOT NULL, -- 'confirmed', 'cancelled', 'pending'
    booking_data JSON, -- Full booking details
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Watches Table
```sql
CREATE TABLE watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    park_id TEXT NOT NULL,
    campground_id TEXT NOT NULL,
    arrival_date DATE NOT NULL,
    departure_date DATE NOT NULL,
    num_guests INTEGER NOT NULL,
    preferred_sites JSON, -- Array of site IDs/names
    check_interval_minutes INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT 1,
    last_checked_at DATETIME,
    next_check_at DATETIME,
    auto_book BOOLEAN DEFAULT 0,
    notify_only BOOLEAN DEFAULT 1,
    max_price DECIMAL(10,2),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Skip The Queue Entries Table
```sql
CREATE TABLE skip_the_queue_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    booking_id INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    check_interval_minutes INTEGER DEFAULT 2,
    last_checked_at DATETIME,
    next_check_at DATETIME,
    attempts_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 1000,
    success_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
);
```

#### Notifications Table
```sql
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'watch_found', 'stq_success', 'error', 'info'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id INTEGER, -- ID of related booking/watch
    related_type TEXT, -- 'booking', 'watch', 'stq'
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Job Logs Table
```sql
CREATE TABLE job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL, -- 'watch_poll', 'stq_check'
    job_id INTEGER NOT NULL,
    status TEXT NOT NULL, -- 'success', 'failure', 'error'
    message TEXT,
    error_details TEXT,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Settings Table
```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Data Models (TypeScript)

```typescript
// User Model
interface User {
  id: number;
  email: string;
  encryptedPassword: string;
  encryptionKey: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Booking Model
interface Booking {
  id: number;
  userId: number;
  bookingReference: string;
  parkName: string;
  campgroundName: string;
  siteNumber?: string;
  arrivalDate: Date;
  departureDate: Date;
  numGuests: number;
  totalCost?: number;
  status: 'confirmed' | 'cancelled' | 'pending';
  bookingData?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Watch Model
interface Watch {
  id: number;
  userId: number;
  name: string;
  parkId: string;
  campgroundId: string;
  arrivalDate: Date;
  departureDate: Date;
  numGuests: number;
  preferredSites?: string[];
  checkIntervalMinutes: number;
  isActive: boolean;
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
  autoBook: boolean;
  notifyOnly: boolean;
  maxPrice?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Skip The Queue Model
interface SkipTheQueueEntry {
  id: number;
  userId: number;
  bookingId: number;
  isActive: boolean;
  checkIntervalMinutes: number;
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
  attemptsCount: number;
  maxAttempts: number;
  successDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Notification Model
interface Notification {
  id: number;
  userId: number;
  type: 'watch_found' | 'stq_success' | 'error' | 'info';
  title: string;
  message: string;
  relatedId?: number;
  relatedType?: 'booking' | 'watch' | 'stq';
  isRead: boolean;
  createdAt: Date;
}
```

## Service Layer

### ParkStay Service

Handles all interactions with the ParkStay website.

```typescript
class ParkStayService {
  // Authentication
  async login(email: string, password: string): Promise<SessionToken>
  async logout(): Promise<void>
  async validateSession(): Promise<boolean>

  // Search
  async searchAvailability(params: SearchParams): Promise<AvailabilityResult[]>

  // Booking
  async createBooking(params: BookingParams): Promise<Booking>
  async getBookingDetails(reference: string): Promise<BookingDetails>
  async cancelBooking(reference: string): Promise<void>

  // Skip The Queue
  async checkSkipTheQueue(bookingRef: string): Promise<STQResult>
  async rebook(bookingRef: string): Promise<RebookResult>
}
```

**Key Responsibilities:**
- HTTP client management
- Session management
- Cookie handling
- Request/response parsing
- Error handling and retries
- Rate limiting

### Booking Manager Service

Manages booking-related operations.

```typescript
class BookingManagerService {
  // CRUD operations
  async createBooking(booking: BookingInput): Promise<Booking>
  async getBooking(id: number): Promise<Booking>
  async listBookings(userId: number): Promise<Booking[]>
  async updateBooking(id: number, updates: Partial<Booking>): Promise<Booking>
  async deleteBooking(id: number): Promise<void>

  // Sync with ParkStay
  async syncBooking(bookingRef: string): Promise<Booking>
  async syncAllBookings(userId: number): Promise<void>

  // Import
  async importBooking(bookingRef: string, userId: number): Promise<Booking>
}
```

### Watch Manager Service

Manages watch configurations and monitoring.

```typescript
class WatchManagerService {
  // CRUD operations
  async createWatch(watch: WatchInput): Promise<Watch>
  async getWatch(id: number): Promise<Watch>
  async listWatches(userId: number): Promise<Watch[]>
  async updateWatch(id: number, updates: Partial<Watch>): Promise<Watch>
  async deleteWatch(id: number): Promise<void>

  // Activation
  async activateWatch(id: number): Promise<void>
  async deactivateWatch(id: number): Promise<void>

  // Execution
  async executeWatch(id: number): Promise<WatchResult>
  async handleWatchResult(watch: Watch, result: WatchResult): Promise<void>
}
```

### Skip The Queue Manager Service

Manages Skip The Queue functionality.

```typescript
class STQManagerService {
  // CRUD operations
  async createSTQEntry(entry: STQInput): Promise<SkipTheQueueEntry>
  async getSTQEntry(id: number): Promise<SkipTheQueueEntry>
  async listSTQEntries(userId: number): Promise<SkipTheQueueEntry[]>
  async updateSTQEntry(id: number, updates: Partial<SkipTheQueueEntry>): Promise<SkipTheQueueEntry>
  async deleteSTQEntry(id: number): Promise<void>

  // Activation
  async activateSTQ(id: number): Promise<void>
  async deactivateSTQ(id: number): Promise<void>

  // Execution
  async executeSTQ(id: number): Promise<STQResult>
  async handleSTQResult(entry: SkipTheQueueEntry, result: STQResult): Promise<void>
}
```

### Authentication Service

Manages user credentials securely.

```typescript
class AuthService {
  // Credential management
  async storeCredentials(email: string, password: string): Promise<void>
  async getCredentials(): Promise<{ email: string; password: string } | null>
  async updateCredentials(email: string, password: string): Promise<void>
  async deleteCredentials(): Promise<void>

  // Encryption
  async encryptPassword(password: string): Promise<string>
  async decryptPassword(encrypted: string): Promise<string>

  // Session
  async getSession(): Promise<SessionToken | null>
  async refreshSession(): Promise<SessionToken>
}
```

### Notification Service

Handles user notifications.

```typescript
class NotificationService {
  // Create notifications
  async notify(notification: NotificationInput): Promise<Notification>
  async notifyWatchFound(watch: Watch, availability: AvailabilityResult): Promise<void>
  async notifySTQSuccess(entry: SkipTheQueueEntry, booking: Booking): Promise<void>
  async notifyError(error: Error, context: string): Promise<void>

  // Desktop notifications
  async showDesktopNotification(title: string, message: string): Promise<void>
  async playNotificationSound(): Promise<void>

  // Management
  async getNotifications(userId: number): Promise<Notification[]>
  async markAsRead(id: number): Promise<void>
  async deleteNotification(id: number): Promise<void>
}
```

## Job Scheduling System

### Architecture

The job scheduler uses **node-cron** for time-based scheduling and a custom queue system for immediate job execution.

```typescript
class JobScheduler {
  private cronJobs: Map<string, CronJob>;
  private queue: JobQueue;

  // Lifecycle
  async start(): Promise<void>
  async stop(): Promise<void>

  // Watch jobs
  async scheduleWatch(watch: Watch): Promise<void>
  async unscheduleWatch(watchId: number): Promise<void>

  // STQ jobs
  async scheduleSTQ(entry: SkipTheQueueEntry): Promise<void>
  async unscheduleSTQ(entryId: number): Promise<void>

  // Manual execution
  async executeWatchNow(watchId: number): Promise<void>
  async executeSTQNow(entryId: number): Promise<void>
}
```

### Job Types

#### Watch Poll Job

**Frequency:** Configurable per watch (default: 5 minutes)
**Purpose:** Check for availability matching watch criteria

```typescript
interface WatchPollJob {
  watchId: number;
  execute: async () => {
    // 1. Get watch from database
    // 2. Check if active
    // 3. Call ParkStay search API
    // 4. Compare results with criteria
    // 5. If match found:
    //    - Send notification
    //    - Optionally auto-book
    // 6. Update last_checked_at
    // 7. Schedule next check
    // 8. Log result
  };
}
```

#### Skip The Queue Check Job

**Frequency:** Configurable per entry (default: 2 minutes)
**Purpose:** Attempt to rebook a cancelled booking

```typescript
interface STQCheckJob {
  entryId: number;
  execute: async () => {
    // 1. Get STQ entry from database
    // 2. Check if active and under max attempts
    // 3. Call ParkStay STQ API
    // 4. If successful:
    //    - Create new booking record
    //    - Send notification
    //    - Mark STQ entry as complete
    // 5. Increment attempts counter
    // 6. Schedule next check (if not complete)
    // 7. Log result
  };
}
```

### Error Handling

- **Transient Errors:** Retry with exponential backoff
- **Rate Limiting:** Back off and reschedule
- **Authentication Errors:** Notify user, pause jobs
- **Network Errors:** Retry up to 3 times
- **Permanent Errors:** Disable job, notify user

### Job Persistence

Jobs are persisted in the database to survive application restarts:

```typescript
interface ScheduledJob {
  id: string;
  type: 'watch' | 'stq';
  relatedId: number;
  cronExpression: string;
  nextRunAt: Date;
  isActive: boolean;
}
```

On application startup:
1. Load all active jobs from database
2. Recalculate next run times
3. Schedule jobs with node-cron
4. Resume execution

## Notification System

### Notification Types

1. **Watch Found**: When availability matches a watch
2. **STQ Success**: When rebooking succeeds
3. **Booking Confirmation**: When booking is created
4. **Error Alerts**: When jobs fail
5. **System Messages**: General information

### Delivery Channels

#### In-App Notifications
- Notification bell icon in UI
- Badge count for unread notifications
- Notification list in sidebar
- Real-time updates via IPC

#### Desktop Notifications
- Native OS notifications (Electron)
- Appear even when app is minimized
- Clickable to open relevant page
- Sound optional (configurable)

#### System Tray
- System tray icon
- Badge/indicator for active watches
- Quick access menu
- Status tooltips

### Notification Flow

```
Event Occurs (Watch Found, STQ Success, Error)
    ↓
NotificationService.notify()
    ↓
├─→ Store in database
├─→ Send to renderer via IPC
├─→ Show desktop notification
└─→ Play sound (if enabled)
    ↓
User sees notification
    ↓
User clicks notification
    ↓
App navigates to relevant page
```

## Security Architecture

### Credential Storage

**Encryption Strategy:**
1. User password encrypted with AES-256-GCM
2. Encryption key derived from machine-specific data
3. Key stored separately from encrypted data
4. No master password required (seamless UX)

```typescript
class CredentialStore {
  private machineId: string;
  private algorithm = 'aes-256-gcm';

  async encrypt(password: string): Promise<EncryptedData> {
    const key = await this.deriveKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return { encrypted, iv: iv.toString('hex'), authTag: authTag.toString('hex') };
  }

  async decrypt(data: EncryptedData): Promise<string> {
    const key = await this.deriveKey();
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(data.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private async deriveKey(): Promise<Buffer> {
    // Derive key from machine ID + app secret
    return crypto.pbkdf2Sync(
      this.machineId + APP_SECRET,
      'parkstay-salt',
      100000,
      32,
      'sha512'
    );
  }
}
```

### Session Management

- Session tokens stored in memory only
- Automatic re-authentication on token expiry
- Session timeout after 24 hours of inactivity
- Secure cookie handling

### IPC Security

```typescript
// Preload script (context bridge)
contextBridge.exposeInMainWorld('api', {
  // Only expose specific, validated methods
  booking: {
    create: (data: BookingInput) => ipcRenderer.invoke('booking:create', data),
    list: () => ipcRenderer.invoke('booking:list'),
    // ...
  },
  // Never expose direct database access
  // Never expose credential decryption to renderer
});
```

**Security Measures:**
- Context isolation enabled
- Node integration disabled in renderer
- Validate all IPC messages
- Sanitize user inputs
- No direct database access from renderer

### Data Privacy

- All data stored locally
- No telemetry or analytics
- No external API calls except ParkStay
- Database encrypted at rest (OS-level)
- Secure file permissions

## Deployment Architecture

### Application Structure

```
parkstay-bookings/
├── app.asar                 # Packed application code
├── package.json
├── electron.exe / Electron  # Runtime
└── resources/
    ├── data/
    │   └── parkstay.db     # SQLite database
    ├── logs/
    └── config.json         # User config (electron-store)
```

### Installation

**Windows:**
- NSIS installer (.exe)
- Installs to Program Files
- Creates desktop shortcut
- Adds to Start Menu
- Option to run on startup
- Silent install supported

**macOS:**
- DMG with drag-to-Applications
- Code signed and notarized
- LaunchAgent for startup
- Native look and feel

### Auto-Update

```typescript
// Main process
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', (info) => {
  // Notify user of available update
});

autoUpdater.on('update-downloaded', (info) => {
  // Prompt user to restart and install
});
```

**Update Flow:**
1. Check for updates on startup
2. Download in background
3. Notify user when ready
4. Install on restart

### Data Migration

For database schema changes:

```typescript
class MigrationManager {
  private migrations: Migration[] = [
    { version: 1, up: async (db) => { /* initial schema */ } },
    { version: 2, up: async (db) => { /* add columns */ } },
    // ...
  ];

  async migrate(): Promise<void> {
    const currentVersion = this.getCurrentVersion();
    const targetVersion = this.migrations.length;

    for (let v = currentVersion + 1; v <= targetVersion; v++) {
      await this.migrations[v - 1].up(this.db);
      this.setCurrentVersion(v);
    }
  }
}
```

### Logging

```typescript
// Winston logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(app.getPath('userData'), 'logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(app.getPath('userData'), 'logs', 'combined.log'),
      maxsize: 5242880,
      maxFiles: 10,
    }),
  ],
});
```

**Log Levels:**
- **error**: Critical errors requiring user attention
- **warn**: Non-critical issues (rate limits, retries)
- **info**: Normal operations (job execution, bookings)
- **debug**: Detailed debugging information

### Performance Considerations

**Memory Management:**
- Limit concurrent jobs to 5
- Clear result caches after 1 hour
- Use database connection pooling
- Minimize renderer-main communication

**Database Optimization:**
- Index frequently queried columns
- Vacuum database monthly
- Archive old notifications/logs
- Limit query result sizes

**Network Optimization:**
- Reuse HTTP connections
- Compress requests/responses
- Implement request caching
- Rate limit API calls

## Technology Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI Framework | Electron + React | Cross-platform, rapid development, rich ecosystem |
| Language | TypeScript | Type safety, better developer experience |
| Database | SQLite | Local storage, no server needed, reliable |
| Job Scheduler | node-cron | Simple, reliable, sufficient for our needs |
| HTTP Client | axios | Mature, good error handling, interceptors |
| State Management | TanStack Query | Server state caching, automatic refetching |
| Styling | Tailwind CSS | Rapid UI development, consistent design |
| Testing | Jest + Playwright | Unit and E2E testing coverage |

## Future Considerations

### Potential Enhancements

1. **Multi-User Support**: Allow multiple ParkStay accounts
2. **Booking Templates**: Save common booking configurations
3. **Historical Analytics**: Track booking success rates
4. **Custom Notifications**: SMS/Email via user's own services
5. **Backup/Restore**: Export/import data
6. **Dark Mode**: Theme support
7. **Mobile Companion**: View-only mobile app

### Scalability

The architecture supports:
- Unlimited bookings and watches (SQLite scales to millions of rows)
- Concurrent job execution (Node.js async)
- Efficient polling (configurable intervals)
- Low resource usage (<200MB RAM baseline)

### Maintenance

- Regular dependency updates
- Security patches
- ParkStay website changes (scraping updates)
- User feedback and bug fixes

## Conclusion

This architecture provides a solid foundation for the WA ParkStay Bookings application. It balances simplicity with functionality, prioritizes user privacy and security, and provides a path for future enhancements. The local-first approach ensures reliability and user control over their data.
