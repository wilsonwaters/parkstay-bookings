# Runbook — local dev environment

## Install
```bash
npm ci                      # postinstall builds better-sqlite3 for Electron's ABI
```

## Native module ABI (important)
`better-sqlite3` must be compiled for **Node** to run Jest, and for **Electron** to run the app.
- Tests: `npm rebuild better-sqlite3` (CI does this before `npm test`).
- App: `npx electron-rebuild -f -w better-sqlite3` (or `npm run rebuild`).
In the orchestration sandbox both builds are cached in the scratchpad (`native/node.node`, `native/electron.node`) and copied into `node_modules/better-sqlite3/build/Release/better_sqlite3.node` as needed.

## Pre-commit gate
```bash
npm run lint && npm run format:check && npm run type-check && npm test
```

## Running the app headless (sandbox / CI)
```bash
npm run build
xvfb-run -a npx electron . --no-sandbox     # needs the Electron ABI build
```
Runtime verification uses Playwright's `_electron` launcher against the built app (see tests/e2e once Q1 lands).

## Mapbox
Copy `.env.example` → `.env` and set `MAPBOX_ACCESS_TOKEN=pk....` (gitignored). CI reads the `MAPBOX_ACCESS_TOKEN` secret.
