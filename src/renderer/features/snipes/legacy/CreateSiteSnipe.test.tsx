/**
 * E2's bridge into the legacy Create Site Snipe page (U2 replaces it): the §12.10 prefill
 * query fills the form with the campground, the dates, adults and children.
 */
import { screen } from '@testing-library/react';
import { placeApi } from '@tests/utils/renderer/catalog';
import { renderWithApp } from '@tests/utils/renderer/renderWithApp';

describe('Create Site Snipe (legacy) with a prefill', () => {
  it('fills the campground, the dates, adults and children', async () => {
    renderWithApp({
      route:
        '/site-sniper/new?provider=parkstay&location=20&arrival=2026-11-06&departure=2026-11-08&adults=2&children=1',
      api: placeApi(),
    });
    expect(await screen.findByText('Bungarra')).toBeInTheDocument();
    expect(screen.getByLabelText(/Arrival/)).toHaveValue('2026-11-06');
    expect(screen.getByLabelText(/Departure/)).toHaveValue('2026-11-08');
    expect(screen.getByLabelText(/^Adults/)).toHaveValue(2);
    expect(screen.getByLabelText(/^Children/)).toHaveValue(1);
  });
});
