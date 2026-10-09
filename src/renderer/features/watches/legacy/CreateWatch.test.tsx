/**
 * E2's bridge into the legacy Create Watch page (U1 replaces it): the §12.10 prefill query
 * fills the form with the campground, the dates and the guests.
 */
import { screen } from '@testing-library/react';
import { placeApi } from '@tests/utils/renderer/catalog';
import { renderWithApp } from '@tests/utils/renderer/renderWithApp';

const PREFILL =
  '?provider=parkstay&location=20&arrival=2026-11-06&departure=2026-11-08&adults=2&children=1';

describe('Create Watch (legacy) with a prefill', () => {
  it('fills the campground, the dates and the guests (adults and children)', async () => {
    const { mock } = renderWithApp({ route: `/watches/new${PREFILL}`, api: placeApi() });
    expect(await screen.findByText('Bungarra')).toBeInTheDocument();
    expect(mock?.api.catalog.get).toHaveBeenCalledWith('parkstay:20');
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Check-in Date/)).toHaveValue('2026-11-06');
    expect(screen.getByLabelText(/Check-out Date/)).toHaveValue('2026-11-08');
    expect(screen.getByLabelText(/Number of Guests/)).toHaveValue(3);
  });

  it('ignores a prefill for another provider', async () => {
    const { mock } = renderWithApp({
      route: '/watches/new?provider=airbnb&location=20&arrival=2026-11-06&departure=2026-11-08',
      api: placeApi(),
    });
    expect(await screen.findByRole('heading', { name: 'Create Watch' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Select Campground/)).toHaveValue('');
    expect(screen.getByLabelText(/Check-in Date/)).not.toHaveValue('2026-11-06');
    expect(mock?.api.catalog.get).not.toHaveBeenCalled();
  });

  it('keeps the dates and guests when the campground cannot be found', async () => {
    renderWithApp({
      route: `/watches/new${PREFILL.replace('location=20', 'location=9999')}`,
      api: placeApi(),
    });
    expect(await screen.findByLabelText(/Select Campground/)).toHaveValue('');
    expect(screen.getByLabelText(/Check-in Date/)).toHaveValue('2026-11-06');
    expect(screen.getByLabelText(/Number of Guests/)).toHaveValue(3);
  });
});
