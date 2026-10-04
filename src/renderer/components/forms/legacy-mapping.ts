/**
 * Maps the legacy ParkStay forms to and from the provider-aware domain types (V2).
 *
 * The forms keep their own values (date pickers, ParkStay field names) and their look; only
 * what crosses IPC changed. A date input with `valueAsDate` holds UTC midnight of the picked
 * day, and that is the `Date` these helpers convert to and from calendar dates `YYYY-MM-DD`.
 * The U tasks replace the forms and this file.
 */

import type {
  BookingInput,
  BookingLocationRef,
  SiteSnipe,
  SiteSnipeInput,
  Stay,
  StayParams,
  Watch,
  WatchInput,
  WatchUpdate,
} from '../../../shared/types';
import type { BookingSchemaType } from '../../../shared/schemas/booking.schema';
import type { SiteSnipeSchemaType } from '../../../shared/schemas/site-sniper.schema';
import type { WatchSchemaType } from '../../../shared/schemas/watch.schema';

/** The legacy forms create ParkStay watches, snipes and bookings only. */
export const LEGACY_FORM_PROVIDER_ID = 'parkstay';

/** The calendar date a date input's `valueAsDate` means (UTC midnight of the picked day). */
export function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** UTC midnight of a calendar date: the `Date` a date input's `valueAsDate` holds for it. */
export function formDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
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

/** A stay field as text, or undefined when it is not set. */
export function stayParamText(params: StayParams | undefined, key: string): string | undefined {
  const value = params?.[key];
  return value === undefined || value === '' ? undefined : String(value);
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
// Watches
// ---------------------------------------------------------------------------------------

export function watchFormToInput(form: WatchSchemaType): WatchInput {
  return defined({
    providerId: LEGACY_FORM_PROVIDER_ID,
    name: form.name,
    location: { externalId: form.campgroundId, name: form.campgroundName, areaName: form.parkName },
    stay: {
      arrival: toCalendarDate(form.arrivalDate),
      departure: toCalendarDate(form.departureDate),
      adults: form.numGuests,
    },
    unitIds: form.preferredSites,
    stayParams: compactParams({ parkId: form.parkId, gearType: form.siteType }),
    checkIntervalMinutes: form.checkIntervalMinutes,
    autoBook: form.autoBook,
    notifyOnly: form.notifyOnly,
    allowPartialMatch: form.allowPartialMatch,
    maxPrice: form.maxPrice,
    notes: form.notes,
  });
}

/** The watch form as an update: everything but the provider, which never changes. */
export function watchFormToUpdate(form: WatchSchemaType): WatchUpdate {
  const input: Partial<WatchInput> = watchFormToInput(form);
  delete input.providerId;
  return input;
}

/** The watch form's starting values for an existing watch. */
export function watchToFormValues(watch: Partial<Watch> | undefined): Partial<WatchSchemaType> {
  return {
    name: watch?.name || '',
    parkId: stayParamText(watch?.stayParams, 'parkId') || '',
    parkName: watch?.location?.areaName || '',
    campgroundId: watch?.location?.externalId || '',
    campgroundName: watch?.location?.name || '',
    arrivalDate: watch?.stay ? formDate(watch.stay.arrival) : new Date(),
    departureDate: watch?.stay ? formDate(watch.stay.departure) : new Date(),
    numGuests: (watch?.stay && partySize(watch.stay)) || 2,
  };
}

// ---------------------------------------------------------------------------------------
// Site Sniper
// ---------------------------------------------------------------------------------------

export function snipeFormToInput(form: SiteSnipeSchemaType): SiteSnipeInput {
  return defined({
    providerId: LEGACY_FORM_PROVIDER_ID,
    name: form.name,
    location: { externalId: form.campgroundId, name: form.campgroundName ?? '' },
    stay: {
      arrival: toCalendarDate(form.arrivalDate),
      departure: toCalendarDate(form.departureDate),
      adults: form.numAdult,
      children: form.numChild,
      infants: form.numInfant,
      concessions: form.numConcession,
    },
    unitIds: form.targetSiteIds,
    stayParams: compactParams({
      gearType: form.siteType,
      numVehicles: form.numVehicle,
      postcode: form.postcode,
    }),
    releaseMode: form.releaseMode,
    releaseAt: form.releaseAt,
    accessGateEnabled: form.queueEnabled,
    leadTimeSeconds: form.leadTimeSeconds,
    pollIntervalMs: form.pollIntervalMs,
    windowDurationMs: form.windowDurationMs,
    maxAttempts: form.maxAttempts,
    notes: form.notes,
  });
}

/** The snipe form's starting values for an existing snipe (ParkStay stay fields). */
export function snipeToFormValues(
  snipe: Partial<SiteSnipe> | undefined
): Partial<SiteSnipeSchemaType> {
  const gearType = stayParamText(snipe?.stayParams, 'gearType');
  const numVehicles = snipe?.stayParams?.numVehicles;
  return {
    campgroundId: snipe?.location?.externalId || '',
    campgroundName: snipe?.location?.name || '',
    targetSiteIds: snipe?.unitIds || [],
    siteType: (gearType as SiteSnipeSchemaType['siteType'] | undefined) || 'all',
    arrivalDate: snipe?.stay ? formDate(snipe.stay.arrival) : new Date(),
    departureDate: snipe?.stay
      ? formDate(snipe.stay.departure)
      : new Date(Date.now() + 24 * 60 * 60 * 1000),
    numAdult: snipe?.stay?.adults ?? 2,
    numConcession: snipe?.stay?.concessions ?? 0,
    numChild: snipe?.stay?.children ?? 0,
    numInfant: snipe?.stay?.infants ?? 0,
    numVehicle: typeof numVehicles === 'number' ? numVehicles : 1,
    postcode: stayParamText(snipe?.stayParams, 'postcode'),
    queueEnabled: snipe?.accessGateEnabled ?? false,
  };
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
