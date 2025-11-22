# Gmail OTP Integration - Quick Start

## 5-Minute Setup

### 1. Google Cloud Console (One-time setup)

1. Go to https://console.cloud.google.com/
2. Create new project: "ParkStay Bookings Gmail"
3. Enable Gmail API: APIs & Services > Library > Gmail API > Enable
4. Configure OAuth:
   - APIs & Services > OAuth consent screen
   - External > Create
   - Add your Gmail as test user
5. Create credentials:
   - APIs & Services > Credentials
   - Create Credentials > OAuth client ID
   - Desktop app
   - Save Client ID and Client Secret

### 2. In ParkStay Bookings App

```typescript
// Step 1: Set credentials (one-time)
await window.api.gmail.setCredentials({
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  clientSecret: 'YOUR_CLIENT_SECRET',
  redirectUri: 'http://localhost:3000/oauth2callback'
});

// Step 2: Authorize (browser will open)
await window.api.gmail.authorize();

// Step 3: Use it!
const result = await window.api.gmail.waitForEmail(
  'noreply@parkstay.com',
  'Your Verification Code',
  60000 // 60 seconds
);

if (result.success && result.data?.found) {
  console.log('OTP:', result.data.code);
  console.log('Link:', result.data.link);
}
```

## Common Use Cases

### Extract OTP Code
```typescript
const result = await window.api.gmail.waitForEmail(
  'noreply@service.com',
  'Your verification code',
  60000
);
console.log('Code:', result.data?.code); // e.g., "123456"
```

### Extract Magic Link
```typescript
const result = await window.api.gmail.waitForEmail(
  'auth@service.com',
  'Sign in link',
  60000
);
console.log('Link:', result.data?.link); // e.g., "https://..."
```

### Check if Authorized
```typescript
const status = await window.api.gmail.checkAuthStatus();
console.log('Authorized:', status.data?.isAuthorized);
```

## Troubleshooting

- **"Access blocked"**: Add your email as test user in OAuth consent screen
- **"Not authorized"**: Run `await window.api.gmail.authorize()`
- **Email not found**: Check subject matches exactly (case-sensitive)
- **Port 3000 in use**: Close other apps using that port

## Full Documentation

See [gmail-otp-setup.md](./gmail-otp-setup.md) for complete guide.
