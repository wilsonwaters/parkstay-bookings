import type { NightState, UnitAvailability } from '../../shared/types/provider.types';
import {
  formatPrice,
  isFullyAvailable,
  isPartlyAvailable,
  nightCellText,
  nightHeading,
  noFullRowsMessage,
  stayNights,
  stayRangeLabel,
  summariseAvailability,
  summaryLine,
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

describe('summariseAvailability', () => {
  it('counts units free for the whole stay, for some nights, and not released yet', () => {
    const units = [
      unit('a', ['available', 'available']),
      unit('b', ['available', 'booked']),
      unit('c', ['booked', 'booked']),
      unit('d', ['available', 'not-released']),
      unit('e', ['not-released', 'not-released']),
      // A night the provider did not report is unknown, so not free.
      unit('f', ['available', null]),
    ];
    const summary = summariseAvailability(units, NIGHTS);
    expect(summary).toEqual({ total: 6, fully: 1, partly: 3, notReleased: 2, nights: 2 });
    expect(summaryLine(summary, SITE)).toBe('1 of 6 sites free for all 2 nights');
    expect(isFullyAvailable(units[5], NIGHTS)).toBe(false);
    expect(isPartlyAvailable(units[5], NIGHTS)).toBe(true);
  });

  it('reads well for one night and one unit', () => {
    const summary = summariseAvailability([unit('a', ['available', null])], ['2026-11-06']);
    expect(summaryLine(summary, SITE)).toBe('1 of 1 site free for 1 night');
  });

  it('never counts an empty stay as free', () => {
    expect(isFullyAvailable(unit('a', ['available', 'available']), [])).toBe(false);
  });
});

describe('noFullRowsMessage', () => {
  it('suggests turning the switch off only when some units are partly free', () => {
    expect(
      noFullRowsMessage({ total: 3, fully: 0, partly: 2, notReleased: 0, nights: 2 }, SITE)
    ).toBe(
      'No sites are free for all 2 nights. Turn off "Fully available only" to see sites free for some of them.'
    );
    expect(
      noFullRowsMessage({ total: 3, fully: 0, partly: 0, notReleased: 0, nights: 2 }, SITE)
    ).toBe('No sites are free on any of these nights.');
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
