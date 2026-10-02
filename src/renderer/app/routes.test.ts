import { buildPath, LEGACY_REDIRECTS, pageTitleFor, PATTERNS, ROUTES } from './routes';

describe('buildPath', () => {
  it('encodes each param, so an external id may hold slashes, spaces and query characters', () => {
    expect(
      buildPath(PATTERNS.placeDetail, { providerId: 'parkstay', externalId: 'a/b c?d#e' })
    ).toBe('/places/parkstay/a%2Fb%20c%3Fd%23e');
  });

  it('drops a missing optional param and throws for a missing required one', () => {
    expect(buildPath(PATTERNS.settings)).toBe('/settings');
    expect(buildPath(PATTERNS.settings, { section: 'notifications' })).toBe(
      '/settings/notifications'
    );
    expect(() => buildPath(PATTERNS.watchDetail)).toThrow(':id');
  });

  it('appends a query string, leaving out empty values', () => {
    expect(
      buildPath(PATTERNS.watchNew, {}, { provider: 'parkstay', location: '12', adults: 2, x: '' })
    ).toBe('/watches/new?provider=parkstay&location=12&adults=2');
    expect(buildPath(PATTERNS.explore, {}, { q: undefined })).toBe('/');
  });
});

describe('ROUTES', () => {
  it('has exactly the keys later tasks rely on', () => {
    expect(Object.keys(ROUTES).sort()).toEqual(
      [
        'explore',
        'placeDetail',
        'watches',
        'watchNew',
        'watchDetail',
        'watchEdit',
        'snipes',
        'snipeNew',
        'snipeDetail',
        'bookings',
        'bookingDetail',
        'settings',
        'design',
      ].sort()
    );
  });

  it('builds the addresses of architecture-notes §12.10', () => {
    expect(ROUTES.explore()).toBe('/');
    expect(ROUTES.placeDetail('parkstay', '12 3')).toBe('/places/parkstay/12%203');
    expect(ROUTES.watches()).toBe('/watches');
    expect(ROUTES.watchNew()).toBe('/watches/new');
    expect(
      ROUTES.watchNew({ provider: 'parkstay', location: '7', arrival: '2026-12-01', adults: 2 })
    ).toBe('/watches/new?provider=parkstay&location=7&arrival=2026-12-01&adults=2');
    expect(ROUTES.watchDetail(12)).toBe('/watches/12');
    expect(ROUTES.watchEdit(12)).toBe('/watches/12/edit');
    expect(ROUTES.snipes()).toBe('/site-sniper');
    expect(ROUTES.snipeNew({ location: '9' })).toBe('/site-sniper/new?location=9');
    expect(ROUTES.snipeDetail(4)).toBe('/site-sniper/4');
    expect(ROUTES.bookings()).toBe('/bookings');
    expect(ROUTES.bookingDetail(3)).toBe('/bookings/3');
    expect(ROUTES.settings()).toBe('/settings');
    expect(ROUTES.settings('notifications')).toBe('/settings/notifications');
    expect(ROUTES.design()).toBe('/__design');
  });

  it('redirects the old create routes to /new', () => {
    expect(LEGACY_REDIRECTS).toEqual([
      { from: '/watches/create', to: '/watches/new' },
      { from: '/site-sniper/create', to: '/site-sniper/new' },
    ]);
  });
});

describe('pageTitleFor', () => {
  it.each([
    ['/', 'Explore'],
    ['/watches', 'Watches'],
    ['/watches/new', 'New watch'],
    ['/watches/12', 'Watch'],
    ['/watches/12/edit', 'Edit watch'],
    ['/site-sniper', 'Site Sniper'],
    ['/bookings/3', 'Booking'],
    ['/settings/notifications', 'Settings'],
    ['/nowhere', 'Page not found'],
  ])('%s is "%s"', (pathname, title) => {
    expect(pageTitleFor(pathname)).toBe(title);
  });
});
