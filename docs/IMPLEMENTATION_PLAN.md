# ParkStay Bookings - Hierarchical Agent Swarm Implementation Plan

**Date:** 2025-11-22
**Current Status:** 85-90% Complete
**Target:** 100% Complete with Full QA

## Executive Summary

Based on comprehensive codebase analysis, the ParkStay Bookings cation has:
- ✅ **Backend Infrastructure:** 95% complete (database, tories, services, IPC, 
cheduler)
- ✅ **Frontend Foundation:** 70% complete (main pages exist, incomplete)
- ⚠️ **ParkStay API Integration:** 20% complete (structure , real endpoints 
eeded)
- ❌ **Integration Tests:** 0% complete
- ❌ **Gmail OTP Automation:** 0% complete

## Hierarchical Agent Swarm Architecture

```
────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR                          │
│  (Coordinates all agents, manages dependencies, tracks ss) │
────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
┌───────────────▼──────────────┐  ┌─────────▼──────────────┐
│  RESEARCH & PLANNING AGENT   │  │   IMPLEMENTATION TEAM   │
│  - ParkStay API Research     │  │   (Parallel execution)  │
│  - Gmail OTP Design          │  └──────────┬──────────────┘
│  - Integration Test Design   │             │
└──────────────────────────────┘             │
                                  ┌──────────┴──────────┐
                                  │                     │
                    ┌─────────────▼──────┐  ──────▼─────────┐
                    │  BACKEND AGENTS    │  │  FRONTEND     │
                    │  (Parallel)        │  │  lel)         │
                    └──────┬─────────────┘  ─┬──────────────┘
                           │                        │
        ┌──────────────────┼──────────────┐        ─────────┐
        │                  │               │                 │
┌───────▼─────┐  ┌─────────▼──────┐  ┌────▼─────┐ │  ──────▼──────┐
│ ParkStay    │  │ Gmail OTP      │  │ Auth     │ │  │ Forms      │
│ API Agent   │  │ Automation     │  │ Service  │ │  │ - Watch    │
│             │  │ Agent          │  │ Agent    │ │  │ - STQ      │
└─────────────┘  └────────────────┘  └──────────┘ │  │ - Booking  │
                                                   │  │ - gs Page  │
                                                   │  ─────────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │ UI Integration   │
                                          │ Agent            │
                                          │ - API Connection │
                                          │ - State Mgmt     │
                                          └──────────────────┘
                                                   │
                                    ─────────▼──────────────┐
                                    │   TESTING & QA        │
                                    │   (Sequential after   │
                                    ─────────┬──────────────┘
                                                   │
                            ─────────────────┼──────────────────┐
                            │                                   │
                   ┌────────▼─────────┐  ┌─────────▼────────┐  ▼─────┐
                   │ Integration Test │  │ QA Testing Agent │  │ x   │
                   │ Creation Agent   │  │ - End-to-end     │  │     │
                   │                  │  │ - User Flows     │        │
                   └──────────────────┘  │ - Error Cases    │  ──────┘
                                        │ - Performance    │
                                        └──────────────────┘
```

## Phase 1: Research & Planning (Agents 1-2)

### Agent 1: ParkStay API Research Agent
**Responsibility:** Reverse engineer ParkStay API endpoints

**Tasks:**
1. **Browser Network Analysis**
   - Open parkstay.dbca.wa.gov.au in browser DevTools
   - Capture all API calls during:
     - Login flow (email OTP)
     - Campground search
     - Availability checking
     - Booking creation
     - Booking retrieval
     - Booking cancellation

2. **Document Findings**
   - Create `docs/parkstay-api/endpoints.md` with:
     - Base URL
     - Authentication flow (Azure AD B2C + email magic link)
     - All endpoints with request/response schemas
     - Headers required (cookies, CSRF tokens, etc.)
     - Rate limiting observations

3. **Test Implementation**
   - Create proof-of-concept Node.js script
   - Test login flow
   - Test availability check
   - Document findings

**Deliverables:**
- `docs/parkstay-api/endpoints.md`
- `docs/parkstay-api/authentication-flow.md`
- `scripts/api-test.js` (proof of concept)

### Agent 2: Gmail OTP Automation Designer
**Responsibility:** Design automated email OTP retrieval

**Approach Options:**

#### Option A: Gmail API (Recommended)
```typescript
// Use Gmail API with OAuth2
import { google } from 'googleapis';

class GmailOTPService {
  private gmail: any;

  async initialize() {
    // OAuth2 client setup
    // User authorizes app once
  }

  async waitForOTP(fromEmail: string, timeout: number = 60000): <string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const messages = await this.gmail.users.messages.list({
        userId: 'me',
        q: `from:${fromEmail} after:${Math.floor(startTime / subject:"ParkStay"       
OR subject:"one-time code"`,
        maxResults: 10
      });

      if (messages.data.messages) {
        for (const message of messages.data.messages) {
          const fullMessage = await this.gmail.users.messages.get
            userId: 'me',
            id: message.id,
            format: 'full'
          });

          const code = this.extractOTP(fullMessage);
          if (code) {
            // Optional: Mark as read or delete
            return code;
          }
        }
      }

      await this.sleep(2000); // Check every 2 seconds
    }

    throw new Error('OTP not received within timeout');
  }

  private extractOTP(message: any): string | null {
    // Extract OTP from email body
    // Look for patterns: 6-digit code, magic link, etc.
    const body = this.getBody(message);

    // Pattern 1: Magic link
    const linkMatch = 
ody.match(/https:\/\/parkstay\.dbca\.wa\.gov\.au\/auth\/zA-Z0-9\-_]+/);
    if (linkMatch) return linkMatch[0];

    // Pattern 2: Numeric code
    const codeMatch = body.match(/\b\d{6}\b/);
    if (codeMatch) return codeMatch[0];

    return null;
  }
}
```

#### Option B: IMAP (Alternative)
- Use `imap` npm package
- Connect to Gmail via IMAP
- Search for unread emails from ParkStay
- Extract OTP/magic link
- Mark as read

**Deliverables:**
- `src/main/services/gmail/GmailOTPService.ts`
- `docs/gmail-otp-setup.md` (user setup instructions)
- OAuth2 consent flow UI component

### Agent 3: Integration Test Designer
**Responsibility:** Design comprehensive integration test suite

**Test Categories:**

1. **Authentication Flow Tests**
   ```typescript
   describe('Authentication', () => {
     it('should store credentials securely')
     it('should encrypt/decrypt credentials')
     it('should login to ParkStay')
     it('should retrieve OTP from Gmail')
     it('should handle invalid credentials')
     it('should handle expired sessions')
   })
   ```

2. **Booking Management Tests**
   ```typescript
   describe('Bookings', () => {
     it('should import booking by reference')
     it('should sync booking status')
     it('should list bookings with filters')
     it('should calculate statistics')
     it('should handle cancelled bookings')
   })
   ```

3. **Watch System Tests**
   ```typescript
   describe('Watches', () => {
     it('should create watch with valid data')
     it('should activate watch and schedule job')
     it('should check availability on schedule')
     it('should notify when availability found')
     it('should auto-book if enabled')
     it('should deactivate when dates pass')
   })
   ```

4. **Skip The Queue Tests**
   ```typescript
   describe('Skip The Queue', () => {
     it('should enable STQ for booking')
     it('should check for rebooking opportunities')
     it('should attempt rebooking')
     it('should respect max attempts')
     it('should notify on success')
   })
   ```

5. **End-to-End Tests** (Playwright)
   ```typescript
   test('complete watch flow', async ({ page }) => {
     // Login
     // Create watch
     // Wait for availability
     // Verify notification
     // Verify auto-booking
   })
   ```

**Deliverables:**
- `tests/integration/auth.test.ts`
- `tests/integration/bookings.test.ts`
- `tests/integration/watches.test.ts`
- `tests/integration/stq.test.ts`
- `tests/e2e/complete-flows.spec.ts`
- `tests/fixtures/` (mock data)

## Phase 2: Parallel Implementation (Agents 4-9)

### Backend Team

#### Agent 4: ParkStay API Implementation Agent
**Responsibility:** Implement real ParkStay API endpoints

**Files to Update:**
- `src/main/services/parkstay/parkstay.service.ts`

**Tasks:**
1. Replace placeholder implementations with real API calls
2. Implement Azure AD B2C OAuth2 flow
3. Implement email magic link flow
4. Implement session management
5. Implement all API methods:
   - `login()` - Complete OAuth2 + email auth
   - `searchCampgrounds()` - Real search API
   - `checkAvailability()` - Real availability API
   - `getCampsiteAvailability()` - Detailed site info
   - `createBooking()` - Create booking API
   - `getBookingDetails()` - Fetch booking API
   - `cancelBooking()` - Cancel booking API
   - `updateBooking()` - Rebooking API
   - `checkQueue()` - Queue detection API

6. Add error handling for all API responses
7. Implement rate limiting and retry logic
8. Add comprehensive logging

**Dependencies:** Agent 1 (API Research)

#### Agent 5: Gmail OTP Automation Agent
**Responsibility:** Implement Gmail OTP automation

**Files to Create:**
- `src/main/services/gmail/GmailOTPService.ts`
- `src/main/services/gmail/oauth2-handler.ts`

**Tasks:**
1. Implement Gmail API integration
2. Create OAuth2 consent flow
3. Implement OTP retrieval with polling
4. Implement magic link extraction
5. Add timeout and error handling
6. Store OAuth2 tokens securely
7. Add UI for Gmail authorization

**Dependencies:** Agent 2 (OTP Design)

#### Agent 6: Auth Service Enhancement Agent
**Responsibility:** Integrate Gmail OTP with AuthService

**Files to Update:**
- `src/main/services/auth/AuthService.ts`
- `src/main/ipc/handlers/auth.handlers.ts`

**Tasks:**
1. Add Gmail OTP service integration
2. Update login flow to use Gmail OTP
3. Add IPC handler for Gmail authorization
4. Update preload API
5. Add error handling for OTP failures

**Dependencies:** Agent 5

### Frontend Team

#### Agent 7: Forms Implementation Agent
**Responsibility:** Implement all missing forms

**Files to Create:**
1. **Watch Forms**
   - `src/renderer/pages/Watches/CreateWatch.tsx`
   - `src/renderer/pages/Watches/EditWatch.tsx`
   - `src/renderer/components/forms/WatchForm.tsx`

   Features:
   - Campground search/selection
   - Date range picker
   - Guest count
   - Site preferences (type, price range, accessibility)
   - Check interval configuration
   - Auto-booking toggle
   - Notification preferences

2. **STQ Forms**
   - `src/renderer/pages/SkipTheQueue/CreateSTQ.tsx`
   - `src/renderer/components/forms/STQForm.tsx`

   Features:
   - Booking selection dropdown
   - Max attempts configuration
   - Check interval configuration
   - Notification preferences

3. **Booking Forms**
   - `src/renderer/components/forms/BookingForm.tsx` (create/
   - `src/renderer/components/forms/ImportBookingForm.tsx`

   Features:
   - Manual booking entry
   - Import by reference number
   - Date validation
   - Cost calculation

4. **Settings Page**
   - `src/renderer/pages/Settings.tsx`

   Sections:
   - Account settings (credentials, test connection)
   - Gmail OTP setup
   - Notification preferences (desktop, sound)
   - App preferences (startup, tray, theme)
   - Advanced settings (log level, intervals)

**Deliverables:**
- All forms fully functional
- Form validation with Zod
- Loading/error states
- Success feedback

#### Agent 8: UI Integration Agent
**Responsibility:** Connect UI to backend, fix API calls

**Files to Update:**
- `src/renderer/pages/Watches/index.tsx` - Uncomment API calls
- `src/renderer/pages/SkipTheQueue/index.tsx` - Uncomment API 
- `src/renderer/pages/Bookings/BookingsList.tsx` - Complete ntation
- `src/renderer/pages/Dashboard.tsx` - Real-time updates

**Tasks:**
1. Uncomment and fix all API calls in Watches page
2. Uncomment and fix all API calls in STQ page
3. Implement real-time notification updates
4. Add optimistic UI updates
5. Implement proper error handling
6. Add loading states
7. Add success/error toast notifications
8. Test all UI interactions

#### Agent 9: Component Polish Agent
**Responsibility:** Create missing components and polish UI

**Files to Create:**
- `src/renderer/components/NotificationBell.tsx`
- `src/renderer/components/NotificationList.tsx`
- `src/renderer/components/NotificationItem.tsx`
- `src/renderer/components/LoadingSpinner.tsx`
- `src/renderer/components/ErrorBoundary.tsx`
- `src/renderer/components/EmptyState.tsx`
- `src/renderer/components/ConfirmDialog.tsx`

**Tasks:**
1. Create notification components
2. Add system tray integration
3. Implement desktop notifications
4. Add error boundaries
5. Polish animations and transitions
6. Add keyboard shortcuts
7. Improve accessibility (ARIA labels)

## Phase 3: Integration & Testing (Agents 10-12)

### Agent 10: Integration Test Creation Agent
**Responsibility:** Write all integration tests

**Files to Create:**
- `tests/integration/auth.test.ts`
- `tests/integration/bookings.test.ts`
- `tests/integration/watches.test.ts`
- `tests/integration/stq.test.ts`
- `tests/integration/notifications.test.ts`
- `tests/integration/scheduler.test.ts`
- `tests/e2e/complete-flows.spec.ts`
- `tests/fixtures/mock-data.ts`

**Coverage Goals:**
- Unit tests: >80%
- Integration tests: >70%
- E2E tests: Critical user flows

**Dependencies:** All implementation agents complete

### Agent 11: QA Testing Agent
**Responsibility:** Execute comprehensive QA testing

**Test Scenarios:**

1. **Happy Path Testing**
   - Complete watch flow (create → execute → notify → auto-book)
   - Complete STQ flow (enable → check → rebook → success)
   - Complete booking management
   - Settings management

2. **Error Scenarios**
   - Network failures
   - Invalid credentials
   - Rate limiting
   - API errors
   - Database errors
   - Concurrent operations

3. **Edge Cases**
   - No availability found
   - Max attempts reached
   - Expired sessions
   - Date range validation
   - Multiple simultaneous watches

4. **Performance Testing**
   - 100+ bookings
   - 50+ active watches
   - 20+ STQ entries
   - Database query performance
   - Memory usage over time

5. **Security Testing**
   - Credential encryption
   - SQL injection attempts
   - XSS attempts
   - IPC security

**Process:**
1. Run automated test suite
2. Execute manual test scenarios
3. Document all bugs in `QA_REPORT.md`
4. Create detailed bug reports with reproduction steps
5. Retest after fixes
6. Continue until all tests pass

**Success Criteria:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ All E2E tests pass
- ✅ Zero critical bugs
- ✅ Zero high-priority bugs
- ✅ <5 medium-priority bugs (documented for v1.1)

### Agent 12: Bug Fix Agent
**Responsibility:** Fix all bugs found by QA agent

**Process:**
1. Receive bug reports from Agent 11
2. Prioritize by severity
3. Fix bugs in order: Critical → High → Medium
4. Write regression tests for each bug
5. Notify Agent 11 for retesting
6. Repeat until all bugs resolved

## Agent Coordination & Dependencies

### Dependency Graph
```
Phase 1 (Sequential):
Agent 1 → Agent 4
Agent 2 → Agent 5
Agent 3 → Agent 10

Phase 2 (Parallel):
Backend Team:
  Agent 4 (ParkStay API) ┐
  Agent 5 (Gmail OTP)    ├─→ Agent 6 (Auth Service)
  Agent 6 (Auth Service) ┘

Frontend Team:
  Agent 7 (Forms) ┐
  Agent 8 (Integration) ├─→ Agent 9 (Polish)
  Agent 9 (Polish) ┘

Phase 3 (Sequential):
All Phase 2 → Agent 10 (Integration Tests) → Agent 11 (QA) ⇄ 2 (Bug Fix)
```

### Communication Protocol
- Each agent reports progress every hour
- Orchestrator maintains shared `PROGRESS.md` file
- Blockers escalated immediately to orchestrator
- Daily standup summary for all agents

## Orchestrator Responsibilities

1. **Initialization**
   - Create all agent instances
   - Assign tasks
   - Set up shared workspace

2. **Coordination**
   - Monitor agent progress
   - Manage dependencies
   - Handle blockers
   - Coordinate handoffs

3. **Quality Control**
   - Review agent deliverables
   - Ensure coding standards
   - Maintain documentation
   - Track test coverage

4. **Reporting**
   - Update `PROGRESS.md` every hour
   - Generate daily summary reports
   - Track overall completion percentage
   - Alert on delays or issues

## Timeline Estimate

| Phase | Duration | Agents |
|-------|----------|--------|
| Phase 1: Research & Planning | 4 hours | 1, 2, 3 (sequential) |
| Phase 2: Implementation | 8 hours | 4, 5, 6, 7, 8, 9 el) |
| Phase 3: Testing (Round 1) | 4 hours | 10, 11 (sequential) |
| Phase 3: Bug Fixing | 2-4 hours | 12 (depends on bugs) |
| Phase 3: Testing (Round 2) | 2 hours | 11 (retest) |
| **Total** | **20-22 hours** | |

## Success Metrics

### Code Quality
- [ ] All TypeScript errors resolved
- [ ] All ESLint warnings resolved
- [ ] Code coverage >80%
- [ ] No security vulnerabilities

### Functionality
- [ ] ParkStay API fully integrated
- [ ] Gmail OTP automation working
- [ ] All forms functional
- [ ] All pages functional
- [ ] Job scheduler working
- [ ] Notifications working

### Testing
- [ ] 100% integration test pass rate
- [ ] 100% E2E test pass rate
- [ ] Manual QA complete
- [ ] Performance benchmarks met

### User Experience
- [ ] Intuitive UI
- [ ] Clear error messages
- [ ] Responsive interactions
- [ ] Professional polish

## Risk Mitigation

### Risk 1: ParkStay API Changes
- **Mitigation:** Agent 1 will thoroughly document current API
- **Fallback:** Implement browser automation with Puppeteer

### Risk 2: Gmail OTP Complexity
- **Mitigation:** Multiple implementation options (Gmail API, 
- **Fallback:** Manual OTP entry with clear instructions

### Risk 3: Integration Issues
- **Mitigation:** Comprehensive integration tests
- **Fallback:** Incremental integration with rollback capability

### Risk 4: Timeline Overrun
- **Mitigation:** Parallel execution where possible
- **Fallback:** Prioritize MVP features, defer polish

## Deliverables Summary

### Documentation
- `docs/parkstay-api/endpoints.md`
- `docs/parkstay-api/authentication-flow.md`
- `docs/gmail-otp-setup.md`
- `PROGRESS.md` (updated hourly)
- `QA_REPORT.md`

### Code
- Updated `parkstay.service.ts` with real API
- New `GmailOTPService.ts`
- All forms implemented
- All pages fully functional
- Comprehensive test suite

### Tests
- 50+ integration tests
- 20+ E2E tests
- 80%+ code coverage

### Quality Assurance
- Zero critical bugs
- Zero high-priority bugs
- All automated tests passing
- Manual QA complete

## Next Steps

1. **User Approval:** Review and approve this plan
2. **Agent Deployment:** Deploy all 12 specialized agents
3. **Execution:** Begin Phase 1 with research agents
4. **Monitoring:** Orchestrator tracks progress
5. **QA Loop:** Continue testing until all tests pass
6. **Completion:** Final review and deployment

---

**Status:** Ready to Deploy
**Created By:** Orchestrator Agent
**Approved By:** [Pending User Approval]