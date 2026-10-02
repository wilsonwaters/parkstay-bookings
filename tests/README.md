# ParkStay Bookings - Test Suite

## Quick Start

```bash
# Install dependencies
npm ci

# Build better-sqlite3 for Node (npm ci builds it for Electron; see "Native module ABI guard")
npm rebuild better-sqlite3

# Run all Jest tests (both projects)
npm test

# Run one project
npx jest --selectProjects main
npx jest --selectProjects renderer

# Run specific test file (only the project that owns it runs)
npm test -- tests/unit/services/auth.test.ts

# Run with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run E2E tests (Playwright)
npm run test:e2e
```

## Jest projects

`jest.config.js` defines two [projects](https://jestjs.io/docs/configuration#projects-arraystring--projectconfig) built from one shared base (roots, transform, module aliases). Jest projects do not inherit root options, so anything both need goes in that base.

| Project | `testEnvironment` | Test files | Setup file |
| --- | --- | --- | --- |
| `main` | `node` | `tests/unit/**`, `tests/integration/**`, `tests/scripts/**`, `src/main/**`, `src/shared/**` | `tests/setup/main.ts` (`setupFiles`) |
| `renderer` | `jsdom` | `src/renderer/**`, `tests/renderer/**` | `tests/setup/renderer.ts` (`setupFilesAfterEnv`) |

- Test files are named `*.test.ts` / `*.test.tsx`.
- `npm test -- <path>` runs only the project whose files match the path.
- Coverage (`collectCoverageFrom`, `coverageThreshold`, `coverageReporters`) is configured once at the root. It is aggregated across both projects and the threshold (branches 9, functions 17, lines 16, statements 16) is evaluated once, globally.

### Writing tests for the `main` project

- **There is no DOM.** `window`, `document` and other jsdom globals do not exist. A main-process or shared test that needs them is relying on something it should not; fix the test rather than moving it to `renderer`.
- **`electron` is not mocked.** Outside Electron, `require('electron')` returns the path to the Electron binary (a string), not the API, so `app`, `BrowserWindow`, `Notification` and friends are `undefined`. A test that needs Electron APIs mocks the module itself:

  ```typescript
  jest.mock('electron', () => ({
    app: { getPath: jest.fn(() => '/tmp/wa-stay-test'), isReady: jest.fn(() => true) },
  }));
  ```

  There is deliberately no global `jest.mock('electron')`: it would hide accidental Electron coupling in code that is meant to be pure.

## Setup files

- **`tests/setup/main.ts`** (`setupFiles`, runs before any module loads) sets `process.env.LOG_LEVEL ??= 'warn'`, so the Winston logger skips info/debug output but still prints warnings and errors. An explicit level wins: `LOG_LEVEL=debug npm test`.
- **`tests/setup/renderer.ts`** (`setupFilesAfterEnv`) loads the `@testing-library/jest-dom` matchers and installs a mock `window.api` (see below).

Neither file silences the console. A test that expects an error to be logged spies on the console locally and restores it:

```typescript
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

## Mocking `window.api` (renderer)

The renderer setup installs `createMockWindowApi()` from `tests/utils/window-api.ts` on `window.api`: once when the test file loads and again, fresh, before every test. It is a `Proxy` typed as `Window['api']`, so it needs no list of namespaces and keeps working when the preload API changes shape.

Every member, at any depth, is a `jest.fn()` that rejects with `window.api.<namespace>.<method> is not mocked in this test` until the test stubs it:

```typescript
jest.mocked(window.api.watch.list).mockResolvedValue({ success: true, data: [] });
// or
window.api.settings.get = jest.fn().mockResolvedValue({ success: true, data: null });

expect(window.api.watch.list).toHaveBeenCalledWith(1);
```

- Stub in the test or in a `beforeEach`. Stubs made at module scope or in `beforeAll` are replaced before each test.
- `jest.resetAllMocks()` / `mockReset()` clear the default rejection (the method then returns `undefined`); prefer `jest.clearAllMocks()`.
- An un-stubbed call that nobody awaits becomes an unhandled rejection, and Node 22 crashes the Jest process for that file. In-band the run exits 1 with only Node's stack; with workers it is reported as "Jest worker encountered child process exceptions". stderr still names the method. Always `await` (or stub) every `window.api` call a component makes.

## Clocks and dates

Tests must not depend on the real date or the machine's time zone.

- Pin the clock with `jest.useFakeTimers({ now: new Date('2026-06-15T12:00:00.000Z') })`. Every file that calls `jest.useFakeTimers` also calls `jest.useRealTimers()` in an `afterEach` (or `afterAll`), so a failing test cannot leak fake timers.
- Use mid-day UTC for fixed dates, so the local calendar day is the same from UTC−11 to UTC+11. Build every date in a test from the same pinned instant, so UTC+14 passes too.
- SQLite's `date('now')` (used by `BookingRepository.findUpcoming` / `findPast`) ignores Jest fake timers. Use fixed dates far in the future or past instead.
- Fixtures do not read the clock either: `tests/fixtures/watches.ts` builds dates from a fixed reference date.

Check the main project in several time zones:

```bash
TZ=UTC npx jest --selectProjects main
TZ=Australia/Perth npx jest --selectProjects main
TZ=Pacific/Kiritimati npx jest --selectProjects main   # UTC+14
```

## Native module ABI guard

`better-sqlite3` is a native module and must be compiled for the runtime that loads it. `npm install` / `npm ci` run the `postinstall` script (`electron-builder install-app-deps`), which compiles it for **Electron** (NODE_MODULE_VERSION 119). Jest runs on plain **Node** (115 on Node 20, 127 on Node 22) and needs the Node build.

`scripts/check-native-abi.js` runs as `pretest`, `pretest:coverage` and `pretest:watch`. It loads `better-sqlite3`, opens a `:memory:` database and exits silently if that works (it adds well under a second). Otherwise it stops the run with one message instead of a `dlopen` error in every database test:

- **ABI mismatch:** prints both NODE_MODULE_VERSION numbers, explains that Electron's build is installed, and gives the fix, `npm rebuild better-sqlite3`.
- **Not installed** (missing package, or `npm ci --ignore-scripts` left no binary): prints an install hint.
- **Any other load error** (for example a missing libc symbol): prints the original error unchanged.

Set `AUTO_REBUILD_NATIVE=1` to have the guard run `npm rebuild better-sqlite3` itself on a mismatch, re-check, and continue:

```bash
AUTO_REBUILD_NATIVE=1 npm test
```

To run the Electron app again afterwards, rebuild for Electron with `npm run rebuild`. Calling `npx jest` directly skips the guard. The diagnosis logic lives in `scripts/lib/native-abi.js` and is unit tested in `tests/scripts/native-abi.test.ts`.

## Directory Structure

```
tests/
├── unit/                    # Unit tests (main project)
│   ├── database/
│   └── services/
├── integration/             # Integration tests (main project)
├── scripts/                 # Tests for Node scripts in scripts/ (main project)
├── e2e/                     # End-to-end tests (Playwright, not Jest)
├── manual/                  # Scripts run by hand against live services (not Jest)
├── fixtures/                # Test data (users, bookings, watches, site-sniper)
├── setup/
│   ├── main.ts              # setupFiles for the main project
│   └── renderer.ts          # setupFilesAfterEnv for the renderer project
├── utils/
│   ├── database-helper.ts   # Database setup/teardown
│   ├── mock-api.ts          # Mock API responses
│   ├── test-helpers.ts      # Common test utilities
│   └── window-api.ts        # createMockWindowApi() for renderer tests
└── README.md                # This file
```

Renderer component tests are co-located with the components (`src/renderer/**/*.test.tsx`). `tests/renderer/` is also part of the renderer project, for renderer tests that do not belong next to one component.

## Test Types

### Unit Tests (`tests/unit/`)
Tests individual services in isolation with mocked dependencies.

**Example:**
```typescript
describe('AuthService', () => {
  let authService: AuthService;
  let dbHelper: TestDatabaseHelper;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('auth-test');
    await dbHelper.setup();
    authService = new AuthService(/* ... */);
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  it('should encrypt passwords', async () => {
    const user = await authService.storeCredentials(mockUserInput);
    expect(user.encryptedPassword).not.toBe(mockUserInput.password);
  });
});
```

### Integration Tests (`tests/integration/`)
Tests multiple components working together, including database operations.

**Example:**
```typescript
describe('Authentication Flow', () => {
  it('should handle complete user lifecycle', async () => {
    // Register user
    const user = await authService.storeCredentials(mockUserInput);

    // Retrieve credentials
    const credentials = await authService.getCredentials();
    expect(credentials?.password).toBe(mockUserInput.password);

    // Update password
    await authService.updateCredentials(user.email, 'NewPassword123!');

    // Delete user (cascade deletes bookings)
    await authService.deleteCredentials();
    expect(authService.hasStoredCredentials()).toBe(false);
  });
});
```

### E2E Tests (`tests/e2e/`)
Tests complete user workflows in the browser using Playwright.

**Example:**
```typescript
test('should create a booking', async ({ page }) => {
  await page.goto('/bookings');
  await page.click('button:has-text("Add Booking")');
  await page.fill('input[name="bookingReference"]', 'BK123456');
  await page.fill('input[name="parkName"]', 'Karijini National Park');
  await page.click('button[type="submit"]');

  await expect(page.locator('.toast-success')).toContainText('Booking created');
});
```

## Test Utilities

### TestDatabaseHelper
Manages test database lifecycle.

```typescript
import { TestDatabaseHelper } from '@tests/utils/database-helper';

const dbHelper = new TestDatabaseHelper('my-test');
await dbHelper.setup();            // Create & initialize test DB
const db = dbHelper.getDb();       // Get database instance
await dbHelper.reset();            // Clear all data
await dbHelper.teardown();         // Delete test DB
```

### Mock API
Provides mock responses for external APIs.

```typescript
import { MockParkStayAPI, MockGmailAPI } from '@tests/utils/mock-api';

// Mock availability response
const response = MockParkStayAPI.mockAvailabilityResponse('CG001', true);

// Mock Gmail message
const message = MockGmailAPI.mockMessageDetailsResponse('123456', 'https://link.com');
```

### Test Helpers
Common utilities for tests.

```typescript
import { waitFor, sleep, randomEmail } from '@tests/utils/test-helpers';

// Wait for condition
await waitFor(() => element.isVisible(), 5000);

// Generate random data
const email = randomEmail();
const date = randomFutureDate();

// Handle async errors
await expectAsyncThrow(
  () => service.doSomething(),
  'Expected error message'
);
```

## Test Fixtures

### Using Fixtures
```typescript
import { mockUserInput, createMockUser } from '@tests/fixtures/users';
import { mockBooking, createMockBooking } from '@tests/fixtures/bookings';

// Use predefined fixture
const user = mockUserInput;

// Create custom fixture
const customUser = createMockUser({ email: 'custom@example.com' });

// Create multiple fixtures
const bookings = createMultipleMockBookings(10, userId);
```

## Writing Tests

### Test Structure
Follow the AAA pattern (Arrange, Act, Assert):

```typescript
it('should do something', async () => {
  // Arrange: Set up test data and environment
  const input = createMockBookingInput();

  // Act: Execute the code being tested
  const result = await bookingService.createBooking(userId, input);

  // Assert: Verify the results
  expect(result).toBeDefined();
  expect(result.bookingReference).toBe(input.bookingReference);
});
```

### Best Practices

1. **Isolated Tests**: Each test should be independent
2. **Clear Names**: Test names should describe what they test
3. **Single Responsibility**: One test should test one thing
4. **Cleanup**: Always clean up resources (databases, files, etc.)
5. **Mock External Dependencies**: Don't make real API calls
6. **Test Edge Cases**: Test both success and failure scenarios
7. **Use Fixtures**: Reuse test data through fixtures
8. **Async/Await**: Properly handle async operations

### Example Test

```typescript
describe('BookingService', () => {
  describe('createBooking', () => {
    it('should create a valid booking', async () => {
      // Arrange
      const input = createMockBookingInput();

      // Act
      const booking = await bookingService.createBooking(userId, input);

      // Assert
      expect(booking.id).toBeDefined();
      expect(booking.userId).toBe(userId);
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
    });

    it('should reject invalid dates', async () => {
      // Arrange
      const input = createMockBookingInput({
        arrivalDate: new Date('2024-06-05'),
        departureDate: new Date('2024-06-01'), // Before arrival!
      });

      // Act & Assert
      await expectAsyncThrow(
        () => bookingService.createBooking(userId, input),
        'Departure date must be after arrival date'
      );
    });
  });
});
```

## Debugging Tests

### Run Single Test
```bash
npm test -- tests/unit/services/auth.test.ts
```

### Run Tests Matching Pattern
```bash
npm test -- --testNamePattern="should encrypt"
```

### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### View Coverage
```bash
npm run test:coverage
open coverage/index.html
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm install
      - run: npm rebuild better-sqlite3
      - run: npm test -- --coverage
      - run: npm run test:e2e
```

## Troubleshooting

### "Module not found" errors
```bash
# Clear Jest cache
npx jest --clearCache

# Rebuild native modules
npm rebuild better-sqlite3
```

### Database errors
```bash
# Clean up test databases
rm -rf tests/.test-dbs

# Rebuild SQLite
npm rebuild better-sqlite3
```

### E2E tests not starting
```bash
# Ensure renderer is built
npm run build:renderer

# Or run dev server
npm run dev:renderer
```

### TypeScript errors
```bash
# Check TypeScript configuration
npm run type-check

# Update path mappings in jest.config.js
```

## Coverage Thresholds

`jest.config.js` enforces a global floor across both projects: branches 9%, functions 17%, lines 16%, statements 16%. Do not lower it to make a run pass.

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all tests pass
3. Maintain coverage above thresholds
4. Add fixtures for new entities
5. Update this documentation

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
