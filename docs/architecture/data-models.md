# WA ParkStay Bookings - Data Models

**Version:** 1.0
**Date:** 2025-10-31

## Overview

This document provides detailed specifications for all data models in the WA ParkStay Bookings application. Each model includes database schema, TypeScript interfaces, validation rules, and relationships.

## Table of Contents

1. [User Model](#user-model)
2. [Booking Model](#booking-model)
3. [Watch Model](#watch-model)
4. [Skip The Queue Model](#skip-the-queue-model)
5. [Notification Model](#notification-model)
6. [Job Log Model](#job-log-model)
7. [Settings Model](#settings-model)
8. [Data Relationships](#data-relationships)
9. [Validation Schemas](#validation-schemas)

## User Model

### Purpose
Stores user credentials for ParkStay authentication.

### Database Schema

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    encrypted_password TEXT NOT NULL,
    encryption_key TEXT NOT NULL,
    encryption_iv TEXT NOT NULL,
    encryption_auth_tag TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```

### TypeScript Interface

```typescript
interface User {
  id: number;
  email: string;
  encryptedPassword: string;
  encryptionKey: string;
  encryptionIv: string;
  encryptionAuthTag: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Input for creating/updating user
interface UserInput {
  email: string;
  password: string; // Plain text, will be encrypted
  firstName?: string;
  lastName?: string;
  phone?: string;
}

// Credentials (decrypted)
interface UserCredentials {
  email: string;
  password: string;
}
```

### Validation Rules

- **email**: Required, valid email format, unique
- **password**: Required, minimum 8 characters (when creating)
- **firstName**: Optional, max 100 characters
- **lastName**: Optional, max 100 characters
- **phone**: Optional, valid phone format

### Business Rules

1. Only one user supported initially (single-user application)
2. Password encrypted using AES-256-GCM
3. Encryption key derived from machine ID
4. Password never stored in plain text
5. Password required for all ParkStay operations

## Booking Model

### Purpose
Stores booking information from ParkStay, both imported and newly created.

### Database Schema

```sql
CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    booking_reference TEXT UNIQUE NOT NULL,
    park_name TEXT NOT NULL,
    campground_name TEXT NOT NULL,
    site_number TEXT,
    site_type TEXT,
    arrival_date DATE NOT NULL,
    departure_date DATE NOT NULL,
    num_nights INTEGER NOT NULL,
    num_guests INTEGER NOT NULL,
    total_cost DECIMAL(10,2),
    currency TEXT DEFAULT 'AUD',
    status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled', 'pending')),
    booking_data JSON, -- Full booking details from ParkStay
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_reference ON bookings(booking_reference);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_arrival_date ON bookings(arrival_date);
CREATE INDEX idx_bookings_dates ON bookings(arrival_date, departure_date);
```

### TypeScript Interface

```typescript
interface Booking {
  id: number;
  userId: number;
  bookingReference: string;
  parkName: string;
  campgroundName: string;
  siteNumber?: string;
  siteType?: string;
  arrivalDate: Date;
  departureDate: Date;
  numNights: number;
  numGuests: number;
  totalCost?: number;
  currency: string;
  status: BookingStatus;
  bookingData?: ParkStayBookingData;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;
}

enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
}

interface BookingInput {
  bookingReference: string;
  parkName: string;
  campgroundName: string;
  siteNumber?: string;
  siteType?: string;
  arrivalDate: Date;
  departureDate: Date;
  numGuests: number;
  totalCost?: number;
  notes?: string;
}

// Raw booking data from ParkStay API
interface ParkStayBookingData {
  id: string;
  bookingNumber: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  campground: {
    id: string;
    name: string;
    parkId: string;
    parkName: string;
  };
  site: {
    id: string;
    name: string;
    type: string;
  };
  dates: {
    arrival: string;
    departure: string;
    nights: number;
  };
  charges: {
    subtotal: number;
    fees: number;
    total: number;
    currency: string;
  };
  status: string;
  createdAt: string;
  // Additional fields from ParkStay
  [key: string]: any;
}
```

### Validation Rules

- **bookingReference**: Required, unique, alphanumeric
- **parkName**: Required, max 200 characters
- **campgroundName**: Required, max 200 characters
- **siteNumber**: Optional, max 50 characters
- **arrivalDate**: Required, valid date
- **departureDate**: Required, valid date, must be after arrivalDate
- **numNights**: Auto-calculated from dates
- **numGuests**: Required, minimum 1, maximum 50
- **totalCost**: Optional, must be positive
- **status**: Required, must be one of enum values

### Business Rules

1. `numNights` automatically calculated from arrival and departure dates
2. `departureDate` must be after `arrivalDate`
3. Cannot delete bookings with active STQ entries
4. Sync with ParkStay periodically to update status
5. `bookingData` stores complete ParkStay response for reference

## Watch Model

### Purpose
Stores watch configurations for monitoring campground availability.

### Database Schema

```sql
CREATE TABLE watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    park_id TEXT NOT NULL,
    park_name TEXT NOT NULL,
    campground_id TEXT NOT NULL,
    campground_name TEXT NOT NULL,
    arrival_date DATE NOT NULL,
    departure_date DATE NOT NULL,
    num_guests INTEGER NOT NULL,
    preferred_sites JSON, -- Array of site IDs/names
    site_type TEXT, -- preferred site type
    check_interval_minutes INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT 1,
    last_checked_at DATETIME,
    next_check_at DATETIME,
    last_result TEXT, -- 'found', 'not_found', 'error'
    found_count INTEGER DEFAULT 0,
    auto_book BOOLEAN DEFAULT 0,
    notify_only BOOLEAN DEFAULT 1,
    max_price DECIMAL(10,2),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_watches_user_id ON watches(user_id);
CREATE INDEX idx_watches_active ON watches(is_active);
CREATE INDEX idx_watches_next_check ON watches(next_check_at);
CREATE INDEX idx_watches_dates ON watches(arrival_date, departure_date);
```

### TypeScript Interface

```typescript
interface Watch {
  id: number;
  userId: number;
  name: string;
  parkId: string;
  parkName: string;
  campgroundId: string;
  campgroundName: string;
  arrivalDate: Date;
  departureDate: Date;
  numGuests: number;
  preferredSites?: string[];
  siteType?: string;
  checkIntervalMinutes: number;
  isActive: boolean;
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
  lastResult?: WatchResult;
  foundCount: number;
  autoBook: boolean;
  notifyOnly: boolean;
  maxPrice?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

enum WatchResult {
  FOUND = 'found',
  NOT_FOUND = 'not_found',
  ERROR = 'error',
}

interface WatchInput {
  name: string;
  parkId: string;
  parkName: string;
  campgroundId: string;
  campgroundName: string;
  arrivalDate: Date;
  departureDate: Date;
  numGuests: number;
  preferredSites?: string[];
  siteType?: string;
  checkIntervalMinutes?: number;
  autoBook?: boolean;
  notifyOnly?: boolean;
  maxPrice?: number;
  notes?: string;
}

// Result from executing a watch
interface WatchExecutionResult {
  watchId: number;
  success: boolean;
  found: boolean;
  availability?: AvailabilityResult[];
  error?: Error;
  checkedAt: Date;
}

interface AvailabilityResult {
  siteId: string;
  siteName: string;
  siteType: string;
  available: boolean;
  price: number;
  dates: {
    arrival: Date;
    departure: Date;
  };
}
```

### Validation Rules

- **name**: Required, max 200 characters
- **parkId**: Required
- **campgroundId**: Required
- **arrivalDate**: Required, must be in the future
- **departureDate**: Required, must be after arrivalDate
- **numGuests**: Required, minimum 1, maximum 50
- **checkIntervalMinutes**: Optional, minimum 1, maximum 60, default 5
- **maxPrice**: Optional, must be positive

### Business Rules

1. Watch only runs when `isActive` is true
2. `nextCheckAt` calculated based on `checkIntervalMinutes`
3. If `autoBook` is true, automatically create booking when found
4. If `notifyOnly` is true, only send notification when found
5. Cannot enable both `autoBook` and have date in the past
6. `foundCount` increments each time availability is found
7. Watch automatically deactivates after successful auto-book
8. Minimum check interval is 1 minute (to avoid rate limiting)

## Skip The Queue Model

### Purpose
Stores Skip The Queue configurations for rebooking cancelled bookings.

### Database Schema

```sql
CREATE TABLE skip_the_queue_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    booking_id INTEGER NOT NULL,
    booking_reference TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    check_interval_minutes INTEGER DEFAULT 2,
    last_checked_at DATETIME,
    next_check_at DATETIME,
    attempts_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 1000,
    last_result TEXT, -- 'success', 'unavailable', 'error'
    success_date DATETIME,
    new_booking_reference TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX idx_stq_user_id ON skip_the_queue_entries(user_id);
CREATE INDEX idx_stq_booking_id ON skip_the_queue_entries(booking_id);
CREATE INDEX idx_stq_active ON skip_the_queue_entries(is_active);
CREATE INDEX idx_stq_next_check ON skip_the_queue_entries(next_check_at);
```

### TypeScript Interface

```typescript
interface SkipTheQueueEntry {
  id: number;
  userId: number;
  bookingId: number;
  bookingReference: string;
  isActive: boolean;
  checkIntervalMinutes: number;
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
  attemptsCount: number;
  maxAttempts: number;
  lastResult?: STQResult;
  successDate?: Date;
  newBookingReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

enum STQResult {
  SUCCESS = 'success',
  UNAVAILABLE = 'unavailable',
  ERROR = 'error',
}

interface STQInput {
  bookingId: number;
  bookingReference: string;
  checkIntervalMinutes?: number;
  maxAttempts?: number;
  notes?: string;
}

// Result from executing STQ check
interface STQExecutionResult {
  stqId: number;
  success: boolean;
  rebooked: boolean;
  newBookingReference?: string;
  error?: Error;
  checkedAt: Date;
}
```

### Validation Rules

- **bookingId**: Required, must reference existing booking
- **bookingReference**: Required, alphanumeric
- **checkIntervalMinutes**: Optional, minimum 1, maximum 30, default 2
- **maxAttempts**: Optional, minimum 1, default 1000
- **notes**: Optional, max 500 characters

### Business Rules

1. Only runs when `isActive` is true
2. Automatically deactivates when `attemptsCount` >= `maxAttempts`
3. Automatically deactivates on successful rebooking
4. `nextCheckAt` calculated based on `checkIntervalMinutes`
5. When successful, creates new booking record with `newBookingReference`
6. Original booking status updated to 'cancelled'
7. Minimum check interval is 1 minute
8. STQ entry cannot be created for already-cancelled bookings

## Notification Model

### Purpose
Stores in-app notifications for user alerts.

### Database Schema

```sql
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('watch_found', 'stq_success', 'booking_confirmed', 'error', 'warning', 'info')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id INTEGER, -- ID of related booking/watch/stq
    related_type TEXT CHECK(related_type IN ('booking', 'watch', 'stq')),
    action_url TEXT, -- Internal URL to navigate to
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
```

### TypeScript Interface

```typescript
interface Notification {
  id: number;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: number;
  relatedType?: RelatedType;
  actionUrl?: string;
  isRead: boolean;
  createdAt: Date;
}

enum NotificationType {
  WATCH_FOUND = 'watch_found',
  STQ_SUCCESS = 'stq_success',
  BOOKING_CONFIRMED = 'booking_confirmed',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

enum RelatedType {
  BOOKING = 'booking',
  WATCH = 'watch',
  STQ = 'stq',
}

interface NotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: number;
  relatedType?: RelatedType;
  actionUrl?: string;
}
```

### Validation Rules

- **type**: Required, must be one of enum values
- **title**: Required, max 200 characters
- **message**: Required, max 1000 characters
- **relatedType**: Required if relatedId provided
- **actionUrl**: Optional, must be valid internal URL format

### Business Rules

1. Notifications sorted by `createdAt` DESC
2. Unread count displayed in UI badge
3. Clicking notification marks as read
4. Clicking notification navigates to `actionUrl` if provided
5. Old notifications (>30 days) auto-archived
6. Max 1000 notifications stored per user

## Job Log Model

### Purpose
Logs execution history of scheduled jobs (watches and STQ checks).

### Database Schema

```sql
CREATE TABLE job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL CHECK(job_type IN ('watch_poll', 'stq_check', 'cleanup')),
    job_id INTEGER NOT NULL, -- ID of watch or stq entry
    status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'error')),
    message TEXT,
    error_details TEXT,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_logs_type ON job_logs(job_type);
CREATE INDEX idx_job_logs_job_id ON job_logs(job_id);
CREATE INDEX idx_job_logs_status ON job_logs(status);
CREATE INDEX idx_job_logs_created_at ON job_logs(created_at);
```

### TypeScript Interface

```typescript
interface JobLog {
  id: number;
  jobType: JobType;
  jobId: number;
  status: JobStatus;
  message?: string;
  errorDetails?: string;
  durationMs?: number;
  createdAt: Date;
}

enum JobType {
  WATCH_POLL = 'watch_poll',
  STQ_CHECK = 'stq_check',
  CLEANUP = 'cleanup',
}

enum JobStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  ERROR = 'error',
}

interface JobLogInput {
  jobType: JobType;
  jobId: number;
  status: JobStatus;
  message?: string;
  errorDetails?: string;
  durationMs?: number;
}
```

### Validation Rules

- **jobType**: Required, must be one of enum values
- **jobId**: Required
- **status**: Required, must be one of enum values
- **message**: Optional, max 500 characters
- **errorDetails**: Optional, max 2000 characters

### Business Rules

1. Logs retained for 30 days
2. Old logs auto-cleaned by cleanup job
3. Error logs retained longer (90 days) for debugging
4. Logs used for debugging and analytics

## Settings Model

### Purpose
Stores application configuration and user preferences.

### Database Schema

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK(value_type IN ('string', 'number', 'boolean', 'json')),
    category TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_settings_category ON settings(category);
```

### TypeScript Interface

```typescript
interface Setting {
  key: string;
  value: string; // Serialized value
  valueType: SettingValueType;
  category: SettingCategory;
  description?: string;
  updatedAt: Date;
}

enum SettingValueType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
}

enum SettingCategory {
  GENERAL = 'general',
  NOTIFICATIONS = 'notifications',
  WATCHES = 'watches',
  STQ = 'stq',
  UI = 'ui',
  ADVANCED = 'advanced',
}

// Typed settings interface
interface AppSettings {
  general: {
    launchOnStartup: boolean;
    minimizeToTray: boolean;
    checkForUpdates: boolean;
  };
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    soundFile: string;
  };
  watches: {
    defaultInterval: number;
    maxConcurrent: number;
    autoBookEnabled: boolean;
  };
  stq: {
    defaultInterval: number;
    maxAttempts: number;
    enabled: boolean;
  };
  ui: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    dateFormat: string;
  };
  advanced: {
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    databasePath: string;
    maxLogSize: number;
  };
}
```

### Validation Rules

- **key**: Required, unique
- **value**: Required
- **valueType**: Required, must be one of enum values
- **category**: Required, must be one of enum values

### Business Rules

1. Settings loaded on application startup
2. Settings cached in memory for performance
3. Settings persisted to database on change
4. Default settings created on first launch

### Default Settings

```typescript
const DEFAULT_SETTINGS: AppSettings = {
  general: {
    launchOnStartup: false,
    minimizeToTray: true,
    checkForUpdates: true,
  },
  notifications: {
    enabled: true,
    sound: true,
    desktop: true,
    soundFile: 'default',
  },
  watches: {
    defaultInterval: 5,
    maxConcurrent: 10,
    autoBookEnabled: false,
  },
  stq: {
    defaultInterval: 2,
    maxAttempts: 1000,
    enabled: true,
  },
  ui: {
    theme: 'system',
    language: 'en',
    dateFormat: 'DD/MM/YYYY',
  },
  advanced: {
    logLevel: 'info',
    databasePath: 'default',
    maxLogSize: 10485760, // 10MB
  },
};
```

## Data Relationships

### Entity Relationship Diagram

```
┌─────────────┐
│    User     │
│             │
│  id (PK)    │
│  email      │
│  password   │
└──────┬──────┘
       │
       │ 1:N
       │
   ┌───┴────────────────────────────────────┐
   │                                        │
   │                                        │
┌──▼────────┐  ┌──────────┐  ┌─────────────▼───┐
│  Booking  │  │  Watch   │  │  Notification   │
│           │  │          │  │                 │
│  id (PK)  │  │  id (PK) │  │  id (PK)        │
│  user_id  │  │  user_id │  │  user_id (FK)   │
│           │  │          │  │  related_id     │
└─────┬─────┘  └──────────┘  │  related_type   │
      │                      └─────────────────┘
      │ 1:N
      │
┌─────▼──────────────┐
│ Skip The Queue     │
│                    │
│  id (PK)           │
│  user_id (FK)      │
│  booking_id (FK)   │
└────────────────────┘
```

### Relationship Details

**User → Bookings**: One-to-Many
- One user can have many bookings
- Bookings deleted when user deleted (CASCADE)

**User → Watches**: One-to-Many
- One user can have many watches
- Watches deleted when user deleted (CASCADE)

**User → Notifications**: One-to-Many
- One user can have many notifications
- Notifications deleted when user deleted (CASCADE)

**Booking → Skip The Queue**: One-to-Many
- One booking can have multiple STQ entries (historical)
- STQ entries deleted when booking deleted (CASCADE)

**Watch/STQ → Notifications**: One-to-Many
- Notifications reference related watch/STQ via `related_id` and `related_type`
- No foreign key constraint (soft reference)

## Validation Schemas

Using Zod for runtime validation:

### Booking Schema

```typescript
import { z } from 'zod';

export const bookingSchema = z.object({
  bookingReference: z.string().min(1).max(50).regex(/^[A-Z0-9]+$/),
  parkName: z.string().min(1).max(200),
  campgroundName: z.string().min(1).max(200),
  siteNumber: z.string().max(50).optional(),
  siteType: z.string().max(50).optional(),
  arrivalDate: z.date().min(new Date('2000-01-01')),
  departureDate: z.date(),
  numGuests: z.number().int().min(1).max(50),
  totalCost: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
}).refine((data) => data.departureDate > data.arrivalDate, {
  message: "Departure date must be after arrival date",
  path: ["departureDate"],
});
```

### Watch Schema

```typescript
export const watchSchema = z.object({
  name: z.string().min(1).max(200),
  parkId: z.string().min(1),
  parkName: z.string().min(1).max(200),
  campgroundId: z.string().min(1),
  campgroundName: z.string().min(1).max(200),
  arrivalDate: z.date().min(new Date()),
  departureDate: z.date(),
  numGuests: z.number().int().min(1).max(50),
  preferredSites: z.array(z.string()).optional(),
  siteType: z.string().max(50).optional(),
  checkIntervalMinutes: z.number().int().min(1).max(60).default(5),
  autoBook: z.boolean().default(false),
  notifyOnly: z.boolean().default(true),
  maxPrice: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
}).refine((data) => data.departureDate > data.arrivalDate, {
  message: "Departure date must be after arrival date",
  path: ["departureDate"],
}).refine((data) => !(data.autoBook && data.arrivalDate < new Date()), {
  message: "Cannot auto-book for past dates",
  path: ["autoBook"],
});
```

### STQ Schema

```typescript
export const stqSchema = z.object({
  bookingId: z.number().int().positive(),
  bookingReference: z.string().min(1).max(50).regex(/^[A-Z0-9]+$/),
  checkIntervalMinutes: z.number().int().min(1).max(30).default(2),
  maxAttempts: z.number().int().min(1).default(1000),
  notes: z.string().max(500).optional(),
});
```

### User Schema

```typescript
export const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().regex(/^\+?[0-9\s\-()]+$/).optional(),
});
```

## Data Migration Strategy

### Version Control

Each schema change requires a migration file:

```typescript
interface Migration {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
  down: (db: Database) => Promise<void>;
}
```

### Example Migration

```typescript
// migrations/002-add-site-type.ts
export const migration: Migration = {
  version: 2,
  name: 'add-site-type-to-bookings',
  up: async (db) => {
    await db.exec(`
      ALTER TABLE bookings ADD COLUMN site_type TEXT;
      ALTER TABLE watches ADD COLUMN site_type TEXT;
    `);
  },
  down: async (db) => {
    // SQLite doesn't support DROP COLUMN easily
    // Would need to recreate table
    throw new Error('Downgrade not supported for this migration');
  },
};
```

## Data Integrity

### Constraints

1. **Foreign Keys**: Enabled for referential integrity
2. **Unique Constraints**: On booking reference, email
3. **Check Constraints**: On enum values, date ranges
4. **Not Null**: On required fields

### Triggers

```sql
-- Auto-update updated_at timestamp
CREATE TRIGGER update_bookings_timestamp
AFTER UPDATE ON bookings
BEGIN
    UPDATE bookings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER update_watches_timestamp
AFTER UPDATE ON watches
BEGIN
    UPDATE watches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Calculate num_nights on insert/update
CREATE TRIGGER calculate_num_nights
BEFORE INSERT ON bookings
BEGIN
    UPDATE bookings SET num_nights = julianday(NEW.departure_date) - julianday(NEW.arrival_date)
    WHERE id = NEW.id;
END;
```

## Performance Considerations

### Indexes

All frequently queried columns have indexes:
- User email
- Booking reference, status, dates
- Watch active status, next check time
- STQ active status, next check time
- Notification read status, created date

### Query Optimization

1. Use prepared statements for repeated queries
2. Limit result sets with pagination
3. Use covering indexes where possible
4. Denormalize read-heavy data

### Data Cleanup

Automated cleanup jobs:
- Delete job logs older than 30 days
- Archive old notifications (>30 days)
- Vacuum database monthly

## Conclusion

These data models provide a solid foundation for the WA ParkStay Bookings application. They are normalized for data integrity while denormalized where needed for performance. The models support all required features including watches, Skip The Queue, notifications, and job scheduling.
