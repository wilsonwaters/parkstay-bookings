/**
 * Maps the legacy ParkStay snipe form to and from the provider-aware domain types (V2).
 * Watches (U1) and bookings (U3) have their own provider-first forms.
 *
 * The forms keep their own values (date pickers, ParkStay field names) and their look; only
 * what crosses IPC changed. A date input with `valueAsDate` holds UTC midnight of the picked
 * day, and that is the `Date` these helpers convert to and from calendar dates `YYYY-MM-DD`.
 * The U tasks replace the forms and this file.
 */

import type { SiteSnipe, SiteSnipeInput, StayParams } from '../../../shared/types';
import type { RefCallback } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import type { CreatePrefill } from '../../app/routes';
import type { SiteSnipeSchemaType } from '../../../shared/schemas/site-sniper.schema';

/** The legacy form creates ParkStay snipes only. */
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

/**
 * A date input's ref that also shows the field's starting `Date`. react-hook-form writes a
 * `Date` default into the input's `value` as text the input rejects, so the input showed empty
 * (when editing, or when E2's prefill fills the form) while the form kept the date.
 */
export function dateInputRef(
  field: UseFormRegisterReturn,
  value: () => unknown
): RefCallback<HTMLInputElement> {
  return (input) => {
    field.ref(input);
    if (!input || input.value) return;
    const date = value();
    if (date instanceof Date && !Number.isNaN(date.getTime())) input.valueAsDate = date;
  };
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
// Site Sniper
// ---------------------------------------------------------------------------------------

/**
 * The legacy snipe form's starting values from a create flow's prefill query (§12.10), until
 * U2 rebuilds the form. ParkStay only; adults and children go to their own fields.
 */
export function snipeFromPrefill(
  prefill: CreatePrefill,
  place: { name: string } | undefined
): Partial<SiteSnipe> | undefined {
  if (prefill.provider !== LEGACY_FORM_PROVIDER_ID) return undefined;
  const snipe: Partial<SiteSnipe> = {};
  if (prefill.location && place?.name) {
    snipe.location = { externalId: prefill.location, name: place.name };
  }
  if (prefill.arrival && prefill.departure) {
    snipe.stay = {
      arrival: prefill.arrival,
      departure: prefill.departure,
      adults: prefill.adults ?? 2,
      children: prefill.children ?? 0,
      infants: 0,
      concessions: 0,
    };
  }
  return snipe;
}

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
