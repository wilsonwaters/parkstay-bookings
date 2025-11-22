# ParkStay Authentication Flow

## Overview

The ParkStay system (parkstay.dbca.wa.gov.au) uses a passwordless authentication system based on Azure AD B2C (Azure Active Directory Business-to-Consumer) with email magic links. Users never need to create or remember a password.

## Authentication Architecture

### Components

1. **Azure AD B2C Tenant**: `dbcab2c.onmicrosoft.com`
2. **Custom Policy**: `B2C_1A_Parkstay_prod`
3. **SSO Gateway**: `auth2.dbca.wa.gov.au`
4. **ParkStay Application**: `parkstay.dbca.wa.gov.au`
5. **Ledger System**: Core authentication and commerce hub

## Authentication Flow

### 1. Magic Link Login Flow

```
User                    ParkStay               Auth Gateway            Azure AD B2C
  |                         |                         |                       |
  |---(1) Visit site------->|                         |                       |
  |                         |                         |                       |
  |<--(2) Login page--------|                         |                       |
  |                         |                         |                       |
  |---(3) Enter email------>|                         |                       |
  |                         |                         |                       |
  |                         |---(4) Redirect to SSO-->|                       |
  |                         |                         |                       |
  |                         |                         |---(5) Initiate auth-->|
  |                         |                         |                       |
  |                         |                         |<--(6) Challenge-------|
  |                         |                         |                       |
  |<-------------------------(7) Email magic link-------------------------|
  |                         |                         |                       |
  |---(8) Click link------->|                         |                       |
  |                         |                         |                       |
  |                         |---(9) Validate-------->|                       |
  |                         |                         |                       |
  |                         |                         |---(10) Verify-------->|
  |                         |                         |                       |
  |                         |                         |<--(11) Token----------|
  |                         |                         |                       |
  |                         |<--(12) Auth callback----|                       |
  |                         |                         |                       |
  |<--(13) Session cookie---|                         |                       |
  |                         |                         |                       |
  |---(14) Authenticated--->|                         |                       |
```

### 2. Detailed Step-by-Step Process

#### Step 1-2: Initial Access
- User visits `parkstay.dbca.wa.gov.au`
- System checks for existing session
- If not authenticated, redirect to login page

#### Step 3: Email Entry
- User enters email address
- System validates email format
- Checks if email is registered

#### Step 4: SSO Redirect
- ParkStay redirects to SSO gateway:
  ```
  GET https://auth2.dbca.wa.gov.au/sso/auth_local
  Query params:
    - next: parkstay.dbca.wa.gov.au/ssologin
  ```

#### Step 5-6: Azure AD B2C Initiation
- SSO gateway redirects to Azure AD B2C OAuth2 endpoint:
  ```
  GET https://dbcab2c.b2clogin.com/dbcab2c.onmicrosoft.com/B2C_1A_Parkstay_prod/oauth2/v2.0/authorize
  Query params:
    - client_id: f99767f0-123b-4b1b-8723-dec08ca45290
    - redirect_uri: https://auth2.dbca.wa.gov.au/sso/complete/azuread-b2c-oauth2
    - state: [random_state_token]
    - response_type: code
    - scope: openid email
    - p: B2C_1A_Parkstay_prod
  ```

#### Step 7: Magic Link Email
- Azure AD B2C sends email to user
- Email contains one-time magic link
- Link is time-limited (typically 5-15 minutes)
- Link contains authentication token

#### Step 8-10: Link Click and Validation
- User clicks magic link in email
- Link redirects back to Azure AD B2C
- Azure AD B2C validates the token
- Generates authorization code

#### Step 11: Token Exchange
- Azure AD B2C returns authorization code to SSO gateway
- SSO gateway exchanges code for access token:
  ```
  POST https://dbcab2c.b2clogin.com/dbcab2c.onmicrosoft.com/B2C_1A_Parkstay_prod/oauth2/v2.0/token
  Body:
    - grant_type: authorization_code
    - client_id: f99767f0-123b-4b1b-8723-dec08ca45290
    - code: [authorization_code]
    - redirect_uri: https://auth2.dbca.wa.gov.au/sso/complete/azuread-b2c-oauth2
  ```

#### Step 12-13: Session Creation
- SSO gateway creates user session in Ledger system
- Returns to ParkStay with authentication callback
- ParkStay creates local session cookie
- Session typically valid for 24 hours

#### Step 14: Authenticated Access
- User can now access protected resources
- Session cookie sent with each request
- CSRF token managed by Django backend

## Session Management

### Session Token Structure

```typescript
interface ParkStaySession {
  // Session cookies from Django backend
  sessionid: string;        // Django session ID
  csrftoken: string;        // CSRF protection token

  // Optional queue system cookie
  sitequeuesession?: string;  // Queue management session

  // User info (stored server-side)
  user: {
    email: string;
    userId: string;
    firstName?: string;
    lastName?: string;
  };

  // Expiration
  expiresAt: Date;
}
```

### Session Validation

**Endpoint**: `GET /api/account/`

**Response**:
```json
{
  "id": 12345,
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "is_staff": false,
  "is_authenticated": true
}
```

### Session Expiration
- Sessions expire after 24 hours of inactivity
- Server-side session cleanup occurs regularly
- Client should check session validity before operations

## Security Considerations

### CSRF Protection
- Django CSRF middleware enabled
- CSRF token required for all POST/PUT/DELETE requests
- Token stored in cookie: `csrftoken`
- Token sent in header: `X-CSRFToken` or in form data

### Cookie Security
- HttpOnly flag set on session cookies
- Secure flag set (HTTPS only)
- SameSite=Lax policy
- Domain restricted to `.dbca.wa.gov.au`

### State Parameter
- Random state token prevents CSRF attacks
- State validated on OAuth callback
- State tied to user's browser session

## Queue System Integration

During high-traffic periods, ParkStay uses a queue system hosted at `queue.dbca.wa.gov.au`.

### Queue Flow

```
User                    ParkStay               Queue System
  |                         |                         |
  |---(1) Request---------->|                         |
  |                         |                         |
  |                         |---(2) Check queue------>|
  |                         |                         |
  |                         |<--(3) Queue status------|
  |                         |                         |
  |<--(4) Queue page--------|                         |
  |                         |                         |
  |---(5) Poll position---->|---(6) Check------------>|
  |                         |                         |
  |<--(7) Position----------|<--(8) Status------------|
  |                         |                         |
  [Wait until position = 0] |                         |
  |                         |                         |
  |---(9) Request---------->|---(10) Validate-------->|
  |                         |                         |
  |<--(11) Access granted---|<--(12) Cleared----------|
```

### Queue Session Cookie

When in queue:
```
Cookie: sitequeuesession=[queue_session_id]
```

### Queue Status Check

**Endpoint**: `GET /api/queue/status/`

**Response**:
```json
{
  "active": true,
  "position": 42,
  "wait_time": 180,  // seconds
  "session_id": "abc123..."
}
```

## Implementation Notes for Automation

### Challenges

1. **Magic Link Requirement**
   - Cannot automate email link clicking in production
   - Email must be accessed programmatically or manually
   - Consider using email API (Gmail API, IMAP) to retrieve links

2. **Session Persistence**
   - Sessions expire after 24 hours
   - Need to handle re-authentication
   - Store session cookies securely

3. **CSRF Token Management**
   - Must extract CSRF token from cookies
   - Include in all state-changing requests
   - Token refreshes with new session

4. **Queue System**
   - May need to wait in queue during peak times
   - Position polling required
   - Session must maintain queue cookie

### Recommended Approach

1. **Manual Initial Authentication**
   - User authenticates through normal web flow
   - Export session cookies from browser
   - Import cookies into automation tool

2. **Session Cookie Import**
   ```typescript
   const session = {
     sessionid: 'xxx',
     csrftoken: 'yyy',
     expiresAt: new Date('2025-11-23T10:00:00Z')
   };
   parkstayService.setSession(session);
   ```

3. **Session Validation**
   - Check session validity before operations
   - Re-authenticate if expired
   - Handle 401/403 responses gracefully

4. **Testing Strategy**
   - Test with valid session in UAT environment
   - Document exact cookie requirements
   - Capture network traffic to understand flows

## Azure AD B2C Configuration Details

### OAuth2 Endpoints

**Authorization Endpoint**:
```
https://dbcab2c.b2clogin.com/dbcab2c.onmicrosoft.com/B2C_1A_Parkstay_prod/oauth2/v2.0/authorize
```

**Token Endpoint**:
```
https://dbcab2c.b2clogin.com/dbcab2c.onmicrosoft.com/B2C_1A_Parkstay_prod/oauth2/v2.0/token
```

**Logout Endpoint**:
```
https://dbcab2c.b2clogin.com/dbcab2c.onmicrosoft.com/B2C_1A_Parkstay_prod/oauth2/v2.0/logout
```

### Client Configuration

- **Client ID**: `f99767f0-123b-4b1b-8723-dec08ca45290`
- **Redirect URI**: `https://auth2.dbca.wa.gov.au/sso/complete/azuread-b2c-oauth2`
- **Scopes**: `openid`, `email`
- **Response Type**: `code` (Authorization Code Flow)
- **Policy**: `B2C_1A_Parkstay_prod`

## Testing Authentication

### Manual Testing Steps

1. Open browser DevTools (Network tab)
2. Clear cookies
3. Visit `https://parkstay.dbca.wa.gov.au`
4. Click login
5. Enter email
6. Check email for magic link
7. Click magic link
8. Observe redirects and cookies
9. Export cookies from DevTools

### Required Cookies

After successful authentication, you should have:
- `sessionid` - Django session identifier
- `csrftoken` - CSRF protection token
- Potentially other Django/session cookies

### Cookie Export Format

```json
{
  "cookies": [
    {
      "name": "sessionid",
      "value": "xxx...",
      "domain": ".dbca.wa.gov.au",
      "path": "/",
      "secure": true,
      "httpOnly": true
    },
    {
      "name": "csrftoken",
      "value": "yyy...",
      "domain": ".dbca.wa.gov.au",
      "path": "/",
      "secure": true,
      "httpOnly": false
    }
  ]
}
```

## Related Documentation

- [API Endpoints](./ENDPOINTS.md) - All ParkStay API endpoints
- [Azure AD B2C Documentation](https://learn.microsoft.com/en-us/azure/active-directory-b2c/)
- [OAuth 2.0 Authorization Code Flow](https://oauth.net/2/grant-types/authorization-code/)
