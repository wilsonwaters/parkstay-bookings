// Application-wide constants

export const APP_NAME = 'WA Stay';
/** The tagline: package.json's `description`, which the installer and Linux packages show. */
export const APP_DESCRIPTION = 'Find and book places to stay across Western Australia';
export const APP_REPO_URL = 'https://github.com/wilsonwaters/wa-stay';
export const APP_ISSUES_URL = `${APP_REPO_URL}/issues`;
export const APP_VERSION = '1.0.0';

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

// Watch check intervals (minutes, PQ6). The renderer offers exactly these; the scheduler never
// checks a watch more often than every 15 minutes (a legacy shorter value is run at 15).
export const WATCH_INTERVAL_OPTIONS = [15, 30, 60, 240, 720, 1440] as const;
export const DEFAULT_WATCH_INTERVAL = 60;
export const MIN_WATCH_INTERVAL_MINUTES = 15;

// Site Sniper
export const DEFAULT_SNIPE_POLL_INTERVAL_MS = 1500;
export const MIN_SNIPE_POLL_INTERVAL_MS = 500;
export const MAX_SNIPE_POLL_INTERVAL_MS = 60000;
export const DEFAULT_SNIPE_LEAD_TIME_SECONDS = 120;
export const DEFAULT_SNIPE_WINDOW_MS = 900000; // 15 min
export const CANCELLATION_POLL_MIN_MS = 3000; // politeness floor for continuous cancellation polling
export const NINGALOO_RELEASE_HOUR_AWST = 10; // 10:00 AWST first Tuesday (subject to change per DBCA)

// Limits
export const MAX_GUESTS = 50;

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
export const ERROR_LOG_RETENTION_DAYS = 90;
export const NOTIFICATION_RETENTION_DAYS = 30;
export const MAX_NOTIFICATIONS_PER_USER = 1000;

// Currency
export const DEFAULT_CURRENCY = 'AUD';
