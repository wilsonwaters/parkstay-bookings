# Browser-driven providers

These notes are for authors of providers that have no API, such as holiday-park chains, Airbnb and RAC Parks & Resorts. Such a provider reads the provider's own website in a real browser through `ctx.browser`. Everything else (the manifest, registering the provider, the conformance suite) works as it does for any other provider: see [Adding a provider](adding-a-provider.md), whose second worked example is a browser provider.

`ctx.browser` is a `PlaywrightBrowserAutomation` (`src/main/providers/sdk/browser-automation.ts`). It drives the **Microsoft Edge or Google Chrome already installed** on the person's computer through `playwright-core`. WA Stay never bundles or downloads a browser.

The worked example is the test-only `tests/utils/fake-browser-provider.ts`, which reads the fake holiday-park site in `tests/fixtures/fake-browser-site.ts`.

## Contents

- [Choosing `api`, `browser` or `hybrid`](#choosing-api-browser-or-hybrid)
- [The `withPage` lifecycle](#the-withpage-lifecycle)
- [Selectors](#selectors)
- [Waiting](#waiting)
- [Honouring `signal`](#honouring-signal)
- [Read data, not the DOM](#read-data-not-the-dom)
- [Mapping to the normalised types](#mapping-to-the-normalised-types)
- [Search-mode catalogues (`catalogMode: 'search'`)](#search-mode-catalogues-catalogmode-search)
- [Politeness](#politeness)
- [Headless detection and bot walls](#headless-detection-and-bot-walls)
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
3. **It gives `fn` a page.** The first call after a launch reuses the blank page Chromium opens the context with; every later call opens a new page (the previous call's pages are all closed). It applies `timeoutMs` to `page.setDefaultTimeout` and `page.setDefaultNavigationTimeout`, and runs `fn(page)`.
4. **It always closes every page the call opened** when `fn` returns or throws, popups included. The context then has no pages.
5. **It serialises calls per provider.** Two `withPage` calls on one provider run strictly one after the other (concurrency 1). Calls on different providers run independently.

The context is set up the same way for every provider:

- viewport 1280 × 800, locale `en-AU`, and `timezoneId` from `manifest.timezone`;
- `acceptDownloads: false`;
- the browser's own user agent. Never override it;
- **Chromium's sandbox on** (`chromiumSandbox: true`). Playwright otherwise starts Chromium with `--no-sandbox`, and the person's own Edge or Chrome must keep its sandbox while it visits third-party sites. Only a development `WA_STAY_BROWSER_PATH` build keeps Playwright's default (no sandbox), because it often runs as root in CI or a container, where Chromium cannot start sandboxed.

Around that:

- **Idle close.** The context closes after 5 minutes with no `withPage` call. The next call relaunches it.
- **Crashes.** If the browser crashes, updates itself or disconnects, the context is dropped and the next call relaunches it.
- **Quit.** `before-quit` hides the app's windows, then disposes the container (`src/main/app/quit-hold.ts`): it cuts the renderer off, starts `registry.disposeAll()`, which calls `ctx.browser.close()`, and closes the database. `close()` gives the browser 5 s to close, then kills its process, unless the browser has already exited (its process id may by then belong to something else). The quit waits for this at most 6 s (on Windows, a `taskkill` that hangs can add up to 2 s more). A `withPage` call during or after `close()` rejects with `BrowserUnavailableError` (`closing`).
- **`isAvailable()`** returns `{ available, channel?, reason? }`. It answers from the open context or the last launch when it can. Otherwise it probes each channel with a throwaway headless browser, never the provider's profile. A definitive answer is kept for the session; a `launch-failed` probe is not, so the next call probes again.

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

## Read data, not the DOM

Many sites that need a browser still load their data as JSON: a page script calls an endpoint, or the server embeds the page's initial state in the HTML. Read that JSON rather than the rendered markup. It is faster, carries the site's own ids and values, and survives redesigns that break selectors.

- **Data that arrives by XHR or `fetch`.** Start waiting for the response *before* the action that triggers it (a response that arrives before `waitForResponse` is called is missed), then read its body:

  ```ts
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/search' && r.ok()),
    page.goto(searchUrl, { waitUntil: 'domcontentloaded' }),
  ]);
  const data: unknown = await response.json();
  ```

  Match on the endpoint's path, not the whole URL with its query string.
- **Data embedded in the page.** Frameworks often ship the page's state as JSON in a script tag, such as Next.js's `<script id="__NEXT_DATA__" type="application/json">`. Read its text and parse it in Node:

  ```ts
  const text = await page.locator('script#__NEXT_DATA__').textContent();
  const data: unknown = text ? JSON.parse(text) : undefined;
  ```

  Prefer a script tag's text over `page.evaluate(() => window.__INITIAL_STATE__)`: it is plain data, and needs nothing from the site's scripts.
- **Validate it with a zod schema in Node** before you map it. The site's JSON is not a contract. A mismatch becomes a `ProviderParseError` with a clear message, not an `undefined` deep in the mapping.
- **Use only what the page itself loads.** Do not call the site's internal endpoints with parameters its pages never send, or page through them faster than a person browsing would.
- **If the endpoint answers a plain request** with the right headers, you may not need a browser for that step at all: use `ctx.http` (`hybrid` or `api`, above).

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

## Search-mode catalogues (`catalogMode: 'search'`)

A provider that cannot list every location, such as a marketplace with thousands of listings, sets `capabilities.catalogMode: 'search'` and implements `catalog.searchArea` instead of `listLocations`. The registry refuses a `search` provider without it.

```ts
catalog: {
  searchArea: ({ bbox, stay, cursor }, signal) =>
    ctx.browser.withPage(
      async (page) => {
        // The cursor is the site's results-page number, as a string.
        const resultsPage = cursor ? Number(cursor) : 1;
        const results = await readSearchPage(page, searchUrl(bbox, stay, resultsPage));
        return {
          items: results.listings.map((listing) => toLocationSummary(ctx.id, listing)),
          nextCursor: results.hasMore ? String(resultsPage + 1) : undefined,
        };
      },
      { signal }
    ),
  getLocation: (externalId, signal) => ctx.browser.withPage(/* … */, { signal }),
},
```

- **One results page per call.** `searchArea({ bbox, stay?, cursor? })` returns `{ items, nextCursor? }`, and each call is its own `withPage`. A caller that pages through results never holds the provider's only page for the whole crawl, and other calls (a watch check) can run between pages.
- **`bbox` is `[west, south, east, north]`** in degrees (`BoundingBox`). Translate it into the site's own map-search parameters. If the site searches by centre and zoom instead, derive them from the box, and drop items outside the box before you return them.
- **`stay`, when given,** narrows the search to locations bookable for those dates, if the site can filter that way. If it cannot, ignore it. Do not check availability item by item here.
- **The cursor is opaque to the core.** Encode what the next call needs to fetch the next page (a page number, an offset or the site's own continuation token) as a string, and decode it on that call. It must not rely on anything held between calls: the page is closed, and the next call may come minutes later, after the browser was relaunched. Never put cookies, tokens or personal details in it.
- **Return `nextCursor` only when there is another page.** Stop when the site says there are no more results. Never loop through every page inside one call.
- **Keep keys stable across pages.** A listing that moves between pages because the site re-sorts keeps the same `makeLocationKey(ctx.id, externalId)`.
- **Use the site's own page size.** Every page is a full browser visit. Leave it to the caller to decide how many pages it needs.

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

## Headless detection and bot walls

Some sites treat a headless browser differently. Chromium's headless user agent contains `HeadlessChrome`, and a site may answer it with a CAPTCHA, a "browser not supported" or "access denied" page, an "unusual traffic" wall, or results that are quietly empty.

- **Detect it, then stop.** Check for these pages (and for data that should be there and is not) and throw a `ProviderError` that says the site did not let WA Stay read it, for example *"Fake Parks did not allow WA Stay to read its site. Use the site directly."* Do not retry in a loop.
- **Do not spoof or evade.** Never set or edit the user agent (for example to strip `HeadlessChrome`), patch `navigator.webdriver`, use stealth plugins, randomise fingerprints, rotate addresses, or solve or outsource a CAPTCHA. Do not switch to `headed: true` to get past a wall either: headed mode is for a person's own step, such as signing in.
- **Respect the provider's terms.** A site that blocks automated access has said it does not want it. Re-read its terms ([below](#provider-terms-and-genuine-intent)); if they forbid automation, the provider gets links only, not a browser module.

## Provider terms and genuine intent

Read the provider's terms of use before you write a module, and record what they say about automated access in the module's notes.

- **If the terms forbid automated access, do not build a browser module.** A provider can still be listed with links only.
- **Genuine intent.** WA Stay acts for one person, for stays they really mean to take. A browser provider must follow the same rules as ParkStay ([Site Sniper](../site-sniper.md#book-responsibly)):
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

- **`WA_STAY_BROWSER_PATH` is for development only.** The running app also honours it, but only when it runs from source (unpackaged and not loaded from an asar archive, `src/main/app/app-source.ts`); a packaged build always detects Edge or Chrome itself. A browser started from this path runs without Chromium's sandbox (Playwright's default), so it can run as root in CI; Edge and Chrome found by detection always run sandboxed.

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
