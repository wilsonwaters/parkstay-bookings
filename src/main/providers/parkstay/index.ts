/**
 * ParkStay WA (DBCA): the manifest and factory.
 *
 * Manifest only for now, so the registry, `providers.list()` and the renderer's provider
 * badges have real data. Every capability is off and `account` is `none`; the modules
 * (catalogue, availability, queue, release policy, holds, sign-in) are added here as they
 * land, without changing the SDK contract.
 */

import { PARKSTAY_BASE_URL } from '@shared/constants';
import type { ProviderManifest } from '@shared/types/provider.types';
import { defineProvider, type ProviderLinks } from '../sdk';

export const PARKSTAY_PROVIDER_ID = 'parkstay';

export const parkstayManifest: ProviderManifest = {
  id: PARKSTAY_PROVIDER_ID,
  name: 'ParkStay WA',
  shortName: 'ParkStay',
  description: "Campgrounds in Western Australia's national parks, booked through DBCA ParkStay.",
  website: PARKSTAY_BASE_URL,
  integration: 'api',
  // Dark eucalypt green; a white monogram on it passes WCAG AA.
  brand: { color: '#2F5D50', monogram: 'PS' },
  locationKinds: [
    'campground',
    'holiday-park',
    'caravan-park',
    'cabin',
    'hut',
    'glamping',
    'farm-stay',
    'other',
  ],
  timezone: 'Australia/Perth',
  capabilities: {
    catalog: false,
    availability: false,
    bulkAvailability: false,
    watches: false,
    snipes: false,
    holds: false,
    bookingImport: false,
    accessGate: false,
    account: 'none',
  },
};

export const parkstayLinks: ProviderLinks = {
  location: (externalId) =>
    `${PARKSTAY_BASE_URL}/search-availability/campground/?site_id=${encodeURIComponent(externalId)}`,
  // The stay-specific deep link comes with the availability module.
  booking: () => null,
};

export const parkstayFactory = defineProvider(PARKSTAY_PROVIDER_ID, () => ({
  manifest: parkstayManifest,
  links: parkstayLinks,
}));
