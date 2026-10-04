/**
 * @jest-environment node
 *
 * The page the browser shows once Gmail sign-in completes says WA Stay (B2).
 */
import { successPage } from '@main/services/gmail/loopback-flow';

describe('Gmail sign-in success page', () => {
  const html = successPage();

  it('is titled "WA Stay – Gmail connected" and sends the user back to WA Stay', () => {
    expect(html).toContain('<title>WA Stay – Gmail connected</title>');
    expect(html).toContain('<h1>Gmail connected</h1>');
    expect(html).toContain('You can close this window and return to WA Stay.');
  });

  it('never names the old app', () => {
    expect(html).not.toMatch(/ParkStay Bookings|WA ParkStay/i);
  });

  it('uses the D1 palette instead of the old green', () => {
    expect(html).not.toMatch(/#4CAF50/i);
    expect(html).toContain('#FAF7F2');
    expect(html).toContain('#15181D');
  });
});
