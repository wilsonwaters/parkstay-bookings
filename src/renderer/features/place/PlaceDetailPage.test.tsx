/**
 * A place's detail page through the whole app, with a mocked `window.api`: Bungarra
 * (`parkstay:20`) with 12 photos, a description, 24 sites and a release rule
 * (tests/fixtures/catalog/place-detail.ts).
 */
import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { availabilityFor, placeDetail } from '../../../../tests/fixtures/catalog/place-detail';
import { placeApi } from '../../../../tests/utils/renderer/catalog';
import { fail, ok, PARKSTAY_MANIFEST } from '../../../../tests/utils/renderer/createMockApi';
import { currentRoute, renderWithApp } from '../../../../tests/utils/renderer/renderWithApp';
import type { StayQuery } from '../../../shared/types/provider.types';
import { SLOW_CHECK_MS } from './PlaceDetailPage';

configure({ asyncUtilTimeout: 4000 });

const STAY = '?arrival=2099-11-06&departure=2099-11-08&adults=2';
const SEARCH_PAGE = 'https://parkstay.dbca.wa.gov.au/search-availability/campground/?site_id=20';

/** Renders the place page at `route` and waits for its detail. */
async function renderPlace(route = `/places/parkstay/20${STAY}`, api = placeApi()) {
  const view = renderWithApp({ route, api });
  await screen.findByRole('heading', { level: 2, name: 'About' });
  return view;
}

const card = () => screen.getByRole('region', { name: 'Check your dates' });
/** The results' summary line, once a check is on screen. */
async function findSummary(text: string) {
  const section = await screen.findByRole('region', { name: 'Availability' });
  return within(section).findByText(text);
}
const checkButton = () => within(card()).getByRole('button', { name: 'Check availability' });
const politeRegion = () => document.querySelector('[aria-live="polite"][aria-atomic="true"]');

function manifestWith(capabilities: Partial<typeof PARKSTAY_MANIFEST.capabilities>) {
  return {
    ...PARKSTAY_MANIFEST,
    capabilities: { ...PARKSTAY_MANIFEST.capabilities, ...capabilities },
  };
}

describe('Place detail page', () => {
  it('opens cold from a deep link: name, provider, region, photos and facilities', async () => {
    const { mock } = await renderPlace('/places/parkstay/20');
    expect(mock?.api.catalog.get).toHaveBeenCalledWith('parkstay:20');
    expect(screen.getByRole('heading', { level: 1, name: 'Bungarra' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'ParkStay WA' })).toHaveTextContent('ParkStay');
    expect(screen.getByText('Cape Range National Park · Pilbara')).toBeInTheDocument();
    expect(screen.getByText('Book online')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Bungarra, photo 1 of 12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all 12 photos' })).toBeInTheDocument();
    const facilities = screen.getByRole('region', { name: 'Facilities' });
    expect(
      within(facilities)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Toilet', 'Road access for 2WD/SUV']);
    // The provider is named in the shell's tab of Explore, and Explore is the current nav item.
    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', {
        name: 'Explore',
      })
    ).toHaveAttribute('aria-current', 'page');
  });

  it('renders the description formatted, with links that open in the browser', async () => {
    await renderPlace();
    const about = screen.getByRole('region', { name: 'About' });
    expect(within(about).getByText('Ningaloo coast').tagName).toBe('STRONG');
    expect(within(about).getByRole('link', { name: 'park guide' })).toHaveAttribute(
      'target',
      '_blank'
    );
  });

  it('falls back to the summary, then to a sentence and the info link', async () => {
    await renderPlace(
      '/places/parkstay/20',
      placeApi({ detail: placeDetail({ descriptionHtml: undefined, summary: 'A quiet bay.' }) })
    );
    expect(screen.getByText('A quiet bay.')).toBeInTheDocument();
  });

  it('says when there is no description at all, with the info link', async () => {
    await renderPlace(
      '/places/parkstay/20',
      placeApi({ detail: placeDetail({ descriptionHtml: undefined, summary: undefined }) })
    );
    const about = screen.getByRole('region', { name: 'About' });
    expect(within(about).getByText("ParkStay hasn't published a description.")).toBeInTheDocument();
    expect(
      within(about).getByRole('link', {
        name: 'More information exploreparks.dbca.wa.gov.au (opens in your browser)',
      })
    ).toHaveAttribute('href', 'https://exploreparks.dbca.wa.gov.au/site/bungarra');
  });

  it('summarises the sites: count, types, guests, and every name behind a disclosure', async () => {
    const { user } = await renderPlace();
    const sites = screen.getByRole('region', { name: 'Sites' });
    expect(within(sites).getByText('24 sites')).toBeInTheDocument();
    expect(within(sites).getByText('Tent site × 12')).toBeInTheDocument();
    expect(within(sites).getByText('Campervan site × 8')).toBeInTheDocument();
    expect(within(sites).getByText('Caravan site × 4')).toBeInTheDocument();
    expect(within(sites).getByText('Up to 2–6 guests per site')).toBeInTheDocument();
    const disclosure = within(sites).getByRole('button', { name: 'Show all 24 sites' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await user.click(disclosure);
    const names = within(sites)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
      .filter((text) => text?.startsWith('Site '));
    expect(names).toHaveLength(24);
    expect(names[23]).toBe('Site 24');
  });

  it('puts the check card before the place, and the results right after it', async () => {
    const { user } = await renderPlace();
    const about = screen.getByRole('region', { name: 'About' });
    expect(card().compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(checkButton());
    const results = await screen.findByRole('region', { name: 'Availability' });
    const order = [card(), results, about];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  it("announces the place's name once its detail loads, after showing it was loading", async () => {
    let release: () => void = () => undefined;
    const api = placeApi();
    const get = (api.catalog as Record<string, jest.Mock>).get;
    const real = get.getMockImplementation()!;
    get.mockImplementation(
      (key: string) => new Promise((done) => (release = () => done(real(key))))
    );
    renderWithApp({ route: '/places/parkstay/20', api });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Loading place' })
    ).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalled());
    act(() => release());
    await screen.findByRole('heading', { level: 1, name: 'Bungarra' });
    await waitFor(() => expect(politeRegion()?.textContent?.trim()).toBe('Bungarra'));
  });

  it('names a single site plainly', async () => {
    await renderPlace(
      '/places/parkstay/20',
      placeApi({
        detail: placeDetail({
          unitCount: undefined,
          units: [{ unitId: '1', unitName: 'One site - select on arrival' }],
        }),
      })
    );
    const sites = screen.getByRole('region', { name: 'Sites' });
    expect(within(sites).getByText('1 site')).toBeInTheDocument();
    expect(within(sites).getByRole('button', { name: 'Show the site' })).toBeInTheDocument();
    // No types to break down.
    expect(within(sites).queryByText(/×/)).toBeNull();
  });

  it("counts the place's sites as its provider does, even when fewer units are listed", async () => {
    await renderPlace(
      '/places/parkstay/20',
      placeApi({
        detail: placeDetail({
          unitCount: 56,
          units: [{ unitId: '1', unitName: 'One site - select on arrival' }],
        }),
      })
    );
    const sites = screen.getByRole('region', { name: 'Sites' });
    expect(within(sites).getByText('56 sites')).toBeInTheDocument();
    expect(within(sites).getByText('Bookable as 1 site type')).toBeInTheDocument();
    expect(within(sites).getByRole('button', { name: 'Show the site type' })).toBeInTheDocument();
  });

  it('shows the booking rules as a time cue', async () => {
    await renderPlace();
    const rules = screen.getByRole('region', { name: 'Booking rules' });
    expect(within(rules).getByRole('status')).toHaveTextContent(
      'Bookings open 180 days ahead at midnight AWST.'
    );
  });

  it('prefills the side card from the address', async () => {
    await renderPlace();
    expect(within(card()).getByRole('button', { name: /^Dates/ })).toHaveTextContent(
      'Fri 6 Nov – Sun 8 Nov'
    );
    expect(within(card()).getByRole('button', { name: /^Guests/ })).toHaveTextContent('2 adults');
  });

  it("keeps a stay from the address to the provider's rules, and rewrites the address", async () => {
    await renderPlace('/places/parkstay/20?arrival=2099-11-06&departure=2100-01-06&adults=2');
    await waitFor(() =>
      expect(currentRoute()).toBe(
        '/places/parkstay/20?arrival=2099-11-06&departure=2099-12-06&adults=2'
      )
    );
    expect(within(card()).getByRole('button', { name: /^Dates/ })).toHaveTextContent(
      'Fri 6 Nov – Sun 6 Dec'
    );
  });

  it('drops a stay from the address that has already started', async () => {
    await renderPlace('/places/parkstay/20?arrival=2020-01-01&departure=2020-01-03&adults=2');
    await waitFor(() => expect(currentRoute()).toBe('/places/parkstay/20?adults=2'));
    expect(within(card()).getByRole('button', { name: /^Dates/ })).toHaveTextContent('Add dates');
  });

  it('checks the stay once, then shows the grid, focuses its summary and announces it', async () => {
    const { user, mock } = await renderPlace();
    await user.click(checkButton());

    const summary = await findSummary('8 of 24 sites free for all 2 nights');
    expect(mock?.api.catalog.checkLocation).toHaveBeenCalledTimes(1);
    expect(mock?.api.catalog.checkLocation).toHaveBeenCalledWith('parkstay:20', {
      arrival: '2099-11-06',
      departure: '2099-11-08',
      adults: 2,
      children: 0,
      infants: 0,
    });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(politeRegion()?.textContent?.trim()).toBe('8 of 24 sites free for all 2 nights');
    const grid = screen.getByRole('table', { name: 'Availability by night, 6–8 Nov' });
    expect(within(grid).getAllByRole('rowheader')).toHaveLength(8);

    // Book now goes straight to these dates on ParkStay.
    const book = within(card()).getByRole('link', {
      name: 'Book on ParkStay (opens in your browser)',
    });
    expect(book).toHaveAttribute(
      'href',
      `${SEARCH_PAGE}&arrival=2099/11/06&departure=2099/11/08&num_adult=2`
    );
    // Checking the same dates again stays possible.
    expect(checkButton()).toBeEnabled();
    expect(checkButton()).not.toHaveAttribute('aria-busy');
  });

  it('shows partly available sites once "Fully available only" is off', async () => {
    const { user } = await renderPlace();
    await user.click(checkButton());
    await findSummary('8 of 24 sites free for all 2 nights');
    await user.click(screen.getByRole('switch', { name: 'Fully available only' }));
    const row = screen.getByRole('rowheader', { name: /^Site 09/ }).closest('tr')!;
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['$30Available, $30', 'Booked']);
  });

  it('asks for dates before checking', async () => {
    const { user, mock } = await renderPlace('/places/parkstay/20');
    await user.click(checkButton());
    expect(
      within(card()).getByText('Choose your check-in and check-out dates')
    ).toBeInTheDocument();
    expect(mock?.api.catalog.checkLocation).not.toHaveBeenCalled();
  });

  it('marks old results with their dates once the stay changes, and checks again', async () => {
    const { user, mock } = await renderPlace();
    await user.click(checkButton());
    await findSummary('8 of 24 sites free for all 2 nights');

    await user.click(within(card()).getByRole('button', { name: /^Guests/ }));
    await user.click(screen.getByRole('button', { name: /^Increase adults/ }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(currentRoute()).toBe(
      '/places/parkstay/20?arrival=2099-11-06&departure=2099-11-08&adults=3&children=0&infants=0'
    );
    expect(await screen.findByText('Results for 6–8 Nov')).toBeInTheDocument();
    expect(checkButton()).toBeEnabled();

    await user.click(checkButton());
    await waitFor(() => expect(mock?.api.catalog.checkLocation).toHaveBeenCalledTimes(2));
    expect(jest.mocked(mock!.api.catalog.checkLocation).mock.calls[1][1]).toMatchObject({
      adults: 3,
    });
    await waitFor(() => expect(screen.queryByText('Results for 6–8 Nov')).not.toBeInTheDocument());
  });

  it('says when bookings for the dates open, in the provider time zone', async () => {
    const api = placeApi({
      catalog: {
        checkLocation: jest.fn(async (_key: string, stay: StayQuery) =>
          ok(
            availabilityFor(stay, {
              fully: 0,
              partly: 0,
              rest: 'not-released',
              release: { open: false, opensAt: '2027-03-31T16:00:00.000Z' },
            })
          )
        ),
      },
    });
    const { user } = await renderPlace(`/places/parkstay/20${STAY}`, api);
    await user.click(checkButton());
    expect(
      await screen.findByText('Bookings for these dates open Thu 1 Apr 2027, 12:00 am AWST.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Fully available only' }));
    const row = screen.getByRole('rowheader', { name: /^Site 01/ }).closest('tr')!;
    expect(within(row).getAllByRole('cell')[0]).toHaveTextContent('Not released yet');
  });

  describe('when a check fails', () => {
    async function failWith(response: unknown) {
      const checkLocation = jest.fn().mockResolvedValue(response);
      const view = await renderPlace(
        `/places/parkstay/20${STAY}`,
        placeApi({ catalog: { checkLocation } })
      );
      await view.user.click(checkButton());
      return { ...view, checkLocation };
    }

    it('names the waiting queue, for a provider that has one', async () => {
      await failWith(fail('ParkStay is queueing visitors', 'ACCESS_GATE'));
      expect(
        await within(card()).findByText(
          'ParkStay has a waiting queue right now. Try again in a few minutes.'
        )
      ).toBeInTheDocument();
      expect(checkButton()).toBeEnabled();
    });

    it('says to slow down after a rate limit', async () => {
      await failWith(
        fail('parkstay: HTTP 429 from https://parkstay.dbca.wa.gov.au/api', 'RATE_LIMITED')
      );
      expect(
        await within(card()).findByText('Too many checks in a short time. Try again in a minute.')
      ).toBeInTheDocument();
    });

    it('offers Retry for anything else, without retrying by itself', async () => {
      const { user, checkLocation } = await failWith(fail('parkstay: HTTP 500', 'PROVIDER_ERROR'));
      const alert = await within(card()).findByRole('alert');
      expect(alert).toHaveTextContent("Couldn't check availability");
      expect(checkLocation).toHaveBeenCalledTimes(1);
      checkLocation.mockImplementation(async (_key: string, stay: StayQuery) =>
        ok(availabilityFor(stay))
      );
      await user.click(within(alert).getByRole('button', { name: 'Retry' }));
      expect(await findSummary('8 of 24 sites free for all 2 nights')).toBeInTheDocument();
      expect(checkLocation).toHaveBeenCalledTimes(2);
    });
  });

  it('says it is still checking after 10 seconds', async () => {
    jest.useFakeTimers();
    try {
      const api = placeApi({ catalog: { checkLocation: jest.fn(() => new Promise(() => {})) } });
      renderWithApp({ route: `/places/parkstay/20${STAY}`, api });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await screen.findByRole('heading', { level: 2, name: 'About' });
      await user.click(checkButton());
      expect(checkButton()).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByRole('status', { name: 'Still checking ParkStay' })).toBeNull();
      // Async, so the tray's own 10 s poll (QueueStatus) settles inside act too.
      await act(async () => {
        jest.advanceTimersByTime(SLOW_CHECK_MS);
      });
      expect(within(card()).getByText('Still checking ParkStay…')).toBeInTheDocument();
      expect(screen.getByRole('status', { name: 'Still checking ParkStay' })).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  describe('capabilities', () => {
    it("says when the provider doesn't share availability, instead of Check", async () => {
      await renderPlace(
        `/places/parkstay/20${STAY}`,
        placeApi({
          stubs: {
            providers: {
              list: jest.fn().mockResolvedValue(ok([manifestWith({ availability: false })])),
            },
          },
        })
      );
      expect(
        within(card()).getByText(
          "ParkStay doesn't share availability with WA Stay. Check dates on their website."
        )
      ).toBeInTheDocument();
      expect(within(card()).queryByRole('button', { name: 'Check availability' })).toBeNull();
    });

    it('offers Watch and Snipe only when the provider does', async () => {
      await renderPlace(
        `/places/parkstay/20${STAY}`,
        placeApi({
          stubs: {
            providers: {
              list: jest
                .fn()
                .mockResolvedValue(ok([manifestWith({ watches: false, snipes: false })])),
            },
          },
        })
      );
      expect(within(card()).queryByRole('link', { name: 'Watch for availability' })).toBeNull();
      expect(within(card()).queryByRole('link', { name: /Snipe a site/ })).toBeNull();
    });

    it('treats a detail with no units array as no units', async () => {
      const detail = placeDetail();
      delete (detail as { units?: unknown }).units;
      await renderPlace(`/places/parkstay/20${STAY}`, placeApi({ detail }));
      expect(screen.queryByRole('region', { name: 'Sites' })).toBeNull();
      expect(within(card()).queryByRole('button', { name: 'Check availability' })).toBeNull();
    });

    it('hides the sites and Check when the provider lists no units, and shows the info link', async () => {
      await renderPlace(
        `/places/parkstay/20${STAY}`,
        placeApi({ detail: placeDetail({ units: [] }) })
      );
      expect(screen.queryByRole('region', { name: 'Sites' })).toBeNull();
      expect(within(card()).queryByRole('button', { name: 'Check availability' })).toBeNull();
      expect(
        within(card()).getByText(
          "ParkStay doesn't list sites for Bungarra, so dates can't be checked in WA Stay."
        )
      ).toBeInTheDocument();
      expect(
        within(card()).getAllByRole('link', { name: /^More information exploreparks/ }).length
      ).toBeGreaterThan(0);
    });
  });

  describe('links out to the provider', () => {
    it('books online places on ParkStay, and links to its page and the info page', async () => {
      await renderPlace();
      const book = within(card()).getByRole('link', {
        name: 'Book on ParkStay (opens in your browser)',
      });
      expect(book).toHaveAttribute('href', SEARCH_PAGE);
      expect(book).toHaveAttribute('target', '_blank');
      expect(
        within(card()).getByRole('link', { name: 'View on ParkStay (opens in your browser)' })
      ).toHaveAttribute('href', SEARCH_PAGE);
      expect(
        within(card()).getByRole('link', {
          name: 'More information exploreparks.dbca.wa.gov.au (opens in your browser)',
        })
      ).toHaveAttribute('href', 'https://exploreparks.dbca.wa.gov.au/site/bungarra');
    });

    it('has no Book for places not booked online, and visits the website with no links', async () => {
      await renderPlace(
        '/places/parkstay/20',
        placeApi({
          detail: placeDetail({
            bookingMode: 'external',
            bookingUrl: undefined,
            infoUrl: undefined,
          }),
        })
      );
      expect(screen.getByText('Info only')).toBeInTheDocument();
      expect(within(card()).queryByRole('link', { name: /^Book on/ })).toBeNull();
      expect(
        within(card()).getByRole('link', { name: 'Visit ParkStay (opens in your browser)' })
      ).toHaveAttribute('href', 'https://parkstay.dbca.wa.gov.au');
    });
  });

  describe('hand-offs', () => {
    it('watches with the §12.10 prefill', async () => {
      await renderPlace();
      expect(within(card()).getByRole('link', { name: 'Watch for availability' })).toHaveAttribute(
        'href',
        '#/watches/new?provider=parkstay&location=20&arrival=2099-11-06&departure=2099-11-08&adults=2'
      );
    });

    it('snipes with the same prefill, and says it is coming soon', async () => {
      await renderPlace();
      const snipe = within(card()).getByRole('link', { name: 'Snipe a site, coming soon' });
      expect(snipe).toHaveAttribute(
        'href',
        '#/site-sniper/new?provider=parkstay&location=20&arrival=2099-11-06&departure=2099-11-08&adults=2'
      );
      expect(within(snipe).getByText('Soon')).toBeInTheDocument();
    });
  });

  describe('Back to Explore', () => {
    it('opens Explore with the stay when the page was not opened from Explore', async () => {
      const { user } = await renderPlace();
      await user.click(screen.getByRole('link', { name: 'Back to Explore' }));
      expect(currentRoute()).toBe('/?arrival=2099-11-06&departure=2099-11-08&adults=2');
    });

    it('goes back one step when it was opened from Explore', async () => {
      const { user } = renderWithApp({ route: '/?q=Bungarra', api: placeApi() });
      const results = await screen.findByRole('region', { name: 'Results' });
      await user.click(await within(results).findByRole('link', { name: 'Bungarra' }));
      const title = await screen.findByRole('heading', { level: 1, name: 'Bungarra' });
      // Focus lands on the place's name.
      await waitFor(() => expect(title).toHaveFocus());
      expect(currentRoute()).toBe('/places/parkstay/20');

      await user.click(screen.getByRole('link', { name: 'Back to Explore' }));
      await screen.findByRole('heading', { level: 1, name: 'Explore places to stay' });
      expect(currentRoute()).toBe('/?q=Bungarra');
      // Back, not a new entry: forward returns to the place.
      act(() => window.history.forward());
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Bungarra' })
      ).toBeInTheDocument();
    });
  });

  describe('a place that is not there', () => {
    it('says so when the catalogue does not have it', async () => {
      renderWithApp({ route: '/places/parkstay/9999', api: placeApi() });
      expect(
        await screen.findByRole('heading', { level: 1, name: "This place isn't available" })
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to Explore' })).toBeInTheDocument();
    });

    it('says so for a provider WA Stay does not have, without asking for it', async () => {
      const { mock } = renderWithApp({ route: '/places/airbnb/1', api: placeApi() });
      expect(
        await screen.findByRole('heading', { level: 1, name: "This place isn't available" })
      ).toBeInTheDocument();
      expect(mock?.api.catalog.get).not.toHaveBeenCalled();
    });

    it('offers to try again when the detail could not be loaded', async () => {
      const get = jest.fn().mockResolvedValue(fail('Database is locked', 'INTERNAL'));
      renderWithApp({ route: '/places/parkstay/20', api: placeApi({ catalog: { get } }) });
      expect(
        await screen.findByRole('heading', { level: 1, name: "We couldn't load this place" })
      ).toBeInTheDocument();
      get.mockResolvedValue(ok(placeDetail()));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Bungarra' })
      ).toBeInTheDocument();
    });
  });

  it('finds a place whose external id holds "/", ":" and spaces', async () => {
    const detail = placeDetail({ key: 'parkstay:a/b:c d', externalId: 'a/b:c d', name: 'Odd Id' });
    const { mock } = renderWithApp({
      route: '/places/parkstay/a%2Fb%3Ac%20d',
      api: placeApi({ detail }),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Odd Id' })).toBeInTheDocument();
    expect(mock?.api.catalog.get).toHaveBeenCalledWith('parkstay:a/b:c d');
  });

  it('reloads the detail in place when the catalogue syncs, keeping the open gallery', async () => {
    const { user, mock } = await renderPlace();
    await user.click(screen.getByRole('button', { name: 'Show all 12 photos' }));
    await user.keyboard('{ArrowRight}');
    expect(within(screen.getByRole('dialog')).getByText('2 of 12')).toBeInTheDocument();

    mock!.emit('catalog:updated', {
      providerId: 'parkstay',
      count: 169,
      syncedAt: '2026-10-09T02:00:00Z',
    });
    await waitFor(() => expect(mock?.api.catalog.get).toHaveBeenCalledTimes(2));
    expect(within(screen.getByRole('dialog')).getByText('2 of 12')).toBeInTheDocument();
    // Another provider's sync is not this place's.
    mock!.emit('catalog:updated', {
      providerId: 'other',
      count: 1,
      syncedAt: '2026-10-09T02:00:00Z',
    });
    expect(mock?.api.catalog.get).toHaveBeenCalledTimes(2);
  });
});
