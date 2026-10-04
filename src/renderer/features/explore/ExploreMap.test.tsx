/**
 * Explore with the map: a FakeMapController stands in for Mapbox (no WebGL under Jest), so
 * these tests drive the map's side (pins hovered and clicked, the map moved) and check the
 * list, the URL and what Explore asks of the map.
 */
import { act, configure, screen, waitFor, within } from '@testing-library/react';
import { PARKSTAY_LOCATIONS } from '../../../../tests/fixtures/catalog/parkstay-locations';
import { catalogApi, placeNamed } from '../../../../tests/utils/renderer/catalog';
import {
  installFakeMap,
  KIMBERLEY_BBOX,
  type FakeMaps,
} from '../../../../tests/utils/renderer/fakeMapController';
import { currentRoute, renderWithApp } from '../../../../tests/utils/renderer/renderWithApp';
import { boundsOf } from './map/geo';
import { createMapboxController } from './map/mapboxController';

// These render the whole app with 169 places: give async queries room on a busy CI runner.
configure({ asyncUtilTimeout: 4000 });

jest.mock('./map/mapSupport', () => ({
  detectMapSupport: () => ({ available: true, token: 'pk.test-token' }),
}));
jest.mock('./map/mapboxController', () => ({ createMapboxController: jest.fn() }));

let maps: FakeMaps;
let scrollIntoView: jest.Mock;

/** Pretends the window is `width` px wide for `min-width` media queries. */
function setWindowWidth(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
      return {
        matches: width >= min,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
    },
  });
}

beforeEach(() => {
  maps = installFakeMap(jest.mocked(createMapboxController));
  scrollIntoView = jest.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  setWindowWidth(1440);
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const results = () => screen.getByRole('region', { name: 'Results' });
const resultsHeading = () => within(results()).getByRole('heading', { level: 2 });
const mapRegion = () => screen.getByRole('region', { name: 'Map of places' });

async function renderMap(route = '/') {
  const view = renderWithApp({ route, api: catalogApi() });
  await screen.findByRole('heading', { level: 2, name: '169 places in map area' });
  return view;
}

describe('Explore map', () => {
  it('draws every result on one map of WA, beside the list', async () => {
    await renderMap();
    expect(mapRegion()).toBeInTheDocument();
    expect(createMapboxController).toHaveBeenCalledTimes(1);
    expect(maps.current.options).toMatchObject({ token: 'pk.test-token', camera: null });
    expect(maps.current.data).toHaveLength(169);
    expect(screen.getByRole('switch', { name: 'Search as I move the map' })).toBeChecked();
    expect(screen.queryByText(/The map isn't available in this build/)).not.toBeInTheDocument();
  });

  it('starts at the camera in the URL and writes the camera back after the map stops', async () => {
    await renderMap('/?map=115.5,-33.5,8');
    expect(maps.current.options.camera).toEqual({ lng: 115.5, lat: -33.5, zoom: 8 });
    maps.current.emitMove(KIMBERLEY_BBOX);
    await waitFor(() => expect(currentRoute()).toBe('/?map=125.25,-16.75,6'), { timeout: 2000 });
  });

  it('replaces the map data only when the set of results changes', async () => {
    const { user } = await renderMap();
    const calls = maps.current.setDataCalls;
    await user.click(screen.getByRole('button', { name: 'Book online' }));
    await screen.findByRole('heading', { level: 2, name: /^106 places/ });
    expect(maps.current.setDataCalls).toBe(calls + 1);
    expect(maps.current.data).toHaveLength(106);
    // Moving the map narrows the list, not the map's data.
    maps.current.emitMove(KIMBERLEY_BBOX);
    expect(maps.current.setDataCalls).toBe(calls + 1);
  });

  describe('hover', () => {
    it('highlights the pin of a hovered or focused card', async () => {
      const { user } = await renderMap();
      const bungarra = placeNamed('Bungarra');
      const card = screen.getByRole('link', { name: 'Bungarra' });
      await user.hover(card);
      expect(maps.current.hovered).toBe(bungarra.key);
      await user.unhover(card);
      expect(maps.current.hovered).toBeNull();
      act(() => card.focus());
      expect(maps.current.hovered).toBe(bungarra.key);
    });

    it('highlights the card of a hovered pin, without scrolling to it', async () => {
      await renderMap();
      const bungarra = placeNamed('Bungarra');
      maps.current.emitHover(bungarra.key);
      expect(screen.getByRole('link', { name: 'Bungarra' })).toHaveAttribute(
        'data-highlighted',
        'true'
      );
      expect(scrollIntoView).not.toHaveBeenCalled();
      maps.current.emitHover(null);
      expect(screen.getByRole('link', { name: 'Bungarra' })).not.toHaveAttribute(
        'data-highlighted'
      );
    });
  });

  describe('selecting a pin', () => {
    it('selects its card, scrolls to it, and opens a preview that leads to the detail page', async () => {
      const { user } = await renderMap();
      const bungarra = placeNamed('Bungarra');
      maps.current.emitClick({ type: 'location', key: bungarra.key });

      await waitFor(() => expect(currentRoute()).toBe('/?sel=parkstay%3A20'));
      const card = screen.getByRole('link', { name: 'Bungarra' });
      expect(card).toHaveAttribute('aria-current', 'true');
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
      expect(maps.current.selected).toBe(bungarra.key);

      const preview = await screen.findByRole('group', { name: 'Bungarra' });
      expect(maps.current.popupAt).toEqual({ lng: bungarra.lng, lat: bungarra.lat });
      expect(mapRegion()).toContainElement(preview);
      expect(within(preview).getByText('Cape Range National Park · Pilbara')).toBeInTheDocument();
      expect(within(preview).getByRole('img', { name: 'ParkStay WA' })).toBeInTheDocument();
      await user.click(within(preview).getByRole('link', { name: 'View details' }));
      expect(currentRoute()).toBe('/places/parkstay/20');
    });

    it('closes the preview with Escape, or a click on empty map', async () => {
      const { user } = await renderMap();
      const bungarra = placeNamed('Bungarra');
      maps.current.emitClick({ type: 'location', key: bungarra.key });
      await screen.findByRole('group', { name: 'Bungarra' });
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('group', { name: 'Bungarra' })).not.toBeInTheDocument()
      );
      expect(currentRoute()).toBe('/');

      maps.current.emitClick({ type: 'location', key: bungarra.key });
      await screen.findByRole('group', { name: 'Bungarra' });
      maps.current.emitClick({ type: 'empty' });
      await waitFor(() => expect(currentRoute()).toBe('/'));
      expect(maps.current.popupAt).toBeNull();
    });

    it('shows the full name in the preview however long it is', async () => {
      await renderMap();
      const chapman = placeNamed('Chapman Pool (formerly Warner Glen at Chapman Pool)');
      maps.current.emitClick({ type: 'location', key: chapman.key });
      const preview = await screen.findByRole('group', { name: chapman.name });
      expect(within(preview).getByText(chapman.name)).toBeInTheDocument();
    });

    it('lists places that zooming cannot separate, and selects the one chosen', async () => {
      const { user } = await renderMap();
      const [a, b] = PARKSTAY_LOCATIONS;
      maps.current.emitClick({ type: 'locations', keys: [a.key, b.key], lng: a.lng, lat: a.lat });
      const list = await screen.findByRole('group', { name: '2 places' });
      expect(within(list).getByText('2 places here')).toBeInTheDocument();
      await user.click(within(list).getByRole('button', { name: new RegExp(b.name) }));
      await waitFor(() => expect(currentRoute()).toBe(`/?sel=${encodeURIComponent(b.key)}`));
      expect(await screen.findByRole('group', { name: b.name })).toBeInTheDocument();
    });
  });

  describe('search as I move the map', () => {
    it('narrows the list to the map area while on', async () => {
      await renderMap();
      maps.current.emitMove(KIMBERLEY_BBOX);
      expect(resultsHeading()).toHaveTextContent(/^7 places in map area$/);
      expect(screen.queryByRole('button', { name: 'Search this area' })).not.toBeInTheDocument();
    });

    it('offers "Search this area" when off, and narrows only when it is applied', async () => {
      const { user } = await renderMap();
      await user.click(screen.getByRole('switch', { name: 'Search as I move the map' }));
      expect(currentRoute()).toBe('/?follow=0');
      maps.current.emitMove(KIMBERLEY_BBOX);
      expect(resultsHeading()).toHaveTextContent(/^169 places in map area$/);
      await user.click(screen.getByRole('button', { name: 'Search this area' }));
      expect(resultsHeading()).toHaveTextContent(/^7 places in map area$/);
      expect(screen.queryByRole('button', { name: 'Search this area' })).not.toBeInTheDocument();
    });

    it('says when no place is in the map area, and shows all of WA again', async () => {
      const { user } = await renderMap();
      maps.current.emitMove([150, -40, 155, -35]);
      expect(
        screen.getByRole('heading', { name: 'No places in this part of the map' })
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Show all of WA' }));
      expect(maps.current.fits.at(-1)).toEqual({
        bbox: [112.5, -35.6, 129.2, -13.5],
        maxZoom: undefined,
      });
    });
  });

  describe('fitting the results', () => {
    it('fits the map to the results of a new filter, not on the first load', async () => {
      const { user } = await renderMap();
      expect(maps.current.fits).toEqual([]);
      await user.click(screen.getByRole('button', { name: /^Region/ }));
      await user.click(screen.getByRole('checkbox', { name: 'Pilbara, 39 places' }));
      await waitFor(() => expect(maps.current.fits).toHaveLength(1));
      const pilbara = PARKSTAY_LOCATIONS.filter((p) => p.area?.region === 'Pilbara');
      expect(maps.current.fits[0].bbox).toEqual(boundsOf(pilbara));
    });

    it('fits the map to a region chosen in Where', async () => {
      const { user } = await renderMap();
      await user.type(screen.getByRole('combobox', { name: 'Where' }), 'Kimb');
      await user.click(screen.getByRole('option', { name: /Kimberley/ }));
      await waitFor(() => expect(maps.current.fits).toHaveLength(1));
      const kimberley = PARKSTAY_LOCATIONS.filter((p) => p.area?.region === 'Kimberley');
      expect(maps.current.fits[0].bbox).toEqual(boundsOf(kimberley));
    });

    it('leaves the camera alone when nothing matches', async () => {
      const { user } = await renderMap();
      await user.type(screen.getByRole('combobox', { name: 'Where' }), 'zzzz{Enter}');
      await screen.findByRole('heading', { name: 'No places match your search' });
      expect(maps.current.fits).toEqual([]);
    });

    it('flies to a place chosen in Where, without fitting', async () => {
      const { user } = await renderMap();
      const lucky = placeNamed('Lucky Bay (Cape Le Grand)');
      await user.type(screen.getByRole('combobox', { name: 'Where' }), 'Lucky');
      await waitFor(() => expect(currentRoute()).toContain('q=Lucky'));
      await user.click(screen.getByRole('option', { name: /Lucky Bay \(Cape Le Grand\)/ }));
      await waitFor(() => expect(currentRoute()).toContain(`sel=${encodeURIComponent(lucky.key)}`));
      expect(currentRoute()).not.toContain('q=');
      expect(maps.current.flights).toEqual([{ lng: lucky.lng, lat: lucky.lat }]);
      await screen.findByRole('heading', { level: 2, name: '169 places in map area' });
      // The text typed to find it was a search (fitted); clearing it again is not.
      expect(maps.current.fits).toHaveLength(1);
    });
  });

  describe('below 1024 px', () => {
    it('shows one pane at a time, keeping the map mounted, and moves focus to the revealed pane', async () => {
      setWindowWidth(1000);
      const { user } = await renderMap();
      const map = maps.current;
      expect(createMapboxController).toHaveBeenCalledTimes(1);
      const toggle = screen.getByRole('button', { name: 'Show map' });
      await user.click(toggle);
      expect(currentRoute()).toBe('/?view=map');
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 2, name: 'Map of places' })).toHaveFocus()
      );
      expect(map.resizes).toBeGreaterThan(0);

      await user.click(screen.getByRole('button', { name: 'Show list' }));
      await waitFor(() => expect(resultsHeading()).toHaveFocus());
      expect(createMapboxController).toHaveBeenCalledTimes(1);
      expect(map.destroyed).toBe(false);
    });

    it('has no toggle at 1024 px and wider', async () => {
      await renderMap();
      expect(screen.queryByRole('button', { name: 'Show map' })).not.toBeInTheDocument();
    });
  });

  describe('failures', () => {
    it('falls back to the list when the map cannot load, and can try again', async () => {
      jest
        .mocked(createMapboxController)
        .mockRejectedValueOnce(new Error("The map couldn't load: 401 Unauthorized"));
      const { user } = renderWithApp({ api: catalogApi() });
      expect(
        await screen.findByText("The map couldn't load, so places are shown as a list.")
      ).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Map of places' })).not.toBeInTheDocument();
      expect(resultsHeading()).toHaveTextContent(/^169 places$/);

      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('region', { name: 'Map of places' })).toBeInTheDocument();
      await waitFor(() => expect(maps.all).toHaveLength(1));
    });

    it('removes the map when Explore closes', async () => {
      const { unmount } = await renderMap();
      const map = maps.current;
      unmount();
      expect(map.destroyed).toBe(true);
    });
  });

  it('puts the search pill, then the filters, then the results, then the map in tab order', async () => {
    await renderMap();
    const order = [
      screen.getByRole('search', { name: 'Search places' }),
      screen.getByRole('group', { name: 'Filters' }),
      results(),
      mapRegion(),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });
});
