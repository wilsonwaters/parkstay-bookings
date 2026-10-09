/**
 * `HoldPaymentService`: paying for a hold in the app (architecture-notes §12.31, §12.32).
 *
 * `openForSnipe(id)` and `openForWatch(id)` open the provider's payment page in a payment
 * window on the provider's session partition, the one its HTTP client placed the hold with
 * (ParkStay keeps the hold in that session as `ps_booking`, so `/booking/` shows it). They
 * resolve once the window is open, not when payment ends.
 *
 * - **Preconditions:** the row exists (`NOT_FOUND`); its provider has holds (`CAPABILITY`);
 *   it holds a site that has not expired (`HOLD_EXPIRED`). The payment URL must be on the
 *   provider's own origins (`PROVIDER_ERROR`).
 * - **The window** may show the provider's payment origins and its sign-in origins (the
 *   person may sign in while paying). One payment window per provider: a provider session
 *   holds one booking at a time. Asking again for the same hold focuses it; asking for another
 *   one focuses it and answers `VALIDATION`.
 * - **Paid:** a page the window shows that the provider's `holds.bookedReference` recognises
 *   as this hold's confirmation (ParkStay: `/success/` with the hold's own `checkouthash`)
 *   marks the snipe BOOKED (from HELD, or EXPIRED: the hash proves the payment even after the
 *   hold timer fired) or the watch booked, and records the confirmed booking, in one
 *   transaction. Then `snipe:updated` or `watch:updated`, `booking:updated`, and a
 *   notification. A repeat (the page reloaded) changes nothing.
 * - **Closed** before paying: nothing changes; payment can open again until the hold expires.
 *   Once a payment window closes, `onWindowClosed` lets the account service check the account
 *   once (the person may have signed in on the payment page).
 */

import type { EventSink } from '@shared/contracts/events';
import type { BookingInput, SiteSnipe, Watch } from '@shared/types';
import { SnipeStatus, WatchResult } from '@shared/types/common.types';
import type { ProviderId } from '@shared/types/provider.types';
import type { SiteSniperRepository, WatchRepository } from '../../database/repositories';
import type { ProviderRegistry, ProviderWith } from '../../providers/registry';
import type { ProviderLogger } from '../../providers/sdk/context';
import { ProviderError } from '../../providers/sdk/errors';
import type { HoldSuccess } from '../../providers/sdk/provider';
import { matchesOrigin } from '../../providers/sdk/url-patterns';
import { AppError } from '../../utils/app-error';
import type {
  ProviderWindowHandle,
  ProviderWindowNavigation,
  ProviderWindowOpener,
} from '../accounts/ports';
import type { BookingService } from '../bookings/booking.service';
import type { NotificationService } from '../notifications/notification.service';

/** What is being paid for: a snipe's or a watch's hold, by its provider reference. */
export interface PaymentSubject {
  kind: 'snipe' | 'watch';
  id: number;
  providerId: ProviderId;
  /** The provider's reference for the hold. */
  reference: string;
}

export interface HoldPaymentDeps {
  providers: Pick<ProviderRegistry, 'require' | 'tryGet'>;
  snipes: Pick<SiteSniperRepository, 'findById' | 'setBooked'>;
  watches: Pick<WatchRepository, 'findById' | 'setBooked'>;
  bookings: Pick<BookingService, 'recordConfirmed' | 'announce'>;
  notifications: Pick<NotificationService, 'notifySnipeBooked' | 'notifyBookingConfirmed'>;
  windows: ProviderWindowOpener;
  events: EventSink;
  /** Runs `fn` in one database transaction. */
  transaction<T>(fn: () => T): T;
  /** A payment window of the provider closed (not on quit). */
  onWindowClosed?(providerId: ProviderId): void;
  logger: ProviderLogger;
  clock?: () => Date;
}

interface OpenPayment {
  readonly subject: PaymentSubject;
  readonly window: ProviderWindowHandle;
  /** The confirmation was seen: later pages change nothing. */
  done: boolean;
}

type HoldsProvider = ProviderWith<'holds'>;

export const PAYMENT_WINDOW_BUSY_MESSAGE = 'Finish or close the open payment window first';

export class HoldPaymentService {
  private readonly deps: HoldPaymentDeps;
  private readonly log: ProviderLogger;
  private readonly clock: () => Date;
  private readonly payments = new Map<ProviderId, OpenPayment>();
  private disposed = false;

  constructor(deps: HoldPaymentDeps) {
    this.deps = deps;
    this.log = deps.logger.child({ module: 'hold-payment' });
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Opens the payment window for a HELD snipe's hold (see the class comment). */
  async openForSnipe(id: number): Promise<void> {
    const snipe = this.deps.snipes.findById(id);
    if (!snipe) throw new AppError('NOT_FOUND', 'Site snipe not found');
    const provider = this.deps.providers.require(snipe.providerId, 'holds');
    const { holdReference, holdExpiresAt } = snipe;
    if (snipe.status !== SnipeStatus.HELD || !holdReference || !this.unexpired(holdExpiresAt)) {
      throw this.expired();
    }
    this.open(
      provider,
      { kind: 'snipe', id, providerId: snipe.providerId, reference: holdReference },
      {
        ok: true,
        reference: holdReference,
        expiresAt: holdExpiresAt!,
        ...(snipe.holdUnitId ? { unitId: snipe.holdUnitId } : {}),
      }
    );
  }

  /** Opens the payment window for a watch's automatic hold (see the class comment). */
  async openForWatch(id: number): Promise<void> {
    const watch = this.deps.watches.findById(id);
    if (!watch) throw new AppError('NOT_FOUND', 'Watch not found');
    const provider = this.deps.providers.require(watch.providerId, 'holds');
    const { hold } = watch;
    if (watch.lastResult !== WatchResult.HELD || !hold || !this.unexpired(hold.expiresAt)) {
      throw this.expired();
    }
    this.open(
      provider,
      { kind: 'watch', id, providerId: watch.providerId, reference: hold.reference },
      {
        ok: true,
        reference: hold.reference,
        expiresAt: hold.expiresAt,
        ...(hold.unitId ? { unitId: hold.unitId } : {}),
      }
    );
  }

  /** On quit, before the windows close: their events change nothing from here. */
  dispose(): void {
    this.disposed = true;
    this.payments.clear();
  }

  // ---------------------------------------------------------------------------------------

  private unexpired(expiresAt: Date | undefined): boolean {
    return expiresAt !== undefined && expiresAt.getTime() > this.clock().getTime();
  }

  private expired(): AppError {
    return new AppError('HOLD_EXPIRED', 'This hold has expired, so it can no longer be paid for');
  }

  private open(provider: HoldsProvider, subject: PaymentSubject, hold: HoldSuccess): void {
    const { providerId } = subject;
    const existing = this.payments.get(providerId);
    if (existing && !existing.window.isClosed()) {
      existing.window.focus();
      if (existing.subject.kind === subject.kind && existing.subject.id === subject.id) return;
      throw new AppError('VALIDATION', PAYMENT_WINDOW_BUSY_MESSAGE);
    }

    const { manifest, holds, auth } = provider;
    const url = holds.paymentUrl(hold);
    const allowedOrigins = paymentWindowOrigins(url, holds.paymentOrigins, auth);
    if (!matchesOrigin(url, allowedOrigins)) {
      throw new ProviderError({
        providerId,
        message: `${manifest.shortName}'s payment page is not on its payment origins`,
      });
    }

    const window = this.deps.windows.open({
      providerId,
      providerName: manifest.shortName,
      kind: 'payment',
      url,
      allowedOrigins,
      openBlockedExternally: false,
    });
    const payment: OpenPayment = { subject, window, done: false };
    this.payments.set(providerId, payment);
    const stopListening = window.onNavigate((navigation) => this.onNavigate(payment, navigation));
    window.onClosed(() => {
      stopListening();
      if (this.payments.get(providerId) === payment) this.payments.delete(providerId);
      if (this.disposed) return;
      this.log.info(`Payment window for ${subject.kind} ${subject.id} closed`);
      this.deps.onWindowClosed?.(providerId);
    });
    this.log.info(`Payment window opened for ${subject.kind} ${subject.id} (${providerId})`);
  }

  private onNavigate(payment: OpenPayment, { url, httpStatus }: ProviderWindowNavigation): void {
    if (this.disposed || payment.done) return;
    if (httpStatus < 200 || httpStatus >= 300) return;
    const { subject } = payment;
    const holds = this.deps.providers.tryGet(subject.providerId)?.holds;
    const reference = holds?.bookedReference?.({ reference: subject.reference }, url) ?? null;
    if (!reference) return;
    payment.done = true;
    try {
      if (subject.kind === 'snipe') this.bookSnipe(subject, reference);
      else this.bookWatch(subject, reference);
    } catch (error) {
      // The person paid: say so loudly; the provider's own bookings page still has it
      this.log.error(
        `Payment for ${subject.kind} ${subject.id} completed (${reference}) but was not recorded`,
        error
      );
    }
  }

  /** A paid snipe hold: BOOKED with the provider's booking reference, and the booking. */
  private bookSnipe(subject: PaymentSubject, reference: string): void {
    const recorded = this.deps.transaction(() => {
      const snipe = this.deps.snipes.findById(subject.id);
      const state = !snipe
        ? 'deleted'
        : snipe.status === SnipeStatus.BOOKED
          ? 'booked'
          : snipe.holdReference !== subject.reference
            ? 'another hold'
            : snipe.status === SnipeStatus.HELD || snipe.status === SnipeStatus.EXPIRED
              ? 'held'
              : snipe.status;
      if (!snipe || state !== 'held') return this.notRecorded(subject, state);
      this.deps.snipes.setBooked(snipe.id, reference);
      const booking = this.deps.bookings.recordConfirmed(
        snipe.userId,
        bookingInput(snipe, reference, snipe.holdUnitId)
      );
      return { snipe: this.deps.snipes.findById(snipe.id)!, booking };
    });
    if (!recorded) return;
    this.log.info(`Snipe ${subject.id} booked (${subject.providerId})`);
    this.deps.events.emit('snipe:updated', recorded.snipe);
    this.deps.bookings.announce(recorded.booking);
    this.deps.notifications.notifySnipeBooked(recorded.snipe).catch((error: unknown) => {
      this.log.error(`Snipe ${subject.id}: booked but not notified`, error);
    });
  }

  /** A paid watch hold: the watch is booked, and the booking recorded. */
  private bookWatch(subject: PaymentSubject, reference: string): void {
    const recorded = this.deps.transaction(() => {
      const watch = this.deps.watches.findById(subject.id);
      const state = !watch
        ? 'deleted'
        : watch.lastResult === WatchResult.BOOKED
          ? 'booked'
          : watch.hold?.reference !== subject.reference
            ? 'another hold'
            : watch.lastResult === WatchResult.HELD
              ? 'held'
              : (watch.lastResult ?? 'unchecked');
      if (!watch || state !== 'held') return this.notRecorded(subject, state);
      this.deps.watches.setBooked(watch.id);
      const booking = this.deps.bookings.recordConfirmed(
        watch.userId,
        bookingInput(watch, reference, watch.hold?.unitId)
      );
      return { watch: this.deps.watches.findById(watch.id)!, booking };
    });
    if (!recorded) return;
    const { watch, booking } = recorded;
    this.log.info(`Watch ${subject.id} booked (${subject.providerId})`);
    this.deps.events.emit('watch:updated', watch);
    this.deps.bookings.announce(booking);
    this.deps.notifications
      .notifyBookingConfirmed(watch.userId, watch.providerId, booking.id, booking.bookingReference)
      .catch((error: unknown) => {
        this.log.error(`Watch ${subject.id}: booked but not notified`, error);
      });
  }

  /**
   * A confirmation that changes nothing: a reloaded page (already booked), or a row that was
   * deleted, holds another hold now, or is in a state a payment cannot follow.
   */
  private notRecorded(subject: PaymentSubject, state: string): null {
    if (state !== 'booked') {
      this.log.warn(`${subject.kind} ${subject.id} (${state}): its payment was not recorded`);
    }
    return null;
  }
}

/**
 * The payment window's top-level origins: the provider's payment origins (or the payment
 * page's own origin) and its sign-in origins, so signing in while paying works.
 */
function paymentWindowOrigins(
  url: string,
  paymentOrigins: readonly string[] | undefined,
  auth: HoldsProvider['auth']
): string[] {
  let own: string[] = [];
  try {
    own = [new URL(url).origin];
  } catch {
    // Not a URL: matchesOrigin refuses it below
  }
  const signIn = auth?.kind === 'browser-session' ? auth.allowedOrigins : [];
  return [...new Set([...(paymentOrigins ?? own), ...signIn])];
}

/** The confirmed booking for a paid hold. */
function bookingInput(
  row: SiteSnipe | Watch,
  reference: string,
  unitId: string | undefined
): BookingInput {
  const { location } = row;
  return {
    providerId: row.providerId,
    bookingReference: reference,
    location: {
      externalId: location.externalId,
      name: location.name || location.externalId,
      ...(location.areaName ? { areaName: location.areaName } : {}),
    },
    stay: row.stay,
    unitIds: unitId ? [unitId] : [],
    stayParams: row.stayParams,
  };
}
