/**
 * Maps the legacy booking forms (ParkStay only) to the provider-aware domain types (V2).
 * Watches (U1) and snipes (U2) have their own provider-first forms.
 *
 * The forms keep their own values (date pickers, ParkStay field names) and their look; only
 * what crosses IPC changed. A date input with `valueAsDate` holds UTC midnight of the picked
 * day, and that is the `Date` these helpers convert to calendar dates `YYYY-MM-DD`. U3
 * replaces the forms and this file.
 */

import type { BookingInput, BookingLocationRef, Stay, StayParams } from '../../../shared/types';
import type { BookingSchemaType } from '../../../shared/schemas/booking.schema';

/** The legacy forms create bookings for ParkStay only. */
export const LEGACY_FORM_PROVIDER_ID = 'parkstay';

/** The calendar date a date input's `valueAsDate` means (UTC midnight of the picked day). */
export function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Local midnight of a calendar date, for display: formatted in local time it shows the day
 * the date names, in any time zone. Invalid Date when it is not `YYYY-MM-DD`.
 */
export function stayDate(date: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return new Date(NaN);
  const [year, month, day] = match.slice(1).map(Number);
  const local = new Date(year, month - 1, day);
  local.setFullYear(year);
  return local;
}

/** Everyone in the party. */
export function partySize(stay: Stay): number {
  return stay.adults + stay.children + stay.infants + stay.concessions;
}

/** Stay params without the members a form left empty (the IPC schema rejects undefined). */
function compactParams(params: Record<string, string | number | boolean | undefined>): StayParams {
  const compact: StayParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && !Number.isNaN(value)) compact[key] = value;
  }
  return compact;
}

/** Drops undefined members, so an update changes only what the form gave. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

// ---------------------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------------------

export function bookingFormToInput(form: BookingSchemaType): BookingInput {
  const location: BookingLocationRef = { name: form.campgroundName, areaName: form.parkName };
  return defined({
    providerId: LEGACY_FORM_PROVIDER_ID,
    bookingReference: form.bookingReference,
    location,
    stay: {
      arrival: toCalendarDate(form.arrivalDate),
      departure: toCalendarDate(form.departureDate),
      adults: form.numGuests,
    },
    unitIds: form.siteNumber ? [form.siteNumber] : [],
    stayParams: compactParams({ siteType: form.siteType }),
    totalCost: form.totalCost,
    notes: form.notes,
  });
}
