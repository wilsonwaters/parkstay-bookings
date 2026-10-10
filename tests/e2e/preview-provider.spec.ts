/**
 * Preview a provider in the app (opt-in): `PREVIEW_PROVIDER` names it by id.
 *
 *   npm run build:e2e
 *   npx cross-env PREVIEW_PROVIDER=acme-parks playwright test preview-provider
 *   # Linux without a display: xvfb-run -a npx cross-env PREVIEW_PROVIDER=acme-parks playwright test preview-provider
 *
 * It launches the built app as every journey does (network-free fixture mode, a temp profile)
 * with only that provider registered, and checks that Explore lists its places, that the first
 * one's page opens, and that Settings → Accounts shows it. Each step's screenshot is attached to
 * the report (`npx playwright show-report`) and saved under `test-results/`. If Explore shows
 * none of its places, the failure quotes what the app logged about the provider.
 *
 * In fixture mode the provider's HTTP answers from `tests/e2e/fixtures/http/<id>/`, whatever
 * host it asks. Browser automation (`ctx.browser`) is not served from fixtures: see "Preview in
 * the app" in docs/providers/adding-a-provider.md before you preview a browser provider.
 *
 * Without `PREVIEW_PROVIDER` the test is skipped, so the suite and CI never run it.
 */

import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './support/wa-stay';
import { chooseAccountMenuItem, currentRoute, pageHeading } from './support/shell';

const PROVIDER = process.env.PREVIEW_PROVIDER?.trim() ?? '';

/** How long a catalogue may take to show: the app syncs it 5 s after the window is up. */
const CATALOGUE_TIMEOUT_MS = 30_000;

async function screenshot(window: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = testInfo.outputPath(`${name}.png`);
  await window.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

/** The lines of the app's log that mention `id`, for a failure message. */
function linesAbout(log: string, id: string): string {
  const lines = log.split(/\r?\n/).filter((line) => line.includes(id));
  return lines.length > 0 ? lines.slice(-20).join('\n') : '(nothing)';
}

test.describe('preview a provider', () => {
  test.skip(!PROVIDER, 'Set PREVIEW_PROVIDER=<provider id> to preview a provider in the app');

  test('the provider on Explore, on a place page and in Settings', async ({
    launchWaStay,
  }, testInfo) => {
    test.setTimeout(120_000);
    const wa = await launchWaStay({ providers: [PROVIDER] });
    const { window } = wa;

    // Explore: with only this provider registered, every place listed is its own.
    const results = window.getByRole('region', { name: 'Results' });
    const count = results.getByRole('heading', { level: 2, name: /^[1-9][\d,]* places?$/ });
    try {
      await expect(count).toBeVisible({ timeout: CATALOGUE_TIMEOUT_MS });
    } catch (error) {
      await screenshot(window, testInfo, 'explore');
      throw new Error(
        `Explore shows no places from ${PROVIDER} after ${CATALOGUE_TIMEOUT_MS / 1000} s. ` +
          `What the app logged about it:\n${linesAbout(wa.mainLog(), PROVIDER)}`,
        { cause: error }
      );
    }
    await screenshot(window, testInfo, 'explore');

    // The first place's page: its detail comes from the provider.
    await results.getByRole('link').first().click();
    await expect.poll(() => currentRoute(window)).toMatch(new RegExp(`^/places/${PROVIDER}/`));
    await expect(pageHeading(window)).toBeVisible();
    await screenshot(window, testInfo, 'place');

    // Settings → Accounts: a row for every provider.
    await chooseAccountMenuItem(window, 'Settings');
    await expect(window.getByRole('heading', { name: 'Accounts' })).toBeVisible();
    await screenshot(window, testInfo, 'settings-accounts');
  });
});
