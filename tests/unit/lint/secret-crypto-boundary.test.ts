/**
 * Secret crypto lives only in `src/main/security/` (P5): no key derivation, raw ciphers,
 * machine id or hard-coded store keys anywhere else in the main process. This is the spec's
 *
 *   grep -rnE "pbkdf2Sync|createCipheriv|machineIdSync|encryptionKey" src/main | grep -v "src/main/security/"
 *
 * as a test, plus: `node-machine-id` is imported only by the legacy decryptors, and nothing
 * imports `electron-store` any more.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const MAIN = path.join(ROOT, 'src/main');
const SECURITY = path.join(MAIN, 'security') + path.sep;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** `file:line` for every line of `files` matching `pattern`. */
function matches(files: string[], pattern: RegExp): string[] {
  return files.flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .flatMap((line, index) =>
        pattern.test(line)
          ? [`${path.relative(ROOT, file).split(path.sep).join('/')}:${index + 1}`]
          : []
      )
  );
}

describe('secret crypto boundary (src/main/security)', () => {
  const files = sourceFiles(MAIN);

  it('no pbkdf2Sync, createCipheriv, machineIdSync or encryptionKey outside src/main/security', () => {
    const outside = files.filter((file) => !file.startsWith(SECURITY));
    expect(outside.length).toBeGreaterThan(50); // the scan is not vacuous
    expect(matches(outside, /pbkdf2Sync|createCipheriv|machineIdSync|encryptionKey/)).toEqual([]);
  });

  it('node-machine-id is imported only by the legacy decryptors; electron-store by nothing', () => {
    expect(matches(files, /from 'node-machine-id'/)).toEqual([
      expect.stringMatching(/^src\/main\/security\/legacy-decryptors\.ts:\d+$/),
    ]);
    expect(matches(files, /from 'electron-store'/)).toEqual([]);
  });
});
