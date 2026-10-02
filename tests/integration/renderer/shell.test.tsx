/**
 * One walk through the shell, as a person would take it: Explore → Watches (nav) → Settings
 * (account menu) → an unknown address → back to Explore. Electron smoke coverage follows in Q1.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { createMockApi } from '../../utils/renderer/createMockApi';
import { currentRoute, getBanners, renderWithApp } from '../../utils/renderer/renderWithApp';

describe('app shell flow', () => {
  it('gets around the app without signing in', async () => {
    const mock = createMockApi();
    const { user } = renderWithApp({ api: mock });

    // Starts on Explore, with no login gate.
    expect(await screen.findByRole('heading', { level: 1, name: 'Explore' })).toBeInTheDocument();
    expect(mock.api.auth.validateSession).not.toHaveBeenCalled();
    const nav = screen.getByRole('navigation', { name: 'Primary' });

    // Watches through the nav: the legacy page loads its data inside the shell.
    await user.click(within(nav).getByRole('link', { name: 'Watches' }));
    const watchesHeading = await screen.findByRole('heading', { level: 1, name: 'Watches' });
    expect(currentRoute()).toBe('/watches');
    expect(mock.api.watches.list).toHaveBeenCalled();
    expect(within(nav).getByRole('link', { name: 'Watches' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await waitFor(() => expect(watchesHeading).toHaveFocus());

    // Settings through the account menu.
    await user.click(screen.getByRole('button', { name: 'Account and settings' }));
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }));
    // The legacy page renders, swaps to a spinner while it loads, then renders again, so look
    // the heading up afresh rather than holding on to the first one.
    await waitFor(() => expect(mock.api.app.getAutoLaunch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    );
    expect(currentRoute()).toBe('/settings');

    // An unknown address, then back to Explore.
    act(() => {
      window.location.hash = '#/no-such-page';
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Explore' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Explore' })).toBeInTheDocument();
    expect(currentRoute()).toBe('/');

    // The frame never changed underneath.
    expect(getBanners()).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(mock.api.auth.validateSession).not.toHaveBeenCalled();
  });
});
