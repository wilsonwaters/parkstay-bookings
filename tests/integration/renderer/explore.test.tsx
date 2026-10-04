/**
 * The Explore journey through the whole renderer: the shell opens on Explore, a search, a
 * region filter, then a card to its detail page. And Explore with 5,000 places.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { PARKSTAY_LOCATIONS } from '../../fixtures/catalog/parkstay-locations';
import { SYNTHETIC_LOCATIONS_5K } from '../../fixtures/catalog/synthetic-locations';
import { catalogApi } from '../../utils/renderer/catalog';
import { currentRoute, renderWithApp } from '../../utils/renderer/renderWithApp';

describe('Explore journey', () => {
  it('searches, filters by region and opens a place', async () => {
    const { user, mock } = renderWithApp({ route: '/', api: catalogApi() });

    // The shell opens straight on Explore.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Explore places to stay' })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', {
        name: 'Explore',
      })
    ).toHaveAttribute('aria-current', 'page');
    const results = screen.getByRole('region', { name: 'Results' });
    expect(await within(results).findByRole('heading', { name: '169 places' })).toBeInTheDocument();

    // Search.
    await user.type(screen.getByRole('combobox', { name: 'Where' }), 'National Park{Enter}');
    await waitFor(() =>
      expect(mock?.api.catalog.search).toHaveBeenCalledWith({ text: 'National Park', limit: 5000 })
    );
    const matching = PARKSTAY_LOCATIONS.filter((p) => /national park/i.test(p.area?.name ?? ''));
    expect(
      await within(results).findByRole('heading', { name: `${matching.length} places` })
    ).toBeInTheDocument();

    // Region filter.
    await user.click(screen.getByRole('button', { name: /^Region/ }));
    const region = screen.getByRole('dialog', { name: 'Region' });
    const kimberley = matching.filter((p) => p.area?.region === 'Kimberley');
    await user.click(
      within(region).getByRole('checkbox', { name: `Kimberley, ${kimberley.length} places` })
    );
    await user.click(within(region).getByRole('button', { name: 'Done' }));
    expect(
      await within(results).findByRole('heading', { name: `${kimberley.length} places` })
    ).toBeInTheDocument();
    expect(currentRoute()).toBe('/?q=National+Park&regions=Kimberley');

    // Open a card.
    const [first] = kimberley;
    await user.click(within(results).getByRole('link', { name: first.name }));
    expect(currentRoute()).toBe(`/places/parkstay/${first.externalId}`);

    // Back returns to the same search.
    window.history.back();
    expect(
      await screen.findByRole('heading', { name: `${kimberley.length} places` })
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Where' })).toHaveValue('National Park');
  });

  it('keeps only 40 cards on the page with 5,000 places, and still searches as you type', async () => {
    const { user, mock } = renderWithApp({ api: catalogApi({ items: SYNTHETIC_LOCATIONS_5K }) });
    const results = await screen.findByRole('region', { name: 'Results' });
    expect(
      await within(results).findByRole('heading', { name: '5000 places' })
    ).toBeInTheDocument();
    expect(within(results).getAllByRole('link')).toHaveLength(40);

    await user.type(screen.getByRole('combobox', { name: 'Where' }), 'Gorge');
    await waitFor(() =>
      expect(mock?.api.catalog.search).toHaveBeenCalledWith({ text: 'Gorge', limit: 5000 })
    );
    await waitFor(() =>
      expect(within(results).getByRole('heading', { level: 2 })).not.toHaveTextContent('5000')
    );
    expect(within(results).getAllByRole('link').length).toBeLessThanOrEqual(40);
  });
});
