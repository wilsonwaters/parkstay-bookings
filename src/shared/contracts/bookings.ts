/**
 * `bookings`: the local booking records. The renderer never sends a user id; main acts for
 * the local profile.
 */

import { z } from 'zod';
import type { Booking, BookingInput } from '../types/booking.types';
import { CHANNELS } from './channels';
import { id, idPayload, Namespace } from './define';

const C = CHANNELS.bookings;

/**
 * A booking as the renderer sends it. Field types only: the cross-field rules (departure
 * after arrival, guest limits) stay in `BookingService`.
 */
export const bookingInputSchema = z.object({
  bookingReference: z.string().min(1),
  parkName: z.string(),
  campgroundName: z.string(),
  siteNumber: z.string().optional(),
  siteType: z.string().optional(),
  arrivalDate: z.date(),
  departureDate: z.date(),
  numGuests: z.number().int(),
  totalCost: z.number().optional(),
  notes: z.string().optional(),
});

export const bookings = {
  list: { channel: C.list, request: z.void(), args: {} as [], response: {} as Booking[] },
  get: {
    channel: C.get,
    request: idPayload,
    args: {} as [id: number],
    response: {} as Booking | null,
  },
  create: {
    channel: C.create,
    request: bookingInputSchema,
    args: {} as [input: BookingInput],
    response: {} as Booking,
  },
  update: {
    channel: C.update,
    request: z.object({ id, updates: bookingInputSchema.partial() }),
    args: {} as [id: number, updates: Partial<BookingInput>],
    response: {} as Booking,
  },
  delete: {
    channel: C.delete,
    request: idPayload,
    args: {} as [id: number],
    response: {} as boolean,
  },
  sync: { channel: C.sync, request: idPayload, args: {} as [id: number], response: {} as Booking },
  syncAll: { channel: C.syncAll, request: z.void(), args: {} as [], response: {} as boolean },
  import: {
    channel: C.import,
    request: z.object({ bookingReference: z.string().min(1) }),
    args: {} as [bookingReference: string],
    response: {} as Booking,
  },
} satisfies Namespace;
