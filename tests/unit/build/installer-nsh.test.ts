/**
 * @jest-environment node
 *
 * `resources/installer.nsh`, the custom NSIS steps (B2; architecture-notes §12.12):
 * - electron-builder makes the shortcuts, so the script makes none and removes the ones v1.x
 *   made itself;
 * - uninstalling never offers to delete data during an update or in silent mode, and the v1.x
 *   data folder goes only after a second prompt that names it (default No);
 * - before the old v1.x uninstaller runs, the v1.x data is copied (never moved) into
 *   `$APPDATA\WA Stay\legacy-snapshot\`.
 *
 * NSIS cannot run here: the CI Windows build compiles the script, and the manual Windows
 * checklist in the B2 spec covers the behaviour.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'resources/installer.nsh'), 'utf8');

/** The script's lines without comments (`;` outside a string) or blank lines. */
function codeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quote) {
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'" || ch === '`') {
          quote = ch;
        } else if (ch === ';' || ch === '#') {
          return line.slice(0, i).trim();
        }
      }
      return line.trim();
    })
    .filter((line) => line !== '');
}

const CODE = codeLines(SOURCE);

/** The code lines of one `!macro name … !macroend`. */
function macro(name: string): string[] {
  const start = CODE.findIndex((line) => line === `!macro ${name}`);
  if (start < 0) throw new Error(`installer.nsh defines no macro ${name}`);
  const end = CODE.indexOf('!macroend', start);
  return CODE.slice(start + 1, end);
}

/** Index of the `${endIf}` that closes the block opened at `open`. */
function closingEndIf(lines: string[], open: number): number {
  let depth = 0;
  for (let i = open; i < lines.length; i += 1) {
    if (/^\$\{(if|ifNot)\}/i.test(lines[i])) depth += 1;
    if (/^\$\{endIf\}/i.test(lines[i])) depth -= 1;
    if (depth === 0) return i;
  }
  throw new Error(`No \${endIf} closes line ${open}: ${lines[open]}`);
}

const LEGACY_DATA_RMDIR = 'RMDir /r "$APPDATA\\parkstay-bookings"';

describe('installer.nsh', () => {
  it('reads as LF or CRLF alike', () => {
    expect(codeLines(SOURCE.replace(/\n/g, '\r\n'))).toEqual(CODE);
  });

  it('creates no shortcuts (electron-builder makes the WA Stay ones)', () => {
    expect(SOURCE).not.toMatch(/CreateShortCut/i);
  });

  it('removes the v1.x shortcuts for the current user and for all users', () => {
    expect(macro('waStayRemoveLegacyShortcuts')).toEqual([
      'Delete "$DESKTOP\\WA ParkStay Bookings.lnk"',
      'Delete "$SMPROGRAMS\\WA ParkStay Bookings.lnk"',
      'RMDir /r "$SMPROGRAMS\\WA ParkStay Bookings"',
    ]);
    const install = macro('customInstall');
    const current = install.indexOf('SetShellVarContext current');
    const all = install.indexOf('SetShellVarContext all');
    expect(current).toBeGreaterThanOrEqual(0);
    expect(install[current + 1]).toBe('!insertmacro waStayRemoveLegacyShortcuts');
    expect(install[all + 1]).toBe('!insertmacro waStayRemoveLegacyShortcuts');
  });

  it('gives every MessageBox a silent-mode default (/SD)', () => {
    const boxes = CODE.filter((line) => /^MessageBox\b/i.test(line));
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    for (const box of boxes) expect(box).toMatch(/\s\/SD ID(NO|OK|YES|CANCEL)\b/);
  });

  it('runs the uninstall data cleanup only when not updating, defaulting to No', () => {
    const uninstall = macro('customUnInstall');
    expect(uninstall[0]).toBe('${ifNot} ${isUpdated}');
    expect(closingEndIf(uninstall, 0)).toBe(uninstall.length - 1);

    const boxes = uninstall.filter((line) => line.startsWith('MessageBox'));
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box).toContain('MB_DEFBUTTON2');
      expect(box).toContain('/SD IDNO');
    }
  });

  it('deletes the WA Stay data and updater cache on "Yes"', () => {
    const uninstall = macro('customUnInstall');
    const yes = uninstall.indexOf('waStayDeleteData:');
    expect(uninstall.find((l) => l.startsWith('MessageBox'))).toContain('IDYES waStayDeleteData');
    expect(uninstall.slice(yes)).toEqual(
      expect.arrayContaining([
        'RMDir /r "$APPDATA\\WA Stay"',
        'RMDir /r "$LOCALAPPDATA\\wa-stay-updater"',
      ])
    );
    expect(uninstall.indexOf('RMDir /r "$APPDATA\\WA Stay"')).toBeGreaterThan(yes);
  });

  it('removes the v1.x data folder only inside the second prompt, which names it', () => {
    expect(
      CODE.filter((line) => line.includes('parkstay-bookings"') && /RMDir/i.test(line))
    ).toEqual([LEGACY_DATA_RMDIR]);

    const uninstall = macro('customUnInstall');
    const yes = uninstall.indexOf('waStayDeleteData:');
    const second = uninstall.findIndex(
      (line, i) =>
        i > yes && line.startsWith('MessageBox') && line.includes('$APPDATA\\parkstay-bookings')
    );
    const remove = uninstall.indexOf(LEGACY_DATA_RMDIR);
    expect(second).toBeGreaterThan(yes);
    // "No" (and the silent default) jumps past the removal
    expect(uninstall[second]).toMatch(/\/SD IDNO IDNO waStayDataDone$/);
    expect(remove).toBe(second + 1);
    expect(uninstall.indexOf('waStayDataDone:')).toBeGreaterThan(remove);

    // ...and only when that folder exists
    const branch = uninstall.findIndex((line) =>
      line.startsWith('${if} ${FileExists} "$APPDATA\\parkstay-bookings')
    );
    expect(branch).toBeGreaterThan(yes);
    expect(branch).toBeLessThan(second);
    expect(closingEndIf(uninstall, branch)).toBeGreaterThan(remove);
  });

  it('defines customCheckAppRunning: the usual running-app check, then the legacy snapshot', () => {
    const check = macro('customCheckAppRunning');
    expect(check).toEqual([
      '!insertmacro _CHECK_APP_RUNNING',
      '!ifndef BUILD_UNINSTALLER',
      '!insertmacro waStaySnapshotLegacyData',
      '!endif',
    ]);
    // electron-builder includes these only when customCheckAppRunning is not defined
    expect(CODE).toEqual(expect.arrayContaining(['!include "getProcessInfo.nsh"', 'Var pid']));
  });

  it('copies (never moves) the v1.x database and Gmail file into legacy-snapshot, once', () => {
    const snapshot = macro('waStaySnapshotLegacyData');
    const guards = snapshot.filter((line) => /^\$\{(if|ifNot)\} \$\{FileExists\}/.test(line));
    expect(guards.slice(0, 3)).toEqual([
      '${if} ${FileExists} "$APPDATA\\parkstay-bookings\\parkstay.db"',
      '${ifNot} ${FileExists} "$APPDATA\\WA Stay\\migration.json"',
      '${ifNot} ${FileExists} "$APPDATA\\WA Stay\\legacy-snapshot\\parkstay.db"',
    ]);

    const copies = snapshot.filter((line) => line.startsWith('CopyFiles'));
    expect(copies).toEqual(
      ['parkstay.db', 'parkstay.db-wal', 'parkstay.db-shm', 'gmail-oauth.json'].map(
        (file) =>
          `CopyFiles /SILENT "$APPDATA\\parkstay-bookings\\${file}" "$APPDATA\\WA Stay\\legacy-snapshot"`
      )
    );
    // Copy only: nothing in the snapshot step moves or deletes a file
    expect(snapshot.join('\n')).not.toMatch(/\b(Rename|Delete|RMDir)\b/);
    // Every copy sits inside the three guards
    const outer = snapshot.indexOf(guards[0]);
    const inner = snapshot.indexOf(guards[2]);
    for (const copy of copies) {
      expect(snapshot.indexOf(copy)).toBeGreaterThan(inner);
      expect(snapshot.indexOf(copy)).toBeLessThan(closingEndIf(snapshot, inner));
    }
    expect(closingEndIf(snapshot, outer)).toBeGreaterThan(closingEndIf(snapshot, inner));
  });

  it('says WA Stay in its messages', () => {
    expect(macro('customInit').join('\n')).toContain('"WA Stay requires Windows 10 or later."');
    expect(macro('customHeader').join('\n')).toContain('Welcome to WA Stay Setup');
    expect(macro('customFinishPage').join('\n')).toContain(
      '!define MUI_FINISHPAGE_RUN "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"'
    );
  });
});
