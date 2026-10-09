/**
 * The facts NightGrid shows, worked out from a provider's per-night availability: which units
 * are free for the whole stay, the summary line, each cell's words, and how dates read. Pure.
 */

import { format } from 'date-fns';
import type { NightState, NightStatus, UnitAvailability } from '../../shared/types/provider.types';
import { eachNight } from '../../shared/utils/calendar-date';
import { parseIsoDate } from './ui/calendar';

/** What one unit is called, and several: `{ one: 'site', many: 'sites' }`. */
export interface UnitNoun {
  one: string;
  many: string;
}

export const DEFAULT_UNIT_NOUN: UnitNoun = { one: 'unit', many: 'units' };

/** Each night of the stay, by the date it starts: the arrival up to, not including, departure. */
export function stayNights(arrival: string, departure: string): string[] {
  return eachNight(arrival, departure);
}

/** A unit's state on one night; a night the provider did not report is `unknown`. */
export function nightOf(unit: UnitAvailability, date: string): NightStatus {
  return unit.nights.find((night) => night.date === date) ?? { date, state: 'unknown' };
}

/** Free on every night of the stay. */
export function isFullyAvailable(unit: UnitAvailability, nights: readonly string[]): boolean {
  return nights.length > 0 && nights.every((date) => nightOf(unit, date).state === 'available');
}

/** Free on some nights of the stay, but not all of them. */
export function isPartlyAvailable(unit: UnitAvailability, nights: readonly string[]): boolean {
  return (
    !isFullyAvailable(unit, nights) &&
    nights.some((date) => nightOf(unit, date).state === 'available')
  );
}

export interface AvailabilitySummary {
  /** Units checked. */
  total: number;
  /** Free for the whole stay. */
  fully: number;
  /** Free for some nights only. */
  partly: number;
  /** With at least one night not released for booking yet. */
  notReleased: number;
  nights: number;
}

export function summariseAvailability(
  units: readonly UnitAvailability[],
  nights: readonly string[]
): AvailabilitySummary {
  let fully = 0;
  let partly = 0;
  let notReleased = 0;
  for (const unit of units) {
    if (isFullyAvailable(unit, nights)) fully += 1;
    else if (isPartlyAvailable(unit, nights)) partly += 1;
    if (nights.some((date) => nightOf(unit, date).state === 'not-released')) notReleased += 1;
  }
  return { total: units.length, fully, partly, notReleased, nights: nights.length };
}

const plural = (count: number, noun: UnitNoun) => (count === 1 ? noun.one : noun.many);

/** "8 of 24 sites free for all 2 nights", or "… free for 1 night". */
export function summaryLine(summary: AvailabilitySummary, noun: UnitNoun): string {
  const span = summary.nights === 1 ? '1 night' : `all ${summary.nights} nights`;
  return `${summary.fully} of ${summary.total} ${plural(summary.total, noun)} free for ${span}`;
}

/** Why "Fully available only" shows no rows, and what to do about it. */
export function noFullRowsMessage(summary: AvailabilitySummary, noun: UnitNoun): string {
  if (summary.partly === 0) return `No ${noun.many} are free on any of these nights.`;
  const span = summary.nights === 1 ? 'that night' : `all ${summary.nights} nights`;
  return `No ${noun.many} are free for ${span}. Turn off "Fully available only" to see ${noun.many} free for some of them.`;
}

/** "$30", or "$30.50" when there are cents. */
export function formatPrice(amount: number, currency = 'AUD'): string {
  const cents = Math.round(amount * 100) % 100 !== 0;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(amount);
}

export const NIGHT_STATE_LABELS: Record<NightState, string> = {
  available: 'Available',
  booked: 'Booked',
  closed: 'Closed',
  'not-released': 'Not released yet',
  unknown: 'Unknown',
};

/**
 * What a cell says. `label` is the whole state in words ("Available, $30"), for screen
 * readers; `short` is the little text shown beside the icon (the price), if any.
 */
export function nightCellText(
  night: NightStatus,
  currency?: string
): { label: string; short?: string } {
  const label = NIGHT_STATE_LABELS[night.state];
  if (night.state === 'available' && night.price !== undefined && Number.isFinite(night.price)) {
    const price = formatPrice(night.price, currency);
    return { label: `${label}, ${price}`, short: price };
  }
  return { label };
}

/**
 * A night's column heading: "Fri 3", with the month on the first night and on the first of a
 * new month ("Sat 31 Oct", "Sun 1 Nov").
 */
export function nightHeading(date: string, previous?: string): string {
  const day = parseIsoDate(date);
  const newMonth = !previous || previous.slice(0, 7) !== date.slice(0, 7);
  return format(day, newMonth ? 'EEE d MMM' : 'EEE d');
}

/**
 * A stay's dates in short: "6–8 Nov", "30 Oct – 2 Nov", or "30 Dec 2026 – 2 Jan 2027" across
 * years (design-language.md, "Voice and tone").
 */
export function stayRangeLabel(arrival: string, departure: string): string {
  const from = parseIsoDate(arrival);
  const to = parseIsoDate(departure);
  if (arrival.slice(0, 4) !== departure.slice(0, 4)) {
    return `${format(from, 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`;
  }
  if (arrival.slice(0, 7) !== departure.slice(0, 7)) {
    return `${format(from, 'd MMM')} – ${format(to, 'd MMM')}`;
  }
  return `${format(from, 'd')}–${format(to, 'd MMM')}`;
}
