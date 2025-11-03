# WA ParkStay Bookings - Architecture Documentation

This directory contains the complete architecture documentation for the WA ParkStay Bookings application.

## Documents

### 1. [ADR-001: UI Framework Choice](./ADR-001-ui-framework-choice.md)
**Architecture Decision Record** for choosing the UI framework.

**Decision:** Electron + React

**Key Points:**
- Evaluated three options: Electron, Native, and Web Server
- Chose Electron for cross-platform support and development speed
- Trade-off: Larger bundle size for better developer experience
- Provides auto-update, native integrations, and consistent UX

### 2. [System Architecture](./system-architecture.md)
**Comprehensive system architecture** covering all aspects of the application.

**Contents:**
- High-level architecture diagram
- Technology stack (Electron, React, TypeScript, SQLite)
- Component architecture (main process, renderer, preload)
- Service layer design (ParkStay, Booking, Watch, STQ, Auth, Notification)
- Job scheduling system (node-cron based)
- Notification system (in-app, desktop, system tray)
- Security architecture (credential encryption, IPC security)
- Deployment architecture (installers, auto-update, logging)

**Key Technologies:**
- **Frontend:** React 18, TypeScript, Tailwind CSS, Shadcn/ui
- **Backend:** Node.js, better-sqlite3, node-cron, axios
- **Desktop:** Electron 28+, Electron Builder
- **Testing:** Jest, Playwright

### 3. [Project Structure](./project-structure.md)
**Complete directory layout and organization.**

**Contents:**
- Root directory structure
- Source code organization (`src/main`, `src/renderer`, `src/preload`, `src/shared`)
- Test structure (unit, integration, e2e)
- Documentation structure
- Configuration files (tsconfig, vite, electron-builder)
- Module organization principles
- Naming conventions
- Build and distribution

**Key Principles:**
- Separation of concerns (main vs renderer)
- Layered architecture
- Clear module boundaries
- Dependency rules

### 4. [Data Models](./data-models.md)
**Detailed data model specifications.**

**Models:**
- **User:** Credentials storage with encryption
- **Booking:** Booking information from ParkStay
- **Watch:** Availability monitoring configuration
- **Skip The Queue:** Rebooking automation
- **Notification:** In-app notifications
- **Job Log:** Job execution history
- **Settings:** Application configuration

**Features:**
- Complete database schemas with indexes
- TypeScript interfaces
- Validation schemas (Zod)
- Entity relationships
- Business rules
- Migration strategy

## Quick Reference

### Architecture Highlights

**Local-First Design:**
- All data stored locally (SQLite)
- No cloud dependencies
- User privacy guaranteed

**Security:**
- AES-256-GCM encryption for credentials
- Context isolation in Electron
- No Node integration in renderer
- Validated IPC communication

**Scheduling:**
- Background job scheduler (node-cron)
- Configurable polling intervals
- Error handling and retries
- Job persistence across restarts

**User Experience:**
- Native desktop application feel
- System tray integration
- Desktop notifications
- Auto-updates

### Technology Stack Summary

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Electron 28+ |
| UI Framework | React 18 |
| Language | TypeScript 5+ |
| Database | SQLite 3.43+ |
| Job Scheduler | node-cron |
| HTTP Client | axios |
| Styling | Tailwind CSS |
| Build Tool | Vite 5+ |
| Packaging | Electron Builder |
| Testing | Jest + Playwright |

### Key Services

**Main Process Services:**
- `ParkStayService`: API integration with ParkStay website
- `BookingManagerService`: Booking CRUD and sync
- `WatchManagerService`: Watch configuration and execution
- `STQManagerService`: Skip The Queue management
- `AuthService`: Credential management and encryption
- `NotificationService`: Notification delivery
- `JobScheduler`: Background job scheduling

### Database Schema

```
users
├── bookings (1:N)
│   └── skip_the_queue_entries (1:N)
├── watches (1:N)
└── notifications (1:N)

job_logs (independent)
settings (independent)
```

## Development Workflow

### Getting Started

```bash
# Clone repository
git clone <repository-url>
cd parkstay-bookings

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Build application
npm run build
```

### Project Setup

1. Follow the [Project Structure](./project-structure.md) to create directories
2. Implement data models from [Data Models](./data-models.md)
3. Build services according to [System Architecture](./system-architecture.md)
4. Create UI components following the structure

### Next Steps for Implementation

**Phase 1: Foundation (Week 1-2)**
1. Set up project structure
2. Configure TypeScript, ESLint, Prettier
3. Set up Electron + React + Vite
4. Create database schema and migrations
5. Implement repositories

**Phase 2: Core Services (Week 3-4)**
1. Implement ParkStay API client
2. Build authentication service with encryption
3. Create booking manager service
4. Implement watch manager service
5. Implement STQ manager service

**Phase 3: Scheduling (Week 5)**
1. Build job scheduler
2. Implement watch poll jobs
3. Implement STQ check jobs
4. Add error handling and retries

**Phase 4: UI (Week 6-8)**
1. Create base UI components
2. Build dashboard page
3. Build bookings page
4. Build watches page
5. Build Skip The Queue page
6. Build settings page

**Phase 5: Integration (Week 9)**
1. Connect UI to services via IPC
2. Implement notification system
3. Add system tray
4. Test end-to-end flows

**Phase 6: Polish (Week 10)**
1. Add error handling
2. Improve UX
3. Write documentation
4. Performance optimization
5. Security audit

**Phase 7: Distribution (Week 11-12)**
1. Set up auto-update
2. Create installers (Windows, Mac)
3. Test installation process
4. Prepare for release

## Design Decisions Summary

### Why Electron?
- Cross-platform with single codebase
- Rich ecosystem and tooling
- Native integrations (notifications, tray, auto-update)
- Fast development with web technologies

### Why React?
- Component reusability
- Large ecosystem
- Good performance with proper optimization
- Familiar to many developers

### Why TypeScript?
- Type safety reduces bugs
- Better developer experience
- Improved code documentation
- Easier refactoring

### Why SQLite?
- No server setup required
- Fast for local operations
- ACID compliance
- Mature and reliable

### Why node-cron?
- Simple API
- Sufficient for our needs
- Good for scheduled tasks
- Active maintenance

## Contributing

When contributing to the architecture:

1. **New decisions:** Create a new ADR document (ADR-00X-title.md)
2. **Architecture changes:** Update relevant sections in system-architecture.md
3. **New models:** Update data-models.md with complete specifications
4. **Structure changes:** Update project-structure.md

All architecture changes should be:
- Documented clearly
- Reviewed by the team
- Consistent with existing decisions
- Justified with rationale

## References

- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Architecture Decision Records](https://adr.github.io/)

## License

[Your License Here]

---

**Note:** This architecture is designed to be flexible and can evolve as requirements change. The key is to maintain the core principles of local-first design, security, and user privacy while being pragmatic about trade-offs.
