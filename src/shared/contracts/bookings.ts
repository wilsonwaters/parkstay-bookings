/**
 * `bookings`: the local booking records. The renderer never sends a user id; main acts for
 * the local profile.
 */

import { z } from 'zod';
import type { Booking, BookingInput, BookingUpdate } from '../types/booking.types';
import { ProviderIdSchema, StayParamsSchema } from '../types/provider.types';
import { BookingLocationRefSchema, StayInputSchema } from '../types/stay.types';
import { assertTypeEquals } from '../utils/type-equality';
import { CHANNELS } from './channels';
import { id, idPayload, Namespace } from './define';

const C = CHANNELS.bookings;

/**
 * A booking as the renderer sends it. Field types only (plus the stay's own date order):
 * the other cross-field rules (guest limits) stay in `BookingService`. Stay dates are
 * calendar dates `YYYY-MM-DD`.
 */
export const bookingInputSchema = z.object({
  providerId: ProviderIdSchema,
  bookingReference: z.string().min(1),
  location: BookingLocationRefSchema,
  stay: StayInputSchema,
  unitIds: z.array(z.string()).optional(),
  stayParams: StayParamsSchema.optional(),
  totalCost: z.number().optional(),
  notes: z.string().optional(),
});
assertTypeEquals<z.input<typeof bookingInputSchema>, BookingInput>(true);
assertTypeEquals<z.output<typeof bookingInputSchema>, BookingInput>(true);

/** An update: any field but the provider. */
export const bookingUpdateSchema = bookingInputSchema.omit({ providerId: true }).partial();
assertTypeEquals<z.input<typeof bookingUpdateSchema>, BookingUpdate>(true);
assertTypeEquals<z.output<typeof bookingUpdateSchema>, BookingUpdate>(true);

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
    request: z.object({ id, updates: bookingUpdateSchema }),
    args: {} as [id: number, updates: BookingUpdate],
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
