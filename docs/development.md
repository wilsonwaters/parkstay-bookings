# WA ParkStay Bookings - Development Guide

**Version:** 1.0
**Last Updated:** 2025-10-31

## Table of Contents

1. [Development Environment Setup](#development-environment-setup)
2. [Project Structure](#project-structure)
3. [Building the Application](#building-the-application)
4. [Testing](#testing)
5. [Code Style and Conventions](#code-style-and-conventions)
6. [Contributing Guidelines](#contributing-guidelines)
7. [Debugging](#debugging)
8. [Common Development Tasks](#common-development-tasks)
9. [Troubleshooting Development Issues](#troubleshooting-development-issues)

---

## Development Environment Setup

### Prerequisites

Before you begin, ensure you have the following installed:

**Required:**
- **Node.js**: Version 20.x or later (LTS recommended)
- **npm**: Version 10.x or later (comes with Node.js)
- **Git**: For version control
- **Code Editor**: VS Code recommended

**Recommended:**
- **VS Code Extensions**:
  - ESLint
  - Prettier
  - TypeScript
  - Electron Debug
  - Jest Runner
- **GitHub CLI**: For easier PR management

### Initial Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/parkstay-bookings.git
   cd parkstay-bookings
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build Native Modules**
   ```bash
   npm run rebuild
   ```

4. **Verify Setup**
   ```bash
   # Run type checking
   npm run type-check

   # Run linter
   npm run lint

   # Run tests
   npm run test
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

The application should open automatically. You'll have:
- Hot reloading for renderer process (React UI)
- Automatic restart for main process changes
- DevTools open by default

### Environment Configuration

Create a `.env` file in the root directory for local development:

```bash
# .env (not committed to git)
NODE_ENV=development
VITE_API_BASE_URL=https://parkstay.dbca.wa.gov.au
LOG_LEVEL=debug
DATABASE_PATH=./data/parkstay-dev.db

# Optional: Enable additional debugging
DEBUG=parkstay:*
ELECTRON_ENABLE_LOGGING=1
```

---

## Project Structure

The project follows a standard Electron + React architecture:

```
parkstay-bookings/
├── .github/                  # GitHub Actions workflows
├── docs/                     # Documentation
├── resources/                # Static resources (icons, sounds)
├── scripts/                  # Build and utility scripts
├── src/
│   ├── main/                # Electron main process (Node.js)
│   │   ├── services/        # Business logic
│   │   ├── database/        # Database layer
│   │   ├── scheduler/       # Job scheduling
│   │   ├── ipc/             # IPC handlers
│   │   └── utils/           # Utilities
│   ├── preload/             # Preload scripts (secure bridge)
│   ├── renderer/            # React UI
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable components
│   │   ├── hooks/           # Custom React hooks
│   │   └── services/        # Frontend services
│   └── shared/              # Shared code
│       ├── types/           # TypeScript types
│       ├── constants/       # Constants
│       └── schemas/         # Validation schemas
├── tests/                   # Test files
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── e2e/                # End-to-end tests
├── electron-builder.json   # Build configuration
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite configuration
```

### Key Directories

**`src/main/`**: Backend logic
- Services for API integration, booking management, scheduling
- Database operations and migrations
- IPC handlers for renderer communication
- Job scheduling and background tasks

**`src/renderer/`**: Frontend UI
- React components and pages
- State management and hooks
- User interface logic
- Styling with Tailwind CSS

**`src/preload/`**: Security bridge
- Exposes limited API to renderer
- Validates all IPC messages
- Prevents direct Node.js access from renderer

**`src/shared/`**: Common code
- TypeScript types used by both processes
- Constants and configuration
- Validation schemas (Zod)

---

## Building the Application

### Development Build

```bash
# Start development server with hot reloading
npm run dev

# Start renderer only
npm run dev:renderer

# Start main process compilation only
npm run dev:main

# Start built application
npm start
```

### Production Build

```bash
# Build all (main + renderer)
npm run build

# Build main process
npm run build:main

# Build renderer process
npm run build:renderer
```

### Platform-Specific Builds

```bash
# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux

# Build for all platforms
npm run build:all
```

### Package Without Installer

```bash
# Package without creating installer (faster for testing)
npm run pack

# Platform-specific
npm run pack:win
npm run pack:mac
npm run pack:linux
```

### Build Output

Builds are output to the `release/` directory:

```
release/
├── win-unpacked/           # Windows unpacked files
├── mac/                    # macOS app bundle
├── linux-unpacked/         # Linux unpacked files
├── *.exe                   # Windows installer
├── *.dmg                   # macOS disk image
├── *.AppImage              # Linux AppImage
└── latest*.yml             # Update metadata
```

---

## Testing

The project uses multiple testing strategies:

### Unit Tests (Jest)

```bash
# Run all unit tests
npm run test

# Watch mode (re-run on changes)
npm run test:watch

# Coverage report
npm run test:coverage

# Test specific file
npm run test -- path/to/file.test.ts
```

**Writing Unit Tests:**

```typescript
// src/main/services/booking/__tests__/booking-manager.test.ts
import { BookingManagerService } from '../booking-manager.service';

describe('BookingManagerService', () => {
  let service: BookingManagerService;

  beforeEach(() => {
    service = new BookingManagerService();
  });

  it('should create a new booking', async () => {
    const booking = await service.createBooking({
      userId: 1,
      bookingReference: 'PS-12345',
      // ... other fields
    });

    expect(booking).toBeDefined();
    expect(booking.bookingReference).toBe('PS-12345');
  });
});
```

### Integration Tests

```bash
# Run integration tests
npm run test -- tests/integration

# Run specific integration test
npm run test -- tests/integration/booking-flow.test.ts
```

**Writing Integration Tests:**

```typescript
// tests/integration/booking-flow.test.ts
import { setupTestDatabase, teardownTestDatabase } from '../helpers/db-helper';

describe('Booking Flow Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('should complete full booking flow', async () => {
    // Test complete flow from watch creation to booking
  });
});
```

### End-to-End Tests (Playwright)

```bash
# Run E2E tests
npm run test:e2e

# Run with UI (interactive)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug
```

**Writing E2E Tests:**

```typescript
// tests/e2e/watch-creation.spec.ts
import { test, expect } from '@playwright/test';

test('should create a new watch', async ({ page }) => {
  await page.goto('http://localhost:3000');

  await page.click('text=Watches');
  await page.click('text=Create New Watch');

  await page.fill('[name="name"]', 'Test Watch');
  await page.selectOption('[name="park"]', 'Karijini');

  await page.click('text=Create');

  await expect(page.locator('text=Test Watch')).toBeVisible();
});
```

### Test Coverage

Aim for:
- Unit tests: 80%+ coverage
- Integration tests: Key flows covered
- E2E tests: Critical user journeys

View coverage report:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

---

## Code Style and Conventions

### TypeScript

**Types and Interfaces:**
```typescript
// Use interfaces for object shapes
interface Booking {
  id: number;
  userId: number;
  bookingReference: string;
}

// Use types for unions and complex types
type BookingStatus = 'confirmed' | 'cancelled' | 'pending';

// Avoid 'any', use 'unknown' if type is truly unknown
function parseData(data: unknown): Booking {
  // Type guard here
}
```

**Naming Conventions:**
- PascalCase for classes, interfaces, types
- camelCase for variables, functions
- UPPER_SNAKE_CASE for constants
- Prefix interfaces with 'I' (optional)

**Functions:**
```typescript
// Use explicit return types
function calculateTotal(booking: Booking): number {
  return booking.nights * booking.pricePerNight;
}

// Use async/await over promises
async function fetchBooking(id: number): Promise<Booking> {
  const data = await api.getBooking(id);
  return transformData(data);
}
```

### React Components

**Functional Components:**
```typescript
// Use React.FC or explicit typing
interface BookingCardProps {
  booking: Booking;
  onSelect: (id: number) => void;
}

export const BookingCard: React.FC<BookingCardProps> = ({
  booking,
  onSelect
}) => {
  return (
    <div onClick={() => onSelect(booking.id)}>
      {booking.parkName}
    </div>
  );
};
```

**Hooks:**
```typescript
// Custom hooks start with 'use'
export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    loadBookings();
  }, []);

  return { bookings, refresh: loadBookings };
}
```

### File Organization

**Barrel Exports:**
```typescript
// src/main/services/index.ts
export * from './auth';
export * from './booking';
export * from './watch';
```

**Co-location:**
Place related files together:
```
components/BookingCard/
├── BookingCard.tsx
├── BookingCard.test.tsx
├── BookingCard.module.css
└── index.ts
```

### Linting and Formatting

**ESLint:**
```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

**Prettier:**
```bash
# Format code
npm run format

# Check formatting
npm run format:check
```

**Pre-commit Hooks:**
Husky automatically runs linting and formatting before commits:
```bash
# Configured in .husky/pre-commit
npm run lint-staged
```

---

## Contributing Guidelines

### Branching Strategy

**Branch Naming:**
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/improvements

**Example:**
```bash
git checkout -b feature/add-notification-sound
```

### Commit Messages

Follow conventional commits format:

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(watch): add support for flexible dates

fix(booking): correct price calculation for multi-night stays

docs(readme): update installation instructions

test(booking): add unit tests for booking service
```

### Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make Changes**
   - Write code
   - Add tests
   - Update documentation

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat(scope): description"
   ```

4. **Push Branch**
   ```bash
   git push origin feature/your-feature
   ```

5. **Create Pull Request**
   - Go to GitHub
   - Click "New Pull Request"
   - Fill out PR template
   - Request reviews

6. **Address Feedback**
   - Make requested changes
   - Push additional commits
   - Re-request review

7. **Merge**
   - After approval, merge to main
   - Delete feature branch

### Code Review Checklist

**For Authors:**
- [ ] Code follows style guide
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Handles errors properly
- [ ] Type-safe (no any)

**For Reviewers:**
- [ ] Code is clear and maintainable
- [ ] Tests are comprehensive
- [ ] No obvious bugs
- [ ] Performance considerations addressed
- [ ] Security concerns addressed

---

## Debugging

### Main Process Debugging

**VS Code Launch Configuration:**

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "windows": {
        "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron.cmd"
      },
      "args": ["."],
      "outputCapture": "std"
    }
  ]
}
```

**Console Debugging:**
```typescript
// Use electron-log for persistent logging
import log from 'electron-log';

log.info('Application started');
log.error('Error occurred:', error);
log.debug('Debug info:', data);
```

### Renderer Process Debugging

**Chrome DevTools:**
- DevTools open automatically in development
- Or press `Ctrl+Shift+I` / `Cmd+Option+I`
- React DevTools available
- Network tab for API calls

**Console Logging:**
```typescript
console.log('Component rendered:', props);
console.error('Error:', error);
console.table(data); // Tables are helpful!
```

### IPC Debugging

```typescript
// Main process
ipcMain.handle('channel-name', async (event, ...args) => {
  console.log('IPC received:', args);
  const result = await doSomething(args);
  console.log('IPC response:', result);
  return result;
});

// Renderer process
const result = await window.api.methodName(data);
console.log('IPC result:', result);
```

### Database Debugging

**SQLite CLI:**
```bash
sqlite3 data/parkstay.db

.tables                    # List tables
.schema bookings          # Show schema
SELECT * FROM bookings;   # Query data
```

**Query Logging:**
```typescript
// Enable SQL logging in development
db.on('trace', (sql) => {
  console.log('SQL:', sql);
});
```

---

## Common Development Tasks

### Adding a New Feature

1. **Plan the Feature**
   - Define requirements
   - Design data models
   - Plan UI/UX

2. **Update Database**
   ```typescript
   // Create migration
   // src/main/database/migrations/XXX-add-feature.ts
   export async function up(db: Database) {
     db.exec(`
       CREATE TABLE feature_data (
         id INTEGER PRIMARY KEY,
         data TEXT
       );
     `);
   }
   ```

3. **Create Service**
   ```typescript
   // src/main/services/feature/feature.service.ts
   export class FeatureService {
     async doSomething(): Promise<void> {
       // Implementation
     }
   }
   ```

4. **Add IPC Handler**
   ```typescript
   // src/main/ipc/handlers/feature.handlers.ts
   ipcMain.handle('feature:action', async (event, data) => {
     return await featureService.doSomething(data);
   });
   ```

5. **Update Preload**
   ```typescript
   // src/preload/api/feature.api.ts
   contextBridge.exposeInMainWorld('api', {
     feature: {
       doSomething: (data) => ipcRenderer.invoke('feature:action', data)
     }
   });
   ```

6. **Create UI Components**
   ```typescript
   // src/renderer/pages/Feature/Feature.tsx
   export const FeaturePage: React.FC = () => {
     // Implementation
   };
   ```

7. **Add Tests**
   - Unit tests for service
   - Integration tests for flow
   - E2E tests for UI

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update all dependencies
npm update

# Update specific package
npm install package@latest

# Rebuild native modules after updates
npm run rebuild

# Test thoroughly after updates
npm run test
npm run build
```

### Adding a New Page

1. **Create Page Component**
   ```bash
   mkdir src/renderer/pages/NewPage
   touch src/renderer/pages/NewPage/index.tsx
   ```

2. **Implement Component**
   ```typescript
   export const NewPage: React.FC = () => {
     return <div>New Page</div>;
   };
   ```

3. **Add Route**
   ```typescript
   // src/renderer/router/routes.tsx
   <Route path="/new-page" element={<NewPage />} />
   ```

4. **Add Navigation**
   ```typescript
   // src/renderer/components/layouts/Sidebar.tsx
   <NavLink to="/new-page">New Page</NavLink>
   ```

---

## Troubleshooting Development Issues

### Common Issues

**Issue: "Cannot find module" error**
```bash
# Solution: Clean install
rm -rf node_modules package-lock.json
npm install
```

**Issue: Native module won't build**
```bash
# Solution: Rebuild native modules
npm run rebuild
# Or manually
npm rebuild better-sqlite3 --build-from-source
```

**Issue: TypeScript errors in IDE but builds fine**
```bash
# Solution: Restart TypeScript server in VS Code
# Cmd+Shift+P -> "TypeScript: Restart TS Server"
```

**Issue: Hot reload not working**
```bash
# Solution: Restart dev server
# Kill process and run again
npm run dev
```

**Issue: Database locked error**
```bash
# Solution: Close all app instances
# Delete .db-shm and .db-wal files
rm data/*.db-shm data/*.db-wal
```

### Getting Help

1. **Check Documentation**: Review architecture docs
2. **Search Issues**: Look for similar problems in GitHub Issues
3. **Ask in Discussions**: Use GitHub Discussions for questions
4. **Create Issue**: Report bugs with full details

---

## Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Documentation](https://vitejs.dev/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/)

---

**Happy Coding!**

For questions or issues, please open a GitHub issue or discussion.
