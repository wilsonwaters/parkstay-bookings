# Gmail OTP Integration - Setup Checklist

## Pre-Installation Checklist

- [ ] Node.js 20+ installed
- [ ] npm 10+ installed
- [ ] Google account with Gmail access
- [ ] Access to Google Cloud Console

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `googleapis@^128.0.0` - Google APIs client
- `electron-store@^8.1.0` - Secure token storage (already included)

### 2. Verify Installation

```bash
# Check package is installed
npm list googleapis electron-store

# Build the project
npm run build:main
```

Expected output: Build completes without errors

### 3. Verify Files Exist

Check that all required files are present:

- [ ] `src/main/services/gmail/GmailOTPService.ts`
- [ ] `src/main/services/gmail/oauth2-handler.ts`
- [ ] `src/main/services/gmail/index.ts`
- [ ] `src/main/ipc/handlers/gmail.handlers.ts`
- [ ] `src/shared/types/gmail.types.ts`
- [ ] `src/shared/constants/ipc-channels.ts` (Gmail channels added)
- [ ] `src/preload/index.ts` (Gmail API exposed)
- [ ] `docs/gmail-otp-setup.md`
- [ ] `docs/gmail-otp-quick-start.md`

## Google Cloud Console Setup

### 1. Create Project

- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/)
- [ ] Create new project: "ParkStay Bookings Gmail"
- [ ] Wait for project creation to complete

### 2. Enable Gmail API

- [ ] Navigate to "APIs & Services" > "Library"
- [ ] Search for "Gmail API"
- [ ] Click "Enable"
- [ ] Wait for API to be enabled

### 3. Configure OAuth Consent Screen

- [ ] Go to "APIs & Services" > "OAuth consent screen"
- [ ] Select "External" user type
- [ ] Fill in App Information:
  - [ ] App name: `ParkStay Bookings`
  - [ ] User support email: Your email
  - [ ] Developer contact: Your email
- [ ] Add OAuth scope:
  - [ ] `https://www.googleapis.com/auth/gmail.readonly`
- [ ] Add Test Users:
  - [ ] Add your Gmail address
  - [ ] Click "Save"
- [ ] Complete all steps (Save and Continue)

### 4. Create OAuth Credentials

- [ ] Go to "APIs & Services" > "Credentials"
- [ ] Click "Create Credentials" > "OAuth client ID"
- [ ] Select "Desktop app"
- [ ] Name: `ParkStay Bookings Desktop`
- [ ] Click "Create"
- [ ] Copy Client ID (save securely)
- [ ] Copy Client Secret (save securely)
- [ ] Click "OK"

## Application Configuration

### 1. Start Application

```bash
npm run dev
```

### 2. Set OAuth Credentials

In the application settings or via console:

```typescript
await window.api.gmail.setCredentials({
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  clientSecret: 'YOUR_CLIENT_SECRET',
  redirectUri: 'http://localhost:3000/oauth2callback'
});
```

- [ ] Credentials set successfully (no errors)

### 3. Authorize Gmail Access

```typescript
await window.api.gmail.authorize();
```

- [ ] Browser window opens
- [ ] Google login page appears
- [ ] Grant permissions
- [ ] Success page shown
- [ ] Return to application

### 4. Verify Authorization

```typescript
const status = await window.api.gmail.checkAuthStatus();
console.log('Authorized:', status.data?.isAuthorized);
```

- [ ] Returns `true`
- [ ] No errors in console

## Testing

### Test 1: Get Recent Emails

```typescript
const result = await window.api.gmail.getRecentEmails(5);
console.log('Emails:', result.data);
```

- [ ] Returns list of emails
- [ ] Each email has: subject, from, date, body

### Test 2: Search for Specific Email

```typescript
const result = await window.api.gmail.testSearch(
  'noreply@example.com',
  'Test Subject'
);
console.log('Found emails:', result.data?.length);
```

- [ ] Returns matching emails or empty array
- [ ] No errors

### Test 3: Wait for OTP (Manual Test)

1. Send yourself a test email with an OTP code
2. Run:
```typescript
const result = await window.api.gmail.waitForEmail(
  'your-email@gmail.com',
  'Test OTP',
  60000
);
console.log('OTP:', result.data?.code);
```

- [ ] OTP code extracted correctly
- [ ] Result returns within timeout

### Test 4: Wait for Magic Link (Manual Test)

1. Send yourself a test email with a link
2. Run:
```typescript
const result = await window.api.gmail.waitForEmail(
  'your-email@gmail.com',
  'Test Link',
  60000
);
console.log('Link:', result.data?.link);
```

- [ ] Link extracted correctly
- [ ] Result returns within timeout

## Troubleshooting

### Issue: "OAuth2 credentials not configured"

- [ ] Run `setCredentials()` with valid Client ID and Secret
- [ ] Verify credentials in Google Cloud Console

### Issue: "Not authorized"

- [ ] Run `authorize()` and complete OAuth flow
- [ ] Check test user is added in OAuth consent screen

### Issue: "Access blocked"

- [ ] Verify your Gmail is added as test user
- [ ] Click "Advanced" > "Go to [App] (unsafe)" if prompted

### Issue: "Email not found"

- [ ] Check subject matches exactly (case-sensitive)
- [ ] Verify email is in inbox (not spam)
- [ ] Try `getRecentEmails()` to confirm API access

### Issue: Port 3000 in use

- [ ] Close other applications using port 3000
- [ ] Check with: `netstat -ano | findstr :3000`

## Security Verification

- [ ] Client Secret not committed to Git
- [ ] Tokens stored in encrypted format
- [ ] Only `gmail.readonly` scope granted
- [ ] Can revoke access via `revokeAuth()`
- [ ] Can revoke via [Google Account](https://myaccount.google.com/permissions)

## Documentation Review

Read these documents:

- [ ] [gmail-otp-setup.md](./gmail-otp-setup.md) - Complete guide
- [ ] [gmail-otp-quick-start.md](./gmail-otp-quick-start.md) - Quick reference
- [ ] [GMAIL-INTEGRATION-SUMMARY.md](./GMAIL-INTEGRATION-SUMMARY.md) - Technical details

## Production Deployment

Before deploying to production:

- [ ] Test with multiple email senders
- [ ] Test timeout scenarios
- [ ] Test token refresh (wait for expiry)
- [ ] Test revocation and re-authorization
- [ ] Document Client ID/Secret storage strategy
- [ ] Set up monitoring for API errors
- [ ] Review API quota usage

## Maintenance Schedule

Set reminders for:

- [ ] Monthly: Update `googleapis` package
- [ ] Quarterly: Review Google Cloud Console security
- [ ] Annually: Rotate Client Secret if needed

## Support

If issues persist:

1. Check logs in application data directory
2. Review error messages in console
3. Test with `getRecentEmails()` for API connectivity
4. Verify OAuth consent screen configuration
5. Check Google Cloud Console for quota limits

## Completion

Once all checkboxes are complete:

- ✅ Gmail OTP integration is fully functional
- ✅ Application can retrieve and extract OTP codes
- ✅ Application can retrieve and extract magic links
- ✅ OAuth2 authentication is working
- ✅ Tokens are stored securely
- ✅ Ready for production use

## Sign-off

- Setup completed by: ________________
- Date: ________________
- Issues encountered: ________________
- Notes: ________________
