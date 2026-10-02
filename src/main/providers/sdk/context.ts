/**
 * `ProviderContext`: everything a provider gets from the app, scoped to that provider
 * (architecture-notes §3). Providers never reach for globals: no `electron`, no app logger,
 * no database.
 */

import { ProviderIdSchema, type ProviderId } from '@shared/types/provider.types';
import { UnavailableBrowserAutomation, type BrowserAutomation } from './browser';
import type { HttpClient } from './http';
import type { KeyValueStore } from './kv-store';
import { createScopedSecretVault, type ScopedSecretVault, type SecretVaultLike } from './secrets';

/** The logging surface providers use (Winston's logger satisfies it). */
export interface ProviderLogger {
  debug(message: string, ...meta: unknown[]): void;
  info(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
  child(meta: Record<string, unknown>): ProviderLogger;
}

export interface ProviderContext {
  readonly id: ProviderId;
  /** Bound to the provider's session partition, whose cookies its sign-in and payment windows share. */
  readonly http: HttpClient;
  readonly browser: BrowserAutomation;
  /** The provider's own key-value state. */
  readonly state: KeyValueStore;
  /** Encrypted secrets, stored in `state` and readable only by this provider. */
  readonly secrets: ScopedSecretVault;
  /** A child logger tagged `{ provider: id }`. */
  readonly logger: ProviderLogger;
  readonly clock: () => Date;
}

/** What the app supplies to build each provider's context. */
export interface ProviderContextDeps {
  createHttp(providerId: ProviderId): HttpClient;
  createState(providerId: ProviderId): KeyValueStore;
  /** The app's secret vault (P5). */
  vault: SecretVaultLike;
  /** The app logger; each provider gets a child of it. */
  logger: ProviderLogger;
  /** Defaults to `UnavailableBrowserAutomation`. */
  createBrowser?(providerId: ProviderId): BrowserAutomation;
  clock?: () => Date;
}

export function createProviderContext(id: ProviderId, deps: ProviderContextDeps): ProviderContext {
  ProviderIdSchema.parse(id);
  const state = deps.createState(id);
  return Object.freeze({
    id,
    http: deps.createHttp(id),
    browser: deps.createBrowser?.(id) ?? new UnavailableBrowserAutomation(id),
    state,
    secrets: createScopedSecretVault({ providerId: id, vault: deps.vault, store: state }),
    logger: deps.logger.child({ provider: id }),
    clock: deps.clock ?? (() => new Date()),
  });
}
