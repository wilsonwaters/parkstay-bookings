# ParkStay Bookings - Test Suite

## Quick Start

```bash
# Install dependencies
npm install

# Rebuild native modules for tests
npm rebuild better-sqlite3

# Run all tests
npm test

# Run specific test suite
npm test -- tests/unit/services/auth.test.ts

# Run with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui
```

## Directory Structure

```
tests/
├── unit/                    # Unit tests for services
│   └── services/
│       ├── auth.test.ts           ✅ AuthService (25 tests)
│       ├── booking.test.ts        ⚠️ BookingService (22/24 passing)
│       ├── watch.test.ts          ⚠️ WatchService (needs fixes)
│       └── notification.test.ts   ⚠️ NotificationService (needs fixes)
│
├── integration/             # Integration tests
│   ├── database.test.ts           ✅ Database operations (all passing)
│   └── auth-flow.test.ts          ✅ Auth workflows (all passing)
│
├── e2e/                     # End-to-end tests (Playwright)
│   ├── login.spec.ts              ⏳ Login flow
│   └── bookings.spec.ts           ⏳ Bookings management
│
├── fixtures/                # Test data
│   ├── users.ts                   # User fixtures
│   ├── bookings.ts                # Booking fixtures
│   ├── watches.ts                 # Watch fixtures
│   └── stq.ts                     # STQ fixtures
│
├── utils/                   # Test utilities
│   ├── database-helper.ts         # Database setup/teardown
│   ├── mock-api.ts                # Mock API responses
│   └── test-helpers.ts            # Common test utilities
│
├── setup.ts                 # Global test setup
├── TEST_SUMMARY.md          # Detailed test documentation
└── README.md                # This file
```

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

## Coverage Goals

- **Unit Tests**: 80%+ of service logic
- **Integration Tests**: 90%+ of database operations
- **E2E Tests**: All critical user flows
- **Overall**: 70%+ code coverage

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
- [TEST_SUMMARY.md](./TEST_SUMMARY.md) - Detailed test documentation
