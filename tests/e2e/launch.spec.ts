/**
 * Launch: WA Stay opens straight on Explore, with no login gate (brief D2).
 *
 * E1 adds the Explore assertions here (Q1 spec, launch.spec): the search control, the 8
 * results from the ParkStay fixture, a provider badge named /ParkStay/ on the first result and
 * the list-only notice (the e2e build has no Mapbox token).
 */

import { APP_NAME } from '../../src/shared/constants/app-constants';
import { expect, test } from './support/wa-stay';
import { expectCurrentNavLink, expectRoute, NAV_PAGES, pageHeading } from './support/shell';

test('opens straight on Explore, with no login gate', async ({ launchWaStay }) => {
  const { window } = await launchWaStay();

  await expectRoute(window, '/');
  await expect(pageHeading(window)).toHaveCount(1);
  await expect(pageHeading(window)).toHaveText(NAV_PAGES.explore.heading);
  await expectCurrentNavLink(window, NAV_PAGES.explore.link);
  await expect(window.getByRole('banner')).toHaveCount(1);
  await expect(window.getByRole('main')).toBeVisible();
  await expect(window.getByLabel('Password')).toHaveCount(0);

  // The Explore placeholder; E1 replaces it with the map, search and results.
  await expect(
    window.getByRole('heading', { level: 2, name: 'The map is on its way' })
  ).toBeVisible();
});

test('the window is titled WA Stay', async ({ launchWaStay }) => {
  // B2 (#27) renames the app. Until it is merged, APP_NAME and the title are still the v1 name.
  test.fail((APP_NAME as string) !== 'WA Stay', 'B2 (#27) has not renamed the app yet');
  const { window } = await launchWaStay();

  await expect(window).toHaveTitle('WA Stay');
});
