import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NotifierChannel, NotifierStatus, SMTPPreset } from '@shared/types';
import type { NotifierView } from '@shared/types';
import EmailSettingsCard from './EmailSettingsCard';

/** The SMTP notifier as main returns it: the password is never sent, only `hasPassword`. */
function storedNotifier(hasPassword: boolean): NotifierView {
  return {
    id: 1,
    channel: NotifierChannel.EMAIL_SMTP,
    displayName: 'Email (SMTP)',
    enabled: true,
    config: {
      preset: SMTPPreset.GMAIL,
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: 'me@example.com' },
      toEmail: 'me@example.com',
    },
    hasPassword,
    status: NotifierStatus.CONFIGURED,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
}

describe('EmailSettingsCard', () => {
  it('saves without re-entering the password when one is stored (hasPassword)', async () => {
    jest
      .mocked(window.api.notifiers.get)
      .mockResolvedValue({ success: true, data: storedNotifier(true) });
    jest
      .mocked(window.api.notifiers.configure)
      .mockResolvedValue({ success: true, data: storedNotifier(true) });

    render(<EmailSettingsCard />);

    const password = await screen.findByLabelText('App Password');
    expect(password).toHaveValue('');
    expect(
      screen.getByText('Leave blank to keep existing password, or enter a new one to update')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await screen.findByText('Email settings saved successfully');
    expect(window.api.notifiers.configure).toHaveBeenCalledTimes(1);
    const [input] = jest.mocked(window.api.notifiers.configure).mock.calls[0];
    expect(input.config.auth).toEqual({ user: 'me@example.com', pass: undefined });
    expect(input.config).toMatchObject({ preset: SMTPPreset.GMAIL, host: 'smtp.gmail.com' });
  });

  it('still requires a password when none is stored', async () => {
    jest
      .mocked(window.api.notifiers.get)
      .mockResolvedValue({ success: true, data: storedNotifier(false) });
    jest.mocked(window.api.notifiers.configure).mockResolvedValue({ success: true });

    render(<EmailSettingsCard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Save Settings' }));

    expect(await screen.findByText('Password is required')).toBeInTheDocument();
    expect(window.api.notifiers.configure).not.toHaveBeenCalled();
  });
});
