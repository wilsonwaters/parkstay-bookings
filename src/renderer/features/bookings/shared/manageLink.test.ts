import { PARKSTAY_MANIFEST } from '@tests/utils/renderer/manifests';
import { manageLinkFor } from './manageLink';

describe('manageLinkFor', () => {
  it("prefers the booking's own manage URL", () => {
    expect(
      manageLinkFor({ manageUrl: 'https://parkstay.dbca.wa.gov.au/mybookings/' }, PARKSTAY_MANIFEST)
    ).toEqual({
      href: 'https://parkstay.dbca.wa.gov.au/mybookings/',
      label: 'Manage on ParkStay',
    });
  });

  it("falls back to the provider's website", () => {
    expect(manageLinkFor({}, PARKSTAY_MANIFEST)).toEqual({
      href: 'https://parkstay.dbca.wa.gov.au',
      label: 'Manage on ParkStay',
    });
  });

  it('offers nothing without either, or for a provider that is not installed', () => {
    expect(manageLinkFor({}, { ...PARKSTAY_MANIFEST, website: '' })).toBeNull();
    expect(manageLinkFor({ manageUrl: 'https://example.com/b' }, undefined)).toBeNull();
  });

  it('never offers an address that is not a web page', () => {
    expect(
      manageLinkFor({ manageUrl: 'javascript:alert(1)' }, { ...PARKSTAY_MANIFEST, website: '' })
    ).toBeNull();
    expect(manageLinkFor({ manageUrl: 'file:///C:/x' }, PARKSTAY_MANIFEST)?.href).toBe(
      'https://parkstay.dbca.wa.gov.au'
    );
  });
});
