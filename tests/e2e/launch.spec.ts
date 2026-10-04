/**
 * Launch: WA Stay opens straight on Explore, with no login gate (brief D2).
 *
 * Explore (E1): the campgrounds from the ParkStay catalogue fixture
 * (tests/e2e/fixtures/http/parkstay/campground_map.json), filtered by region, and one opened.
 */

import { APP_NAME } from '../../src/shared/constants/app-constants';
import { expect, test, withoutGuardedRequests, withoutRemoteImages } from './support/wa-stay';
import { expectCurrentNavLink, expectRoute, NAV_PAGES, pageHeading } from './support/shell';

/** The 11 campgrounds in the ParkStay catalogue fixture. */
const FIXTURE_CAMPGROUNDS = 11;

test('opens straight on Explore, with no login gate', async ({ launchWaStay }) => {
  const { window } = await launchWaStay();

  await expectRoute(window, '/');
  await expect(pageHeading(window)).toHaveCount(1);
  await expect(pageHeading(window)).toHaveText(NAV_PAGES.explore.heading);
  await expectCurrentNavLink(window, NAV_PAGES.explore.link);
  await expect(window.getByRole('banner')).toHaveCount(1);
  await expect(window.getByRole('main')).toBeVisible();
  await expect(window.getByLabel('Password')).toHaveCount(0);
});

test('Explore lists the ParkStay campgrounds from the catalogue fixture', async ({
  launchWaStay,
}) => {
  const wa = await launchWaStay();
  const { window } = wa;
  const results = window.getByRole('region', { name: 'Results' });

  // The catalogue syncs from the fixture 5 s after the window opens (V5).
  await expect(
    results.getByRole('heading', { level: 2, name: `${FIXTURE_CAMPGROUNDS} places` })
  ).toBeVisible({ timeout: 20_000 });
  const first = results.getByRole('link').first();
  await expect(first.getByRole('img', { name: /ParkStay/ })).toBeVisible();
  await expect(results.getByRole('link', { name: 'Bungarra' })).toBeVisible();

  // Provider photos are not loaded in fixture mode: the placeholder stands in.
  await expect(results.getByRole('img', { name: 'No photo available for Bungarra' })).toBeVisible();

  // Filter by region, then open a place.
  await window
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: 'Region' })
    .click();
  const region = window.getByRole('dialog', { name: 'Region' });
  await region.getByRole('checkbox', { name: 'Pilbara, 3 places' }).click();
  await region.getByRole('button', { name: 'Done' }).click();
  await expect(window.getByRole('button', { name: 'Region, 1 selected' })).toBeFocused();
  await expect(results.getByRole('heading', { level: 2, name: '3 places' })).toBeVisible();
  await results.getByRole('link', { name: 'Bungarra' }).click();
  await expectRoute(window, '/places/parkstay/20');

  expect(withoutGuardedRequests(await wa.consoleErrors(), wa.unexpectedRequests())).toEqual([]);
  expect(withoutRemoteImages(wa.unexpectedRequests())).toEqual([]);
});

test('the window is titled WA Stay', async ({ launchWaStay }) => {
  // B2 (#27) renames the app. Until it is merged, APP_NAME and the title are still the v1 name.
  test.fail((APP_NAME as string) !== 'WA Stay', 'B2 (#27) has not renamed the app yet');
  const { window } = await launchWaStay();

  await expect(window).toHaveTitle('WA Stay');
});
