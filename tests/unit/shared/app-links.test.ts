/**
 * The in-app paths a notification may open (U5): main checks them before `app:navigate`, the
 * renderer before it follows a notification's link.
 */
import { isAppLinkPath } from '@shared/utils/app-links';

describe('isAppLinkPath', () => {
  it.each(['/watches/12', '/site-sniper/7', '/bookings/3', '/settings/notifications'])(
    'allows %s (v1 links stay valid)',
    (path) => {
      expect(isAppLinkPath(path)).toBe(true);
    }
  );

  it.each([
    'https://evil.example',
    '//evil.example/watches/12',
    'javascript:alert(1)',
    'file:///etc/passwd',
    '#/watches/12',
    'watches/12',
    '/watches/12?next=https://evil.example',
    '/watches/12#x',
    '/watches/12/edit',
    '/watches/0',
    '/watches/-1',
    '/watches/abc',
    '/watches/',
    '/watches',
    '/settings',
    '/settings/Accounts',
    '/settings/../watches/1',
    '/places/parkstay/12',
    '/',
    '',
  ])('refuses %s', (path) => {
    expect(isAppLinkPath(path)).toBe(false);
  });

  it('refuses anything that is not a string', () => {
    expect(isAppLinkPath(undefined)).toBe(false);
    expect(isAppLinkPath(null)).toBe(false);
    expect(isAppLinkPath(12)).toBe(false);
    expect(isAppLinkPath({ toString: () => '/watches/12' })).toBe(false);
  });
});
