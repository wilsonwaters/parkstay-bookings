/**
 * ParkStay temporary holds: `POST /api/create_booking` (CSRF-exempt, form-encoded) puts a
 * 30-minute booking for one site (or, at campgrounds listed by class, one site of a class)
 * in the session (`api.py:2938-3380`). The booking id goes into the session as `ps_booking`,
 * so the person pays on the same session at `/booking/` (`api.py:3373-3376`): the payment
 * window must use the provider's partition.
 *
 * Answers: `{status:'success', pk}`; 400 `{inprogress_booking:true}` when the session
 * already has a booking; 400 "The system is currently closed for bookings."; any other 400
 * when the site was taken or the request was refused.
 */

import type { ProviderContext } from '../sdk/context';
import { throwIfAborted } from '../sdk/errors';
import type { HoldRequest, HoldResult, HoldsModule, HoldSuccess } from '../sdk/provider';
import type { CampgroundFacts } from './catalog';
import { toParkStayDate, type ParkStayClient } from './client';
import { HOLD_MINUTES, PARKSTAY_BASE_URL } from './constants';
import type { RawCreateBookingResponse } from './types';

/** `msg` as text: a string, `{ error }`, or anything else serialised. */
function messageOf(body: RawCreateBookingResponse | undefined, fallback: string): string {
  const msg = body?.msg;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  if (msg && typeof msg === 'object') {
    const error = (msg as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) {
      // Some refusals are HTML fragments meant for the ParkStay page.
      return error
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return JSON.stringify(msg);
  }
  return fallback;
}

function numberParam(request: HoldRequest, key: string): number | undefined {
  const value = request.stay.params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringParam(request: HoldRequest, key: string): string | undefined {
  const value = request.stay.params?.[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export interface HoldsDeps {
  ctx: Pick<ProviderContext, 'id' | 'clock'>;
  client: ParkStayClient;
  facts: CampgroundFacts;
  /** A fully available unit for the stay, from a fresh availability check, if there is one. */
  findFreeUnit(
    externalId: string,
    stay: HoldRequest['stay'],
    signal?: AbortSignal
  ): Promise<string | undefined>;
}

/** The form fields `create_booking` reads (`api.py:2986-3003`). */
export function createBookingForm(
  request: HoldRequest,
  facts?: CampgroundFacts
): Record<string, string> {
  const { stay, externalId, unitId } = request;
  const form: Record<string, string> = {
    arrival: toParkStayDate(stay.arrival),
    departure: toParkStayDate(stay.departure),
    num_adult: String(stay.adults),
    num_concession: String(stay.concessions ?? 0),
    num_child: String(stay.children ?? 0),
    num_infant: String(stay.infants ?? 0),
    num_vehicle: String(numberParam(request, 'numVehicles') ?? 1),
    num_campervan: '0',
    num_caravan: '0',
    num_motorcycle: '0',
    num_trailer: '0',
    campground: externalId,
    // ParkStay's page sends it empty; `create_booking` fails on a missing one (`int(None)`).
    change_booking_id: '',
  };
  const postcode = stringParam(request, 'postcode');
  if (postcode) form.postcode = postcode;

  // A campground listed by class is booked by class; the view said which class a unit is in.
  const view = facts?.view(externalId);
  const unitClass =
    unitId && view && view.siteType !== 0 ? view.classOfUnit.get(unitId) : undefined;
  const campsiteClass = request.unitGroupId ?? unitClass;
  if (unitId && !unitClass) form.campsite = unitId;
  else if (campsiteClass) form.campsite_class = campsiteClass;
  return form;
}

export function createHolds({ ctx, client, facts, findFreeUnit }: HoldsDeps): HoldsModule {
  async function create(request: HoldRequest, signal?: AbortSignal): Promise<HoldResult> {
    throwIfAborted(signal);
    // Any unit will do: take the first one that is free for the whole stay.
    if (!request.unitId && !request.unitGroupId) {
      const unitId = await findFreeUnit(request.externalId, request.stay, signal);
      if (!unitId) return { ok: false, reason: 'taken', message: 'No site is free for the stay' };
      request = { ...request, unitId };
    }
    const form = createBookingForm(request, facts);
    const { status, body } = await client.postApiForm('/create_booking', form, { signal });
    const answer = (
      typeof body === 'object' && body !== null ? body : {}
    ) as RawCreateBookingResponse;

    if (status < 300 && answer.status === 'success' && answer.pk !== undefined) {
      const hold: HoldSuccess = {
        ok: true,
        reference: String(answer.pk),
        expiresAt: new Date(ctx.clock().getTime() + HOLD_MINUTES * 60_000),
      };
      if (form.campsite) hold.unitId = form.campsite;
      else if (request.unitId) hold.unitId = request.unitId;
      return hold;
    }
    if (answer.inprogress_booking) {
      return {
        ok: false,
        reason: 'in-progress',
        message: messageOf(answer, 'A booking is already in progress in this session'),
      };
    }
    const message = messageOf(answer, 'ParkStay did not place the hold');
    if (/closed for bookings/i.test(message)) return { ok: false, reason: 'closed', message };
    // A refusal at this point is almost always the site going between the check and the hold.
    return { ok: false, reason: status >= 400 ? 'taken' : 'error', message };
  }

  return {
    create,
    paymentUrl: () => `${PARKSTAY_BASE_URL}/booking/`,
    paymentOrigins: [PARKSTAY_BASE_URL],
  };
}
