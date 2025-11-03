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
   */
  async login(email: string, password: string): Promise<ParkStaySessionToken> {
    try {
      // ParkStay uses Azure AD B2C for authentication
      // This is a simplified implementation - actual implementation would need
      // to handle the full OAuth2/OIDC flow with Azure AD B2C

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
   */
  async validateSession(): Promise<boolean> {
    if (!this.session) return false;

    if (this.session.expiresAt < new Date()) {
      this.session = null;
      return false;
    }

    try {
      await this.client.get('/auth/validate');
      return true;
    } catch {
      this.session = null;
      return false;
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      this.session = null;
      this.queueSession = null;
    }
  }

  /**
   * Search campgrounds
   */
  async searchCampgrounds(query: string): Promise<CampgroundSearchResult[]> {
    try {
      const response = await this.client.get('/search_suggest/', {
        params: { q: query },
      });

      return response.data.map((item: any) => ({
        id: item.id,
        name: item.name,
        parkId: item.park_id,
        parkName: item.park_name,
        region: item.region,
        description: item.description,
        facilities: item.facilities,
        imageUrl: item.image_url,
      }));
    } catch (error) {
      console.error('Search campgrounds failed:', error);
      throw new Error('Failed to search campgrounds');
    }
  }

  /**
   * Check availability for a campground
   */
  async checkAvailability(
    campgroundId: string,
    params: SearchParams
  ): Promise<AvailabilityCheckResult> {
    try {
      const response = await this.client.get(`/availability/${campgroundId}/`, {
        params: {
          arrival: params.arrivalDate,
          departure: params.departureDate,
          num_adult: params.numGuests,
          num_child: 0,
          gear_type: params.siteType || 'all',
        },
      });

      const sites: CampsiteAvailability[] = response.data.map((site: any) => ({
        siteId: site.id,
        siteName: site.name,
        siteType: site.type,
        maxOccupancy: site.max_occupancy,
        dates: site.availability.map((dateAvail: any) => ({
          date: dateAvail.date,
          available: dateAvail.available,
          price: dateAvail.price,
          bookable: dateAvail.bookable,
        })),
      }));

      const availableSites = sites.filter((site) =>
        site.dates.every((date) => date.available && date.bookable)
      );

      const lowestPrice =
        availableSites.length > 0
          ? Math.min(
              ...availableSites.flatMap((site) => site.dates.map((d) => d.price))
            )
          : undefined;

      return {
        available: availableSites.length > 0,
        sites,
        totalAvailable: availableSites.length,
        lowestPrice,
      };
    } catch (error) {
      console.error('Check availability failed:', error);
      throw new Error('Failed to check availability');
    }
  }

  /**
   * Get campsite availability details
   */
  async getCampsiteAvailability(
    siteId: string,
    arrivalDate: string,
    departureDate: string
  ): Promise<CampsiteAvailability> {
    try {
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
   */
  async createBooking(params: BookingParams): Promise<BookingResult> {
    try {
      const response = await this.client.post('/bookings/', {
        campground_id: params.campgroundId,
        site_id: params.siteId,
        arrival_date: params.arrivalDate,
        departure_date: params.departureDate,
        num_adult: params.numGuests,
        num_child: 0,
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
   */
  async getBookingDetails(bookingReference: string): Promise<any> {
    try {
      const response = await this.client.get(`/bookings/${bookingReference}/`);
      return response.data;
    } catch (error) {
      console.error('Get booking details failed:', error);
      throw new Error('Failed to get booking details');
    }
  }

  /**
   * Cancel booking
   */
  async cancelBooking(bookingReference: string): Promise<void> {
    try {
      await this.client.post(`/bookings/${bookingReference}/cancel/`);
    } catch (error) {
      console.error('Cancel booking failed:', error);
      throw new Error('Failed to cancel booking');
    }
  }

  /**
   * Update booking (rebook)
   */
  async updateBooking(bookingReference: string, params: RebookParams): Promise<RebookResult> {
    try {
      const response = await this.client.put(`/bookings/${bookingReference}/`, {
        arrival_date: params.newArrivalDate,
        departure_date: params.newDepartureDate,
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
   */
  async checkQueue(): Promise<QueueSessionInfo> {
    try {
      const response = await this.client.get('/queue/status/');

      this.queueSession = {
        sitequeueSessionCookie: response.data.session_id,
        queuePosition: response.data.position,
        estimatedWaitTime: response.data.wait_time,
        queueActive: response.data.active,
      };

      return this.queueSession;
    } catch (error) {
      // Queue not active
      this.queueSession = {
        queueActive: false,
      };
      return this.queueSession;
    }
  }

  /**
   * Get current session
   */
  getSession(): ParkStaySessionToken | null {
    return this.session;
  }

  /**
   * Set session (for restoring)
   */
  setSession(session: ParkStaySessionToken): void {
    this.session = session;
  }
}
