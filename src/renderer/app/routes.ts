/**
 * Every in-app address, built in one place. Link with `ROUTES.*`, never by joining strings:
 * `ROUTES.placeDetail('parkstay', '123')`. The route table is `AppRoutes.tsx`; the list of routes
 * and their stable names is in docs/design/shell.md.
 */
import { matchPath } from 'react-router-dom';

/** The route patterns (architecture-notes §12.10). */
export const PATTERNS = {
  explore: '/',
  placeDetail: '/places/:providerId/:externalId',
  watches: '/watches',
  watchNew: '/watches/new',
  watchDetail: '/watches/:id',
  watchEdit: '/watches/:id/edit',
  snipes: '/site-sniper',
  snipeNew: '/site-sniper/new',
  snipeDetail: '/site-sniper/:id',
  bookings: '/bookings',
  bookingDetail: '/bookings/:id',
  settings: '/settings/:section?',
  design: '/__design',
} as const;

/** Old create routes, redirected to `/new` with their query string kept. */
export const LEGACY_REDIRECTS = [
  { from: '/watches/create', to: PATTERNS.watchNew },
  { from: '/site-sniper/create', to: PATTERNS.snipeNew },
] as const;

type ParamValue = string | number | null | undefined;
export type PathParams = Record<string, ParamValue>;
export type QueryParams = Record<string, ParamValue>;

/**
 * Fills a pattern's `:params` (each one `encodeURIComponent`-ed, so an id may hold `/`, `?` or
 * spaces) and appends a query string. A missing optional `:param?` is dropped; a missing
 * required one throws. Empty query values are left out.
 */
export function buildPath(pattern: string, params: PathParams = {}, query?: QueryParams): string {
  const segments: string[] = [];
  for (const segment of pattern.split('/')) {
    if (!segment.startsWith(':')) {
      segments.push(segment);
      continue;
    }
    const optional = segment.endsWith('?');
    const name = segment.slice(1, optional ? -1 : undefined);
    const value = params[name];
    if (value === undefined || value === null || value === '') {
      if (optional) continue;
      throw new Error(`buildPath: "${pattern}" needs a value for :${name}`);
    }
    segments.push(encodeURIComponent(String(value)));
  }
  const path = segments.join('/') || '/';

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.append(key, String(value));
  }
  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}

/**
 * The prefill query every create flow accepts (§12.10): `location` is the provider's
 * external id, not the composite location key.
 */
export interface CreatePrefill {
  provider?: string;
  location?: string;
  arrival?: string;
  departure?: string;
  adults?: number;
  children?: number;
}

type Id = string | number;

export const ROUTES = {
  explore: () => buildPath(PATTERNS.explore),
  placeDetail: (providerId: string, externalId: string) =>
    buildPath(PATTERNS.placeDetail, { providerId, externalId }),
  watches: () => buildPath(PATTERNS.watches),
  watchNew: (prefill?: CreatePrefill) => buildPath(PATTERNS.watchNew, {}, { ...prefill }),
  watchDetail: (id: Id) => buildPath(PATTERNS.watchDetail, { id }),
  watchEdit: (id: Id) => buildPath(PATTERNS.watchEdit, { id }),
  snipes: () => buildPath(PATTERNS.snipes),
  snipeNew: (prefill?: CreatePrefill) => buildPath(PATTERNS.snipeNew, {}, { ...prefill }),
  snipeDetail: (id: Id) => buildPath(PATTERNS.snipeDetail, { id }),
  bookings: () => buildPath(PATTERNS.bookings),
  bookingDetail: (id: Id) => buildPath(PATTERNS.bookingDetail, { id }),
  settings: (section?: string) => buildPath(PATTERNS.settings, { section }),
  design: () => buildPath(PATTERNS.design),
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * What each page is called, for the route-change announcement when a page has no `h1` yet.
 * Most specific first.
 */
const PAGE_TITLES: [pattern: string, title: string][] = [
  [PATTERNS.explore, 'Explore'],
  [PATTERNS.placeDetail, 'Place'],
  [PATTERNS.watchNew, 'New watch'],
  [PATTERNS.watchEdit, 'Edit watch'],
  [PATTERNS.watchDetail, 'Watch'],
  [PATTERNS.watches, 'Watches'],
  [PATTERNS.snipeNew, 'New snipe'],
  [PATTERNS.snipeDetail, 'Snipe'],
  [PATTERNS.snipes, 'Site Sniper'],
  [PATTERNS.bookingDetail, 'Booking'],
  [PATTERNS.bookings, 'Bookings'],
  [PATTERNS.settings, 'Settings'],
  [PATTERNS.design, 'Design language'],
];

export function pageTitleFor(pathname: string): string {
  return PAGE_TITLES.find(([pattern]) => matchPath(pattern, pathname))?.[1] ?? 'Page not found';
}
