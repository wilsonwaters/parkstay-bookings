/**
 * The SMTP password is write-only (architecture-notes §4, §7): what IPC returns for a
 * notifier never contains it, and saving settings without a password keeps the stored one.
 */

import type { Notifier, NotifierView, SMTPConfig } from '@shared/types';
import type { NotifierConfigureInput } from '@shared/contracts/notifiers';

type Config = Record<string, unknown>;

function isRecord(value: unknown): value is Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The password stored in a notifier config (`config.auth.pass`), or ''. */
export function storedPassword(config: unknown): string {
  if (!isRecord(config) || !isRecord(config.auth)) return '';
  return typeof config.auth.pass === 'string' ? config.auth.pass : '';
}

/** A notifier as the renderer may see it: `config.auth.pass` removed, `hasPassword` added. */
export function toNotifierView(notifier: Notifier): NotifierView {
  const config = notifier.config as Config;
  const viewConfig: Config = { ...config };
  if (isRecord(config.auth)) {
    viewConfig.auth = Object.fromEntries(
      Object.entries(config.auth).filter(([key]) => key !== 'pass')
    );
  }
  return { ...notifier, config: viewConfig, hasPassword: storedPassword(config) !== '' };
}

/**
 * The SMTP config to store: the settings as given, with the stored password when the
 * renderer sent none (empty or absent).
 */
export function withStoredPassword(
  config: NotifierConfigureInput['config'],
  storedConfig: unknown
): SMTPConfig {
  const pass = config.auth.pass ? config.auth.pass : storedPassword(storedConfig);
  return { ...config, auth: { user: config.auth.user, pass } };
}
