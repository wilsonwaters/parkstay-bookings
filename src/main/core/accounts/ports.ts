/**
 * What `core/accounts` (and, later, the hold payment hand-off) needs from the Electron shell,
 * as plain interfaces: core never imports `electron`. `app/provider-windows.ts` implements
 * them on `BrowserWindow` and the provider's session partition.
 */

import type { AccountStatus, ProviderId } from '@shared/types/provider.types';

export type ProviderWindowKind = 'sign-in' | 'payment';

export interface ProviderWindowRequest {
  providerId: ProviderId;
  /** The provider's display name, for the window title. */
  providerName: string;
  kind: ProviderWindowKind;
  /** The first page. It must match `allowedOrigins`, or `open` throws. */
  url: string;
  /** Origin patterns (`url-patterns.ts`) the window may show at the top level. */
  allowedOrigins: readonly string[];
  /** Sends a blocked http(s) navigation to the system browser instead of only logging it. */
  openBlockedExternally: boolean;
}

/** A top-level page the window showed (after redirects). */
export interface ProviderWindowNavigation {
  url: string;
  /** The HTTP status of the page (0 when Chromium did not report one). */
  httpStatus: number;
}

export interface ProviderWindowHandle {
  readonly providerId: ProviderId;
  readonly kind: ProviderWindowKind;
  /** Brings the window to the front. */
  focus(): void;
  /** Closes the window (its `onClosed` listeners run). */
  close(): void;
  /** Loads `url`, which must match the window's allow-list (otherwise it throws). */
  load(url: string): void;
  /** The URL of the page the window shows now, or '' before the first one. */
  currentUrl(): string;
  /** Every top-level page the window commits. Returns the unsubscribe function. */
  onNavigate(listener: (navigation: ProviderWindowNavigation) => void): () => void;
  /** Runs once, when the window has closed. */
  onClosed(listener: () => void): void;
  isClosed(): boolean;
}

export interface ProviderWindowOpener {
  /** Opens a hardened window on the provider's partition. Throws when `url` is not allowed. */
  open(request: ProviderWindowRequest): ProviderWindowHandle;
  /** The open window of that kind for the provider, if there is one. */
  find(providerId: ProviderId, kind: ProviderWindowKind): ProviderWindowHandle | undefined;
  /** Closes every provider window. */
  closeAll(): void;
}

/** The provider's session partition (cookies and storage shared with its HTTP client). */
export interface ProviderSessionStore {
  /** Clears every cookie, cache and storage of the partition, and its HTTP auth cache. */
  clear(providerId: ProviderId): Promise<void>;
  /** Writes the partition's cookies to disk now. */
  flush(providerId: ProviderId): Promise<void>;
}

/**
 * What the snipe service asks of `ProviderAccountService` before a hold, for a provider whose
 * holds need an account (`required-for-holds` or `required`). ParkStay's is optional.
 */
export interface AccountGate {
  /** Throws `ProviderAuthRequiredError` (`AUTH_REQUIRED`) unless the account is signed in. */
  ensureForHolds(providerId: ProviderId): Promise<void>;
  /** The stored (last definite) state; synchronous, no network. */
  storedState(providerId: ProviderId): AccountStatus['state'];
}
