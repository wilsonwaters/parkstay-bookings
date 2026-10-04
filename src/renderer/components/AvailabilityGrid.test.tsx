/**
 * The legacy watch grid with real nightly prices: each site's total is its nightly price for
 * every night shown, and "From" is the lowest nightly price.
 */

import { render, screen, within } from '@testing-library/react';
import AvailabilityGrid from './AvailabilityGrid';

describe('AvailabilityGrid', () => {
  it('totals the nights of each site and shows the lowest nightly price', () => {
    render(
      <AvailabilityGrid
        arrivalDate="2026-11-03"
        departureDate="2026-11-05"
        watchResults={[
          {
            siteId: '2',
            siteName: 'CAMPSITE 02',
            siteType: 'all',
            available: true,
            price: 30,
            dates: { arrival: '2026-11-03', departure: '2026-11-05' },
          },
          {
            siteId: '4',
            siteName: 'CAMPSITE 04',
            siteType: 'all',
            available: true,
            price: 35,
            dates: { arrival: '2026-11-03', departure: '2026-11-04' },
            partial: true,
          },
        ]}
      />
    );

    expect(screen.getByText('$30.00/night')).toBeTruthy();
    const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
    expect(within(row('CAMPSITE 02')).getByText('$60.00')).toBeTruthy();
    // A partial match is priced for its own nights only.
    expect(within(row('CAMPSITE 04')).getByText('$35.00')).toBeTruthy();
  });
});
