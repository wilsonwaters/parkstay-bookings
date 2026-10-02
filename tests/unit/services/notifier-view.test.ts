/**
 * The SMTP password is write-only: a notifier view drops it and says `hasPassword`, and a
 * save without a password keeps the stored one.
 */

import {
  storedPassword,
  toNotifierView,
  withStoredPassword,
} from '@main/services/notification/notifier-view';
import { Notifier, NotifierChannel, NotifierStatus, SMTPPreset } from '@shared/types';

const smtp = {
  preset: SMTPPreset.CUSTOM,
  host: 'smtp.example.com',
  port: 465,
  secure: true,
  auth: { user: 'me@example.com', pass: 'stored-secret' },
  fromEmail: 'from@example.com',
  toEmail: 'to@example.com',
};

function notifier(config: Notifier['config']): Notifier {
  return {
    id: 1,
    channel: NotifierChannel.EMAIL_SMTP,
    displayName: 'Email (SMTP)',
    enabled: true,
    config,
    status: NotifierStatus.CONFIGURED,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
}

describe('toNotifierView', () => {
  it('removes auth.pass, keeps every other setting, and says hasPassword', () => {
    const view = toNotifierView(notifier(smtp));

    expect(view.config).toEqual({ ...smtp, auth: { user: 'me@example.com' } });
    expect(view.hasPassword).toBe(true);
    expect(JSON.stringify(view)).not.toContain('stored-secret');
    expect(view).toMatchObject({ id: 1, channel: 'email_smtp', enabled: true });
  });

  it('hasPassword is false for an empty, missing or undecryptable config', () => {
    expect(toNotifierView(notifier({ ...smtp, auth: { user: 'me', pass: '' } })).hasPassword).toBe(
      false
    );
    expect(toNotifierView(notifier({})).hasPassword).toBe(false);
    expect(toNotifierView(notifier({})).config).toEqual({});
  });
});

describe('withStoredPassword', () => {
  const { pass: _ignored, ...auth } = smtp.auth;
  void _ignored;

  it('an empty or absent password keeps the stored one', () => {
    const changed = { ...smtp, host: 'smtp.other.example', auth: { ...auth, pass: '' } };
    expect(withStoredPassword(changed, smtp)).toEqual({
      ...changed,
      auth: { user: 'me@example.com', pass: 'stored-secret' },
    });
    expect(withStoredPassword({ ...smtp, auth }, smtp).auth.pass).toBe('stored-secret');
  });

  it('a new password replaces the stored one; with nothing stored the result has none', () => {
    expect(withStoredPassword({ ...smtp, auth: { ...auth, pass: 'new' } }, smtp).auth.pass).toBe(
      'new'
    );
    expect(withStoredPassword({ ...smtp, auth }, undefined).auth.pass).toBe('');
    expect(storedPassword({ auth: { pass: 42 } })).toBe('');
  });
});
