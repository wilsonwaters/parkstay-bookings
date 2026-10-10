/**
 * The in-app addresses a notification may open (U5; architecture-notes §12.6). Main checks a
 * path against them before it sends `app:navigate`, and the renderer checks again before it
 * follows one, so a stored `actionUrl` can never take the app to another site or to an
 * arbitrary route. Pure, with no imports: both processes use it.
 */

/** A row id: a positive integer, as SQLite hands them out. */
const ID = String.raw`[1-9]\d{0,15}`;

const APP_LINK_PATTERNS: readonly RegExp[] = [
  new RegExp(`^/watches/${ID}$`),
  new RegExp(`^/site-sniper/${ID}$`),
  new RegExp(`^/bookings/${ID}$`),
  /^\/settings\/[a-z][a-z-]{0,31}$/,
];

/**
 * True for `/watches/:id`, `/site-sniper/:id`, `/bookings/:id` and `/settings/:section`
 * exactly: no query, no hash, no scheme or host.
 */
export function isAppLinkPath(path: unknown): path is string {
  return typeof path === 'string' && APP_LINK_PATTERNS.some((pattern) => pattern.test(path));
}
