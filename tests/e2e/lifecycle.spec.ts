/**
 * Lifecycle: a journey through every page stays clean (no renderer console errors, nothing
 * sent to the network), the app quits promptly with exit code 0 (no timer keeps it alive),
 * and a relaunch on the same profile reopens the database with its data.
 */

import type { Page } from '@playwright/test';
import { expect, test, within, withoutGuardedRequests } from './support/wa-stay';
import {
  chooseAccountMenuItem,
  expectCurrentNavLink,
  expectHeadingFocused,
  expectRoute,
  NAV_PAGES,
  navLink,
  pageHeading,
} from './support/shell';

/** The preload's settings API, as the renderer sees it. */
interface SettingsApi {
  get(key: 'launchOnStartup'): Promise<unknown>;
  set(key: 'launchOnStartup', value: boolean): Promise<unknown>;
}

// Writes and reads through the real preload, IPC handler and SQLite database. No page can
// store anything yet without the network: the legacy pages it would take are being rebuilt.
function readSetting(window: Page): Promise<unknown> {
  return window.evaluate(() =>
    (globalThis as unknown as { api: { settings: SettingsApi } }).api.settings.get(
      'launchOnStartup'
    )
  );
}

function writeSetting(window: Page, value: boolean): Promise<unknown> {
  return window.evaluate(
    (v) =>
      (globalThis as unknown as { api: { settings: SettingsApi } }).api.settings.set(
        'launchOnStartup',
        v
      ),
    value
  );
}

test('a journey through every page logs no console errors and sends nothing to the network', async ({
  launchWaStay,
}) => {
  const wa = await launchWaStay();
  const { window } = wa;

  for (const page of [NAV_PAGES.watches, NAV_PAGES.snipes, NAV_PAGES.bookings]) {
    await navLink(window, page.link).click();
    await expectRoute(window, page.route);
    await expectCurrentNavLink(window, page.link);
  }
  await chooseAccountMenuItem(window, 'Settings');
  await expectHeadingFocused(window, 'Settings');
  await chooseAccountMenuItem(window, 'About WA Stay');
  const about = window.getByRole('dialog', { name: 'About WA Stay' });
  await expect(about.getByText(/^Version /)).toBeVisible();
  await about.getByRole('button', { name: 'Done' }).click();
  await expect(about).toBeHidden();
  await navLink(window, NAV_PAGES.explore.link).click();
  await expectHeadingFocused(window, NAV_PAGES.explore.heading);

  const requests = wa.unexpectedRequests();
  expect(withoutGuardedRequests(await wa.consoleErrors(), requests)).toEqual([]);
  expect(requests).toEqual([]);
});

test('quits within 10 s with exit code 0, and a relaunch on the same profile keeps its data', async ({
  launchWaStay,
}) => {
  const first = await launchWaStay();
  // A fresh profile has no value; this one is written to the database
  expect(await readSetting(first.window)).toEqual({ success: true, data: null });
  expect(await writeSetting(first.window, false)).toEqual({ success: true, data: true });

  const exitCode = await within(first.close(), 10_000, 'Quitting WA Stay');
  expect(exitCode).toBe(0);
  expect(first.mainLog()).toContain('Application shut down successfully');

  const second = await launchWaStay({ userDataDir: first.userDataDir });
  await expectRoute(second.window, '/');
  await expect(pageHeading(second.window)).toHaveText(NAV_PAGES.explore.heading);
  expect(await readSetting(second.window)).toEqual({ success: true, data: false });
  expect(second.unexpectedRequests()).toEqual([]);
});
