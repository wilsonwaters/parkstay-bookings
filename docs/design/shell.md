# WA Stay app shell

The frame around every page: the header, the route table, the floating tray, error handling and focus management. It lives in `src/renderer/app/`, and the data layer it relies on lives in `src/renderer/api/`. There is no login gate (brief D2): the app opens straight on Explore.

The accessible names in [Stable names](#stable-names) are a contract with the Electron smoke tests (Q1). Change one only together with this page and those tests.

## Files

| File | What it is |
| --- | --- |
| `main.tsx` | Renders `app/App` in `StrictMode`. Nothing else. |
| `app/App.tsx` | Fonts and styles, `AppProviders`, the app-level error boundary and `AppRoutes`. |
| `app/AppProviders.tsx` | `HashRouter` (production loads `file://`), `QueryClientProvider`, `LucideProvider` (stroke 1.75, 20 px), `ToastProvider`, `AnnouncerProvider` and `ProviderManifestsProvider`, filled from `useProviders()`. |
| `app/AppRoutes.tsx` | The route table. (Not `routes.tsx`: `./routes` would be ambiguous, and Vite, Jest and TypeScript all resolve it to `routes.ts` first.) |
| `app/routes.ts` | `PATTERNS`, `ROUTES`, `buildPath()`, `LEGACY_REDIRECTS` and `pageTitleFor()`. |
| `app/AppShell.tsx` | Header, `<main id="main">`, the route error boundary and the tray. |
| `app/TopNav.tsx`, `app/AccountMenu.tsx` | The primary navigation and the account menu. |
| `app/Tray.tsx` | The bottom-right stack of floating messages. |
| `app/ErrorBoundary.tsx` | `AppErrorBoundary` and `RouteErrorBoundary`. |
| `app/useRouteFocus.ts` | Focus and announcements on page changes. |
| `app/NotFoundPage.tsx`, `app/LegacyPageFrame.tsx` | The 404 page, and the gutter and width the legacy pages used to get from the old sidebar layout (the same as the new pages'). |
| `features/explore/ExplorePage.tsx` | Explore, the home screen (E1): search pill, filters, results and the map ([map.md](map.md)). |
| `features/<domain>/legacy/` | The pre-redesign pages, moved unchanged. The U tasks rebuild them and delete these folders. |

## Header

```
+--------------------------------------------------------------------------------------+
| [WA Stay lockup]  Explore  Watches  Site Sniper (Soon)  Bookings (Soon)  [Bell] [Acc] |  64 px
+--------------------------------------------------------------------------------------+
   link to /        <nav aria-label="Primary">                              Bell  Account menu
```

- 64 px high, `sticky top-0 z-header`, `surface` background with a hairline `border` bottom. Gutters are 24 px, or 32 px from 1024 px wide.
- **Skip link** first: "Skip to content", visually hidden until focused, then shown over the logo. It is the first Tab stop and moves focus to `<main id="main">` (by script, since a plain `#main` link would change the HashRouter route).
- **Logo:** the B1 lockup (`components/brand/Logo.tsx`, architecture-notes §12.28), decorative, inside a link to `/` named "WA Stay, Explore".
- **Primary nav:** Explore, Watches, Site Sniper, Bookings.
  - The current item has `aria-current="page"`, ink text at weight 600 and the D1 `underline` brushstroke in ocean, which is `aria-hidden`. The stroke sits in the label's own box at full width, so it is as wide as the label (not the Soon pill) at any zoom. Other items are `fg-secondary` at weight 500. A hidden bold copy of each label reserves its width, so the nav does not shift between pages.
  - Explore is current on `/` and on `/places/*`. Watches is current on `/watches` and everything under it, and the same for Site Sniper and Bookings. On Settings, nothing in the nav is current.
  - Site Sniper and Bookings carry a sun `Badge` reading "Soon", which is `aria-hidden`. Their name comes whole from `VisuallyHidden` text ("Site Sniper, coming soon"), with the visible label hidden from assistive technology, so the name has no stray separator in any engine. Below 900 px wide (a narrow window or 200% zoom) the pills collapse and only the hidden text remains.
- **Right:** the `NotificationBell`, then the account menu. The bell's trigger is an `IconButton` with the lucide `Bell`, named "Notifications", or "Notifications, 3 unread" when there are unread notifications; the count also shows in a decorative `accent` badge (9+ at most). Its dropdown list is still legacy (U5 rebuilds it). The account menu is an `IconButton` with `CircleUser`, named "Account and settings". Its items are "Settings" (a link to `/settings`) and "About WA Stay", which opens a `Dialog` named "About WA Stay". Focus returns to the menu button when the dialog closes. There is no Logout and no sign-in (§12.21–22); provider accounts arrive with V6 and U4.
- The header never wraps. Down to the 960 × 640 minimum window (`minWidth`/`minHeight` on the `BrowserWindow`) there is no horizontal scrolling.
- Zoomed in, the viewport can be narrower than 960 CSS px. Below 900 px the Soon pills collapse; below 640 px the lockup gives way to the square mark and the gutters tighten. If the nav still does not fit (about 200% zoom), the nav strip scrolls sideways on its own, with its scrollbar hidden (Tab scrolls a focused link into view), and the page itself never scrolls sideways.

## Routes

Build every address with `ROUTES` (or `buildPath` with a pattern), never by joining strings. `buildPath` `encodeURIComponent`s each parameter, so an `externalId` may hold `/`, `?` or spaces.

| Path | `ROUTES` key | Renders | Notes |
| --- | --- | --- | --- |
| `/` | `explore` | `ExplorePage` | Its state lives in the query string (`q`, filters, dates, guests, `map`, `follow`, `view`, `sel`). |
| `/places/:providerId/:externalId` | `placeDetail(providerId, externalId)` | `NotFoundPage` | Reserved for E2. |
| `/watches` | `watches` | legacy Watches list |  |
| `/watches/new` | `watchNew(prefill?)` | legacy Create Watch |  |
| `/watches/:id` | `watchDetail(id)` | legacy Watch detail |  |
| `/watches/:id/edit` | `watchEdit(id)` | legacy Edit Watch |  |
| `/site-sniper` | `snipes` | legacy Site Sniper list |  |
| `/site-sniper/new` | `snipeNew(prefill?)` | legacy Create Snipe |  |
| `/site-sniper/:id` | `snipeDetail(id)` | `NotFoundPage` | Reserved for U2. |
| `/bookings` | `bookings` | legacy Bookings list |  |
| `/bookings/:id` | `bookingDetail(id)` | legacy Booking detail |  |
| `/settings/:section?` | `settings(section?)` | legacy Settings | The legacy page ignores `section` until U4, so an unknown section shows the default. |
| `/__design` | `design` | `DesignPreviewPage` | Development builds only, lazy, outside the shell (it has its own header and main). |
| `/watches/create`, `/site-sniper/create` |  | redirect | To `/new`, keeping the query string (§12.19). |
| anything else |  | `NotFoundPage` | "Page not found" and "Back to Explore". |

Legacy pages render inside `LegacyPageFrame` until the provider-ux stream rebuilds them. It gives them the new pages' gutter (`px-6 py-8 lg:px-8`, `max-w-7xl`), so their `h1`s line up with the new pages', and cancels the `p-6` root that the legacy Watches and Site Sniper lists still carry.

**Prefill query** for create flows (§12.10): `?provider=<id>&location=<externalId>&arrival=YYYY-MM-DD&departure=YYYY-MM-DD&adults=N&children=N`. `ROUTES.watchNew(prefill)` and `ROUTES.snipeNew(prefill)` build it and leave out empty values. `location` is the provider's external id, not the composite location key.

## Focus and announcements

- After every change of page (pathname, not the query string), `useRouteFocus` moves focus to the page's `h1` (given `tabIndex={-1}` if it has none), or to `<main>` when there is no `h1` yet, and announces the title through the polite live region. The announcement is the `h1` text, or the route's title from `pageTitleFor()`.
- A page that loads before showing its heading gets two seconds' grace: if its `h1` appears while focus is still on `<main>` (or was lost to the body), focus moves to it. The same applies when a page replaces the `h1` it showed first (heading, spinner, heading again): focus lost with the old heading moves to the new one.
- The first page after launch is left alone, so the first Tab still reaches the skip link. In a quick run of navigations, only the last page takes focus.
- A heading focused this way (`h1`–`h3` with `tabindex="-1"`) draws no focus ring (a base rule in `styles/index.css`): it is a reading position, not a control. Everything a person can Tab to keeps the 2 px ring.
- Landmarks: one `banner` (the header), one `navigation` named "Primary", one `main`. Each page has exactly one `h1`, normally from `PageHeader`.

## Tray

One column, `fixed bottom-4 right-4`, 380 px wide at most, with an 8 px gap, portalled outside `#root`. The column stretches its cards (`items-stretch`) and the toast region fills it, so the stacked cards share one width; the minimized queue pill keeps its own width at the right. Top to bottom, in DOM and visual order:

1. `ToastViewport` (the "Notifications" region)
2. `UpdateNotification` (legacy; U5 restyles it)
3. `QueueStatus` (legacy; U5 restyles it)

- The column never takes clicks itself (`pointer-events-none`); only the cards in it do.
- Each card sits in a slot with no box of its own (`display: contents`), so a card that renders nothing (`QueueStatus` while idle) leaves no gap.
- **Layers.** The tray is at `z-tray` (40), under the modal scrim (`z-overlay`, 50). Being portalled, it is never made `inert` by a modal. While a modal is open (the overlay stack marks `#root` inert), the tray rises to `z-toast` (60) so toasts stay readable and clickable above the scrim, and the update and queue slots are made `inert` and invisible, keeping their space so toasts do not move. Everything returns when the modal closes.
- **Explore (E1):** the tray covers the bottom-right corner of the map, so the Mapbox logo and attribution sit bottom-left, where it never covers them (Mapbox terms).

## Errors

- `AppErrorBoundary` wraps everything inside the providers. Anything that throws outside a page (the header, the tray) replaces the window with a full-page `EmptyState`: "WA Stay hit a problem", with "Reload WA Stay" and "Copy error details" (message, stack, component stack and route).
- `RouteErrorBoundary` wraps only the routed page and is keyed by pathname. A page that throws shows "This page hit a problem" with the error message, "Try again" and "Back to Explore", while the header and tray keep working. Going to any other page starts with a fresh boundary.

## Data layer (`renderer/api/`)

`src/renderer/api/` is the only place that touches `window.api` (architecture-notes §8).

- `client.ts`: `unwrap(call)` resolves an `APIResponse` to its `data` or rejects with `ApiError { message, code?, issues? }`. Pass a function of the API, `unwrap((api) => api.app.getInfo())`, so that a missing `window.api` also becomes an `ApiError` (`API_UNAVAILABLE`).
- `queryKeys.ts`: the only place query keys are built, with `providers`, `catalog`, `notifications`, `app` and `updater` namespaces. Invalidate a namespace with its `all` prefix.
- `events.ts`: `useApiEvent(name, cb)` subscribes for as long as the component is mounted and always calls the latest `cb`. `useInvalidateOn(event, queryKey)` marks a query stale when the event arrives.
- `providers.ts`: `useProviders()`, `useProvider(id)` and `useProvidersWith(capability)`. Until V1 (#19) adds the shared `ProviderManifest` and `window.api.providers`, they use a local structural type marked `TODO(V1)` and resolve to an empty list when the preload has no `providers` namespace.
- `app.ts`: `useAppInfo()` and `useOpenLogsFolder()` for About.
- `catalog.ts`: `useCatalogSearch(query)` (`catalog.search` with `limit: 5000`, previous results kept while the next load, 5 minutes fresh), `useCatalogAll()` (the unfiltered catalogue, for filter options and suggestions; the same cache entry as an empty search), `useCatalogStatus()`, `useCatalogRefresh()`, and `useCatalogUpdates()`, which reloads them on `catalog:updated`. The map area is never sent: Explore filters by area in the renderer.
- **Query client** (`app/queryClient.ts`): `staleTime` 60 s, no refetch on window focus, queries retry once except for `VALIDATION`, `CAPABILITY`, `NOT_FOUND`, `NOT_IMPLEMENTED` and `API_UNAVAILABLE`, and mutations never retry.
- **Guard:** `tests/unit/renderer/api-boundary.test.ts` fails if `window.api` appears outside `renderer/api/` and its explicit legacy allow-list. The U tasks delete entries as they rebuild each page; the list never grows. The token guard keeps a similar list of the legacy pages.

### Outside the app

With no `window.api` (the renderer opened in a plain browser with `npm run dev:renderer`), the shell still renders. A warning `Notice` at the top of `<main>` says the background service isn't available, and the legacy bell, update card and queue status are left out because they call `window.api` themselves.

### Provider manifests

`ProviderManifestsProvider` is filled from `useProviders()`, so `<ProviderBadge providerId="parkstay" />` needs no `info`. If the list is empty or fails, badges fall back to their unknown variant, and a failure raises one error toast ("Provider details couldn't be loaded. …") after a single retry.

## Stable names

| What | Role | Accessible name |
| --- | --- | --- |
| Skip link | link | Skip to content |
| Logo | link | WA Stay, Explore |
| Primary navigation | navigation | Primary |
| Nav items | link | Explore · Watches · Site Sniper, coming soon · Bookings, coming soon |
| Notifications bell | button | Notifications, or "Notifications, N unread" |
| Account menu button | button | Account and settings |
| Account menu items | menuitem | Settings · About WA Stay |
| About | dialog | About WA Stay |
| Toasts | region | Notifications |
| 404 | heading level 1, button | Page not found · Back to Explore |
| Route error | heading level 1, buttons | This page hit a problem · Try again · Back to Explore |
| App error | heading, buttons | WA Stay hit a problem · Reload WA Stay · Copy error details |
| Explore page title | heading level 1 (visually hidden) | Explore places to stay |
| Explore search | search, combobox, button | Search places · Where · Search |
| Explore filters | group, buttons | Filters · Provider · Type · Region · Facilities · Book online · Clear all (a chip with choices: "Region, 1 selected") |
| Explore results | region, heading level 2 | Results · "169 places", or "169 places in map area" |
| Explore map | region, switch | Map of places · Search as I move the map |
| Explore below 1024 px | button | Show map · Show list |

## Testing

- `tests/utils/renderer/renderWithApp.tsx`: `renderWithApp({ route, api })` renders the whole app at a route, in a `#root` container, with a fresh query client. `api` takes stubs for `createMockApi`, a ready `MockApi`, or `null` for no `window.api`. `currentRoute()` reads the HashRouter path. `getBanners()` returns the banner landmarks as a browser computes them: jsdom also counts every `PageHeader`'s `<header>`, which browsers do not.
- `tests/utils/renderer/createMockApi.ts`: a strict `window.api` (an un-stubbed method rejects with an error naming it) that answers the shell's and the legacy list pages' first calls, with a working `events.on`. `emit(name, payload)` drives events inside `act`, and `unsubscribes` holds a spy for each subscription.
