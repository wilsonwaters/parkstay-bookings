# Gmail OTP/Magic Link Setup Guide

This guide will help you set up Gmail API integration for automated OTP (One-Time Password) and magic link retrieval in the ParkStay Bookings application.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Google Cloud Console Setup](#google-cloud-console-setup)
4. [Application Configuration](#application-configuration)
5. [Usage Examples](#usage-examples)
6. [Troubleshooting](#troubleshooting)
7. [Security Considerations](#security-considerations)

## Overview

The Gmail OTP service allows ParkStay Bookings to automatically retrieve verification codes and magic links from your Gmail inbox. This is useful for automated authentication flows with ParkStay and other services.

### Features

- Automated email polling and retrieval
- OTP code extraction (4-8 digit codes)
- Magic link detection and extraction
- Secure OAuth2 authentication
- Token refresh and management
- Email search with filters (sender, subject, date)

## Prerequisites

Before you begin, ensure you have:

1. A Google account with Gmail access
2. Access to Google Cloud Console
3. ParkStay Bookings application installed
4. Node.js 20+ installed (for development)

## Google Cloud Console Setup

### Step 1: Create a New Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "New Project"
4. Enter a project name (e.g., "ParkStay Bookings Gmail")
5. Click "Create"

### Step 2: Enable Gmail API

1. In your new project, go to "APIs & Services" > "Library"
2. Search for "Gmail API"
3. Click on "Gmail API"
4. Click "Enable"

### Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Select "External" user type (unless you have a Google Workspace account)
3. Click "Create"

#### Fill in the required fields:

**App Information:**
- App name: `ParkStay Bookings`
- User support email: Your email address
- Developer contact email: Your email address

**App Domain (Optional):**
- Leave blank for testing

**Scopes:**
- Click "Add or Remove Scopes"
- Search for "Gmail API"
- Select: `https://www.googleapis.com/auth/gmail.readonly`
- Click "Update"

**Test Users (Important for External apps):**
- Click "Add Users"
- Add your Gmail address
- Click "Save"

4. Click "Save and Continue" through all steps

### Step 4: Create OAuth2 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Desktop app" as the application type
4. Enter a name: `ParkStay Bookings Desktop`
5. Click "Create"

6. A dialog will appear with your credentials:
   - **Client ID**: Keep this safe (looks like `xxxxx.apps.googleusercontent.com`)
   - **Client Secret**: Keep this safe (random string)

7. Click "Download JSON" to save the credentials (optional)
8. Click "OK"

### Important Notes:

- Keep your Client ID and Client Secret secure
- Do not commit them to version control
- The redirect URI is automatically set to `http://localhost:3000/oauth2callback`

## Application Configuration

### Step 1: Set OAuth2 Credentials

In your ParkStay Bookings application:

```typescript
// From renderer process (e.g., Settings page)
const credentials = {
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  clientSecret: 'YOUR_CLIENT_SECRET',
  redirectUri: 'http://localhost:3000/oauth2callback' // Default, usually don't change
};

const response = await window.api.gmail.setCredentials(credentials);
if (response.success) {
  console.log('Credentials set successfully');
}
```

### Step 2: Authorize Gmail Access

After setting credentials, initiate the authorization flow:

```typescript
// This will open a browser window for Google OAuth consent
const response = await window.api.gmail.authorize();

if (response.success) {
  console.log('Gmail authorized successfully');
} else {
  console.error('Authorization failed:', response.error);
}
```

**What happens during authorization:**
1. Browser opens to Google's consent screen
2. You log in with your Google account
3. You grant permission to read your emails
4. You're redirected to a success page
5. The application receives and stores the access token

### Step 3: Verify Authorization

Check if Gmail is properly authorized:

```typescript
const statusResponse = await window.api.gmail.checkAuthStatus();

if (statusResponse.success && statusResponse.data?.isAuthorized) {
  console.log('Gmail is authorized');
  console.log('Token expires:', new Date(statusResponse.data.expiryDate));
} else {
  console.log('Gmail is not authorized');
}
```

## Usage Examples

### Example 1: Wait for OTP Code

```typescript
// Wait for an email with an OTP code
const result = await window.api.gmail.waitForEmail(
  'noreply@parkstay.com',
  'Your ParkStay Verification Code',
  60000 // timeout in milliseconds (60 seconds)
);

if (result.success && result.data?.found) {
  console.log('OTP Code:', result.data.code);
  // Use the code for authentication
} else {
  console.error('Email not found or timeout reached');
}
```

### Example 2: Wait for Magic Link

```typescript
// Wait for an email with a magic link
const result = await window.api.gmail.waitForEmail(
  'auth@example.com',
  'Sign in to your account',
  90000 // 90 seconds timeout
);

if (result.success && result.data?.found && result.data.link) {
  console.log('Magic Link:', result.data.link);
  // Open the link or extract token from it
  window.open(result.data.link);
}
```

### Example 3: Get Recent Emails (Testing)

```typescript
// Get last 10 emails for testing
const response = await window.api.gmail.getRecentEmails(10);

if (response.success) {
  console.log('Recent emails:', response.data);
  response.data?.forEach(email => {
    console.log(`From: ${email.from}`);
    console.log(`Subject: ${email.subject}`);
    console.log(`Date: ${email.date}`);
  });
}
```

### Example 4: Test Email Search

```typescript
// Test if emails from a specific sender can be found
const response = await window.api.gmail.testSearch(
  'noreply@parkstay.com',
  'Booking Confirmation'
);

if (response.success) {
  console.log(`Found ${response.data?.length} matching emails`);
}
```

### Example 5: Revoke Authorization

```typescript
// Revoke Gmail access
const response = await window.api.gmail.revokeAuth();

if (response.success) {
  console.log('Gmail authorization revoked');
}
```

## Troubleshooting

### Common Issues

#### Issue 1: "Authorization Error" or "Access Blocked"

**Cause:** Your app is not verified by Google, or you're not a test user.

**Solution:**
1. Ensure your Gmail address is added as a test user in OAuth consent screen
2. If prompted "This app isn't verified", click "Advanced" > "Go to [App Name] (unsafe)"
3. This is safe for your own application

#### Issue 2: "Token Expired" Errors

**Cause:** Access token has expired and refresh failed.

**Solution:**
1. Re-authorize: `await window.api.gmail.authorize()`
2. This will get fresh tokens

#### Issue 3: "Email Not Found" Despite Email Existing

**Possible causes:**
- Email subject doesn't match exactly
- Email is older than the polling start time
- Email is already marked as read

**Solutions:**
1. Use exact subject match (case-sensitive)
2. Check spam/promotions folders
3. Test with: `await window.api.gmail.testSearch(sender, subject)`
4. Use `getRecentEmails()` to verify emails are accessible

#### Issue 4: "Credentials Not Set" Error

**Cause:** OAuth2 credentials not configured.

**Solution:**
```typescript
await window.api.gmail.setCredentials({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
  redirectUri: 'http://localhost:3000/oauth2callback'
});
```

#### Issue 5: Timeout Before Email Arrives

**Cause:** Default timeout (60 seconds) is too short.

**Solution:**
```typescript
// Increase timeout to 2 minutes
await window.api.gmail.waitForEmail(
  sender,
  subject,
  120000 // 2 minutes
);
```

#### Issue 6: Port 3000 Already in Use

**Cause:** OAuth callback server can't start on port 3000.

**Solution:**
1. Close other applications using port 3000
2. Or modify the redirect URI in both Google Console and app config

### Debug Mode

Enable verbose logging to troubleshoot:

```typescript
// Check detailed auth status
const status = await window.api.gmail.checkAuthStatus();
console.log('Full auth status:', status);

// Test credentials
const creds = await window.api.gmail.getCredentials();
console.log('Stored credentials:', creds);
```

### Error Messages Reference

| Error Message | Meaning | Solution |
|--------------|---------|----------|
| "OAuth2 credentials not configured" | Client ID/Secret not set | Set credentials using `setCredentials()` |
| "Not authorized" | No valid access token | Run `authorize()` |
| "Authorization code not found" | OAuth flow interrupted | Retry authorization |
| "Authorization timeout" | User didn't complete OAuth in 5 minutes | Retry with faster response |
| "Email not found within timeout" | No matching email received | Increase timeout or check filters |
| "Token refresh failed" | Refresh token invalid | Re-authorize from scratch |

## Security Considerations

### Token Storage

- OAuth2 tokens are stored encrypted using `electron-store`
- Encryption key: `parkstay-gmail-oauth-encryption-key`
- Stored in user's application data directory
- Never committed to version control

### Access Scope

The application only requests `gmail.readonly` scope:
- Can read emails but NOT send, delete, or modify
- Minimal permissions for security
- Can be revoked at any time

### Client Secret Protection

Best practices for Client Secret:
1. Never commit to Git
2. Store in environment variables for development
3. Consider using a secrets manager for production
4. Rotate if compromised

### Revoking Access

To revoke access:
1. From app: `await window.api.gmail.revokeAuth()`
2. From Google: [Google Account > Security > Third-party apps](https://myaccount.google.com/permissions)

### Audit

Monitor Gmail access:
1. Google sends security alerts for new app authorizations
2. Check [Recent Security Activity](https://myaccount.google.com/security-checkup)
3. Review access regularly

## API Reference

### Available Methods

```typescript
// Set OAuth2 credentials
window.api.gmail.setCredentials(credentials: OAuth2Credentials): Promise<APIResponse<boolean>>

// Get stored credentials
window.api.gmail.getCredentials(): Promise<APIResponse<OAuth2Credentials | null>>

// Authorize Gmail access
window.api.gmail.authorize(): Promise<APIResponse<boolean>>

// Check authorization status
window.api.gmail.checkAuthStatus(): Promise<APIResponse<GmailAuthStatus>>

// Revoke authorization
window.api.gmail.revokeAuth(): Promise<APIResponse<boolean>>

// Wait for email and extract OTP/link
window.api.gmail.waitForEmail(
  fromEmail: string,
  subject: string,
  timeout?: number
): Promise<APIResponse<OTPResult>>

// Get recent emails (testing)
window.api.gmail.getRecentEmails(maxResults?: number): Promise<APIResponse<GmailMessage[]>>

// Test email search (debugging)
window.api.gmail.testSearch(
  fromEmail: string,
  subject: string
): Promise<APIResponse<GmailMessage[]>>
```

### Types

```typescript
interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface GmailAuthStatus {
  isAuthorized: boolean;
  expiryDate?: number;
}

interface OTPResult {
  found: boolean;
  code?: string;        // Extracted OTP code (4-8 digits)
  link?: string;        // Extracted magic link
  message?: GmailMessage;
}

interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: Date;
  body: string;
  snippet: string;
}
```

## Support

For issues or questions:
1. Check this documentation first
2. Review error messages carefully
3. Test with simpler cases (e.g., `getRecentEmails()`)
4. Check Google Cloud Console for quota limits
5. Verify OAuth consent screen configuration

## Additional Resources

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [OAuth2 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google Cloud Console](https://console.cloud.google.com/)
- [OAuth2 Playground](https://developers.google.com/oauthplayground/) (for testing scopes)
