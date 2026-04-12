/**
 * Live Queue API Integration Test
 *
 * Hits the real DBCA queue system at queue.dbca.wa.gov.au
 * to verify the API behaves as expected when the queue is active.
 *
 * Run with: npx ts-node -P tsconfig.json tests/manual/test-queue-live.ts
 */

import axios, { AxiosInstance } from 'axios';

const QUEUE_API_BASE_URL = 'https://queue.dbca.wa.gov.au';
const QUEUE_GROUP = 'parkstayv2';
const POLL_INTERVAL_MS = 5000;

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function getHeaders(): Record<string, string> {
  return {
    'User-Agent': CHROME_USER_AGENT,
    'Accept-Language': 'en-AU,en;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://parkstay.dbca.wa.gov.au',
    Referer: 'https://parkstay.dbca.wa.gov.au/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };
}

function generateSessionKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 52; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function formatElapsed(startMs: number): string {
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  return `${elapsed}s`;
}

interface QueueAPIResponse {
  status: 'Active' | 'Waiting';
  session_key: string;
  queue_position: number;
  wait_time: number;
  expiry_seconds: number;
  time_left_enabled?: boolean;
  show_queue_position?: boolean;
  browser_inactivity_timeout?: number;
  browser_inactivity_redirect?: string;
  browser_inactivity_enabled?: boolean;
  waiting_queue_enabled?: boolean;
  custom_message?: string;
  queue_name?: string;
  more_info_link?: string;
  max_queue_session_limit?: string;
  max_queue_url_redirect?: string;
  queue_waiting_room_url?: string;
  queue_inactivity_url?: string;
  url?: string;
  refresh_page?: boolean;
}

async function main() {
  console.log('=== DBCA ParkStay Queue API Live Test ===\n');
  console.log(`Queue API: ${QUEUE_API_BASE_URL}`);
  console.log(`Queue group: ${QUEUE_GROUP}`);
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms\n`);

  const client: AxiosInstance = axios.create({
    baseURL: QUEUE_API_BASE_URL,
    timeout: 30000,
    headers: getHeaders(),
  });

  const sessionKey = generateSessionKey();
  console.log(`Generated session key: ${sessionKey}`);
  console.log(`Session key length: ${sessionKey.length}\n`);

  // --- Test 1: Initial session check ---
  console.log('--- Test 1: Initial check-create-session ---');
  const startTime = Date.now();

  let response: QueueAPIResponse;
  try {
    const res = await client.get<QueueAPIResponse>('/api/check-create-session/', {
      params: {
        session_key: sessionKey,
        queue_group: QUEUE_GROUP,
      },
    });
    response = res.data;

    console.log(`[${formatElapsed(startTime)}] Response received`);
    console.log(`  Status:         ${response.status}`);
    console.log(`  Session key:    ${response.session_key}`);
    console.log(`  Queue position: ${response.queue_position}`);
    console.log(`  Wait time:      ${response.wait_time}s`);
    console.log(`  Expiry:         ${response.expiry_seconds}s`);
    console.log(`  Full response:  ${JSON.stringify(response, null, 2)}`);
    console.log();
  } catch (error: any) {
    console.error(`[${formatElapsed(startTime)}] ERROR on initial request:`);
    console.error(`  Message: ${error.message}`);
    if (error.response) {
      console.error(`  HTTP Status: ${error.response.status}`);
      console.error(`  Response data: ${JSON.stringify(error.response.data)}`);
      console.error(`  Response headers: ${JSON.stringify(error.response.headers)}`);
    }
    process.exit(1);
  }

  // --- Test 2: Session key returned matches or is new ---
  console.log('--- Test 2: Session key validation ---');
  if (response.session_key === sessionKey) {
    console.log('  PASS: Server returned the same session key we sent');
  } else {
    console.log(`  INFO: Server returned a different session key`);
    console.log(`    Sent:     ${sessionKey}`);
    console.log(`    Received: ${response.session_key}`);
  }
  console.log();

  // --- Test 3: If Waiting, poll until Active ---
  if (response.status === 'Waiting') {
    console.log('--- Test 3: Queue is ACTIVE - polling until session becomes Active ---');
    console.log(`  Starting position: ${response.queue_position}`);
    console.log(`  Estimated wait:    ${response.wait_time}s`);
    console.log();

    let pollCount = 0;
    let lastPosition = response.queue_position;
    const pollStart = Date.now();
    const activeSessionKey = response.session_key;

    while (true) {
      await sleep(POLL_INTERVAL_MS);
      pollCount++;

      try {
        const pollRes = await client.get<QueueAPIResponse>('/api/check-create-session/', {
          params: {
            session_key: activeSessionKey,
            queue_group: QUEUE_GROUP,
          },
        });
        const data = pollRes.data;

        const positionDelta = lastPosition - data.queue_position;
        console.log(
          `  [Poll #${pollCount} | ${formatElapsed(pollStart)}] ` +
            `status=${data.status} position=${data.queue_position} ` +
            `(moved ${positionDelta >= 0 ? '+' : ''}${positionDelta}) ` +
            `wait=${data.wait_time}s expiry=${data.expiry_seconds}s`
        );

        lastPosition = data.queue_position;

        if (data.status === 'Active') {
          const totalWait = ((Date.now() - pollStart) / 1000).toFixed(1);
          console.log();
          console.log(`  PASS: Session became Active after ${totalWait}s (${pollCount} polls)`);
          console.log(`  Session key:  ${data.session_key}`);
          console.log(`  Expiry:       ${data.expiry_seconds}s`);

          // --- Test 4: Verify session stays active on re-check ---
          console.log();
          console.log('--- Test 4: Re-check active session ---');
          await sleep(2000);
          const recheckRes = await client.get<QueueAPIResponse>('/api/check-create-session/', {
            params: {
              session_key: data.session_key,
              queue_group: QUEUE_GROUP,
            },
          });
          console.log(`  Status:  ${recheckRes.data.status}`);
          console.log(`  Expiry:  ${recheckRes.data.expiry_seconds}s`);
          if (recheckRes.data.status === 'Active') {
            console.log('  PASS: Session still active on re-check');
          } else {
            console.log('  WARN: Session is no longer active on re-check');
          }

          // --- Test 5: Test ParkStay API with queue session cookie ---
          console.log();
          console.log('--- Test 5: ParkStay API request with queue session cookie ---');
          try {
            const parkstayRes = await axios.get(
              'https://parkstay.dbca.wa.gov.au/api/search_suggest',
              {
                headers: {
                  ...getHeaders(),
                  Origin: undefined as any,
                  'Sec-Fetch-Site': 'same-origin',
                  Cookie: `sitequeuesession=${data.session_key}`,
                },
                timeout: 30000,
              }
            );
            console.log(`  HTTP Status: ${parkstayRes.status}`);
            const featureCount = parkstayRes.data?.features?.length ?? 'N/A';
            console.log(`  Campgrounds returned: ${featureCount}`);
            console.log('  PASS: ParkStay API responded with queue session cookie');
          } catch (err: any) {
            console.error(`  FAIL: ParkStay API request failed: ${err.message}`);
            if (err.response) {
              console.error(`  HTTP Status: ${err.response.status}`);
              console.error(`  Data: ${JSON.stringify(err.response.data).substring(0, 500)}`);
            }
          }

          break;
        }

        // Safety: bail after 5 minutes of polling
        if (Date.now() - pollStart > 5 * 60 * 1000) {
          console.log();
          console.log('  TIMEOUT: Still waiting after 5 minutes, stopping.');
          break;
        }
      } catch (pollError: any) {
        console.error(`  [Poll #${pollCount}] ERROR: ${pollError.message}`);
      }
    }
  } else {
    console.log('--- Test 3: Queue is NOT active (session immediately Active) ---');
    console.log('  The queue system granted immediate access.');
    console.log('  Cannot test queue waiting behavior — queue may not be active right now.');
    console.log();

    // Still test ParkStay API
    console.log('--- Test 4: ParkStay API request with queue session cookie ---');
    try {
      const parkstayRes = await axios.get('https://parkstay.dbca.wa.gov.au/api/search_suggest', {
        headers: {
          ...getHeaders(),
          Origin: undefined as any,
          'Sec-Fetch-Site': 'same-origin',
          Cookie: `sitequeuesession=${response.session_key}`,
        },
        timeout: 30000,
      });
      console.log(`  HTTP Status: ${parkstayRes.status}`);
      const featureCount = parkstayRes.data?.features?.length ?? 'N/A';
      console.log(`  Campgrounds returned: ${featureCount}`);
      console.log('  PASS: ParkStay API responded with queue session cookie');
    } catch (err: any) {
      console.error(`  FAIL: ParkStay API request failed: ${err.message}`);
      if (err.response) {
        console.error(`  HTTP Status: ${err.response.status}`);
      }
    }
  }

  // --- Test: Second session gets queued independently ---
  console.log();
  console.log('--- Test: New session key gets its own queue position ---');
  const secondKey = generateSessionKey();
  try {
    const res2 = await client.get<QueueAPIResponse>('/api/check-create-session/', {
      params: {
        session_key: secondKey,
        queue_group: QUEUE_GROUP,
      },
    });
    console.log(`  Status:   ${res2.data.status}`);
    console.log(`  Position: ${res2.data.queue_position}`);
    console.log(`  Wait:     ${res2.data.wait_time}s`);
    console.log('  PASS: Second session created successfully');
  } catch (err: any) {
    console.error(`  FAIL: ${err.message}`);
  }

  console.log();
  console.log('=== Test complete ===');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
