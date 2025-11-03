# WA ParkStay Bookings - Architecture Diagrams

**Version:** 1.0
**Date:** 2025-10-31

## Overview

This document contains visual representations of the system architecture to complement the detailed architecture documentation.

## 1. System Context Diagram

Shows the system boundaries and external interactions.

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                         User's Computer                        │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                                                       │    │
│  │         WA ParkStay Bookings Application             │    │
│  │              (Electron Desktop App)                  │    │
│  │                                                       │    │
│  │  • Manage Bookings                                   │    │
│  │  • Configure Watches                                 │    │
│  │  • Enable Skip The Queue                             │    │
│  │  • Receive Notifications                             │    │
│  │                                                       │    │
│  │  Local Storage:                                      │    │
│  │  • SQLite Database (bookings, watches, credentials) │    │
│  │  • Configuration Files                               │    │
│  │  • Log Files                                         │    │
│  │                                                       │    │
│  └───────────────────┬──────────────────────────────────┘    │
│                      │                                        │
│                      │ HTTPS                                  │
└──────────────────────┼────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │   ParkStay Website      │
         │                         │
         │  parkstay.dbca.wa.      │
         │       gov.au            │
         │                         │
         │  • Search Availability  │
         │  • Create Bookings      │
         │  • View Bookings        │
         │  • Skip The Queue       │
         └─────────────────────────┘
```

## 2. High-Level Component Diagram

Shows major components and their relationships.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron Application                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │             Renderer Process (UI)                      │    │
│  │                                                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────┐ │    │
│  │  │Dashboard │  │Bookings  │  │Watches   │  │Settings│ │    │
│  │  │Page      │  │Page      │  │Page      │  │Page    │ │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └───────┘ │    │
│  │                                                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │    │
│  │  │Skip The  │  │Notifi-   │  │Common    │            │    │
│  │  │Queue Page│  │cations   │  │Components│            │    │
│  │  └──────────┘  └──────────┘  └──────────┘            │    │
│  │                                                         │    │
│  └───────────────────────┬─────────────────────────────────┘    │
│                          │ IPC                                  │
│  ┌───────────────────────▼─────────────────────────────────┐    │
│  │         Preload Script (Context Bridge)                 │    │
│  │  • Secure API Exposure                                  │    │
│  │  • IPC Message Validation                               │    │
│  └───────────────────────┬─────────────────────────────────┘    │
│                          │ IPC                                  │
│  ┌───────────────────────▼─────────────────────────────────┐    │
│  │             Main Process (Backend)                      │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │           Service Layer                         │   │    │
│  │  │                                                 │   │    │
│  │  │  ┌────────────┐  ┌────────────┐  ┌──────────┐ │   │    │
│  │  │  │ ParkStay   │  │  Booking   │  │  Watch   │ │   │    │
│  │  │  │  Service   │  │  Manager   │  │  Manager │ │   │    │
│  │  │  └────────────┘  └────────────┘  └──────────┘ │   │    │
│  │  │                                                 │   │    │
│  │  │  ┌────────────┐  ┌────────────┐  ┌──────────┐ │   │    │
│  │  │  │    STQ     │  │    Auth    │  │Notifi-   │ │   │    │
│  │  │  │  Manager   │  │  Service   │  │cation    │ │   │    │
│  │  │  └────────────┘  └────────────┘  └──────────┘ │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │        Job Scheduler (node-cron)                │   │    │
│  │  │  • Watch Polling Jobs                           │   │    │
│  │  │  • STQ Check Jobs                               │   │    │
│  │  │  • Cleanup Jobs                                 │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │         Data Access Layer                       │   │    │
│  │  │  • Repositories                                 │   │    │
│  │  │  • Database Connection                          │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                          │                              │    │
│  └──────────────────────────┼──────────────────────────────┘    │
│                             │                                   │
│                             ▼                                   │
│                    ┌────────────────┐                           │
│                    │ SQLite Database│                           │
│                    └────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ HTTPS
                             ▼
                  ┌──────────────────┐
                  │ ParkStay Website │
                  └──────────────────┘
```

## 3. Data Flow Diagram

### Watch Execution Flow

```
User Creates Watch
      │
      ▼
┌─────────────────┐
│  Watch Manager  │ ──┐
│   Service       │   │ Store watch config
└─────────────────┘   │
                      ▼
              ┌──────────────┐
              │   Database   │
              │  (watches)   │
              └──────────────┘
                      │
                      ▼
              ┌──────────────┐
              │Job Scheduler │ ──┐ Schedule next check
              └──────────────┘   │
                      │          │
        ┌─────────────┴──────────┘
        │
        ▼ (Every N minutes)
┌────────────────┐
│ Watch Poll Job │
└────────┬───────┘
         │
         ▼
┌──────────────────┐
│ ParkStay Service │ ──┐
│   .search()      │   │ API Request
└──────────────────┘   │
         │             ▼
         │    ┌────────────────┐
         │    │ ParkStay API   │
         │    └────────────────┘
         │             │
         │◄────────────┘ Response
         │
         ▼
    Availability
      Found?
      /    \
    Yes     No
     │       │
     ▼       ▼
┌─────────┐  └──► Update
│Notifi-  │        last_checked_at
│cation   │        Schedule next
│Service  │
└────┬────┘
     │
     ├──► Desktop Notification
     ├──► In-App Notification
     └──► Sound Alert
          │
          ▼
     Auto-Book
     Enabled?
      /    \
    Yes     No
     │       │
     ▼       └──► Done
┌──────────┐
│ Booking  │
│ Manager  │
└────┬─────┘
     │
     ▼
Create Booking
via ParkStay
     │
     ▼
Deactivate Watch
```

### Skip The Queue Flow

```
User Enables STQ for Booking
      │
      ▼
┌─────────────────┐
│  STQ Manager    │ ──┐
│   Service       │   │ Store STQ config
└─────────────────┘   │
                      ▼
              ┌──────────────┐
              │   Database   │
              │     (stq)    │
              └──────────────┘
                      │
                      ▼
              ┌──────────────┐
              │Job Scheduler │ ──┐ Schedule next check
              └──────────────┘   │
                      │          │
        ┌─────────────┴──────────┘
        │
        ▼ (Every N minutes)
┌────────────────┐
│ STQ Check Job  │
└────────┬───────┘
         │
         ▼
┌──────────────────┐
│ ParkStay Service │ ──┐
│ .checkSTQ()      │   │ API Request
└──────────────────┘   │
         │             ▼
         │    ┌────────────────┐
         │    │ ParkStay API   │
         │    │ Skip The Queue │
         │    └────────────────┘
         │             │
         │◄────────────┘ Response
         │
         ▼
    Booking
    Available?
      /    \
    Yes     No
     │       │
     ▼       ▼
┌─────────┐  Increment
│ParkStay │  attempts_count
│Service  │      │
│.rebook()│      ▼
└────┬────┘  Max attempts
     │        reached?
     │         /    \
     ▼       Yes    No
Rebook       │      │
Success      ▼      ▼
  │      Deactivate Schedule
  │         STQ     next
  ▼                check
┌──────────┐
│ Booking  │
│ Manager  │
└────┬─────┘
     │
     ├──► Create new booking record
     ├──► Update original booking status
     └──► Send notification
```

## 4. Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                      │
│                   (Untrusted Zone)                       │
│                                                          │
│  • No Node.js access                                    │
│  • No direct database access                            │
│  • No credential access                                 │
│  • Context isolated                                     │
│                                                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ IPC (Validated)
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Preload Script                          │
│                (Security Boundary)                       │
│                                                          │
│  • Context Bridge API                                   │
│  • Message validation                                   │
│  • Type checking                                        │
│  • No sensitive data exposure                           │
│                                                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Validated IPC
                     │
┌────────────────────▼────────────────────────────────────┐
│                   Main Process                           │
│                  (Trusted Zone)                          │
│                                                          │
│  ┌──────────────────────────────────────────┐           │
│  │        Credential Storage                │           │
│  │                                          │           │
│  │  Plain Password                          │           │
│  │       │                                  │           │
│  │       ▼                                  │           │
│  │  ┌─────────────────┐                    │           │
│  │  │ AES-256-GCM     │                    │           │
│  │  │ Encryption      │                    │           │
│  │  └────────┬────────┘                    │           │
│  │           │                              │           │
│  │           ▼                              │           │
│  │  Encrypted Password + IV + Auth Tag     │           │
│  │           │                              │           │
│  │           ▼                              │           │
│  │  ┌─────────────────┐                    │           │
│  │  │  SQLite DB      │                    │           │
│  │  │  (Encrypted)    │                    │           │
│  │  └─────────────────┘                    │           │
│  │                                          │           │
│  │  Encryption Key derived from:           │           │
│  │  • Machine ID (hardware)                │           │
│  │  • App Secret (hardcoded)               │           │
│  │  • PBKDF2 (100k iterations)             │           │
│  └──────────────────────────────────────────┘           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## 5. Job Scheduling Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Job Scheduler                          │
│                                                          │
│  ┌────────────────────────────────────────────┐         │
│  │         Job Queue (In-Memory)              │         │
│  │                                            │         │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────┐ │         │
│  │  │ Watch    │  │ Watch    │  │  STQ    │ │         │
│  │  │ Poll #1  │  │ Poll #2  │  │Check #1 │ │         │
│  │  └──────────┘  └──────────┘  └─────────┘ │         │
│  └────────────────────────────────────────────┘         │
│           │              │              │               │
│           ▼              ▼              ▼               │
│  ┌────────────┐  ┌────────────┐  ┌───────────┐        │
│  │   Cron     │  │   Cron     │  │   Cron    │        │
│  │  Job #1    │  │  Job #2    │  │  Job #3   │        │
│  │            │  │            │  │           │        │
│  │ */5 * * * *│  │ */5 * * * *│  │*/2 * * * *│        │
│  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘        │
│        │               │               │               │
│        └───────────────┴───────────────┘               │
│                        │                               │
│                        ▼                               │
│           ┌─────────────────────────┐                  │
│           │   Job Executor          │                  │
│           │                         │                  │
│           │  1. Load job config     │                  │
│           │  2. Execute job logic   │                  │
│           │  3. Handle result       │                  │
│           │  4. Update database     │                  │
│           │  5. Schedule next run   │                  │
│           │  6. Log execution       │                  │
│           └─────────────────────────┘                  │
│                        │                               │
└────────────────────────┼───────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌─────────────────┐           ┌──────────────────┐
│   ParkStay      │           │    Database      │
│   Service       │           │  • Update status │
│  • API Calls    │           │  • Log result    │
│  • Parse Results│           │  • Next run time │
└─────────────────┘           └──────────────────┘
```

## 6. Notification Flow

```
         Event Occurs
         (Watch Found / STQ Success / Error)
                   │
                   ▼
         ┌─────────────────┐
         │  Notification   │
         │    Service      │
         └────────┬────────┘
                  │
         ┌────────┴────────┬───────────────┐
         │                 │               │
         ▼                 ▼               ▼
┌─────────────────┐ ┌─────────────┐ ┌──────────────┐
│   Database      │ │  Desktop    │ │ System Tray  │
│   Storage       │ │Notification │ │   Badge      │
│                 │ │             │ │              │
│ • Save to DB    │ │ • OS Native │ │ • Update     │
│ • Mark unread   │ │ • Clickable │ │   indicator  │
└────────┬────────┘ └──────┬──────┘ └──────┬───────┘
         │                 │               │
         │                 ▼               │
         │          ┌─────────────┐        │
         │          │   Sound     │        │
         │          │   Player    │        │
         │          │             │        │
         │          │ • Play alert│        │
         │          │   (optional)│        │
         │          └─────────────┘        │
         │                                 │
         └─────────────┬───────────────────┘
                       │
                       │ IPC Event
                       ▼
              ┌────────────────┐
              │    Renderer    │
              │     Process    │
              │                │
              │ • Show badge   │
              │ • Update list  │
              │ • Toast popup  │
              └────────────────┘
```

## 7. Deployment Architecture

### Development Environment

```
┌─────────────────────────────────────┐
│       Developer Machine             │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Source Code (Git)           │  │
│  │  • src/                      │  │
│  │  • tests/                    │  │
│  │  • docs/                     │  │
│  └──────────────────────────────┘  │
│               │                     │
│               ▼                     │
│  ┌──────────────────────────────┐  │
│  │  npm run dev                 │  │
│  │  • Vite dev server           │  │
│  │  • Hot Module Replacement    │  │
│  │  • Source maps               │  │
│  └──────────────────────────────┘  │
│               │                     │
│               ▼                     │
│  ┌──────────────────────────────┐  │
│  │  Electron (Dev Mode)         │  │
│  │  • Main process              │  │
│  │  • Renderer process          │  │
│  │  • DevTools enabled          │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Production Build

```
┌─────────────────────────────────────┐
│         Build Machine (CI)          │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  npm run build               │  │
│  │  • TypeScript compilation    │  │
│  │  • Vite production build     │  │
│  │  • Code minification         │  │
│  │  • Asset optimization        │  │
│  └────────────┬─────────────────┘  │
│               │                     │
│               ▼                     │
│  ┌──────────────────────────────┐  │
│  │  Electron Builder            │  │
│  │  • Package app.asar          │  │
│  │  • Include Electron runtime  │  │
│  │  • Create installers         │  │
│  └────────────┬─────────────────┘  │
│               │                     │
└───────────────┼─────────────────────┘
                │
    ┌───────────┴────────────┐
    │                        │
    ▼                        ▼
┌─────────────┐      ┌────────────────┐
│  Windows    │      │     macOS      │
│  Installer  │      │   Installer    │
│             │      │                │
│  • NSIS     │      │  • DMG         │
│  • .exe     │      │  • Notarized   │
│  • Auto-    │      │  • Code Signed │
│    update   │      │  • Auto-update │
└─────────────┘      └────────────────┘
```

### Installation Layout

```
Windows:
C:\Program Files\ParkStay Bookings\
├── ParkStay Bookings.exe
├── resources\
│   └── app.asar
└── ...

%APPDATA%\parkstay-bookings\
├── config.json
├── parkstay.db
└── logs\

macOS:
/Applications/ParkStay Bookings.app
├── Contents/
│   ├── MacOS/
│   │   └── ParkStay Bookings
│   └── Resources/
│       └── app.asar

~/Library/Application Support/parkstay-bookings/
├── config.json
├── parkstay.db
└── logs/
```

## 8. Error Handling Flow

```
            Error Occurs
                 │
                 ▼
         ┌──────────────┐
         │Error Handler │
         └──────┬───────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
   Transient?        Permanent?
        │                │
        ▼                ▼
┌──────────────┐  ┌─────────────────┐
│ Retry Logic  │  │ Disable Job     │
│              │  │ Notify User     │
│ • Exponential│  │ Log Error       │
│   backoff    │  │                 │
│ • Max 3      │  └─────────────────┘
│   attempts   │
└──────┬───────┘
       │
       ▼
   Success?
    /    \
  Yes     No
   │       │
   ▼       ▼
Resume  Permanent
Normal  Error Flow
```

## 9. Database Schema Relationships

```
┌──────────────────────┐
│       users          │
│──────────────────────│
│ id (PK)              │
│ email                │
│ encrypted_password   │
│ ...                  │
└──────┬───────────────┘
       │
       │ 1:N
       │
   ┌───┴─────────────────────────────────────────┐
   │                                             │
   ▼                                             ▼
┌──────────────────────┐              ┌──────────────────────┐
│     bookings         │              │       watches        │
│──────────────────────│              │──────────────────────│
│ id (PK)              │              │ id (PK)              │
│ user_id (FK)         │              │ user_id (FK)         │
│ booking_reference    │              │ name                 │
│ park_name            │              │ park_id              │
│ arrival_date         │              │ arrival_date         │
│ departure_date       │              │ is_active            │
│ status               │              │ next_check_at        │
│ ...                  │              │ ...                  │
└──────┬───────────────┘              └──────────────────────┘
       │
       │ 1:N
       │
       ▼
┌──────────────────────┐
│ skip_the_queue_      │
│      entries         │
│──────────────────────│
│ id (PK)              │
│ user_id (FK)         │
│ booking_id (FK)      │
│ is_active            │
│ next_check_at        │
│ attempts_count       │
│ ...                  │
└──────────────────────┘


┌──────────────────────┐              ┌──────────────────────┐
│   notifications      │              │     job_logs         │
│──────────────────────│              │──────────────────────│
│ id (PK)              │              │ id (PK)              │
│ user_id (FK)         │              │ job_type             │
│ type                 │              │ job_id               │
│ title                │              │ status               │
│ message              │              │ created_at           │
│ related_id           │              │ ...                  │
│ related_type         │              └──────────────────────┘
│ is_read              │
│ ...                  │
└──────────────────────┘
```

## Conclusion

These diagrams provide visual representations of the system architecture to help understand:

1. **System boundaries** and external interactions
2. **Component relationships** and communication paths
3. **Data flows** through the system
4. **Security layers** and protection mechanisms
5. **Job scheduling** and background processing
6. **Notification delivery** across channels
7. **Deployment** and installation structure
8. **Error handling** strategies
9. **Database relationships** and data modeling

Use these diagrams alongside the detailed architecture documents for a complete understanding of the system design.
