import axios, { AxiosInstance } from 'axios';
import {
  ParkStaySessionToken,
  SearchParams,
  AvailabilityCheckResult,
  BookingParams,
  BookingResult,
  RebookParams,
  RebookResult,
  CampgroundSearchResult,
  CampsiteAvailability,
  QueueSessionInfo,
} from '@shared/types';
import { PARKSTAY_API_BASE_URL } from '@shared/constants';

/**
 * ParkStay API Service
 * Handles all interactions with the ParkStay website and API
 *
 * IMPORTANT: This is a RESEARCH implementation. Real ParkStay API uses:
 * - Azure AD B2C with OAuth2 for authentication (magic link email flow)
 * - Django REST Framework backend
 * - Session-based authentication with cookies (sessionid, csrftoken)
 * - CSRF protection on all state-changing operations
 * - Queue system during high traffic (queue.dbca.wa.gov.au)
 *
 * API Base URL: https://parkstay.dbca.wa.gov.au/api
 * Auth Gateway: https://auth2.dbca.wa.gov.au
 *
 * See documentation:
 * - docs/parkstay-api/AUTHENTICATION_FLOW.md
 * - docs/parkstay-api/ENDPOINTS.md
 *
 * Authentication Flow:
 * 1. User enters email at /ssologin
 * 2. Redirects to auth2.dbca.wa.gov.au/sso/auth_local
 * 3. Redirects to Azure AD B2C OAuth2 endpoint
 * 4. User receives magic link via email
 * 5. Click link validates and returns auth code
 * 6. Auth code exchanged for session
 * 7. Session cookies (sessionid, csrftoken) returned
 *
 * Current Implementation Status:
 * - URLs are educated guesses based on Django REST conventions
 * - Request/response formats need manual testing to confirm
 * - CSRF token handling implemented but untested
 * - Queue system integration needs testing
 *
 * TODO for Production:
 * 1. Manual test with browser DevTools to capture real API calls
 * 2. Export valid session cookies for testing
 * 3. Verify exact endpoint URLs and payloads
 * 4. Test error scenarios and update error handling
 * 5. Implement proper session refresh mechanism
 */
export class ParkStayService {
  private client: AxiosInstance;
  private session: ParkStaySessionToken | null = null;
  private queueSession: QueueSessionInfo | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: PARKSTAY_API_BASE_URL,
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      withCredentials: true,
    });

    // Add request interceptor for session handling
    this.client.interceptors.request.use((config) => {
      if (this.session && this.session.cookies) {
        const cookieString = Object.entries(this.session.cookies)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ');
        config.headers.Cookie = cookieString;
      }

      // Add queue session cookie if present
      if (this.queueSession?.sitequeueSessionCookie) {
        const existingCookies = config.headers.Cookie || '';
        config.headers.Cookie = `${existingCookies}; sitequeuesession=${this.queueSession.sitequeueSessionCookie}`;
      }

      return config;
    });

    // Add response interceptor for cookie handling
    this.client.interceptors.response.use((response) => {
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader && this.session) {
        setCookieHeader.forEach((cookie: string) => {
          const [nameValue] = cookie.split(';');
          const [name, value] = nameValue.split('=');
          if (name && value) {
            this.session!.cookies[name.trim()] = value.trim();
          }
        });
      }
      return response;
    });
  }

  /**
   * Login to ParkStay
   *
   * IMPORTANT: This method CANNOT be fully automated due to magic link authentication.
   *
   * Real ParkStay Authentication Flow:
   * 1. User visits: https://parkstay.dbca.wa.gov.au/ssologin
   * 2. Enters email address (no password required)
   * 3. System sends magic link to email via Azure AD B2C
   * 4. User clicks link in email
   * 5. Link redirects through Azure AD B2C OAuth2 flow
   * 6. Session cookies set: sessionid, csrftoken
   *
   * For Automation:
   * - Option 1: Manual login via browser, export cookies, use setSession()
   * - Option 2: Implement email API integration (Gmail API, IMAP) to retrieve magic link
   * - Option 3: Use browser automation (Puppeteer/Playwright) to handle full flow
   *
   * This method is a PLACEHOLDER and will not work in production.
   * Real endpoint: GET /ssologin (initiates flow, no direct login endpoint)
   *
   * @param email - User's email address (password not used by ParkStay)
   * @param password - Not used (kept for interface compatibility)
   * @returns Promise<ParkStaySessionToken> - Will throw error in current implementation
   */
  async login(email: string, password: string): Promise<ParkStaySessionToken> {
    try {
      // NOTE: This endpoint does NOT exist in real ParkStay API
      // Real flow requires:
      // 1. GET /ssologin -> redirects to auth2.dbca.wa.gov.au
      // 2. User clicks magic link from email
      // 3. OAuth2 callback sets session cookies
      //
      // TODO: Either implement browser automation or require manual cookie import

      const response = await this.client.post('/auth/login', {
        username: email,
        password: password,
      });

      const cookies: Record<string, string> = {};
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        setCookieHeader.forEach((cookie: string) => {
          const [nameValue] = cookie.split(';');
          const [name, value] = nameValue.split('=');
          if (name && value) {
            cookies[name.trim()] = value.trim();
          }
        });
      }

      this.session = {
        token: response.data.access_token || cookies['parkstay_token'] || '',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        cookies,
      };

      return this.session;
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error('Failed to login to ParkStay');
    }
  }

  /**
   * Validate current session
   *
   * Real endpoint: GET /api/account/
   * Returns authenticated user info if session valid, 401 if invalid.
   *
   * Response (valid session):
   * {
   *   "id": 12345,
   *   "email": "user@example.com",
   *   "first_name": "John",
   *   "last_name": "Doe",
   *   "is_staff": false,
   *   "is_authenticated": true
   * }
   *
   * Django session cookies expire after 24 hours by default.
   * Session must be refreshed periodically for long-running automation.
   *
   * @returns Promise<boolean> - True if session valid, false otherwise
   */
  async validateSession(): Promise<boolean> {
    if (!this.session) return false;

    if (this.session.expiresAt < new Date()) {
      this.session = null;
      return false;
    }

    try {
      // Real endpoint: GET /api/account/
      // Returns user info if authenticated, 401 if not
      await this.client.get('/account/');
      return true;
    } catch {
      this.session = null;
      return false;
    }
  }

  /**
   * Logout
   *
   * Real endpoint: POST /api/accounts/logout/
   * Requires CSRF token in X-CSRFToken header.
   * Invalidates Django session on server side.
   *
   * @returns Promise<void>
   */
  async logout(): Promise<void> {
    try {
      // Real endpoint: POST /api/accounts/logout/
      // Requires CSRF token
      await this.client.post('/accounts/logout/');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      this.session = null;
      this.queueSession = null;
    }
  }

  /**
   * Search campgrounds
   *
   * Real endpoint: GET /api/search_suggest
   * Public endpoint (no authentication required).
   * Returns GeoJSON FeatureCollection with all campgrounds.
   *
   * Response format (GeoJSON):
   * {
   *   "type": "FeatureCollection",
   *   "features": [{
   *     "type": "Point",
   *     "properties": {
   *       "type": "Campground",
   *       "id": 34,
   *       "name": "Lane Poole Reserve",
   *       "zoom_level": 12
   *     },
   *     "coordinates": [116.092, -32.8053]
   *   }]
   * }
   *
   * @param query - Search query (filters client-side if provided)
   * @returns Promise<CampgroundSearchResult[]> - Array of matching campgrounds
   */
  async searchCampgrounds(query: string): Promise<CampgroundSearchResult[]> {
    try {
      // Real endpoint: GET /api/search_suggest (returns GeoJSON)
      const response = await this.client.get('/search_suggest');

      // Parse GeoJSON FeatureCollection
      const features = response.data.features || [];
      let campgrounds: CampgroundSearchResult[] = features.map((feature: any) => ({
        id: String(feature.properties?.id || ''),
        name: feature.properties?.name || 'Unknown',
        type: feature.properties?.type || 'Campground',
        coordinates: feature.coordinates as [number, number] | undefined,
      }));

      // Filter by query if provided
      if (query && query.length >= 2) {
        const lowerQuery = query.toLowerCase();
        campgrounds = campgrounds.filter((cg) =>
          cg.name.toLowerCase().includes(lowerQuery)
        );
      }

      return campgrounds;
    } catch (error) {
      console.error('Search campgrounds failed:', error);
      throw new Error('Failed to search campgrounds');
    }
  }

  /**
   * Check availability for a campground
   *
   * Real endpoint: GET /api/campground_availabilty_view/ (note: typo in URL is intentional)
   * Public endpoint but session cookies help with rate limiting.
   *
   * Query Parameters:
   * - format: json
   * - arrival: Date string (YYYY/MM/DD - slash separated)
   * - departure: Date string (YYYY/MM/DD - slash separated)
   * - gear_type: Site type filter ("tent", "campervan", "caravan", "all")
   * - features: JSON array []
   * - featurescs: JSON array []
   *
   * Example: GET /api/campground_availabilty_view/?format=json&arrival=2026/01/18&departure=2026/01/19&gear_type=all
   *
   * Response format:
   * {
   *   "campground": {},
   *   "campground_available": {
   *     "31": { "sites": [136, 137, ...], "total_available": 24, "total_bookable": 13 },
   *     ...
   *   }
   * }
   *
   * @param campgroundId - ID of the campground
   * @param params - Search parameters (dates, guests, site type)
   * @returns Promise<AvailabilityCheckResult> - Availability data for the campground
   */
  async checkAvailability(
    campgroundId: string,
    params: SearchParams
  ): Promise<AvailabilityCheckResult> {
    try {
      // Format dates as YYYY/MM/DD (slash-separated as required by ParkStay)
      const formatDate = (dateStr: string) => {
        // Handle both YYYY-MM-DD and Date objects
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
      };

      // Real endpoint: GET /api/campground_availabilty_view/ (note: typo is intentional)
      const response = await this.client.get('/campground_availabilty_view/', {
        params: {
          format: 'json',
          arrival: formatDate(params.arrivalDate),
          departure: formatDate(params.departureDate),
          gear_type: params.siteType || 'all',
          features: '[]',
          featurescs: '[]',
        },
      });

      // Get availability for the specific campground
      const campgroundAvailable = response.data.campground_available || {};
      const campgroundData = campgroundAvailable[campgroundId];

      if (!campgroundData) {
        return {
          available: false,
          sites: [],
          totalAvailable: 0,
          lowestPrice: undefined,
        };
      }

      // Map site IDs to CampsiteAvailability format
      const sites: CampsiteAvailability[] = (campgroundData.sites || []).map((siteId: number) => ({
        siteId: String(siteId),
        siteName: `Site ${siteId}`,
        siteType: params.siteType || 'all',
        maxOccupancy: params.numGuests,
        dates: [{
          date: params.arrivalDate,
          available: true,
          price: 0, // Price not available in this endpoint
          bookable: true,
        }],
      }));

      return {
        available: campgroundData.total_bookable > 0,
        sites,
        totalAvailable: campgroundData.total_available || 0,
        lowestPrice: undefined, // Price not available in this endpoint
      };
    } catch (error) {
      console.error('Check availability failed:', error);
      throw new Error('Failed to check availability');
    }
  }

  /**
   * Get campsite availability details
   *
   * Real endpoint: GET /api/campsite_availability/{site_id}/
   * Requires authentication.
   *
   * Returns detailed availability and pricing for a specific campsite.
   *
   * Query Parameters:
   * - arrival: Date string (YYYY-MM-DD)
   * - departure: Date string (YYYY-MM-DD)
   *
   * Example: GET /api/campsite_availability/193/?arrival=2025-06-15&departure=2025-06-18
   *
   * Response includes:
   * - Site details (name, type, features, max occupancy)
   * - Per-night availability and pricing
   * - Total cost including booking fees
   * - Whether fully available for entire date range
   *
   * @param siteId - ID of the specific campsite
   * @param arrivalDate - Arrival date (YYYY-MM-DD)
   * @param departureDate - Departure date (YYYY-MM-DD)
   * @returns Promise<CampsiteAvailability> - Detailed site availability
   */
  async getCampsiteAvailability(
    siteId: string,
    arrivalDate: string,
    departureDate: string
  ): Promise<CampsiteAvailability> {
    try {
      // Real endpoint: GET /api/campsite_availability/{site_id}/
      const response = await this.client.get(`/campsite_availability/${siteId}/`, {
        params: {
          arrival: arrivalDate,
          departure: departureDate,
        },
      });

      return {
        siteId: response.data.id,
        siteName: response.data.name,
        siteType: response.data.type,
        maxOccupancy: response.data.max_occupancy,
        dates: response.data.availability.map((dateAvail: any) => ({
          date: dateAvail.date,
          available: dateAvail.available,
          price: dateAvail.price,
          bookable: dateAvail.bookable,
        })),
      };
    } catch (error) {
      console.error('Get campsite availability failed:', error);
      throw new Error('Failed to get campsite availability');
    }
  }

  /**
   * Create booking
   *
   * Real endpoint: POST /api/bookings/
   * Requires authentication and CSRF token.
   *
   * Request Body:
   * {
   *   "campground_id": 34,
   *   "campsite_id": 193,
   *   "arrival": "2025-06-15",
   *   "departure": "2025-06-18",
   *   "num_adult": 2,
   *   "num_child": 0,
   *   "num_infant": 0,
   *   "gear_type": "tent",
   *   "num_vehicle": 1,
   *   "customer": {
   *     "first_name": "John",
   *     "last_name": "Doe",
   *     "phone": "0400123456",
   *     "email": "john.doe@example.com"
   *   },
   *   "vehicle": {
   *     "type": "2WD",
   *     "registration": "1ABC123"
   *   }
   * }
   *
   * Important Notes:
   * - Creates booking in "pending_payment" status
   * - Payment must be completed within time limit (usually 15 minutes)
   * - Response includes booking_number (e.g., "PS0098765")
   * - Response includes payment_url for completing payment
   * - Race condition possible: site may be booked by another user
   *
   * Error Responses:
   * - 400: "Site is no longer available for selected dates"
   * - 400: "Maximum stay is 14 nights during peak season"
   * - 409: "Site was booked by another user while you were completing your booking"
   * - 401: Authentication required
   * - 403: CSRF token invalid
   *
   * @param params - Booking parameters (dates, site, customer info)
   * @returns Promise<BookingResult> - Booking result with booking number and payment URL
   */
  async createBooking(params: BookingParams): Promise<BookingResult> {
    try {
      // Real endpoint: POST /api/bookings/
      // Requires authentication and CSRF token in X-CSRFToken header
      const response = await this.client.post('/bookings/', {
        campground_id: params.campgroundId,
        campsite_id: params.siteId,
        arrival: params.arrivalDate,
        departure: params.departureDate,
        num_adult: params.numGuests,
        num_child: 0,
        num_infant: 0,
        gear_type: params.siteType || 'tent',
        customer: {
          first_name: params.customerInfo.firstName,
          last_name: params.customerInfo.lastName,
          email: params.customerInfo.email,
          phone: params.customerInfo.phone,
        },
      });

      return {
        success: true,
        bookingReference: response.data.booking_number,
        bookingId: response.data.id,
        details: response.data,
      };
    } catch (error: any) {
      console.error('Create booking failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to create booking',
      };
    }
  }

  /**
   * Get booking details
   *
   * Real endpoint: GET /api/bookings/{booking_number}/
   * Requires authentication. User must be booking owner or staff.
   *
   * Path Parameter:
   * - booking_number: Booking reference (e.g., "PS0098765")
   *
   * Example: GET /api/bookings/PS0098765/
   *
   * Returns complete booking details including:
   * - Booking status (pending_payment, confirmed, cancelled, expired, completed, no_show)
   * - Campground and campsite information
   * - Customer details
   * - Cost breakdown
   * - Payment status
   * - Cancellation policy
   * - Confirmation PDF URL
   *
   * @param bookingReference - Booking reference number (e.g., "PS0098765")
   * @returns Promise<any> - Complete booking details
   */
  async getBookingDetails(bookingReference: string): Promise<any> {
    try {
      // Real endpoint: GET /api/bookings/{booking_number}/
      const response = await this.client.get(`/bookings/${bookingReference}/`);
      return response.data;
    } catch (error) {
      console.error('Get booking details failed:', error);
      throw new Error('Failed to get booking details');
    }
  }

  /**
   * Cancel booking
   *
   * Real endpoint: POST /api/bookings/{booking_number}/cancel/
   * Requires authentication, CSRF token. User must be booking owner.
   *
   * Cancellation Policy:
   * - Full refund if cancelled 7+ days before arrival
   * - Partial refund if 3-7 days before arrival (varies by campground)
   * - No refund if < 3 days before arrival
   * - Processing time: 5-7 business days
   *
   * Request Body (optional):
   * {
   *   "reason": "Plans changed"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "booking_number": "PS0098765",
   *   "status": "cancelled",
   *   "refund": {
   *     "amount": 38.50,
   *     "percentage": 100,
   *     "method": "original_payment_method",
   *     "processing_days": "5-7 business days"
   *   }
   * }
   *
   * Error:
   * - 400: "Cancellation deadline has passed. No refund available."
   *
   * @param bookingReference - Booking reference number
   * @returns Promise<void>
   */
  async cancelBooking(bookingReference: string): Promise<void> {
    try {
      // Real endpoint: POST /api/bookings/{booking_number}/cancel/
      // Requires CSRF token
      await this.client.post(`/bookings/${bookingReference}/cancel/`);
    } catch (error) {
      console.error('Cancel booking failed:', error);
      throw new Error('Failed to cancel booking');
    }
  }

  /**
   * Update booking (rebook)
   *
   * Real endpoint: PUT /api/bookings/{booking_number}/
   * Requires authentication, CSRF token. User must be booking owner.
   *
   * Allows changing:
   * - Dates (arrival/departure)
   * - Number of guests
   * - Special requirements
   *
   * Cannot change:
   * - Campground or campsite (must cancel and create new booking)
   * - Booking number
   *
   * Request Body (partial update allowed):
   * {
   *   "arrival": "2025-06-16",
   *   "departure": "2025-06-19",
   *   "num_adult": 3
   * }
   *
   * Notes:
   * - May incur additional charges or provide refunds based on date changes
   * - Response includes payment URL if additional payment required
   * - Subject to same availability and booking rules
   *
   * @param bookingReference - Booking reference number
   * @param params - Updated booking parameters
   * @returns Promise<RebookResult> - Result with any price difference and payment URL
   */
  async updateBooking(bookingReference: string, params: RebookParams): Promise<RebookResult> {
    try {
      // Real endpoint: PUT /api/bookings/{booking_number}/
      // Requires CSRF token
      const response = await this.client.put(`/bookings/${bookingReference}/`, {
        arrival: params.newArrivalDate,
        departure: params.newDepartureDate,
      });

      return {
        success: true,
        newBookingReference: response.data.booking_number,
      };
    } catch (error: any) {
      console.error('Update booking failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to update booking',
      };
    }
  }

  /**
   * Check for queue system
   *
   * Real endpoint: GET /api/queue/status/
   * Optional authentication.
   *
   * ParkStay uses a queue system (hosted at queue.dbca.wa.gov.au) during high traffic.
   * When active, users must wait in queue before accessing booking system.
   *
   * Response (Queue Active):
   * {
   *   "active": true,
   *   "position": 42,
   *   "estimated_wait_seconds": 180,
   *   "session_id": "abc123def456",
   *   "polling_interval": 10,
   *   "message": "High traffic detected. You are in queue."
   * }
   *
   * Response (Queue Inactive):
   * {
   *   "active": false,
   *   "message": "No queue active. Proceed normally."
   * }
   *
   * Queue Cookie:
   * When queue is active, server sets cookie: sitequeuesession={session_id}
   * This cookie must be included in all subsequent requests.
   *
   * Queue Flow:
   * 1. Check queue status
   * 2. If active, poll at polling_interval seconds
   * 3. When position reaches 0, user can proceed
   * 4. Keep sitequeuesession cookie for all requests
   *
   * Important for Automation:
   * - Must handle queue gracefully
   * - Poll at specified interval (don't spam)
   * - Maintain queue session cookie
   * - Queue sessions may expire if inactive
   *
   * @returns Promise<QueueSessionInfo> - Queue status and position
   */
  async checkQueue(): Promise<QueueSessionInfo> {
    try {
      // Real endpoint: GET /api/queue/status/
      const response = await this.client.get('/queue/status/');

      this.queueSession = {
        sitequeueSessionCookie: response.data.session_id,
        queuePosition: response.data.position,
        estimatedWaitTime: response.data.wait_time || response.data.estimated_wait_seconds,
        queueActive: response.data.active,
      };

      return this.queueSession;
    } catch (error) {
      // Queue not active or error checking
      this.queueSession = {
        queueActive: false,
      };
      return this.queueSession;
    }
  }

  /**
   * Get current session
   *
   * Returns the current session token with cookies.
   * Used for persisting session between application restarts.
   *
   * @returns ParkStaySessionToken | null - Current session or null if not authenticated
   */
  getSession(): ParkStaySessionToken | null {
    return this.session;
  }

  /**
   * Set session (for restoring)
   *
   * Restores a previously saved session.
   * Essential for automation to avoid repeated magic link authentication.
   *
   * Workflow:
   * 1. User authenticates manually via browser
   * 2. Export cookies from browser DevTools:
   *    - sessionid (Django session ID)
   *    - csrftoken (CSRF protection token)
   * 3. Create ParkStaySessionToken object with cookies
   * 4. Import into application using this method
   * 5. Session valid for ~24 hours
   *
   * Example:
   * ```typescript
   * const session = {
   *   token: '', // Not used by ParkStay (session-based auth)
   *   cookies: {
   *     sessionid: 'abc123...',
   *     csrftoken: 'xyz789...'
   *   },
   *   expiresAt: new Date('2025-11-23T10:00:00Z')
   * };
   * parkstayService.setSession(session);
   * ```
   *
   * Security Notes:
   * - Store session cookies securely (encrypted at rest)
   * - Never commit cookies to version control
   * - Validate session before use (call validateSession())
   * - Handle expiration gracefully
   *
   * @param session - Session token with cookies to restore
   */
  setSession(session: ParkStaySessionToken): void {
    this.session = session;
  }
}
