# Gmail OTP Integration - Usage Examples

## Complete Usage Examples for Common Scenarios

### Example 1: ParkStay Login Automation

```typescript
/**
 * Automate ParkStay login with OTP
 */
async function loginToParkStay(email: string, password: string) {
  try {
    // Step 1: Submit login form (triggers OTP email)
    await submitLoginForm(email, password);

    // Step 2: Wait for OTP email from ParkStay
    const result = await window.api.gmail.waitForEmail(
      'noreply@parkstay.com',
      'Your ParkStay Verification Code',
      90000 // 90 seconds timeout
    );

    if (!result.success || !result.data?.found) {
      throw new Error('OTP email not received');
    }

    // Step 3: Extract and use OTP code
    const otpCode = result.data.code;
    console.log('Received OTP:', otpCode);

    // Step 4: Submit OTP to complete login
    await submitOTPCode(otpCode);

    console.log('Login successful!');
    return true;
  } catch (error) {
    console.error('Login failed:', error);
    return false;
  }
}
```

### Example 2: Magic Link Authentication

```typescript
/**
 * Authenticate using magic link from email
 */
async function authenticateWithMagicLink(email: string) {
  try {
    // Step 1: Request magic link
    await requestMagicLink(email);

    // Step 2: Wait for email with magic link
    const result = await window.api.gmail.waitForEmail(
      'auth@service.com',
      'Your sign-in link',
      120000 // 2 minutes
    );

    if (!result.success || !result.data?.found || !result.data.link) {
      throw new Error('Magic link not found');
    }

    // Step 3: Extract link
    const magicLink = result.data.link;
    console.log('Magic link:', magicLink);

    // Step 4: Open link in app or extract token
    const token = extractTokenFromLink(magicLink);
    await authenticateWithToken(token);

    console.log('Authenticated successfully!');
    return true;
  } catch (error) {
    console.error('Authentication failed:', error);
    return false;
  }
}

function extractTokenFromLink(link: string): string {
  const url = new URL(link);
  const token = url.searchParams.get('token');
  if (!token) {
    throw new Error('Token not found in link');
  }
  return token;
}
```

### Example 3: Settings Page Integration

```typescript
/**
 * Gmail Settings Component
 */
import React, { useState, useEffect } from 'react';

function GmailSettings() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check authorization status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  async function checkAuthStatus() {
    try {
      const result = await window.api.gmail.checkAuthStatus();
      if (result.success) {
        setIsAuthorized(result.data?.isAuthorized || false);
      }
    } catch (err) {
      console.error('Failed to check auth status:', err);
    }
  }

  async function handleSetCredentials() {
    if (!credentials.clientId || !credentials.clientSecret) {
      setError('Please enter both Client ID and Secret');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await window.api.gmail.setCredentials({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        redirectUri: 'http://localhost:3000/oauth2callback',
      });

      if (result.success) {
        alert('Credentials saved successfully!');
      } else {
        setError(result.error || 'Failed to save credentials');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthorize() {
    setLoading(true);
    setError('');

    try {
      const result = await window.api.gmail.authorize();

      if (result.success) {
        setIsAuthorized(true);
        alert('Gmail authorized successfully!');
      } else {
        setError(result.error || 'Authorization failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);

    try {
      const result = await window.api.gmail.revokeAuth();

      if (result.success) {
        setIsAuthorized(false);
        alert('Gmail authorization revoked');
      } else {
        setError(result.error || 'Failed to revoke');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gmail-settings">
      <h2>Gmail Integration Settings</h2>

      {error && <div className="error">{error}</div>}

      <div className="auth-status">
        <strong>Status:</strong>{' '}
        {isAuthorized ? (
          <span className="authorized">✓ Authorized</span>
        ) : (
          <span className="not-authorized">✗ Not Authorized</span>
        )}
      </div>

      {!isAuthorized && (
        <div className="credentials-form">
          <h3>1. Set OAuth2 Credentials</h3>
          <p>Get these from Google Cloud Console</p>

          <input
            type="text"
            placeholder="Client ID"
            value={credentials.clientId}
            onChange={(e) =>
              setCredentials({ ...credentials, clientId: e.target.value })
            }
          />

          <input
            type="password"
            placeholder="Client Secret"
            value={credentials.clientSecret}
            onChange={(e) =>
              setCredentials({ ...credentials, clientSecret: e.target.value })
            }
          />

          <button onClick={handleSetCredentials} disabled={loading}>
            Save Credentials
          </button>

          <h3>2. Authorize Gmail Access</h3>
          <button onClick={handleAuthorize} disabled={loading}>
            {loading ? 'Processing...' : 'Authorize Gmail'}
          </button>
        </div>
      )}

      {isAuthorized && (
        <div className="authorized-actions">
          <button onClick={handleRevoke} disabled={loading}>
            Revoke Authorization
          </button>
        </div>
      )}
    </div>
  );
}

export default GmailSettings;
```

### Example 4: Booking Automation with OTP

```typescript
/**
 * Complete booking flow with OTP verification
 */
class BookingAutomation {
  async makeBooking(bookingDetails: any) {
    try {
      console.log('Starting booking process...');

      // Step 1: Submit booking form
      const bookingRef = await this.submitBookingForm(bookingDetails);
      console.log('Booking submitted:', bookingRef);

      // Step 2: Wait for confirmation email with verification code
      console.log('Waiting for verification email...');
      const emailResult = await window.api.gmail.waitForEmail(
        'noreply@parkstay.com',
        'Confirm your booking',
        120000 // 2 minutes
      );

      if (!emailResult.success || !emailResult.data?.found) {
        throw new Error('Verification email not received');
      }

      // Step 3: Extract verification code or link
      const { code, link } = emailResult.data;

      if (code) {
        console.log('Verification code received:', code);
        await this.verifyWithCode(bookingRef, code);
      } else if (link) {
        console.log('Verification link received:', link);
        await this.verifyWithLink(link);
      } else {
        throw new Error('No verification code or link found');
      }

      console.log('Booking confirmed successfully!');

      // Step 4: Store booking in database
      await this.saveBooking({
        reference: bookingRef,
        ...bookingDetails,
        status: 'confirmed',
        confirmedAt: new Date(),
      });

      return { success: true, reference: bookingRef };
    } catch (error: any) {
      console.error('Booking failed:', error);
      return { success: false, error: error.message };
    }
  }

  private async submitBookingForm(details: any): Promise<string> {
    // Implementation...
    return 'BOOKING-123';
  }

  private async verifyWithCode(ref: string, code: string): Promise<void> {
    // Implementation...
  }

  private async verifyWithLink(link: string): Promise<void> {
    // Implementation...
  }

  private async saveBooking(booking: any): Promise<void> {
    // Implementation...
  }
}
```

### Example 5: Retry Logic with Timeout

```typescript
/**
 * Wait for email with retry logic
 */
async function waitForEmailWithRetry(
  fromEmail: string,
  subject: string,
  maxRetries: number = 3
): Promise<string | null> {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    console.log(`Attempt ${attempt}/${maxRetries}...`);

    try {
      const result = await window.api.gmail.waitForEmail(
        fromEmail,
        subject,
        60000 // 60 seconds per attempt
      );

      if (result.success && result.data?.found) {
        const code = result.data.code || result.data.link;
        if (code) {
          console.log('Success! Code received:', code);
          return code;
        }
      }

      // If not found, wait before retry
      if (attempt < maxRetries) {
        console.log('Email not found, waiting 10 seconds before retry...');
        await sleep(10000);
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        await sleep(5000); // Wait 5 seconds after error
      }
    }
  }

  console.error('Failed to receive email after', maxRetries, 'attempts');
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Example 6: Testing Email Reception

```typescript
/**
 * Test email reception and extraction
 */
async function testEmailReception() {
  console.log('=== Testing Gmail Integration ===\n');

  // Test 1: Check authorization
  console.log('Test 1: Checking authorization...');
  const authStatus = await window.api.gmail.checkAuthStatus();
  console.log('Authorized:', authStatus.data?.isAuthorized);

  if (!authStatus.data?.isAuthorized) {
    console.error('Not authorized! Please authorize first.');
    return;
  }

  // Test 2: Get recent emails
  console.log('\nTest 2: Getting recent emails...');
  const recentResult = await window.api.gmail.getRecentEmails(5);

  if (recentResult.success && recentResult.data) {
    console.log(`Found ${recentResult.data.length} recent emails:`);
    recentResult.data.forEach((email, i) => {
      console.log(`${i + 1}. From: ${email.from}`);
      console.log(`   Subject: ${email.subject}`);
      console.log(`   Date: ${email.date}`);
    });
  }

  // Test 3: Test search
  console.log('\nTest 3: Testing email search...');
  const searchResult = await window.api.gmail.testSearch(
    'noreply@parkstay.com',
    'Booking'
  );

  if (searchResult.success) {
    console.log(`Found ${searchResult.data?.length || 0} matching emails`);
  }

  // Test 4: Manual OTP test
  console.log('\nTest 4: Manual OTP test');
  console.log('Send yourself an email with an OTP code and subject "Test OTP"');
  console.log('Press Enter to start waiting (60 seconds)...');

  // Wait for user to send email
  // await waitForUserInput();

  const otpResult = await window.api.gmail.waitForEmail(
    'your-email@gmail.com',
    'Test OTP',
    60000
  );

  if (otpResult.success && otpResult.data?.found) {
    console.log('✓ OTP Code:', otpResult.data.code);
    console.log('✓ Link:', otpResult.data.link);
    console.log('✓ Email found successfully!');
  } else {
    console.log('✗ Email not found within timeout');
  }

  console.log('\n=== Test Complete ===');
}
```

### Example 7: Multiple OTP Sources

```typescript
/**
 * Handle OTP from multiple possible sources
 */
async function getOTPFromMultipleSources(): Promise<string | null> {
  const sources = [
    {
      from: 'noreply@parkstay.com',
      subject: 'Your Verification Code',
    },
    {
      from: 'security@parkstay.com',
      subject: 'Security Code',
    },
    {
      from: 'notifications@parkstay.com',
      subject: 'Login Code',
    },
  ];

  // Try all sources in parallel with different timeouts
  const promises = sources.map((source, index) =>
    window.api.gmail
      .waitForEmail(
        source.from,
        source.subject,
        30000 + index * 10000 // Staggered timeouts
      )
      .then((result) => ({
        source,
        result,
      }))
  );

  // Wait for first successful result
  try {
    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (
        result.status === 'fulfilled' &&
        result.value.result.success &&
        result.value.result.data?.found &&
        result.value.result.data.code
      ) {
        console.log('OTP received from:', result.value.source.from);
        return result.value.result.data.code;
      }
    }

    console.error('No OTP received from any source');
    return null;
  } catch (error) {
    console.error('Error waiting for OTP:', error);
    return null;
  }
}
```

### Example 8: Email Polling Progress

```typescript
/**
 * Wait for email with progress updates
 */
async function waitForEmailWithProgress(
  fromEmail: string,
  subject: string,
  onProgress?: (secondsElapsed: number) => void
): Promise<string | null> {
  const timeout = 120000; // 2 minutes
  const startTime = Date.now();

  // Start progress updates
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.floor((timeout - (Date.now() - startTime)) / 1000);

    console.log(`Waiting for email... ${elapsed}s elapsed, ${remaining}s remaining`);

    if (onProgress) {
      onProgress(elapsed);
    }
  }, 5000); // Update every 5 seconds

  try {
    const result = await window.api.gmail.waitForEmail(fromEmail, subject, timeout);

    clearInterval(progressInterval);

    if (result.success && result.data?.found) {
      const totalTime = Math.floor((Date.now() - startTime) / 1000);
      console.log(`Email received after ${totalTime} seconds!`);
      return result.data.code || result.data.link || null;
    }

    console.log('Email not received within timeout');
    return null;
  } catch (error) {
    clearInterval(progressInterval);
    console.error('Error waiting for email:', error);
    return null;
  }
}

// Usage with progress callback
async function example() {
  await waitForEmailWithProgress(
    'noreply@parkstay.com',
    'Verification Code',
    (seconds) => {
      // Update UI with progress
      updateProgressBar((seconds / 120) * 100);
    }
  );
}
```

## Best Practices

### 1. Always Check Authorization First

```typescript
const status = await window.api.gmail.checkAuthStatus();
if (!status.data?.isAuthorized) {
  // Prompt user to authorize
  await window.api.gmail.authorize();
}
```

### 2. Use Appropriate Timeouts

```typescript
// Quick OTP (usually < 30 seconds)
await window.api.gmail.waitForEmail(from, subject, 60000);

// Slower systems or busy times (1-2 minutes)
await window.api.gmail.waitForEmail(from, subject, 120000);

// Very patient waiting (5 minutes)
await window.api.gmail.waitForEmail(from, subject, 300000);
```

### 3. Handle Errors Gracefully

```typescript
try {
  const result = await window.api.gmail.waitForEmail(from, subject, 60000);

  if (!result.success) {
    // Show user-friendly error
    showError('Could not retrieve verification email. Please try again.');
    return;
  }

  // Process result
} catch (error) {
  console.error('Unexpected error:', error);
  showError('An unexpected error occurred. Please check your settings.');
}
```

### 4. Validate Extracted Data

```typescript
const result = await window.api.gmail.waitForEmail(from, subject, 60000);

if (result.success && result.data?.found) {
  const code = result.data.code;

  // Validate OTP format
  if (code && /^\d{6}$/.test(code)) {
    // Use 6-digit OTP
    await submitOTP(code);
  } else {
    console.error('Invalid OTP format:', code);
  }
}
```

## Common Patterns

### Pattern 1: OTP with Fallback

```typescript
// Try automatic OTP first, fallback to manual entry
const result = await window.api.gmail.waitForEmail(from, subject, 60000);

if (result.success && result.data?.code) {
  return result.data.code;
} else {
  // Show manual entry form
  return await promptUserForOTP();
}
```

### Pattern 2: Concurrent Checks

```typescript
// Check multiple email addresses simultaneously
const results = await Promise.all([
  window.api.gmail.waitForEmail('noreply@service.com', 'OTP', 60000),
  window.api.gmail.waitForEmail('security@service.com', 'Code', 60000),
]);

for (const result of results) {
  if (result.success && result.data?.code) {
    return result.data.code;
  }
}
```

### Pattern 3: Polling with Cancel

```typescript
let cancelled = false;

const otpPromise = window.api.gmail.waitForEmail(from, subject, 120000);

// Allow user to cancel
const cancelButton = document.getElementById('cancel');
cancelButton.addEventListener('click', () => {
  cancelled = true;
});

const result = await otpPromise;

if (cancelled) {
  console.log('User cancelled');
  return null;
}

return result.data?.code || null;
```

## Resources

- [Complete Setup Guide](./gmail-otp-setup.md)
- [Quick Start](./gmail-otp-quick-start.md)
- [API Reference](./gmail-otp-setup.md#api-reference)
- [Troubleshooting](./gmail-otp-setup.md#troubleshooting)
