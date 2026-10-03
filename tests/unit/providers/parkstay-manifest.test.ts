/**
 * The manifest-only ParkStay entry: a valid manifest with every capability off, the
 * campground link, and an AA brand colour for the white monogram.
 */

import { parkstayFactory, parkstayManifest } from '@main/providers/parkstay';
import { ProviderRegistry } from '@main/providers/registry';
import { ProviderManifestSchema } from '@shared/types/provider.types';
import { contrastRatio } from '../../../src/renderer/styles/contrast';
import { createTestProviderContext } from '@tests/utils/fake-provider';

describe('ParkStay provider (manifest only)', () => {
  it('has a valid manifest with the agreed identity', () => {
    expect(ProviderManifestSchema.safeParse(parkstayManifest).success).toBe(true);
    expect(parkstayManifest).toMatchObject({
      id: 'parkstay',
      name: 'ParkStay WA',
      shortName: 'ParkStay',
      website: 'https://parkstay.dbca.wa.gov.au',
      integration: 'api',
      timezone: 'Australia/Perth',
      currency: 'AUD',
      limits: { minWatchIntervalMinutes: 15, maxConcurrentRequests: 4, catalogTtlHours: 24 },
      brand: { monogram: 'PS' },
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
    });
  });

  it('turns every capability off, needs no account, and has a full catalogue mode', () => {
    const { account, catalogMode, ...flags } = parkstayManifest.capabilities;
    expect(account).toBe('none');
    expect(catalogMode).toBe('full');
    expect(Object.values(flags)).toHaveLength(8);
    expect(Object.values(flags).every((on) => on === false)).toBe(true);
  });

  it('uses a brand colour a white monogram passes WCAG AA on', () => {
    expect(contrastRatio(parkstayManifest.brand.color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('registers with only links and links each campground to its search page', () => {
    const registry = new ProviderRegistry();
    const provider = registry.register(parkstayFactory, createTestProviderContext);

    expect(provider.links.location('20')).toBe(
      'https://parkstay.dbca.wa.gov.au/search-availability/campground/?site_id=20'
    );
    expect(provider.links.location('a&b')).toBe(
      'https://parkstay.dbca.wa.gov.au/search-availability/campground/?site_id=a%26b'
    );
    expect(provider.links.booking('20')).toBeNull();
    expect(Object.keys(provider).sort()).toEqual(['links', 'manifest']);
    expect(provider.manifest).toEqual(parkstayManifest);
    expect(Object.isFrozen(provider.manifest.capabilities)).toBe(true);
  });
});
