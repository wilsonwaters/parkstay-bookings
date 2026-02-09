/**
 * Browser header configuration for HTTP requests.
 *
 * Provides headers matching a real Chrome browser session.
 * Based on Chrome 131 on Windows 10/11.
 */

import { PARKSTAY_BASE_URL } from '@shared/constants';

const CHROME_VERSION = '131';
const CHROME_FULL_VERSION = '131.0.0.0';

export const CHROME_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`;

/**
 * Headers Chrome sends on every request
 */
const BROWSER_COMMON_HEADERS: Record<string, string> = {
  'User-Agent': CHROME_USER_AGENT,
  'Accept-Language': 'en-AU,en;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'sec-ch-ua': `"Google Chrome";v="${CHROME_VERSION}", "Chromium";v="${CHROME_VERSION}", "Not_A Brand";v="24"`,
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

/**
 * Headers for XHR/fetch requests to the ParkStay API (same-origin context).
 * Origin is added per-request for POST/PUT/PATCH/DELETE via the axios
 * request interceptor, matching real Chrome behaviour.
 */
export function getParkstayApiHeaders(): Record<string, string> {
  return {
    ...BROWSER_COMMON_HEADERS,
    Accept: 'application/json, text/plain, */*',
    Referer: `${PARKSTAY_BASE_URL}/`,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

/**
 * Headers for XHR/fetch requests to the Queue API (cross-site from parkstay).
 * Cross-origin requests always include Origin.
 */
export function getQueueApiHeaders(): Record<string, string> {
  return {
    ...BROWSER_COMMON_HEADERS,
    Accept: 'application/json, text/plain, */*',
    Origin: PARKSTAY_BASE_URL,
    Referer: `${PARKSTAY_BASE_URL}/`,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };
}
