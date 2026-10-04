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
    secretState: hasPassword ? 'ok' : 'missing',
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

  it('requires a new password when the server or account changes', async () => {
    jest
      .mocked(window.api.notifiers.get)
      .mockResolvedValue({ success: true, data: storedNotifier(true) });
    jest
      .mocked(window.api.notifiers.configure)
      .mockResolvedValue({ success: true, data: storedNotifier(true) });

    render(<EmailSettingsCard />);

    const password = await screen.findByLabelText('App Password');
    expect(password).toHaveAttribute('aria-required', 'false');

    // Another account on the same server
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'someone-else@example.com' },
    });
    expect(
      screen.getByText(
        'Required: the server or account has changed, so the saved password will not be used'
      )
    ).toBeInTheDocument();
    expect(password).toHaveAttribute('aria-required', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(
      await screen.findByText('Enter the password for the new server/account')
    ).toBeInTheDocument();
    expect(window.api.notifiers.configure).not.toHaveBeenCalled();

    // Back to the saved account: blank keeps the saved password again
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'me@example.com' },
    });
    expect(
      screen.getByText('Leave blank to keep existing password, or enter a new one to update')
    ).toBeInTheDocument();

    // Another server (Outlook): the password is required, and is sent once entered
    fireEvent.change(screen.getByLabelText('Email Provider'), {
      target: { value: SMTPPreset.OUTLOOK },
    });
    expect(password).toHaveAttribute('aria-required', 'true');
    fireEvent.change(password, { target: { value: 'outlook-app-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await screen.findByText('Email settings saved successfully');
    const [input] = jest.mocked(window.api.notifiers.configure).mock.calls[0];
    expect(input.config).toMatchObject({
      host: 'smtp.office365.com',
      auth: { user: 'me@example.com', pass: 'outlook-app-password' },
    });
  });

  it('a custom host change needs the password too', async () => {
    const custom = storedNotifier(true);
    custom.config = {
      preset: SMTPPreset.CUSTOM,
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'me' },
    };
    jest.mocked(window.api.notifiers.get).mockResolvedValue({ success: true, data: custom });

    render(<EmailSettingsCard />);

    expect(
      await screen.findByText('Leave blank to keep existing password, or enter a new one to update')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('SMTP Host'), {
      target: { value: 'smtp.other.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(
      await screen.findByText('Enter the password for the new server/account')
    ).toBeInTheDocument();
    expect(window.api.notifiers.configure).not.toHaveBeenCalled();
  });
});
