/**
 * Mock API Responses
 * Provides mock data for ParkStay API and Gmail API
 */

import { AxiosResponse } from 'axios';

/**
 * Mock ParkStay API responses
 */
export class MockParkStayAPI {
  /**
   * Mock availability check response
   */
  static mockAvailabilityResponse(campgroundId: string, hasAvailability: boolean = true): any {
    if (!hasAvailability) {
      return {
        data: {
          campground: {
            id: campgroundId,
            name: 'Test Campground',
            park: 'Test Park',
          },
          sites: [],
        },
      };
    }

    return {
      data: {
        campground: {
          id: campgroundId,
          name: 'Test Campground',
          park: 'Test Park',
        },
        sites: [
          {
            siteId: 'SITE001',
            siteName: 'Site 1',
            siteType: 'Unpowered',
            dates: [
              {
                date: '2024-06-01',
                available: true,
                bookable: true,
                price: 35.0,
              },
              {
                date: '2024-06-02',
                available: true,
                bookable: true,
                price: 35.0,
              },
            ],
          },
          {
            siteId: 'SITE002',
            siteName: 'Site 2',
            siteType: 'Powered',
            dates: [
              {
                date: '2024-06-01',
                available: true,
                bookable: true,
                price: 45.0,
              },
              {
                date: '2024-06-02',
                available: true,
                bookable: true,
                price: 45.0,
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * Mock booking details response
   */
  static mockBookingDetailsResponse(bookingReference: string, status: string = 'confirmed'): any {
    return {
      data: {
        bookingReference,
        status,
        park: 'Test Park',
        campground: 'Test Campground',
        siteNumber: '1',
        siteType: 'Unpowered',
        arrivalDate: '2024-06-01',
        departureDate: '2024-06-03',
        numNights: 2,
        numGuests: 2,
        totalCost: 70.0,
        currency: 'AUD',
      },
    };
  }

  /**
   * Mock update booking response
   */
  static mockUpdateBookingResponse(success: boolean = true, newBookingReference?: string): any {
    if (success && newBookingReference) {
      return {
        data: {
          success: true,
          newBookingReference,
          message: 'Booking updated successfully',
        },
      };
    }

    return {
      data: {
        success: false,
        error: 'Unable to update booking',
      },
    };
  }

  /**
   * Mock login response
   */
  static mockLoginResponse(success: boolean = true): any {
    if (success) {
      return {
        data: {
          success: true,
          sessionId: 'test-session-123',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      };
    }

    return {
      data: {
        success: false,
        error: 'Invalid credentials',
      },
    };
  }
}

/**
 * Mock Gmail API responses
 */
export class MockGmailAPI {
  /**
   * Mock Gmail message list response
   */
  static mockMessageListResponse(hasMessages: boolean = true): any {
    if (!hasMessages) {
      return {
        data: {
          messages: [],
          resultSizeEstimate: 0,
        },
      };
    }

    return {
      data: {
        messages: [
          {
            id: 'msg-12345',
            threadId: 'thread-12345',
          },
        ],
        resultSizeEstimate: 1,
      },
    };
  }

  /**
   * Mock Gmail message details response
   */
  static mockMessageDetailsResponse(otpCode?: string, magicLink?: string): any {
    let body = 'Your verification details:\n\n';

    if (otpCode) {
      body += `Your verification code is: ${otpCode}\n\n`;
    }

    if (magicLink) {
      body += `Or click this link to verify: ${magicLink}\n\n`;
    }

    body += 'Thank you for using ParkStay.';

    const encodedBody = Buffer.from(body).toString('base64');

    return {
      data: {
        id: 'msg-12345',
        threadId: 'thread-12345',
        labelIds: ['UNREAD', 'INBOX'],
        snippet: body.substring(0, 100),
        payload: {
          headers: [
            { name: 'From', value: 'noreply@parkstay.wa.gov.au' },
            { name: 'Subject', value: 'ParkStay Verification Code' },
            { name: 'Date', value: new Date().toUTCString() },
          ],
          body: {
            size: body.length,
            data: encodedBody,
          },
        },
      },
    };
  }

  /**
   * Mock OAuth2 token response
   */
  static mockOAuth2TokenResponse(): any {
    return {
      data: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
      },
    };
  }
}

/**
 * Axios mock helpers
 */
export class MockAxios {
  /**
   * Create mock axios response
   */
  static createMockResponse<T>(data: T, status: number = 200): AxiosResponse<T> {
    return {
      data,
      status,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    };
  }

  /**
   * Create mock axios error
   */
  static createMockError(message: string, status: number = 500): any {
    const error: any = new Error(message);
    error.response = {
      data: { error: message },
      status,
      statusText: 'Error',
      headers: {},
      config: {} as any,
    };
    error.isAxiosError = true;
    return error;
  }
}
