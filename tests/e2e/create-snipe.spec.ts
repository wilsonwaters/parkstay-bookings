/**
 * Creating a snipe in the built app (U2), network-free: the ParkStay catalogue, the place's
 * release rule and the release preview come from `fixtures/http/parkstay`. Provider step →
 * location → stay → release (a scheduled release a year away, so nothing is tried while the
 * test runs; no hold is ever placed, §12.33) → review → the new snipe's page, by role and
 * accessible name only.
 */

import { expect, test, withoutGuardedRequests, withoutRemoteImages } from './support/wa-stay';
import { expectHeadingFocused, expectRoute, NAV_PAGES, navLink } from './support/shell';

/** The catalogue syncs 5 s after launch (V5); give it room on a slow runner. */
const CATALOGUE_TIMEOUT_MS = 30_000;

/** A year from now, `YYYY-MM-DD`: a scheduled release that cannot come while the test runs. */
function nextYear(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

test('creates a ParkStay snipe through the provider-first flow', async ({ launchWaStay }) => {
  test.setTimeout(90_000);
  const wa = await launchWaStay();
  const { window } = wa;

  await navLink(window, NAV_PAGES.snipes.link).click();
  await expectHeadingFocused(window, NAV_PAGES.snipes.heading);
  // The page keeps its "Soon" note (U3's ComingSoonBanner).
  await expect(window.getByText('Site Sniper is still being finalised.')).toBeVisible();
  await expect(window.getByRole('heading', { name: 'No snipes yet' })).toBeVisible();
  await window.getByRole('link', { name: 'New snipe' }).click();
  await expectRoute(window, '/site-sniper/new');
  await expectHeadingFocused(window, 'New snipe');

  // 1. Provider: the only provider with Site Sniper, chosen for you but shown.
  const steps = window.getByRole('navigation', { name: 'New snipe steps' });
  await expect(steps.locator('[aria-current="step"]')).toContainText('Provider');
  await expect(window.getByRole('radio', { name: 'ParkStay WA' })).toBeChecked();
  await window.getByRole('button', { name: 'Continue' }).click();

  // 2. Location: search the synced catalogue.
  await expect(window.getByRole('heading', { level: 2, name: /Location$/ })).toBeFocused();
  const location = window.getByRole('combobox', { name: 'Location' });
  const bungarra = window.getByRole('option', { name: /Bungarra/ });
  await expect(async () => {
    await location.fill('');
    await location.fill('Bung');
    await expect(bungarra).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: CATALOGUE_TIMEOUT_MS });
  await bungarra.click();
  await expect(location).toHaveValue('Bungarra');
  await window.getByRole('button', { name: 'Continue' }).click();

  // 3. Stay: two nights, picked with the keyboard; the provider's own snipe fields.
  await expect(window.getByRole('heading', { level: 2, name: /Your stay$/ })).toBeFocused();
  await window.getByRole('button', { name: /^Dates/ }).click();
  for (const key of ['ArrowRight', 'Enter', 'ArrowRight', 'ArrowRight', 'Enter']) {
    await window.keyboard.press(key);
  }
  await window
    .getByRole('dialog', { name: 'Choose dates' })
    .getByRole('button', { name: 'Done' })
    .click();
  await expect(window.getByRole('button', { name: /^Dates .+ – .+/ })).toBeVisible();
  await expect(window.getByRole('textbox', { name: /Postcode/ })).toBeVisible();
  await window.getByRole('button', { name: 'Continue' }).click();

  // 4. Release: the provider's modes, explained; a scheduled release a year away.
  await expect(
    window.getByRole('heading', { level: 2, name: /Release and timing$/ })
  ).toBeFocused();
  const modes = window.getByRole('radiogroup', { name: 'When are the sites released?' });
  await expect(modes.getByRole('radio', { name: 'When new dates open' })).toBeChecked();
  await expect(window.getByRole('button', { name: 'Advanced timing' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  // The radio is the whole card (its native input is visually hidden): pick it by its label.
  await modes.locator('label', { hasText: 'At a scheduled time' }).click();
  await expect(modes.getByRole('radio', { name: 'At a scheduled time' })).toBeChecked();
  await window.getByLabel('Release date').fill(nextYear());
  await window.getByLabel(/^Release time/).fill('10:00');
  await window.getByRole('button', { name: 'Continue' }).click();

  // 5. Review: hold responsibly; connecting ParkStay is only suggested. Create.
  await expect(window.getByRole('heading', { level: 2, name: /Review$/ })).toBeFocused();
  await expect(
    window.getByText('Hold only what you will use. Payment is always completed by you on ParkStay.')
  ).toBeVisible();
  const name = await window.getByRole('textbox', { name: 'Name' }).inputValue();
  expect(name).toMatch(/^Bungarra · /);
  await window.getByRole('button', { name: 'Create snipe' }).click();

  await expect
    .poll(() => window.evaluate(() => document.location.hash))
    .toMatch(/^#\/site-sniper\/\d+$/);
  await expect(window.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(
    window.getByRole('region', { name: 'Notifications' }).getByText('Snipe created')
  ).toBeVisible();
  await expect(window.getByRole('img', { name: 'ParkStay WA' }).first()).toBeVisible();
  await expect(window.getByRole('list', { name: 'Progress' })).toBeVisible();
  await expect(window.getByRole('timer', { name: /^Opens in/ })).toBeVisible();

  // The list shows it.
  await navLink(window, NAV_PAGES.snipes.link).click();
  await expect(window.getByRole('article', { name })).toBeVisible();

  const requests = wa.unexpectedRequests();
  expect(withoutGuardedRequests(await wa.consoleErrors(), requests)).toEqual([]);
  expect(withoutRemoteImages(requests)).toEqual([]);
});
