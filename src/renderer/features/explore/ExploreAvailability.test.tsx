/**
 * Explore with dates (E3): availability on the cards and the map pins, "Available only", the
 * order, the cache per stay, each provider's failure on its own, and what is announced. The
 * whole app renders with a mocked `window.api` whose `catalog.availability` answers as main
 * does; a FakeMapController stands in for Mapbox.
 */
import { act, configure, screen, waitFor, within } from '@testing-library/react';
import { bulkAvailabilityFor } from '../../../../tests/fixtures/catalog/bulk-availability';
import { catalogApi, placeNamed } from '../../../../tests/utils/renderer/catalog';
import { ok, PARKSTAY_MANIFEST } from '../../../../tests/utils/renderer/createMockApi';
import { installFakeMap, type FakeMaps } from '../../../../tests/utils/renderer/fakeMapController';
import { currentRoute, renderWithApp } from '../../../../tests/utils/renderer/renderWithApp';
import type { LocationSummary } from '../../../shared/types/catalog.types';
import type { BulkAvailabilityEntry, StayQuery } from '../../../shared/types/provider.types';
import { addDays, todayIn } from '../../../shared/utils/calendar-date';
import { stayRangeLabel } from '../../components/nightGrid';
import { SLOW_AVAILABILITY_MS, STAY_DEBOUNCE_MS } from './ExplorePage';
import { createMapboxController } from './map/mapboxController';

configure({ asyncUtilTimeout: 4000 });

let mockMapAvailable = false;
jest.mock('./map/mapSupport', () => ({
  detectMapSupport: () =>
    mockMapAvailable
      ? { available: true, token: 'pk.test-token' }
      : { available: false, reason: 'no-token' },
}));
jest.mock('./map/mapboxController', () => ({ createMapboxController: jest.fn() }));

// ---- The places: one in each state --------------------------------------------------------
const YARDIE = placeNamed('Yardie Creek'); // 9 of 10 free
const BUNGARRA = placeNamed('Bungarra'); // 3 of 5 free
const LUCKY = placeNamed('Lucky Bay (Cape Le Grand)'); // full
const ONE_K = placeNamed('One K'); // nothing bookable: not open
const COALMINE = placeNamed('Coalmine Beach Holiday Park'); // not bookable online
/** A provider that checks one place at a time, but not in bulk. */
const SINGLE = {
  ...PARKSTAY_MANIFEST,
  id: 'single',
  name: 'Single Stays',
  shortName: 'Single',
  capabilities: { ...PARKSTAY_MANIFEST.capabilities, bulkAvailability: false, accessGate: false },
};
const KINGSTOWN: LocationSummary = {
  key: 'single:7',
  providerId: 'single',
  externalId: '7',
  name: 'Kingstown Barracks',
  kind: 'cabin',
  bookingMode: 'online',
  lat: -32.0,
  lng: 115.54,
  area: { name: 'Rottnest Island', region: 'Swan' },
  imageUrls: [],
  amenities: [],
};
const PLACES = [YARDIE, BUNGARRA, LUCKY, ONE_K, COALMINE, KINGSTOWN];
const NAMES = PLACES.map((p) => p.name);

const STAY = 'arrival=2099-11-06&departure=2099-11-08&adults=2';
const STAY_B = 'arrival=2099-11-13&departure=2099-11-15&adults=2';

type AvailabilityStub = jest.Mock<
  Promise<unknown>,
  [StayQuery, { providerIds?: string[] } | undefined]
>;

/** `catalog.availability` as main answers it, from `entries`. */
function answering(entries: BulkAvailabilityEntry[] = bulkAvailabilityFor(PLACES)) {
  return (stay: StayQuery, options: { providerIds?: string[] } = {}) => {
    const [id] = options.providerIds ?? [];
    return ok({ entries: entries.filter((e) => e.key.startsWith(`${id}:`)), errors: [] });
  };
}

function api(
  availability: AvailabilityStub = jest.fn(async (stay, options) => answering()(stay, options)),
  manifests: unknown[] = [PARKSTAY_MANIFEST, SINGLE],
  items: LocationSummary[] = PLACES
) {
  return {
    stubs: catalogApi({
      items,
      catalog: { availability },
      stubs: { providers: { list: jest.fn().mockResolvedValue(ok(manifests)) } },
    }),
    availability,
  };
}

/** Reports the window as 1440 px wide, with or without a wish for less motion. */
function setMedia({ reducedMotion = false } = {}) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query)?.[1];
      const matches = min
        ? 1440 >= Number(min)
        : /prefers-reduced-motion:\s*reduce/.test(query) && reducedMotion;
      return {
        matches,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
    },
  });
}

let maps: FakeMaps;
beforeEach(() => {
  mockMapAvailable = false;
  maps = installFakeMap(jest.mocked(createMapboxController));
  Element.prototype.scrollIntoView = jest.fn();
  setMedia();
});
afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const results = () => screen.getByRole('region', { name: 'Results' });
const heading = () => within(results()).getByRole('heading', { level: 2 });
const card = (name: string) => within(results()).getByRole('link', { name });
const cardNames = () =>
  within(results())
    .queryAllByRole('link')
    .map(
      (link) => document.getElementById(link.getAttribute('aria-labelledby') ?? '')?.textContent
    );
const availableOnly = () =>
  within(screen.getByRole('group', { name: 'Filters' })).getByRole('button', {
    name: 'Available only',
  });
const politeLive = () => document.querySelector('[aria-live="polite"][aria-atomic="true"]');
const assertiveLive = () => document.querySelector('[aria-live="assertive"][aria-atomic="true"]');
const SETTLED = /^6 places · 2 available for 6–8 Nov$/;

/** Renders Explore at `route` and waits for its heading. */
async function renderExplore(route: string, stubs = api().stubs, name: RegExp | string = SETTLED) {
  const view = renderWithApp({ route, api: stubs });
  await within(await screen.findByRole('region', { name: 'Results' })).findByRole('heading', {
    level: 2,
    name,
  });
  return view;
}

/**
 * Goes to another Explore address, as the browser would, and lets the router follow it
 * (jsdom fires `hashchange` as a task).
 */
async function go(route: string) {
  await act(async () => {
    window.location.hash = `#${route}`;
    await pause(0);
  });
}

/** Lets `ms` pass, with what it causes applied (inside act). */
const pause = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/** Every text the results heading shows from now on. */
function watchHeading() {
  const seen: string[] = [];
  const record = () => {
    const text = within(results()).queryByRole('heading', { level: 2 })?.textContent ?? '';
    if (seen[seen.length - 1] !== text) seen.push(text);
  };
  record();
  const observer = new MutationObserver(record);
  observer.observe(results(), { childList: true, subtree: true, characterData: true });
  return { seen, stop: () => observer.disconnect() };
}

describe('Explore with dates: asking', () => {
  it('asks each bulk provider once, 400 ms after the dates settle; a run of guest steps asks once', async () => {
    const { stubs, availability } = api();
    const calledAt: number[] = [];
    availability.mockImplementation(async (stay, options) => {
      calledAt.push(Date.now());
      return answering()(stay, options);
    });
    const { user } = await renderExplore('/', stubs, '6 places');
    expect(availability).not.toHaveBeenCalled();

    // Check in tomorrow, out 2 nights later (in Perth), from the keyboard. The stay is set when
    // the departure reaches the URL: the debounce starts there, so time the call from it.
    let chosenAt = Number.POSITIVE_INFINITY;
    const pushState = window.history.pushState.bind(window.history);
    const spy = jest.spyOn(window.history, 'pushState').mockImplementation((...args) => {
      if (String(args[2]).includes('departure=')) chosenAt = Math.min(chosenAt, Date.now());
      pushState(...args);
    });
    await user.click(screen.getByRole('button', { name: /^When/ }));
    await user.keyboard('{ArrowRight}{Enter}{ArrowRight}{ArrowRight}');
    await user.keyboard('{Enter}');
    spy.mockRestore();
    expect(chosenAt).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(availability).not.toHaveBeenCalled();
    const arrival = addDays(todayIn('Australia/Perth'), 1);
    const departure = addDays(arrival, 2);
    await waitFor(() => expect(availability).toHaveBeenCalledTimes(1));
    expect(calledAt[0] - chosenAt).toBeGreaterThanOrEqual(STAY_DEBOUNCE_MS - 10);
    // One call for ParkStay only: the other provider cannot answer in bulk.
    expect(availability).toHaveBeenCalledWith(
      { arrival, departure, adults: 1, children: 0, infants: 0 },
      { providerIds: ['parkstay'] }
    );
    const range = stayRangeLabel(arrival, departure);
    expect(
      await within(results()).findByRole('heading', { name: `6 places · 2 available for ${range}` })
    ).toBeInTheDocument();

    // Stepping the adults quickly: one call, for the last count.
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /^Who/ }));
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Increase adults' }));
    }
    const adults = Number(/adults=(\d)/.exec(currentRoute())?.[1]);
    expect(adults).toBeGreaterThanOrEqual(3);
    await waitFor(() => expect(availability).toHaveBeenCalledTimes(2));
    expect(availability).toHaveBeenLastCalledWith(
      expect.objectContaining({ arrival, departure, adults }),
      { providerIds: ['parkstay'] }
    );
    await pause(STAY_DEBOUNCE_MS + 100);
    expect(availability).toHaveBeenCalledTimes(2);
  });

  it('asks nothing without dates, or for a URL-edited stay of more than 30 nights', async () => {
    const { stubs, availability } = api();
    await renderExplore('/?arrival=2099-11-01&departure=2099-12-05', stubs, '6 places');
    await pause(STAY_DEBOUNCE_MS + 100);
    expect(availability).not.toHaveBeenCalled();
    expect(within(results()).queryByText('Availability unknown')).not.toBeInTheDocument();
  });

  it('shows the dates again at once from the cache (A, B, A), never one stay’s states for another', async () => {
    const a = bulkAvailabilityFor(PLACES);
    const b = a.map((e) => (e.key === BUNGARRA.key ? { ...e, availableUnits: 1 } : e));
    let answerB: () => void = () => undefined;
    const availability: AvailabilityStub = jest.fn((stay, options) =>
      stay.arrival === '2099-11-06'
        ? Promise.resolve(answering(a)(stay, options))
        : new Promise((resolve) => (answerB = () => resolve(answering(b)(stay, options))))
    );
    await renderExplore(`/?${STAY}`, api(availability).stubs);
    expect(within(card('Bungarra')).getByText('3 of 5 sites available')).toBeInTheDocument();

    // B is still loading: its cards are checking, never showing A's states.
    await go(`/?${STAY_B}`);
    expect(
      await within(results()).findByRole('heading', { name: '6 places · checking availability…' })
    ).toBeInTheDocument();
    expect(within(card('Bungarra')).queryByText('3 of 5 sites available')).toBeNull();
    expect(within(card('Bungarra')).getByText('Checking availability')).toBeInTheDocument();
    await waitFor(() => expect(availability).toHaveBeenCalledTimes(2));

    // Back to A: at once, from the cache, with nothing checking and nothing asked.
    const headings = watchHeading();
    await go(`/?${STAY}`);
    headings.stop();
    expect(headings.seen).toEqual([
      '6 places · checking availability…',
      '6 places · 2 available for 6–8 Nov',
    ]);
    expect(heading()).toHaveTextContent(SETTLED);
    expect(within(card('Bungarra')).getByText('3 of 5 sites available')).toBeInTheDocument();
    expect(within(results()).queryByText('Checking availability')).toBeNull();

    // B's late answer is B's alone.
    answerB();
    await pause(20);
    expect(within(card('Bungarra')).getByText('3 of 5 sites available')).toBeInTheDocument();
    await go(`/?${STAY_B}`);
    expect(within(card('Bungarra')).getByText('1 of 5 sites available')).toBeInTheDocument();
    await pause(STAY_DEBOUNCE_MS + 100);
    expect(availability).toHaveBeenCalledTimes(2);
  });
});

describe('Explore with dates: cards (list only)', () => {
  it('says each place’s state in words, and the heading counts the available places', async () => {
    await renderExplore(`/?${STAY}`);
    expect(heading()).toHaveTextContent('6 places · 2 available for 6–8 Nov');
    const expected: [LocationSummary, string][] = [
      [YARDIE, '9 of 10 sites available'],
      [BUNGARRA, '3 of 5 sites available'],
      [LUCKY, 'Fully booked'],
      [ONE_K, 'No sites open for these dates'],
      [COALMINE, 'Not bookable online'],
      [KINGSTOWN, 'Check dates on the place page'],
    ];
    for (const [place, text] of expected) {
      expect(within(card(place.name)).getByText(text)).toBeInTheDocument();
      // Part of the link's description, so it is read with the name.
      expect(card(place.name)).toHaveAccessibleDescription(expect.stringContaining(text));
    }
  });

  it('puts available places first, most free first, then full, not open, check dates, info only', async () => {
    const { user } = await renderExplore(`/?${STAY}`);
    expect(cardNames()).toEqual([
      'Yardie Creek',
      'Bungarra',
      'Lucky Bay (Cape Le Grand)',
      'One K',
      'Kingstown Barracks',
      'Coalmine Beach Holiday Park',
    ]);

    // Clearing the dates: back to A to Z, with no states at all.
    await user.click(screen.getByRole('button', { name: /^When/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Choose dates' })).getByRole('button', {
        name: 'Clear',
      })
    );
    await waitFor(() => expect(heading()).toHaveTextContent(/^6 places$/));
    expect(cardNames()).toEqual([...NAMES].sort((x, y) => x.localeCompare(y)));
    expect(
      within(results()).queryByText(/sites available|Fully booked|Check dates|No sites open/)
    ).toBeNull();
  });

  it('shows a skeleton line on each card while checking, then the states', async () => {
    let answer: () => void = () => undefined;
    const availability: AvailabilityStub = jest.fn(
      (stay, options) =>
        new Promise((resolve) => (answer = () => resolve(answering()(stay, options))))
    );
    await renderExplore(`/?${STAY}`, api(availability).stubs, /checking availability…$/);
    expect(within(card('Bungarra')).getByText('Checking availability')).toBeInTheDocument();
    // Places that need no answer show theirs at once.
    expect(
      within(card('Coalmine Beach Holiday Park')).getByText('Not bookable online')
    ).toBeInTheDocument();
    await waitFor(() => expect(availability).toHaveBeenCalled());
    await act(async () => answer());
    await waitFor(() => expect(heading()).toHaveTextContent(SETTLED));
    expect(within(results()).queryByText('Checking availability')).toBeNull();
  });
});

describe('Explore with dates: "Available only"', () => {
  it('is unavailable without dates, focusable, and says why in its description', async () => {
    const { user } = await renderExplore('/', api().stubs, '6 places');
    const chip = availableOnly();
    expect(chip).toHaveAttribute('aria-disabled', 'true');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveAccessibleDescription('Add dates to filter by availability');
    act(() => chip.focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent('Add dates to filter by availability');
    expect(screen.getByRole('tooltip')).toBeVisible();
    await user.click(chip);
    expect(currentRoute()).toBe('/');
  });

  it('with dates, keeps only the available places, writes avail=1, and a reload restores it', async () => {
    const { user, unmount } = await renderExplore(`/?${STAY}`);
    expect(availableOnly()).not.toHaveAttribute('aria-disabled');
    await user.click(availableOnly());
    expect(availableOnly()).toHaveAttribute('aria-pressed', 'true');
    expect(currentRoute()).toBe(`/?${STAY}&avail=1`);
    expect(cardNames()).toEqual(['Yardie Creek', 'Bungarra']);
    expect(heading()).toHaveTextContent(SETTLED);

    unmount();
    await renderExplore(`/?${STAY}&avail=1`);
    expect(availableOnly()).toHaveAttribute('aria-pressed', 'true');
    expect(cardNames()).toEqual(['Yardie Creek', 'Bungarra']);
  });

  it('says so when nothing is available, with "Show all places" and "Try different dates"', async () => {
    const full = bulkAvailabilityFor(PLACES).map((e) => ({ ...e, availableUnits: 0 }));
    const availability: AvailabilityStub = jest.fn(async (stay, options) =>
      answering(full)(stay, options)
    );
    const { user } = await renderExplore(`/?${STAY}&avail=1`, api(availability).stubs, /./);
    expect(
      await screen.findByRole('heading', { name: 'No places have sites for 6–8 Nov' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try different dates' }));
    expect(screen.getByRole('dialog', { name: 'Choose dates' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Show all places' }));
    expect(currentRoute()).toBe(`/?${STAY}`);
    expect(cardNames()).toHaveLength(6);
  });

  it('does not claim nothing is free when nothing could be checked', async () => {
    const availability: AvailabilityStub = jest.fn(async () =>
      ok({ entries: [], errors: [{ providerId: 'parkstay', code: 'http', message: 'HTTP 502' }] })
    );
    await renderExplore(`/?${STAY}&avail=1`, api(availability).stubs, /./);
    expect(
      await screen.findByRole('heading', {
        name: "Availability couldn't be checked for 6–8 Nov",
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /No places have sites/ })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check availability on ParkStay.");
  });

  it('cannot be used when no provider reports availability in bulk, and nothing is asked', async () => {
    const { stubs, availability } = api(undefined, [SINGLE], [KINGSTOWN]);
    await renderExplore(`/?${STAY}`, stubs, '1 place');
    expect(availableOnly()).toHaveAttribute('aria-disabled', 'true');
    expect(availableOnly()).toHaveAccessibleDescription(
      "Availability filtering isn't supported by these providers"
    );
    expect(
      within(card('Kingstown Barracks')).getByText('Check dates on the place page')
    ).toBeInTheDocument();
    await pause(STAY_DEBOUNCE_MS + 100);
    expect(availability).not.toHaveBeenCalled();
  });
});

describe('Explore with dates: providers that fail or are slow', () => {
  const FAKE = {
    ...PARKSTAY_MANIFEST,
    id: 'fake',
    name: 'Fake Stays',
    shortName: 'Fake',
    capabilities: { ...PARKSTAY_MANIFEST.capabilities, accessGate: false },
  };
  const COVE: LocationSummary = {
    ...KINGSTOWN,
    key: 'fake:1',
    providerId: 'fake',
    externalId: '1',
    name: 'Fake Cove',
    kind: 'campground',
  };

  it("keeps a failing provider's places apart, and Retry asks only it again", async () => {
    let parkstayFails = true;
    const availability: AvailabilityStub = jest.fn(async (stay, options) => {
      const [id] = options?.providerIds ?? [];
      if (id === 'parkstay' && parkstayFails) {
        return ok({
          entries: [],
          errors: [{ providerId: 'parkstay', code: 'http', message: 'parkstay: HTTP 502' }],
        });
      }
      return answering([
        ...bulkAvailabilityFor([BUNGARRA]),
        { key: 'fake:1', availableUnits: 2, bookableUnits: 4 },
      ])(stay, options);
    });
    const { user } = await renderExplore(
      `/?${STAY}`,
      api(availability, [PARKSTAY_MANIFEST, FAKE], [BUNGARRA, COVE]).stubs,
      '2 places · 1 available for 6–8 Nov'
    );
    expect(within(card('Bungarra')).getByText("Couldn't check ParkStay")).toBeInTheDocument();
    expect(within(card('Fake Cove')).getByText('2 of 4 sites available')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't check availability on ParkStay.");
    await waitFor(() =>
      expect(assertiveLive()?.textContent?.trim()).toBe("Couldn't check availability on ParkStay")
    );

    availability.mockClear();
    parkstayFails = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry ParkStay availability' }));
    expect(await within(card('Bungarra')).findByText('3 of 5 sites available')).toBeInTheDocument();
    expect(availability).toHaveBeenCalledTimes(1);
    expect(availability).toHaveBeenCalledWith(expect.anything(), { providerIds: ['parkstay'] });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains a waiting queue once, calmly, rather than on every card', async () => {
    const availability: AvailabilityStub = jest.fn(async () =>
      ok({
        entries: [],
        errors: [{ providerId: 'parkstay', code: 'access-gate', message: 'queue' }],
      })
    );
    await renderExplore(`/?${STAY}`, api(availability).stubs, '6 places');
    const notice = await screen.findByText(/has a waiting queue right now/);
    expect(notice.closest('[role="status"]')).toHaveTextContent(
      "Couldn't check availability on ParkStay. ParkStay has a waiting queue right now. Try again in a few minutes."
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByText(/waiting queue/)).toHaveLength(1);
    expect(within(card('Bungarra')).getByText("Couldn't check ParkStay")).toBeInTheDocument();
  });

  it('says it is still checking after 10 seconds, naming a possible queue', async () => {
    jest.useFakeTimers();
    try {
      const availability: AvailabilityStub = jest.fn(() => new Promise(() => undefined));
      renderWithApp({ route: `/?${STAY}`, api: api(availability).stubs });
      await screen.findByRole('heading', { name: '6 places · checking availability…' });
      expect(screen.queryByText(/Still checking/)).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(SLOW_AVAILABILITY_MS);
      });
      expect(
        screen.getByText('Still checking ParkStay… It may have a waiting queue right now.')
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks nothing offline, and says availability needs a connection', async () => {
    const onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      const { stubs, availability } = api();
      await renderExplore(`/?${STAY}`, stubs, '6 places');
      expect(screen.getByText('Availability needs an internet connection.')).toBeInTheDocument();
      expect(within(card('Bungarra')).getByText('Availability unknown')).toBeInTheDocument();
      await pause(STAY_DEBOUNCE_MS + 100);
      expect(availability).not.toHaveBeenCalled();
    } finally {
      onLine.mockRestore();
    }
  });
});

describe('Explore with dates: announcements', () => {
  it('announces how many places have sites once availability settles', async () => {
    await renderExplore(`/?${STAY}`);
    await waitFor(() =>
      expect(politeLive()?.textContent?.trim()).toBe(
        '2 of 6 places have sites available for 6–8 Nov'
      )
    );
  });
});

describe('Explore with dates: the map', () => {
  beforeEach(() => {
    mockMapAvailable = true;
  });

  it('shows each place’s state on its pin, with a key, once per change and not per hover', async () => {
    const { user } = await renderExplore(`/?${STAY}`);
    const map = maps.current;
    const pins = Object.fromEntries(
      PLACES.map((p) => [p.name, [map.pin(p.key)?.avail, map.pin(p.key)?.availLabel]])
    );
    expect(pins).toEqual({
      'Yardie Creek': ['available', '9 available'],
      Bungarra: ['available', '3 available'],
      'Lucky Bay (Cape Le Grand)': ['full', 'Full'],
      'One K': ['none-open', 'Not open'],
      'Coalmine Beach Holiday Park': ['offline-booking', 'Info only'],
      'Kingstown Barracks': ['check-dates', 'Check dates'],
    });
    const legend = screen.getByRole('list', { name: 'Map key' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Available', 'Full or not open', 'Not checked']);

    const calls = map.setDataCalls;
    map.emitHover(BUNGARRA.key);
    map.emitHover(null);
    expect(map.setDataCalls).toBe(calls);

    // "Available only" leaves only the available pins.
    await user.click(availableOnly());
    await waitFor(() =>
      expect(map.data.map((p) => p.name).sort()).toEqual(['Bungarra', 'Yardie Creek'])
    );

    // Clearing the dates: names on the pills again, no key, no "avail=1".
    await user.click(screen.getByRole('button', { name: /^When/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Choose dates' })).getByRole('button', {
        name: 'Clear',
      })
    );
    await waitFor(() => expect(map.availability).toBeNull());
    expect(map.pin(BUNGARRA.key)).not.toHaveProperty('avail');
    expect(map.data).toHaveLength(6);
    expect(screen.queryByRole('list', { name: 'Map key' })).toBeNull();
    expect(currentRoute()).toBe('/?adults=2');
  });

  it('pulses the pills while checking and stops once settled; not at all under reduced motion', async () => {
    let answer: () => void = () => undefined;
    const pending = () =>
      jest.fn(
        (stay: StayQuery, options: { providerIds?: string[] } | undefined) =>
          new Promise((resolve) => (answer = () => resolve(answering()(stay, options))))
      ) as AvailabilityStub;
    const { unmount } = await renderExplore(`/?${STAY}`, api(pending()).stubs, /checking/);
    const map = maps.current;
    await waitFor(() => expect(map.pin(BUNGARRA.key)?.availLabel).toBe('···'));
    await waitFor(() => expect(map.pillOpacities).toContain(0.55));
    await act(async () => answer());
    await waitFor(() => expect(map.pin(BUNGARRA.key)?.availLabel).toBe('3 available'));
    expect(map.pillOpacities[map.pillOpacities.length - 1]).toBe(1);
    const settled = map.pillOpacities.length;
    await pause(800);
    expect(map.pillOpacities).toHaveLength(settled);
    unmount();

    setMedia({ reducedMotion: true });
    await renderExplore(`/?${STAY}`, api(pending()).stubs, /checking/);
    await waitFor(() => expect(maps.current.pin(BUNGARRA.key)?.availLabel).toBe('···'));
    await pause(800);
    expect(maps.current.pillOpacities).toEqual([]);
  });

  it('counts availability after the map area: places in view, and how many of them are free', async () => {
    await renderExplore(`/?${STAY}`);
    // Cape Range: Yardie Creek and Bungarra (free) and One K (not open).
    maps.current.emitMove([113.5, -22.6, 114.2, -22]);
    expect(
      await within(results()).findByRole('heading', {
        name: '3 places in map area · 2 available for 6–8 Nov',
      })
    ).toBeInTheDocument();
    expect(cardNames()).toEqual(['Yardie Creek', 'Bungarra', 'One K']);
  });

  it('opens an available place from its card with the same stay', async () => {
    await renderExplore(`/?${STAY}`);
    expect(card('Bungarra')).toHaveAttribute('href', `#/places/parkstay/20?${STAY}`);
  });
});
