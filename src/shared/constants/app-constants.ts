// Application-wide constants

export const APP_NAME = 'ParkStay Bookings';
export const APP_VERSION = '1.0.0';

// ParkStay API
export const PARKSTAY_BASE_URL = 'https://parkstay.dbca.wa.gov.au';
export const PARKSTAY_API_BASE_URL = 'https://parkstay.dbca.wa.gov.au/api';

// Booking windows
export const BOOKING_WINDOW_DAYS = 180; // 180-day booking window
export const REBOOK_ADVANCE_DAYS_MIN = 21; // Start checking 21 days before 180-day threshold
export const REBOOK_ADVANCE_DAYS_MAX = 28; // Stop checking 28 days before

// Stay limits
export const MAX_STAY_PEAK_NIGHTS = 14; // Maximum consecutive nights during peak season
export const MAX_STAY_OFF_PEAK_NIGHTS = 28; // Maximum consecutive nights off-peak

// Timezone
export const AWST_TIMEZONE = 'Australia/Perth'; // AWST = UTC+8
export const AWST_UTC_OFFSET = 8;

// Polling intervals (minutes)
export const DEFAULT_WATCH_INTERVAL = 5;
export const MIN_WATCH_INTERVAL = 1;
export const MAX_WATCH_INTERVAL = 60;

// Site Sniper
export const DEFAULT_SNIPE_POLL_INTERVAL_MS = 1500;
export const MIN_SNIPE_POLL_INTERVAL_MS = 500;
export const MAX_SNIPE_POLL_INTERVAL_MS = 60000;
export const DEFAULT_SNIPE_LEAD_TIME_SECONDS = 120;
export const DEFAULT_SNIPE_WINDOW_MS = 900000; // 15 min
export const CANCELLATION_POLL_MIN_MS = 3000; // politeness floor for continuous cancellation polling
export const NINGALOO_RELEASE_HOUR_AWST = 10; // 10:00 AWST first Tuesday (subject to change per DBCA)
export const BOOKING_HOLD_MINUTES = 30; // create_booking temp hold

// Limits
export const MAX_CONCURRENT_WATCHES = 10;
export const MAX_GUESTS = 50;

// Database
export const DB_NAME = 'parkstay.db';

// Retry configuration
export const MAX_RETRIES = 3;
export const INITIAL_RETRY_DELAY_MS = 1000;
export const MAX_RETRY_DELAY_MS = 30000;
export const RETRY_BACKOFF_MULTIPLIER = 2;

// Rate limiting
export const RATE_LIMIT_REQUESTS_PER_MINUTE = 30;
export const RATE_LIMIT_BURST = 10;

// Session
export const SESSION_TIMEOUT_HOURS = 24;

// Cleanup
export const JOB_LOG_RETENTION_DAYS = 30;
export const ERROR_LOG_RETENTION_DAYS = 90;
export const NOTIFICATION_RETENTION_DAYS = 30;
export const MAX_NOTIFICATIONS_PER_USER = 1000;

// Currency
export const DEFAULT_CURRENCY = 'AUD';

// Queue System
export const QUEUE_API_BASE_URL = 'https://queue.dbca.wa.gov.au';
export const QUEUE_GROUP = 'parkstayv2';
export const QUEUE_POLL_INTERVAL_MS = 5000; // 5 seconds (matches official client)
export const QUEUE_SESSION_REFRESH_BUFFER_MS = 120000; // Refresh 2 minutes before expiry
export const QUEUE_MAX_RETRIES = 3;
export const QUEUE_RETRY_DELAY_MS = 2000;
