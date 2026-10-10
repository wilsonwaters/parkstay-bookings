import { screen, within } from '@testing-library/react';
import { makeHeldSnipe } from '@tests/fixtures/renderer/snipes';
import { catalogGet, makeLocationDetail } from '@tests/fixtures/renderer/watches';
import { ok, PARKSTAY_MANIFEST } from '@tests/utils/renderer/createMockApi';
import { renderWithProviders } from '@tests/utils/renderer/renderWithProviders';
import { SnipesPage } from '../SnipesPage';
import { SnipeCard } from './SnipeCard';

/** Lucky Bay as ParkStay lists it: one unit per site class (`class:<id>`). */
const LUCKY = makeLocationDetail({
  key: 'parkstay:43',
  externalId: '43',
  name: 'Lucky Bay (Cape Le Grand)',
  units: [
    { unitId: 'class:117', unitName: 'Camp site (no power)', unitType: 'Camp site (no power)' },
    { unitId: 'class:118', unitName: 'Powered site', unitType: 'Powered site' },
  ],
});
const BUNGARRA = makeLocationDetail({
  units: [{ unitId: '1', unitName: 'CAMPSITE 01', unitType: 'Other' }],
});
const luckyHold = makeHeldSnipe(20, {
  id: 3,
  name: 'Lucky Bay summer',
  location: { externalId: '43', name: 'Lucky Bay (Cape Le Grand)' },
  locationKey: 'parkstay:43',
  holdUnitId: 'class:117',
});

describe('SnipeCard: a held unit', () => {
  it('names a held class by the place’s own name, never by its id', async () => {
    renderWithProviders(
      <SnipeCard snipe={luckyHold} manifest={PARKSTAY_MANIFEST} today="2099-06-01" />,
      { api: { catalog: { get: catalogGet(LUCKY) } } }
    );
    const card = screen.getByRole('article', { name: 'Lucky Bay summer' });
    expect(
      await within(card).findByText('Camp site (no power) is held for you')
    ).toBeInTheDocument();
    expect(card).not.toHaveTextContent('class:');
  });

  it('says "A site" while the place’s names are unknown, never the raw class id', () => {
    renderWithProviders(
      <SnipeCard snipe={luckyHold} manifest={PARKSTAY_MANIFEST} today="2099-06-01" />,
      { api: { catalog: { get: jest.fn(() => new Promise(() => undefined)) } } }
    );
    const card = screen.getByRole('article', { name: 'Lucky Bay summer' });
    expect(within(card).getByText('A site is held for you')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('class:');
  });

  it('names an ordinary site as the place does, as the detail page does', async () => {
    renderWithProviders(
      <SnipeCard
        snipe={makeHeldSnipe(20, { holdUnitId: '1' })}
        manifest={PARKSTAY_MANIFEST}
        today="2099-06-01"
      />,
      { api: { catalog: { get: catalogGet(BUNGARRA) } } }
    );
    expect(await screen.findByText('CAMPSITE 01 is held for you')).toBeInTheDocument();
  });

  it('gives each held card its own landmark name', async () => {
    const list = jest.fn().mockResolvedValue(ok([luckyHold, makeHeldSnipe(22, { id: 4 })]));
    renderWithProviders(<SnipesPage />, { api: { snipes: { list } } });
    expect(
      await screen.findByRole('region', { name: 'Hold at Lucky Bay (Cape Le Grand)' })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Hold at Osprey Bay' })).toBeInTheDocument();
  });
});
