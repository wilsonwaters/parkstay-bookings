# Browser-driven providers

These notes are for authors of providers that have no API, such as holiday-park chains, Airbnb and RAC Parks & Resorts. Such a provider reads the provider's own website in a real browser through `ctx.browser`. Everything else (the manifest, registering the provider, the conformance suite) works as it does for any other provider.

`ctx.browser` is a `PlaywrightBrowserAutomation` (`src/main/providers/sdk/browser-automation.ts`). It drives the **Microsoft Edge or Google Chrome already installed** on the person's computer through `playwright-core`. WA Stay never bundles or downloads a browser.

The worked example is the test-only `tests/utils/fake-browser-provider.ts`, which reads the fake holiday-park site in `tests/fixtures/fake-browser-site.ts`.

## Contents

- [Choosing `api`, `browser` or `hybrid`](#choosing-api-browser-or-hybrid)
- [The `withPage` lifecycle](#the-withpage-lifecycle)
- [Selectors](#selectors)
- [Waiting](#waiting)
- [Honouring `signal`](#honouring-signal)
- [Mapping to the normalised types](#mapping-to-the-normalised-types)
- [Politeness](#politeness)
- [Provider terms and genuine intent](#provider-terms-and-genuine-intent)
- [Headed mode for human steps](#headed-mode-for-human-steps)
- [Testing with a mocked `playwright-core`](#testing-with-a-mocked-playwright-core)
- [The real-browser smoke test](#the-real-browser-smoke-test)
- [The browser profile and privacy](#the-browser-profile-and-privacy)
- [Errors people see](#errors-people-see)

## Choosing `api`, `browser` or `hybrid`

Set `manifest.integration` to say how the provider talks to its site.

| `integration` | Choose it when | Your modules use |
| --- | --- | --- |
| `api` | The site has JSON (or plain HTML) endpoints that answer a normal HTTP request with the right headers. **Always prefer it.** It is faster, lighter on the person's computer and on the provider, and it breaks less often. | `ctx.http` only. |
| `browser` | There is no usable endpoint: pages are built by JavaScript from data you cannot request directly, or the site only answers a real browser engine. | `ctx.browser` for every module. |
| `hybrid` | Most data comes from endpoints, but one step needs a browser, such as a page that must run its own script before an endpoint answers. | `ctx.http` for most calls and `ctx.browser` for that step. |

Before you choose `browser`, open the site's network panel and look for the requests its pages make. Many "no API" sites load their data from an endpoint that `ctx.http` can call.

The browser profile and `ctx.http`'s session partition (`persist:provider-<id>`) are **separate cookie jars**. A `hybrid` provider must not assume that a sign-in in one is visible to the other.

## The `withPage` lifecycle

```ts
const parks = await ctx.browser.withPage(
  async (page) => {
    await page.goto(`${BASE}/parks`, { waitUntil: 'domcontentloaded' });
    return page.$$eval('[data-location]', readParks);
  },
  { signal, timeoutMs: 30_000 }
);
```

`withPage(fn, { headed = false, timeoutMs = 60_000, signal })` does the following:

1. **It loads `playwright-core` on first use only.** App start-up, and providers that never automate, pay nothing for it.
2. **It launches one persistent context per provider, lazily, and reuses it.** Chromium locks a profile directory, so a provider never has two.
   - It finds a browser by trying channels in platform order: `msedge` then `chrome` on Windows (Edge is on every Windows 10/11 machine), and `chrome` then `msedge` on macOS and Linux.
   - It remembers the channel that worked in `ctx.state` (`browser.channel`) and tries it first next time.
3. **It opens a fresh page, applies `timeoutMs`** to `page.setDefaultTimeout` and `page.setDefaultNavigationTimeout`, and runs `fn(page)`.
4. **It always closes every page the call opened** when `fn` returns or throws, popups included. The context then has no pages.
5. **It serialises calls per provider.** Two `withPage` calls on one provider run strictly one after the other (concurrency 1). Calls on different providers run independently.

The context is set up the same way for every provider:

- viewport 1280 × 800, locale `en-AU`, and `timezoneId` from `manifest.timezone`;
- `acceptDownloads: false`;
- the browser's own user agent. Never override it.

Around that:

- **Idle close.** The context closes after 5 minutes with no `withPage` call. The next call relaunches it.
- **Crashes.** If the browser crashes, updates itself or disconnects, the context is dropped and the next call relaunches it.
- **Quit.** `registry.disposeAll()` on `before-quit` calls `ctx.browser.close()`. It gives the browser 5 s to close, then kills its process. A `withPage` call during or after `close()` rejects with `BrowserUnavailableError` (`closing`).
- **`isAvailable()`** returns `{ available, channel?, reason? }`. It answers from the open context or the last launch when it can. Otherwise it probes each channel with a throwaway headless browser, never the provider's profile. The answer is kept for the session.

Rules for `fn`:

- **Do one unit of work per call**, such as list the parks or check one stay. A long `fn` holds the provider's only page and blocks every other call.
- **Never keep the `page`** (or a locator, element handle or listener) after `fn` returns. The page is closed.
- **Do not open extra contexts or browsers.** Use the page you are given. If the site opens a popup, it is closed with the page.
- **Return plain data**, not Playwright objects.

## Selectors

Pick selectors the site is least likely to change, in this order:

1. **Roles and accessible names:** `page.getByRole('button', { name: 'Check availability' })`, `getByLabel('Arrival date')`.
2. **Test ids and data attributes the site sets on purpose:** `getByTestId('park-name')`, `[data-location]`, `[data-night]`.
3. **Visible text**, for links and headings: `getByText('Our parks')`.

**Never use CSS class names.** Sites generate them (`.css-1x2y3z`), rename them in redesigns and share them between unrelated elements. Avoid positional selectors (`nth-child`, long XPath) for the same reason.

Keep every selector for a site in one place in your module, so a site change is a one-file fix.

## Waiting

Wait for the thing you need, never for a length of time.

- **Locators wait for you.** `locator.click()`, `fill()` and `textContent()` wait until the element is there and actionable.
- **Use explicit waits for a state:** `locator.waitFor({ state: 'visible' })`, `page.waitForURL('**/availability**')`, or `page.waitForResponse((r) => r.url().includes('/api/rates'))` when the data arrives by XHR.
- **Navigate with `waitUntil: 'domcontentloaded'`**, then wait for the element that holds your data. `'networkidle'` is slow and never settles on sites that poll.
- **Never use `page.waitForTimeout()`, `setTimeout` or retry loops with sleeps.** They are slow when the site is fast and flaky when it is slow.

Every wait is bounded by `timeoutMs`. A timeout rejects with Playwright's `TimeoutError`, so let it propagate (or wrap it in a `ProviderError`) rather than retrying in place.

## Honouring `signal`

Every module method receives an `AbortSignal`. Pass it to `withPage`:

```ts
check: (externalId, stay, { signal } = {}) =>
  ctx.browser.withPage(async (page) => { /* … */ }, { signal }),
```

- **An abort rejects the call at once** with an `AbortError` and closes the page. Whatever `fn` is waiting on in the page then fails, so `fn` unwinds by itself.
- **A call that is still queued behind another call never runs** once it is aborted.
- **In a long `fn`** (paging through results, many dates), call `throwIfAborted(signal)` from `@main/providers/sdk` between steps.
- **Never swallow errors** in a `catch` inside `fn`. If you must catch, rethrow anything for which `isAbortError(error)` is true.

## Mapping to the normalised types

Read raw values in the page, then map them in Node.

- **Page functions run inside the browser.** A function passed to `$$eval`, `$eval` or `evaluate` can use only its arguments and browser globals. It cannot close over Node variables or imports. Results cross back as JSON, so return plain objects.
- **Keep page functions dumb.** Read text and attributes (see `readParks` in the fake provider). Do the interpretation, such as parsing prices, mapping words to states and building keys, in ordinary Node code that you can unit test.
- **Build keys with `makeLocationKey(ctx.id, externalId)`.** Use the site's own stable id as `externalId`, never a position in a list.
- **Map the site's words to the normalised enums** with an explicit table, and fall back to the neutral value:
  - `NightState`: `available | booked | closed | not-released | unknown`. A word you do not recognise is `unknown`, never `available`.
  - `LocationKind`: an unknown kind is `other`.
- **Return only the stay's nights.** Filter to `arrival <= date < departure`, whatever the page shows. Set `fullyAvailable` only when every night is `available`.
- **Turn an error page into an error.** Check `response.status()` after `page.goto` and throw `ProviderHttpError` for a non-2xx status, as `open()` does in the fake provider. A page that has no data is not an empty result.
- **Sanitise nothing yourself.** Return HTML for `descriptionHtml` as you found it; main sanitises it before it crosses IPC.

## Politeness

A browser visit costs the provider far more than an API call: it loads scripts, images and fonts. Keep the load to what one careful person would cause.

- **One page at a time.** `withPage` already serialises a provider's calls. Do not work around it, for example by opening several pages inside one `fn`.
- **Set `manifest.limits`** to match:
  - `maxConcurrentRequests: 1`;
  - `minWatchIntervalMinutes` generous enough for a page load (the fake provider uses 30);
  - `catalogTtlHours` so the catalogue is crawled rarely (24 or more).
- **Set `release.pollFloorMs`** (`{ window, continuous }`) if the provider supports snipes. Core services never poll faster than these floors. Pick floors for a page load, not for an API call.
- **Fetch only what the stay needs.** Ask for the stay's dates, not a whole season, and do not pre-fetch pages "just in case".
- **Never solve, bypass or outsource a CAPTCHA**, and do not use stealth plugins, fingerprint spoofing or a fake user agent. If a CAPTCHA, bot wall or "unusual traffic" page appears, stop and fail with a clear error. Do not retry in a loop.
- **Back off on errors.** A `429`, `503` or block page means slow down. Throw a retryable `ProviderError` and let the core's scheduling decide when to try again.

## Provider terms and genuine intent

Read the provider's terms of use before you write a module, and record what they say about automated access in the module's notes.

- **If the terms forbid automated access, do not build a browser module.** A provider can still be listed with links only.
- **Genuine intent.** WA Stay acts for one person, for stays they really mean to take. A browser provider must follow the same rules as ParkStay ([SITE_SNIPER.md](../SITE_SNIPER.md#compliance--read-this)):
  - one account per person;
  - one booking per night;
  - holds only on the person's own account, in their own name;
  - no booking for others, no transfer or resale.
- **Payment is always a human step.** A module may place a hold. The person completes payment on the provider's own site.

## Headed mode for human steps

Headless is the default. Use `headed: true` only for a step a person must do themselves, such as signing in with a one-time code when V6's in-app sign-in window (an Electron window on the provider's partition) cannot be used.

```ts
await ctx.browser.withPage(
  async (page) => {
    await page.goto(SIGN_IN_URL);
    // The person signs in; wait for the signed-in page, not for a time.
    await page.getByRole('link', { name: 'My bookings' }).waitFor();
  },
  { headed: true, timeoutMs: 5 * 60_000, signal }
);
```

- **Switching mode relaunches the browser.** Asking for headed mode while a headless context is open (or the reverse) closes the context and relaunches it in the requested mode, with a log line. It is the same profile, so cookies carry over.
- **The headed window closes when `fn` returns.** The next headless call relaunches headless.
- **Give the person time.** Use a long `timeoutMs` and wait for a page or element that proves the step is done.
- **Tell the person first.** The UI should say a browser window is about to open and why.
- **`ProviderAuth.kind: 'automation'`** (`signIn(browser, signal)`) is declared and validated. The account service does not implement it yet.

## Testing with a mocked `playwright-core`

Unit and contract tests never start a browser. They mock `playwright-core` with `tests/utils/fake-playwright.ts`:

```ts
jest.mock('playwright-core', () =>
  jest.requireActual('@tests/utils/fake-playwright').fakePlaywrightModule()
);

import { fakePlaywright } from '@tests/utils/fake-playwright';
import { renderFakeSite } from '@tests/fixtures/fake-browser-site';

beforeEach(() => {
  fakePlaywright.reset(); // Edge and Chrome "installed", no site
  fakePlaywright.site = renderFakeSite; // (url) => { status, html }
});
```

- **Pages render your site's HTML in jsdom.** `page.$$eval(selector, fn)` runs your real page function against that DOM, and results come back JSON-serialised, as from a real browser.
- **Write a fixture site** for your provider that returns the markup your module reads, using the site's real attribute names and words. Keep its data deterministic.
- **Simulate the environment:**
  - `fakePlaywright.installed = new Set(['chrome'])` (or an empty set for "no browser");
  - `unsupported`, `profileLockedLaunches` and `launchError` for launch failures;
  - `context.crash()` for a crash;
  - `hangOnClose` for a browser that will not close.
- **The fake implements the part of the Page API the fake provider uses** (`goto`, `title`, `$$eval`, `close`, the timeout setters). If your module uses more, such as locators, extend the fake with the same behaviour as Playwright's.
- **Run the conformance suite** with `openPages`, so it checks that no call leaves a page open:

  ```ts
  describeProviderContract('my-provider', () => {
    const factory = createMyProviderFactory();
    const ctx = createTestProviderContext(factory.manifest);
    return {
      provider: factory(ctx),
      sample: { externalId: 'some-park', stay: STAY },
      openPages: () => fakePlaywright.openPages(),
      cleanup: () => ctx.browser.close(),
    };
  });
  ```

`tests/integration/browser-provider-contract.test.ts` is the reference.

## The real-browser smoke test

`tests/integration/browser-automation.smoke.test.ts` drives the fake provider on a **real** browser, with no mocks, against the fake site served on loopback HTTP. It is skipped unless you opt in:

```bash
WA_STAY_BROWSER_E2E=1 npx jest tests/integration/browser-automation.smoke.test.ts
```

- **It detects the installed Edge or Chrome**, as the app does, and uses a throwaway profile.
- **To automate a specific Chromium build** (Linux CI, or a machine with neither browser), set `WA_STAY_BROWSER_PATH`:

  ```bash
  WA_STAY_BROWSER_E2E=1 WA_STAY_BROWSER_PATH=/path/to/chrome \
    npx jest tests/integration/browser-automation.smoke.test.ts
  ```

- **`WA_STAY_BROWSER_PATH` is for development only.** The running app also honours it, but only when it is not packaged; a packaged build always detects Edge or Chrome itself.

Copy this test for your provider and point it at a local fixture site, never at the live site.

## The browser profile and privacy

Each provider has its own persistent browser profile at:

```text
<userData>/providers/<id>/browser
```

`<userData>` is Electron's `app.getPath('userData')`. On Windows that is a folder under `%APPDATA%`.

- **What it holds.** Everything a browser profile holds for that provider's site: **cookies, including sign-in sessions**, local storage, cache and history. Keeping it means the person stays signed in between runs, as they would in their own browser.
- **Isolation.** It is not the person's own Edge or Chrome profile, and providers never share one.
- **Privacy note.** Anyone who can read the person's user-data folder can read these cookies. Never log cookies, tokens, form values or page content that holds personal details. Log URLs without query strings.
- **Locks.** If the folder is locked by a browser that did not exit, the launch is retried once after 1 s and then fails with `profile-locked`.
- **WA Stay never deletes a profile automatically.** Deleting the folder while the app is closed signs the person out of that provider's browser session.

## Errors people see

When automation cannot run, `withPage` rejects with `BrowserUnavailableError` (`code: 'browser-unavailable'`). Its `reason` says why, and its message is shown to the person (IPC maps it to `PROVIDER_ERROR`):

| `reason` | When | Message |
| --- | --- | --- |
| `no-browser` | Neither Edge nor Chrome is installed. | "WA Stay needs Microsoft Edge or Google Chrome installed to use {provider}" |
| `runtime-missing` | `playwright-core` could not be loaded (a broken installation). | Asks the person to reinstall WA Stay. |
| `profile-locked` | Another browser process holds the profile. Retryable. | Asks the person to close it and try again. |
| `launch-failed` | The browser was found but did not start. Retryable. | Asks the person to try again later. |
| `closing` | The app is quitting. | Not shown; the work is abandoned. |

Let these propagate from your modules unchanged. Do not catch them to retry, and do not replace the message.
