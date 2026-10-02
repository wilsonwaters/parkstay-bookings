/**
 * `BrowserAutomation`: drives the installed Edge or Chrome for providers that have no API
 * (brief D5). V7 implements it on `playwright-core`; until then every provider gets
 * `UnavailableBrowserAutomation`, which reports itself unavailable.
 */

import type { Page } from 'playwright-core';
import type { ProviderId } from '@shared/types/provider.types';
import { BrowserUnavailableError } from './errors';

export interface BrowserAvailability {
  available: boolean;
  /** The browser channel that works, e.g. `msedge` or `chrome`. */
  channel?: string;
  reason?: string;
}

export interface WithPageOptions {
  /** Show the browser window, for steps a person must do. Default false. */
  headed?: boolean;
  /** Default timeout for page actions and navigation. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BrowserAutomation {
  isAvailable(): Promise<BrowserAvailability>;
  /** Opens a page, runs `fn`, and always closes the page. */
  withPage<T>(fn: (page: Page) => Promise<T>, options?: WithPageOptions): Promise<T>;
  close(): Promise<void>;
}

export class UnavailableBrowserAutomation implements BrowserAutomation {
  constructor(private readonly providerId: ProviderId) {}

  async isAvailable(): Promise<BrowserAvailability> {
    return { available: false, reason: 'not-configured' };
  }

  async withPage<T>(): Promise<T> {
    throw new BrowserUnavailableError(this.providerId, 'not-configured');
  }

  async close(): Promise<void> {
    // Nothing was ever opened.
  }
}
