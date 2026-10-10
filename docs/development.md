# Development

How to build, run and test WA Stay from source. The code conventions (IPC, migrations,
providers, the pre-commit checks) are in [CLAUDE.md](../CLAUDE.md); the structure is in the
[architecture overview](architecture/overview.md).

## Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [The native module (better-sqlite3)](#the-native-module-better-sqlite3)
- [Running in development](#running-in-development)
- [Building and packaging](#building-and-packaging)
- [Scripts](#scripts)
- [Testing](#testing)
- [Before you commit](#before-you-commit)
- [Common tasks](#common-tasks)
- [Debugging](#debugging)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js 20** and npm 10 (`engines` in `package.json`; CI uses Node 20).
- Git.
- Windows, macOS or Linux. Windows is the shipped platform; the Electron smoke tests run on
  Linux under xvfb in CI.

## Setup

```bash
git clone https://github.com/wilsonwaters/wa-stay.git
cd wa-stay
npm ci
```

`npm ci` runs `electron-builder install-app-deps` afterwards, which builds better-sqlite3 for
Electron ([below](#the-native-module-better-sqlite3)).

**The Mapbox token.** Explore's map needs a public Mapbox token at build time:

```bash
cp .env.example .env
# then set MAPBOX_ACCESS_TOKEN=pk.your-token-here
```

- Use a **public** token (it starts with `pk.`) with public scopes only: it is bundled into the
  app, where anyone can read it. A secret `sk.` token fails the build.
- `.env` is gitignored. Never commit a token or paste one into a file, test or doc.
- Without a token everything works, and Explore shows places as a list.
- CI reads the token from the repository secret (or variable) `MAPBOX_ACCESS_TOKEN`.

## The native module (better-sqlite3)

better-sqlite3 is native code, built for one runtime at a time:

| To | It must be built for | Command |
| --- | --- | --- |
| Run the app (`npm start`, `test:e2e`, `test:electron`, `smoke:packaged`, `docs:screenshots`) | Electron | `npm run rebuild` |
| Run Jest (`npm test`, `test:tz`, `test:coverage`) | Node | `npm rebuild better-sqlite3` |

The Jest scripts check this first (`scripts/check-native-abi.js`) and say which build is
installed instead of failing every database test. `AUTO_REBUILD_NATIVE=1 npm test` rebuilds it
for Node by itself.

## Running in development

Two terminals:

```bash
# Terminal 1: TypeScript watch (main), the preload bundle and the Vite dev server on port 3000
npm run dev

# Terminal 2, once Vite prints "ready": Electron, loading http://localhost:3000
npm start
```

Open the app in the Electron window, not in a browser: in a plain browser there is no main
process, and the page says so. In development the window opens its DevTools; the main process
logs to the terminal and to `<userData>/logs`.

The dev server address (`ELECTRON_RENDERER_URL`) and the test hooks (`WA_STAY_*`) are honoured
only when the app runs from source: unpackaged, and not loaded from an asar archive
(`src/main/app/app-source.ts`). A packaged app ignores them, even renamed to `electron`.

Development uses your real data folder (`%APPDATA%\WA Stay`, `~/Library/Application
Support/WA Stay` or `~/.config/WA Stay`). To try something on a throwaway profile, set
`WA_STAY_USER_DATA_DIR` to an empty folder.

## Building and packaging

```bash
npm run build     # empties dist/, then main (tsc + tsc-alias), preload (esbuild), renderer (Vite) into it
npm run dist:win  # build, then the Windows installer and portable exe in release/
npm run pack      # build, then an unpacked app in release/ (quicker to try)
```

The build starts by removing `dist/` (`scripts/clean-dist.js`): tsc and esbuild never delete
what they wrote before, and electron-builder packages `dist/**`, so a module whose source was
deleted would otherwise ship. The preload is bundled by `scripts/build-preload.js` for the
sandboxed window; the build fails if it imports anything but `electron`. The production
Content-Security-Policy is written into `dist/renderer/index.html` at build time. The package
(`electron-builder.json` `files`) leaves out the `.d.ts` and `.map` files tsc and esbuild write
beside the JavaScript: nothing reads them at run time (Node applies source maps to stack traces
only with `--enable-source-maps`, which the app does not use, so the logs carry the compiled
positions either way). Releasing: [release process](release-process.md).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development: main in watch mode, the preload bundle, the Vite dev server |
| `npm start` | Electron on the dev server (`http://localhost:3000`) |
| `npm run build` | Production build into an emptied `dist/` |
| `npm run build:e2e` | The same build with no Mapbox token (for the Electron smoke tests) |
| `npm run dist:win` | Build and package the Windows installer and portable exe (not published) |
| `npm run pack` | Build and package an unpacked app |
| `npm test` | Jest: unit and integration tests, main and renderer projects |
| `npm run test:coverage` | Jest with coverage (thresholds in `jest.config.js`) |
| `npm run test:tz` | The timestamp tests with the clock in Perth time (`TZ=Australia/Perth`) |
| `npm run test:e2e` | The Electron smoke tests on the built app (`tests/e2e`); `:ui`, `:headed`, `:debug` variants |
| `npm run test:electron` | Live Electron tests of the HTTP transport, the ParkStay module and the provider windows (`tests/electron`), against loopback servers |
| `npm run smoke:packaged` | Starts the packaged Linux app and checks it opens and quits cleanly, with the test hooks ignored |
| `npm run docs:screenshots` | Rebuilds and retakes the screenshots in `docs/images/` |
| `npm run lint` / `lint:fix` | ESLint on `src/` |
| `npm run format` / `format:check` | Prettier on `src/`, `tests/` and `scripts/` |
| `npm run type-check` | TypeScript: main, renderer, the e2e and docs-screenshot projects |
| `npm run icons` | Regenerates the icons from the brand sources |
| `npm run rebuild` | better-sqlite3 for Electron |

## Testing

### Jest

`jest.config.js` has two projects: **main** (Node: `tests/unit`, `tests/integration`,
`tests/scripts`, `src/main`, `src/shared`) and **renderer** (jsdom: `src/renderer`,
`tests/integration/renderer`). Shared helpers are in `tests/utils/` (fake providers, a fake
`safeStorage`, an IPC harness, the ParkStay fixture server) and recorded data in
`tests/fixtures/`, including SQL dumps of real v5 and v6 databases for the migration tests.
[tests/README.md](../tests/README.md) has the details.

`npm run test:tz` runs the timestamp tests with the host in Perth (UTC+8), where an unzoned
SQLite timestamp read as local time would be 8 hours out. CI runs it after the unit tests.

The docs have tests too (`tests/unit/docs/`): every relative link and image in the docs
resolves, the provider guide's code blocks match the example providers they come from, those
examples compile and register, and every ParkStay endpoint has a verification status.

### Electron smoke tests

```bash
npm run build:e2e            # no Mapbox token: Explore is list-only, deterministically
npm run rebuild              # better-sqlite3 for Electron
xvfb-run -a npm run test:e2e # or just npm run test:e2e with a display
```

Playwright's `_electron` launcher drives the **built** app through 21 journeys in 10 specs
(`tests/e2e/*.spec.ts`): launch, navigation, Explore and its dates, resizing the window, a place
to a watch, creating a watch and a snipe, a held snipe paid from its notification, bookings, the
v1.x upgrade, and a lifecycle walk through every page and Settings section with a relaunch. One
more check is opt-in: with a Mapbox token in the build and `E2E_MAP=1`, resizing the window must
not count as a map move (`explore-resize.spec.ts`). The harness
(`tests/e2e/support/wa-stay.ts`) gives every launch:

- its own temp userData (`WA_STAY_USER_DATA_DIR`), checked before anything else;
- **fixture mode** (`WA_STAY_E2E_FIXTURES_DIR`): providers answer from
  `tests/e2e/fixtures/http/`, and a network guard cancels every other request;
- a production renderer, Perth time, Australian English, and a window forced online
  (`forceOnline`), so the suite passes with no network at all;
- seeding before launch (`support/seed.ts`: a held snipe, a v1.x data folder) and temp folders
  (`tempDir`), removed after the apps close;
- a trace, a screenshot and the main-process log for a failed test.

CI runs it on every push and pull request (`e2e` job) and always uploads the report. Selectors
use roles and accessible names only. More: [tests/README.md](../tests/README.md).

### Other checks

- **Live Electron tests** (`npm run test:electron`, not part of `npm test`):
  `ElectronSessionHttpClient` on a real partition, the ParkStay module through it, and the
  provider sign-in and payment windows, all against loopback servers.
- **The packaged app** (`npx electron-builder --linux dir --publish never`, then
  `xvfb-run -a npm run smoke:packaged`): first reads `app.asar`'s index (the main, preload and
  renderer builds are there, and no `.d.ts` or `.map` file under `dist/`), then starts
  `release/linux-unpacked/wa-stay`, and a copy renamed `electron`, with every test hook set and a
  temp `XDG_CONFIG_HOME`. It checks that the hooks are ignored (userData is the normal `WA Stay`
  folder under that temp config folder), the page comes from `app.asar`, and the app quits with
  code 0 within 10 s. CI's `packaged-smoke` job.
- **A real browser for browser providers** (opt-in):
  `WA_STAY_BROWSER_E2E=1 npx jest tests/integration/browser-automation.smoke.test.ts`
  ([browser providers](providers/browser-providers.md#the-real-browser-smoke-test)).
- **Documentation screenshots** (`npm run docs:screenshots`): rebuilds the app (with your local
  Mapbox token if `.env` has one), drives it in fixture mode (`tests/docs/`,
  `playwright.docs.config.ts`) and writes optimised PNGs to `docs/images/`. With a token only
  `api.mapbox.com` is reached; without one the run is network-free and Explore is list-only.
  Provider photos are never loaded, so cards show the placeholder. Needs better-sqlite3 built
  for Electron; on Linux without a display it runs under `xvfb-run`.

**No test touches live provider data that matters.** Tests use recorded fixtures; live checks
are anonymous and read-only, and nothing ever places a real hold, booking or payment
(architecture-notes §12.33).

## Before you commit

```bash
npm run lint          # 0 errors
npm run format:check  # npm run format fixes it
npm run type-check
npm test
```

CI enforces all four, plus `test:tz`, the Electron smoke tests and the packaged smoke check.
Commits follow conventional commits (`feat(watches): …`, `fix(parkstay): …`).

## Common tasks

- **Add an IPC method:** the channel in `src/shared/contracts/channels.ts`, the definition (zod
  request, response type) in the namespace file, a handler with `handle()` in
  `src/main/ipc/handlers/`, the mapper in `src/preload/index.ts`, then a hook in
  `src/renderer/api/`. The parity tests fail until all agree. See [CLAUDE.md](../CLAUDE.md).
- **Add a migration:** only in `src/main/database/connection.ts` `runMigrations()`, following
  the rules in [CLAUDE.md](../CLAUDE.md), with an upgrade test from the v5 and v6 fixtures.
- **Add a provider:** [Adding a provider](providers/adding-a-provider.md).
- **Add a setting:** a key in `SETTING_KEYS` (`src/shared/contracts/settings.ts`); main owns its
  type and category.
- **Add a page:** a route in `src/renderer/app/routes.ts` and `AppRoutes.tsx`, the page under
  `src/renderer/features/<domain>/`, built from `components/ui` primitives and design tokens
  ([design](design/components.md)). Data only through `renderer/api/` hooks.

## Debugging

- **Main process:** the terminal and `<userData>/logs/` (`combined.log`, `error.log`). Logs
  never include IPC payload values or secrets.
- **Renderer:** the DevTools the development window opens. React Query's cache holds every
  `window.api` answer.
- **IPC:** a failed call returns `{ success: false, code, error }`; the `code` (`VALIDATION`
  with `issues`, `NOT_FOUND`, `PROVIDER_ERROR`, `ACCESS_GATE`, `RATE_LIMITED`…) says which side
  to look at.
- **Database:** `<userData>/wa-stay.db` (SQLite, WAL). Open a copy with any SQLite browser while
  the app is closed.
- **Providers in tests:** `createTestProviderContext` and the ParkStay fixture server let a
  provider run without the network.

## Troubleshooting

**Port 3000 is already in use.** Vite then moves to another port, but `npm start` still loads
`http://localhost:3000`. Stop whatever holds port 3000 and run `npm run dev` again:

```bash
# Windows
netstat -ano | findstr :3000
taskkill /F /PID <PID>

# macOS / Linux
lsof -i :3000
kill <PID>
```

Or point Electron at the port Vite printed:
`npx cross-env ELECTRON_RENDERER_URL=http://localhost:3001 electron .`

**The Electron window is blank.**

1. Vite is not running yet: wait for its "ready" line, then reload (Ctrl+R) or run `npm start`
   again.
2. A TypeScript error stopped the main-process build: fix the error shown in terminal 1.
3. The preload bundle is missing (`dist/preload/index.js`): the window says so. `npm run dev`
   builds it; `npm run build:preload` builds it once.
4. Check the DevTools console and the main-process log.

**"better-sqlite3 is built for the wrong runtime, so the Jest suite cannot load it."** Run
`npm rebuild better-sqlite3` (or `AUTO_REBUILD_NATIVE=1 npm test`), and `npm run rebuild` again
before running the app.

**The app does not start: "NODE_MODULE_VERSION".** better-sqlite3 is built for Node: run
`npm run rebuild`.

**"Cannot find module".** Reinstall: `rm -rf node_modules && npm ci`.

**Editor shows TypeScript errors the build does not.** Restart the editor's TypeScript server.

**"Database is locked".** Another WA Stay is running on the same data folder. Only one instance
runs per folder; close the other one.
