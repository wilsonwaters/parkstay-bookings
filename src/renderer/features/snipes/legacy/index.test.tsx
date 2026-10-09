import { screen, waitFor } from '@testing-library/react';
import { SnipeStatus, type SiteSnipe } from '@shared/types';
import { mockSiteSnipe } from '@tests/fixtures/site-sniper';
import { fail, ok } from '@tests/utils/renderer/createMockApi';
import { renderWithApp } from '@tests/utils/renderer/renderWithApp';

/**
 * The legacy Site Sniper list's payment hand-off (U2 replaces the page): "Complete payment"
 * opens the payment window in main (`snipes.openPayment`), on the provider's session where the
 * hold is, instead of a browser tab that would not have the hold.
 */

const held: SiteSnipe = {
  ...mockSiteSnipe,
  id: 7,
  status: SnipeStatus.HELD,
  isActive: false,
  holdReference: '2072968',
  holdExpiresAt: new Date(Date.now() + 20 * 60_000),
  holdUnitId: '136',
  paymentUrl: 'https://parkstay.dbca.wa.gov.au/booking/',
};

describe('Site Sniper (legacy): Complete payment', () => {
  it('asks main to open the payment window for the held snipe', async () => {
    const openPayment = jest.fn().mockResolvedValue(ok(undefined));
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const { user } = renderWithApp({
      route: '/site-sniper',
      api: { snipes: { list: jest.fn().mockResolvedValue(ok([held])), openPayment } },
    });

    await user.click(await screen.findByRole('button', { name: /Complete payment/ }));

    expect(openPayment).toHaveBeenCalledWith(7);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('says so when the hold has expired, and reloads the list', async () => {
    const list = jest.fn().mockResolvedValue(ok([held]));
    const openPayment = jest
      .fn()
      .mockResolvedValue(
        fail('This hold has expired, so it can no longer be paid for', 'HOLD_EXPIRED')
      );
    const { user } = renderWithApp({
      route: '/site-sniper',
      api: { snipes: { list, openPayment } },
    });

    await user.click(await screen.findByRole('button', { name: /Complete payment/ }));

    expect(
      await screen.findByText('This hold has expired, so it can no longer be paid for')
    ).toBeInTheDocument();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
