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
 *
 * Payment: `create_booking` also sets `session['checkouthash'] = sha256(str(pk))`
 * (`api.py:3375`), and the payment ledger returns to `/success/?checkouthash=<that hash>`
 * (`utils.py:1766`). `/success/` alone proves nothing: it also serves `success-error.html`,
 * or another booking's page. So a booking is recorded only for `/success/` on ParkStay with
 * the hold's own hash; its reference is ParkStay's `PB` + pk (`BOOKING_PREFIX`).
 */

import { createHash } from 'crypto';
import type { ProviderContext } from '../sdk/context';
import { throwIfAborted } from '../sdk/errors';
import type { HoldRequest, HoldResult, HoldsModule, HoldSuccess } from '../sdk/provider';
import type { CampgroundFacts } from './catalog';
import { toParkStayDate, type ParkStayClient } from './client';
import { BOOKING_PREFIX, HOLD_MINUTES, PARKSTAY_BASE_URL, PAYMENT_ORIGINS } from './constants';
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
  ctx: Pick<ProviderContext, 'id' | 'clock' | 'logger'>;
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
    paymentOrigins: PAYMENT_ORIGINS,
    bookedReference(hold, url) {
      const page = successPage(url);
      if (!page) return null;
      if (page.checkouthash !== checkoutHash(hold.reference)) {
        // Another booking's confirmation, or ParkStay's error page: not this hold's payment
        ctx.logger.warn('Payment window: a /success/ page that is not for this hold; ignored');
        return null;
      }
      return `${BOOKING_PREFIX}${hold.reference}`;
    },
  };
}

/** `sha256(str(pk))` as hex, as `create_booking` stores it (`api.py:3375`). */
export function checkoutHash(reference: string): string {
  return createHash('sha256').update(reference, 'utf8').digest('hex');
}

/** ParkStay's `/success/` page and its `checkouthash`, or null for any other URL. */
function successPage(url: string): { checkouthash: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== PARKSTAY_BASE_URL) return null;
  if (parsed.pathname !== '/success' && !parsed.pathname.startsWith('/success/')) return null;
  return { checkouthash: (parsed.searchParams.get('checkouthash') ?? '').toLowerCase() };
}
