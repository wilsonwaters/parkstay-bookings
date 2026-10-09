import type { NightState, UnitAvailability } from '../../shared/types/provider.types';
import {
  formatPrice,
  isFullyAvailable,
  nightCellText,
  nightHeading,
  noFullRowsMessage,
  stayNights,
  stayRangeLabel,
  summariseAvailability,
  summaryLine,
  summaryNotes,
  unitStanding,
} from './nightGrid';

const SITE = { one: 'site', many: 'sites' };
const NIGHTS = ['2026-11-06', '2026-11-07'];

function unit(id: string, states: (NightState | null)[]): UnitAvailability {
  const nights = NIGHTS.flatMap((date, i) =>
    states[i] === null ? [] : [{ date, state: states[i] as NightState }]
  );
  return {
    unitId: id,
    unitName: id,
    nights,
    fullyAvailable: nights.length === NIGHTS.length && nights.every((n) => n.state === 'available'),
  };
}

describe('stayNights', () => {
  it('has one night per date from arrival to the night before departure', () => {
    expect(stayNights('2026-11-06', '2026-11-08')).toEqual(NIGHTS);
    expect(stayNights('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
  });
});

const summaryOf = (over: Partial<ReturnType<typeof summariseAvailability>>) => ({
  total: 0,
  known: 0,
  fully: 0,
  partly: 0,
  notReleased: 0,
  unknown: 0,
  nights: 2,
  ...over,
});

describe('unitStanding', () => {
  it('lets only known nights decide: booked or closed takes a unit, nothing else does', () => {
    expect(unitStanding(unit('a', ['available', 'available']), NIGHTS)).toBe('free');
    expect(unitStanding(unit('b', ['available', 'booked']), NIGHTS)).toBe('taken');
    expect(unitStanding(unit('c', ['closed', null]), NIGHTS)).toBe('taken');
    expect(unitStanding(unit('d', ['available', 'not-released']), NIGHTS)).toBe('not-released');
    expect(unitStanding(unit('e', ['available', null]), NIGHTS)).toBe('unknown');
    expect(unitStanding(unit('f', [null, null]), NIGHTS)).toBe('unknown');
    // An empty stay is never free.
    expect(unitStanding(unit('g', ['available', 'available']), [])).toBe('unknown');
    expect(isFullyAvailable(unit('g', ['available', 'available']), [])).toBe(false);
  });
});

describe('summariseAvailability', () => {
  it('counts only units whose known nights settle the stay, and notes the rest', () => {
    const units = [
      unit('a', ['available', 'available']),
      unit('b', ['available', 'booked']),
      unit('c', ['booked', 'booked']),
      unit('d', ['available', 'not-released']),
      unit('e', ['not-released', 'not-released']),
      // A night the provider did not report is unknown: not free, and not taken either.
      unit('f', ['available', null]),
    ];
    const summary = summariseAvailability(units, NIGHTS);
    expect(summary).toEqual({
      total: 6,
      known: 3,
      fully: 1,
      partly: 1,
      notReleased: 2,
      unknown: 1,
      nights: 2,
    });
    expect(summaryLine(summary, SITE, 'ParkStay')).toBe('1 of 3 sites free for all 2 nights');
    expect(summaryNotes(summary, SITE, 'ParkStay')).toEqual([
      "2 more sites have nights that aren't released yet.",
      "ParkStay didn't say which nights are free for 1 more site.",
    ]);
  });

  it("says the provider didn't say when no night is known (a class-listed place)", () => {
    const summary = summariseAvailability([unit('class', [null, null])], NIGHTS);
    expect(summary).toMatchObject({ total: 1, known: 0, unknown: 1 });
    expect(summaryLine(summary, SITE, 'ParkStay')).toBe(
      "ParkStay didn't say which nights are free; check on ParkStay"
    );
    expect(summaryNotes(summary, SITE, 'ParkStay')).toEqual([]);
    expect(noFullRowsMessage(summary, SITE)).toBe(
      'Turn off "Fully available only" to see each site\'s nights.'
    );
  });

  it("says the nights aren't released yet when none is, never that they are taken", () => {
    const summary = summariseAvailability(
      [unit('a', ['not-released', 'not-released']), unit('b', ['not-released', null])],
      NIGHTS
    );
    expect(summaryLine(summary, SITE, 'ParkStay')).toBe(
      "These nights aren't released for booking yet"
    );
    expect(summaryNotes(summary, SITE, 'ParkStay')).toEqual([]);
    expect(noFullRowsMessage(summary, SITE)).not.toMatch(/No sites are free/);
  });

  it('reads well for one night and one unit', () => {
    const summary = summariseAvailability([unit('a', ['available', null])], ['2026-11-06']);
    expect(summaryLine(summary, SITE, 'ParkStay')).toBe('1 of 1 site free for 1 night');
  });
});

describe('noFullRowsMessage', () => {
  it('suggests turning the switch off when some units are partly free, or unsettled', () => {
    expect(noFullRowsMessage(summaryOf({ total: 3, known: 3, partly: 2 }), SITE)).toBe(
      'No sites are free for all 2 nights. Turn off "Fully available only" to see sites free for some of them.'
    );
    expect(noFullRowsMessage(summaryOf({ total: 3, known: 3 }), SITE)).toBe(
      'No sites are free for all 2 nights.'
    );
    expect(noFullRowsMessage(summaryOf({ total: 3, known: 2, notReleased: 1 }), SITE)).toBe(
      'No sites are free for all 2 nights. Turn off "Fully available only" to see each site\'s nights.'
    );
  });
});

describe('nightCellText', () => {
  it('says the state in words, with the price of an available night', () => {
    expect(nightCellText({ date: '2026-11-06', state: 'available', price: 30 })).toEqual({
      label: 'Available, $30',
      short: '$30',
    });
    expect(nightCellText({ date: '2026-11-06', state: 'available' })).toEqual({
      label: 'Available',
    });
    expect(nightCellText({ date: '2026-11-06', state: 'booked', price: 30 })).toEqual({
      label: 'Booked',
    });
    expect(nightCellText({ date: '2026-11-06', state: 'closed' }).label).toBe('Closed');
    expect(nightCellText({ date: '2026-11-06', state: 'not-released' }).label).toBe(
      'Not released yet'
    );
    expect(nightCellText({ date: '2026-11-06', state: 'unknown' }).label).toBe('Unknown');
  });
});

describe('formatPrice', () => {
  it('shows cents only when there are some', () => {
    expect(formatPrice(30)).toBe('$30');
    expect(formatPrice(30.5)).toBe('$30.50');
    expect(formatPrice(1234)).toBe('$1,234');
  });
});

describe('nightHeading', () => {
  it('is the weekday and day, with the month on the first night and a new month', () => {
    expect(nightHeading('2026-10-30')).toBe('Fri 30 Oct');
    expect(nightHeading('2026-10-31', '2026-10-30')).toBe('Sat 31');
    expect(nightHeading('2026-11-01', '2026-10-31')).toBe('Sun 1 Nov');
  });
});

describe('stayRangeLabel', () => {
  it('shortens a range within a month, and spells out months and years when they change', () => {
    expect(stayRangeLabel('2026-11-06', '2026-11-08')).toBe('6–8 Nov');
    expect(stayRangeLabel('2026-10-30', '2026-11-02')).toBe('30 Oct – 2 Nov');
    expect(stayRangeLabel('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
  });
});
