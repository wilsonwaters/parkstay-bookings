import React from 'react';
import { act, fireEvent, render as renderDom, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ProviderAccount } from '@shared/types/provider.types';
import { createQueryClient } from '../../../app/queryClient';
import Settings from './Settings';

/**
 * The legacy Settings page's ParkStay account (U4 replaces it with Settings → Accounts): the
 * old email/password form is gone; a status line and "Connect ParkStay", which opens the
 * in-app sign-in window through `accounts.signIn('parkstay')`.
 */

/** The page needs a query client (the About dialog reads app info). */
function render(ui: React.ReactElement) {
  return renderDom(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

const account = (overrides: Partial<ProviderAccount> = {}): ProviderAccount => ({
  providerId: 'parkstay',
  requirement: 'optional',
  status: 'unknown',
  ...overrides,
});

describe('Settings: ParkStay account', () => {
  let onAccountUpdated: ((payload: ProviderAccount) => void) | undefined;

  beforeEach(() => {
    onAccountUpdated = undefined;
    jest.mocked(window.api.app.getAutoLaunch).mockResolvedValue({ success: true, data: false });
    jest.mocked(window.api.accounts.list).mockResolvedValue({ success: true, data: [account()] });
    window.api.events.on = jest.fn((name: string, callback: (payload: never) => void) => {
      if (name === 'account:updated') onAccountUpdated = callback as typeof onAccountUpdated;
      return jest.fn();
    }) as unknown as typeof window.api.events.on;
  });

  it('shows Connect ParkStay and calls accounts.signIn("parkstay")', async () => {
    let finish!: (value: { success: true; data: ProviderAccount }) => void;
    jest
      .mocked(window.api.accounts.signIn)
      .mockReturnValue(new Promise((resolve) => (finish = resolve)));

    render(<Settings />);

    expect(await screen.findByRole('status')).toHaveTextContent('Not connected');
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connect ParkStay' }));

    expect(window.api.accounts.signIn).toHaveBeenCalledWith('parkstay');
    const waiting = await screen.findByRole('button', { name: 'Waiting for sign-in…' });
    expect(waiting).toBeDisabled();

    await act(async () =>
      finish({ success: true, data: account({ status: 'signed-in', email: 'a@b.au' }) })
    );

    expect(screen.getByRole('status')).toHaveTextContent('Signed in as a@b.au');
    expect(screen.queryByRole('button', { name: 'Connect ParkStay' })).toBeNull();
  });

  it('reads the stored account, and follows account:updated', async () => {
    jest.mocked(window.api.accounts.list).mockResolvedValue({
      success: true,
      data: [account({ status: 'signed-out', lastSignedInAt: '2026-10-01T00:00:00.000Z' })],
    });
    render(<Settings />);

    expect(await screen.findByRole('status')).toHaveTextContent('Session expired');
    expect(window.api.accounts.status).not.toHaveBeenCalled(); // no check just for showing it

    act(() => onAccountUpdated?.(account({ status: 'signed-in', displayName: 'Ann Lee' })));
    expect(screen.getByRole('status')).toHaveTextContent('Signed in as Ann Lee');
  });

  it('says sign-in is optional, never a requirement', async () => {
    render(<Settings />);
    expect(
      await screen.findByText(
        /Optional\. Connect ParkStay before the release so checkout is quicker/
      )
    ).toBeInTheDocument();
  });

  it('shows the error when the sign-in window cannot open', async () => {
    jest
      .mocked(window.api.accounts.signIn)
      .mockResolvedValue({ success: false, code: 'INTERNAL', error: 'No window' });
    render(<Settings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Connect ParkStay' }));

    expect(await screen.findByText('No window')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect ParkStay' })).toBeEnabled();
  });
});
