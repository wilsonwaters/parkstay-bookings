/**
 * `HoldPaymentService` on a FakeProvider (nothing ParkStay-specific), a real database and
 * in-memory windows:
 * - the window request: the provider's payment page, its payment and sign-in origins, nothing
 *   opened externally; a payment page off those origins is `PROVIDER_ERROR`;
 * - the provider's `bookedReference` decides when a hold is paid; a provider without one
 *   never records a booking;
 * - the BOOKED status and the booking are one transaction (a failed booking write leaves the
 *   snipe HELD); a deleted snipe records nothing;
 * - closing the window calls `onWindowClosed` once; after `dispose`, pages and closes do
 *   nothing.
 */

import { BookingService } from '@main/core/bookings/booking.service';
import { HoldPaymentService } from '@main/core/holds/hold-payment.service';
import { BookingRepository } from '@main/database/repositories';
import { toApiError } from '@main/providers/sdk/errors';
import { SnipeStatus, WatchResult } from '@shared/types/common.types';
import { createCoreHarness, type CoreHarness } from '@tests/utils/core-harness';
import { createFakeProvider, createMemoryLogger } from '@tests/utils/fake-provider';
import { FakeOpener } from '@tests/utils/fake-provider-windows';

const MINUTE = 60_000;

describe('HoldPaymentService', () => {
  let h: CoreHarness;
  let bookings: BookingService;
  let windows: FakeOpener;
  let notifications: { notifySnipeBooked: jest.Mock; notifyBookingConfirmed: jest.Mock };
  let onWindowClosed: jest.Mock;
  let logger: ReturnType<typeof createMemoryLogger>;
  let service: HoldPaymentService;

  function setUp(provider = createFakeProvider()): void {
    h = createCoreHarness({ providers: [provider] });
    bookings = new BookingService({
      bookings: new BookingRepository(h.db),
      providers: h.registry,
      events: h.events,
    });
    windows = new FakeOpener();
    notifications = {
      notifySnipeBooked: jest.fn().mockResolvedValue(undefined),
      notifyBookingConfirmed: jest.fn().mockResolvedValue(undefined),
    };
    onWindowClosed = jest.fn();
    logger = createMemoryLogger();
    service = new HoldPaymentService({
      providers: h.registry,
      snipes: h.snipeRepo,
      watches: h.watchRepo,
      bookings,
      notifications,
      windows,
      events: h.events,
      transaction: (fn) => h.db.transaction(fn)(),
      onWindowClosed,
      logger,
    });
  }

  afterEach(async () => {
    service.dispose();
    await h.close();
  });

  /** A snipe of the first provider holding u1 as FAKE-1 for 20 more minutes (a seeded row). */
  function heldSnipe(reference = 'FAKE-1') {
    const snipe = h.snipeRepo.create(h.userId, h.snipeInput());
    h.snipeRepo.markHeld(
      snipe.id,
      reference,
      new Date(Date.now() + 20 * MINUTE),
      `https://fake.example/pay/${reference}`,
      'u1'
    );
    return h.snipeRepo.findById(snipe.id)!;
  }

  const emitted = () => h.events.emit.mock.calls.map(([name]) => name);
  const allBookings = () => new BookingRepository(h.db).findByUserId(h.userId);

  it("asks for a payment window on the provider's payment page, its payment and sign-in origins", async () => {
    setUp(
      createFakeProvider({
        auth: { allowedOrigins: ['https://fake.example', 'https://id.example'] },
      })
    );
    const snipe = heldSnipe();
    await service.openForSnipe(snipe.id);

    expect(windows.requests).toEqual([
      {
        providerId: 'fake',
        providerName: 'Fake',
        kind: 'payment',
        url: 'https://fake.example/pay/FAKE-1',
        allowedOrigins: ['https://fake.example', 'https://id.example'],
        openBlockedExternally: false,
      },
    ]);
  });

  it("a payment page off the provider's payment origins is PROVIDER_ERROR, and no window opens", async () => {
    setUp();
    jest.spyOn(h.fake.holds!, 'paymentUrl').mockReturnValue('https://elsewhere.example/pay/FAKE-1');
    const error = await service.openForSnipe(heldSnipe().id).catch((e: unknown) => e);

    expect(toApiError(error).code).toBe('PROVIDER_ERROR');
    expect(windows.requests).toEqual([]);
  });

  it("the provider's bookedReference decides: its paid page books the snipe as BK-FAKE-1", async () => {
    setUp();
    const snipe = heldSnipe();
    await service.openForSnipe(snipe.id);
    h.events.emit.mockClear();

    windows.last.navigate('https://fake.example/pay/FAKE-1/step-2');
    expect(h.snipeRepo.findById(snipe.id)?.status).toBe(SnipeStatus.HELD);

    windows.last.navigate('https://fake.example/paid/FAKE-1?receipt=1');
    expect(h.snipeRepo.findById(snipe.id)).toMatchObject({
      status: SnipeStatus.BOOKED,
      bookedReference: 'BK-FAKE-1',
    });
    expect(allBookings()).toEqual([
      expect.objectContaining({
        providerId: 'fake',
        bookingReference: 'BK-FAKE-1',
        unitIds: ['u1'],
      }),
    ]);
    expect(emitted()).toEqual(['snipe:updated', 'booking:updated']);
    expect(notifications.notifySnipeBooked).toHaveBeenCalledWith(
      expect.objectContaining({ id: snipe.id, bookedReference: 'BK-FAKE-1' })
    );
  });

  it('a provider without bookedReference never records a booking', async () => {
    setUp();
    delete (h.fake.holds as { bookedReference?: unknown }).bookedReference;
    const snipe = heldSnipe();
    await service.openForSnipe(snipe.id);

    windows.last.navigate('https://fake.example/paid/FAKE-1');
    expect(h.snipeRepo.findById(snipe.id)?.status).toBe(SnipeStatus.HELD);
    expect(allBookings()).toEqual([]);
  });

  it('a failed booking write rolls the BOOKED status back (one transaction)', async () => {
    setUp();
    const snipe = heldSnipe();
    await service.openForSnipe(snipe.id);
    jest.spyOn(bookings, 'recordConfirmed').mockImplementation(() => {
      throw new Error('disk full');
    });

    windows.last.navigate('https://fake.example/paid/FAKE-1');

    expect(h.snipeRepo.findById(snipe.id)?.status).toBe(SnipeStatus.HELD);
    expect(allBookings()).toEqual([]);
    expect(logger.lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: 'Payment for snipe 1 completed (BK-FAKE-1) but was not recorded',
      })
    );
  });

  it('a snipe deleted while paying records nothing', async () => {
    setUp();
    const snipe = heldSnipe();
    await service.openForSnipe(snipe.id);
    h.snipeRepo.deleteById(snipe.id);

    windows.last.navigate('https://fake.example/paid/FAKE-1');
    expect(allBookings()).toEqual([]);
    expect(logger.lines).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('deleted') })
    );
  });

  it('a watch hold on the fake provider books the watch', async () => {
    setUp();
    const watch = h.watchRepo.create(h.userId, h.watchInput({ autoHold: true }));
    h.watchRepo.markHeld(watch.id, {
      reference: 'FAKE-7',
      expiresAt: new Date(Date.now() + 20 * MINUTE),
      unitId: 'u2',
    });
    await service.openForWatch(watch.id);
    expect(windows.last.url).toBe('https://fake.example/pay/FAKE-7');

    windows.last.navigate('https://fake.example/paid/FAKE-7');
    expect(h.watchRepo.findById(watch.id)?.lastResult).toBe(WatchResult.BOOKED);
    const [booking] = allBookings();
    expect(booking).toMatchObject({ bookingReference: 'BK-FAKE-7', unitIds: ['u2'] });
    expect(notifications.notifyBookingConfirmed).toHaveBeenCalledWith(
      h.userId,
      'fake',
      booking.id,
      'BK-FAKE-7'
    );
  });

  it('closing the window calls onWindowClosed once; after dispose, pages and closes do nothing', async () => {
    setUp();
    const first = heldSnipe('FAKE-1');
    await service.openForSnipe(first.id);
    windows.last.close();
    expect(onWindowClosed).toHaveBeenCalledTimes(1);
    expect(onWindowClosed).toHaveBeenCalledWith('fake');

    await service.openForSnipe(first.id);
    service.dispose();
    windows.last.navigate('https://fake.example/paid/FAKE-1');
    windows.last.close();

    expect(h.snipeRepo.findById(first.id)?.status).toBe(SnipeStatus.HELD);
    expect(onWindowClosed).toHaveBeenCalledTimes(1);
  });
});
