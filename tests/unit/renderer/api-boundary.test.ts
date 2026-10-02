/**
 * @jest-environment node
 *
 * API boundary guard (architecture-notes §8): renderer code reaches the main process only
 * through `src/renderer/api/**`. Anywhere else, `window.api` is allowed only in the legacy
 * files listed below, which the U tasks delete as they rebuild each page. The list never grows.
 * Comments are ignored; tests (`*.test.ts(x)`) may stub `window.api` freely.
 */
import fs from 'fs';
import path from 'path';
import { stripComments } from '../../utils/strip-comments';

const RENDERER = path.resolve(__dirname, '../../../src/renderer');
const API_DIR = 'api';
const SOURCE = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

/** Pre-redesign code that still calls `window.api` itself, and the task that replaces it. */
const LEGACY_ALLOW_LIST = [
  'components/NotificationBell.tsx', // U5
  'components/QueueStatus.tsx', // U5
  'components/UpdateNotification.tsx', // U5
  'components/forms/ImportBookingForm.tsx', // U3
  'components/forms/ManualBookingForm.tsx', // U3
  'components/forms/SiteSniperForm.tsx', // U2
  'components/forms/WatchForm.tsx', // U1
  'components/settings/EmailSettingsCard.tsx', // U4
  'features/bookings/legacy/BookingDetail.tsx', // U3
  'features/bookings/legacy/BookingsList.tsx', // U3
  'features/settings/legacy/Settings.tsx', // U4
  'features/snipes/legacy/CreateSiteSnipe.tsx', // U2
  'features/snipes/legacy/index.tsx', // U2
  'features/watches/legacy/CreateWatch.tsx', // U1
  'features/watches/legacy/EditWatch.tsx', // U1
  'features/watches/legacy/WatchDetail.tsx', // U1
  'features/watches/legacy/index.tsx', // U1
];
/** The length LEGACY_ALLOW_LIST had when D3 wrote it. Lower it as entries go; never raise it. */
const LEGACY_ALLOW_LIST_MAX = 17;

/**
 * Ways to reach the preload API: `window.api`, `window?.api`, `window['api']`,
 * `const { api } = window`, and the same through `globalThis` or `self`.
 */
const API_ACCESS =
  /\b(?:window|globalThis|self)\s*(?:\?\.|\.)\s*api\b|\b(?:window|globalThis|self)\s*(?:\?\.)?\s*\[\s*(['"`])api\1\s*\]|\{[^{}]*\bapi\b[^{}]*\}\s*=\s*(?:window|globalThis|self)\b/g;

/** The 1-based lines of `source` that reach the preload API, comments ignored. */
function apiAccessLines(source: string): number[] {
  const code = stripComments(source);
  const lines = new Set<number>();
  for (const match of code.matchAll(API_ACCESS)) {
    lines.add(code.slice(0, match.index ?? 0).split(/\r?\n/).length);
  }
  return [...lines].sort((a, b) => a - b);
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return SOURCE.test(entry.name) && !TEST_FILE.test(entry.name) ? [full] : [];
  });
}

const relative = (file: string) => path.relative(RENDERER, file).split(path.sep).join('/');

describe('API boundary guard self-test', () => {
  it.each([
    ['a call', 'await window.api.watches.list();'],
    ['optional chaining', 'const ok = window?.api != null;'],
    ['bracket access', "const api = window['api'];"],
    ['destructuring', 'const { api } = window;'],
    ['destructuring among others', 'const { location, api: preload } = window;'],
    ['globalThis', 'globalThis.api.events.on("x", cb);'],
    ['across lines', 'const unsubscribe = window\n  .api.events.on("x", cb);'],
  ])('flags %s', (_name, source) => {
    expect(apiAccessLines(source).length).toBeGreaterThan(0);
  });

  it.each([
    ['a comment', '// components never call window.api directly'],
    ['a block comment', '/* no `window.api` here */ const x = 1;'],
    ['a different global', 'const apiKey = window.apiKey; const x = myWindow.api;'],
    ['a local named api', 'const api = useApi(); api.watches.list();'],
    ['a renderer api import', "import { useProviders } from '../api';"],
  ])('ignores %s', (_name, source) => {
    expect(apiAccessLines(source)).toEqual([]);
  });

  it('reports the line of each access', () => {
    expect(apiAccessLines('const a = 1;\n// window.api\nconst b = window.api;\n')).toEqual([3]);
  });
});

describe('API boundary guard', () => {
  const files = walk(RENDERER);

  it('scans the renderer, including app, features and components', () => {
    for (const dir of ['app', 'features', 'components', API_DIR]) {
      expect(files.some((f) => relative(f).startsWith(`${dir}/`))).toBe(true);
    }
  });

  it('finds window.api only in renderer/api and the legacy allow-list', () => {
    const offenders = files
      .filter((f) => !relative(f).startsWith(`${API_DIR}/`))
      .filter((f) => !LEGACY_ALLOW_LIST.includes(relative(f)))
      .flatMap((f) =>
        apiAccessLines(fs.readFileSync(f, 'utf8')).map((line) => `${relative(f)}:${line}`)
      );
    expect(offenders).toEqual([]);
  });

  it('lists only files that exist and still need the exemption', () => {
    const stale = LEGACY_ALLOW_LIST.filter((file) => {
      const full = path.join(RENDERER, file);
      return !fs.existsSync(full) || apiAccessLines(fs.readFileSync(full, 'utf8')).length === 0;
    });
    expect(stale).toEqual([]);
  });

  it('never grows the legacy allow-list', () => {
    expect(new Set(LEGACY_ALLOW_LIST).size).toBe(LEGACY_ALLOW_LIST.length);
    expect(LEGACY_ALLOW_LIST.length).toBeLessThanOrEqual(LEGACY_ALLOW_LIST_MAX);
  });

  it('keeps the shell and the data layer itself on the right side of the boundary', () => {
    const shell = files.filter((f) => relative(f).startsWith('app/'));
    expect(shell.length).toBeGreaterThan(0);
    expect(shell.flatMap((f) => apiAccessLines(fs.readFileSync(f, 'utf8')))).toEqual([]);
    const client = fs.readFileSync(path.join(RENDERER, API_DIR, 'client.ts'), 'utf8');
    expect(apiAccessLines(client).length).toBeGreaterThan(0);
  });
});
