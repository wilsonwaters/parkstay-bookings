#!/usr/bin/env node
/**
 * `npm run smoke:packaged`: starts the packaged Linux app (`electron-builder --linux dir`) the
 * way an installed copy starts, and checks that it opens its window and quits cleanly. The
 * Electron smoke tests (`tests/e2e`) drive the app from source; this is the one check of what
 * electron-builder actually ships (app.asar, the native module, the preload).
 *
 *   npx electron-builder --linux dir --publish never
 *   xvfb-run -a npm run smoke:packaged [-- <path to the executable>]
 *
 * Each start gets a temp `XDG_CONFIG_HOME`, so the data folder is `<temp>/WA Stay` and no real
 * profile is touched. The test-only and development hooks are set on purpose
 * (`WA_STAY_USER_DATA_DIR`, `WA_STAY_E2E_FIXTURES_DIR`, `ELECTRON_RENDERER_URL`,
 * `NODE_ENV=development`): a packaged app must ignore them (architecture-notes §12.14). Two
 * starts:
 *
 * 1. the executable as built: `app.isPackaged` is true;
 * 2. a copy named `electron`, which Electron reports as unpackaged (it decides by the
 *    executable's name) while the code still comes from `resources/app.asar`.
 *
 * For each: userData is the temp data folder, the window shows the built page from app.asar
 * with its `h1`, and `app.quit()` ends the process with exit code 0 within 10 s.
 *
 * Not in fixture mode, so the app may make its usual start-up requests (the update check); it
 * is closed before the catalogue sync and account check (5 s after the window opens) start.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_EXECUTABLE = path.join(ROOT, 'release', 'linux-unpacked', 'wa-stay');
const STARTUP_TIMEOUT_MS = 30_000;
const QUIT_TIMEOUT_MS = 10_000;

function within(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took more than ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ok - ${message}`);
}

/** The environment of an installed start, plus every hook a packaged app must ignore. */
function launchEnv(configHome, hookDir) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined || name === 'ELECTRON_RUN_AS_NODE' || name.startsWith('WA_STAY_')) {
      continue;
    }
    env[name] = value;
  }
  return {
    ...env,
    XDG_CONFIG_HOME: configHome,
    WA_STAY_USER_DATA_DIR: path.join(hookDir, 'user-data'),
    WA_STAY_LEGACY_DATA_DIR: path.join(hookDir, 'legacy'),
    WA_STAY_E2E_FIXTURES_DIR: path.join(ROOT, 'tests', 'e2e', 'fixtures', 'http'),
    ELECTRON_RENDERER_URL: 'http://127.0.0.1:9/',
    NODE_ENV: 'development',
  };
}

async function smoke(executable, label, expectPackaged) {
  console.log(`# ${label}: ${executable}`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-stay-packaged-smoke-'));
  const configHome = path.join(work, 'config');
  const hookDir = path.join(work, 'hooks');
  const output = [];
  let app;
  try {
    app = await electron.launch({
      executablePath: executable,
      args: ['--no-sandbox'],
      env: launchEnv(configHome, hookDir),
      timeout: STARTUP_TIMEOUT_MS,
    });
    const proc = app.process();
    proc.stdout?.on('data', (chunk) => output.push(String(chunk)));
    proc.stderr?.on('data', (chunk) => output.push(String(chunk)));
    const exited = new Promise((resolve) => proc.once('exit', (code) => resolve(code)));

    const info = await app.evaluate(({ app: electronApp }) => ({
      isPackaged: electronApp.isPackaged,
      appPath: electronApp.getAppPath(),
      userData: electronApp.getPath('userData'),
    }));
    check(info.isPackaged === expectPackaged, `app.isPackaged is ${expectPackaged}`);
    check(/\.asar$/.test(info.appPath), `the app is loaded from app.asar (${info.appPath})`);
    const userData = path.join(configHome, 'WA Stay');
    check(info.userData === userData, `userData is the temp data folder, not the hook's`);

    const window = await app.firstWindow({ timeout: STARTUP_TIMEOUT_MS });
    await window
      .getByRole('heading', { level: 1 })
      .first()
      .waitFor({ timeout: STARTUP_TIMEOUT_MS });
    const url = window.url();
    check(
      url.startsWith('file://') && url.includes('/app.asar/dist/renderer/index.html'),
      `the window shows the built page from app.asar, not ELECTRON_RENDERER_URL`
    );
    check(fs.existsSync(path.join(userData, 'wa-stay.db')), 'the database is in the data folder');
    check(!fs.existsSync(hookDir), 'no hook folder was created');
    check(
      !fs.existsSync(path.join(userData, 'e2e-unexpected-requests.log')),
      'fixture mode is off'
    );

    const quitting = app.close();
    const code = await within(exited, QUIT_TIMEOUT_MS, 'Quitting WA Stay');
    await quitting.catch(() => undefined);
    app = undefined;
    check(code === 0, `quit within ${QUIT_TIMEOUT_MS / 1000} s with exit code 0`);
  } catch (error) {
    console.error(
      `--- app output (tail) ---\n${output.join('').split('\n').slice(-60).join('\n')}`
    );
    throw error;
  } finally {
    if (app) app.process().kill('SIGKILL');
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== 'linux') {
    throw new Error('The packaged smoke check runs the Linux build (electron-builder --linux dir)');
  }
  const executable = path.resolve(process.argv[2] ?? DEFAULT_EXECUTABLE);
  if (!fs.existsSync(executable)) {
    throw new Error(
      `${executable} is missing: run \`npx electron-builder --linux dir --publish never\` first`
    );
  }
  await smoke(executable, 'packaged', true);

  // Electron reports any executable not named `electron` as packaged; this one says it is not.
  const renamed = path.join(path.dirname(executable), 'electron');
  fs.copyFileSync(executable, renamed);
  fs.chmodSync(renamed, 0o755);
  try {
    await smoke(renamed, 'renamed to electron', false);
  } finally {
    fs.rmSync(renamed, { force: true });
  }
  console.log('Packaged smoke check passed');
}

main().catch((error) => {
  console.error(`Packaged smoke check failed: ${error.message}`);
  process.exit(1);
});
