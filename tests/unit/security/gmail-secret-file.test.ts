/**
 * @jest-environment node
 *
 * `writeGmailSecretFile` is atomic and durable: the temp file is fsynced before it is renamed
 * over the file, then the folder is fsynced (where supported) so the rename survives a power
 * loss. A failed write leaves the old file and no temp file.
 */

import fs from 'fs';
import path from 'path';
import { readGmailSecretFile, writeGmailSecretFile } from '@main/security/gmail-secret-file';
import { removeUserData, tempUserData } from '@tests/utils/fake-safe-storage';

describe('writeGmailSecretFile', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = tempUserData();
    filePath = path.join(dir, 'gmail-oauth.json');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    removeUserData(dir);
  });

  /** Records the open, fsync, close and rename calls, by the path each fd was opened for. */
  function recordSyncCalls(): string[] {
    const calls: string[] = [];
    const paths = new Map<number, string>();
    const name = (p: fs.PathLike): string =>
      path.resolve(String(p)) === path.resolve(dir) ? '<dir>' : path.basename(String(p));
    const real = {
      openSync: fs.openSync,
      fsyncSync: fs.fsyncSync,
      renameSync: fs.renameSync,
    };
    jest.spyOn(fs, 'openSync').mockImplementation(((p: fs.PathLike, ...rest: unknown[]) => {
      const fd = (real.openSync as (...args: unknown[]) => number)(p, ...rest);
      paths.set(fd, name(p));
      calls.push(`open ${name(p)}`);
      return fd;
    }) as typeof fs.openSync);
    jest.spyOn(fs, 'fsyncSync').mockImplementation((fd: number) => {
      calls.push(`fsync ${paths.get(fd)}`);
      real.fsyncSync(fd);
    });
    jest.spyOn(fs, 'renameSync').mockImplementation((from: fs.PathLike, to: fs.PathLike) => {
      calls.push(`rename ${name(from)} -> ${name(to)}`);
      real.renameSync(from, to);
    });
    return calls;
  }

  it('fsyncs the temp file before the rename, then fsyncs the folder', () => {
    const calls = recordSyncCalls();

    writeGmailSecretFile(filePath, { format: 2, credentials: 'vault:v1:os:AAAA' });

    const temp = calls[0].replace('open ', '');
    expect(temp).toMatch(/^\.gmail-oauth\.json\.[0-9a-f]{12}\.tmp$/);
    const expected = [`open ${temp}`, `fsync ${temp}`, `rename ${temp} -> gmail-oauth.json`];
    if (process.platform !== 'win32') expected.push('open <dir>', 'fsync <dir>');
    expect(calls).toEqual(expected);

    expect(readGmailSecretFile(filePath)).toEqual({
      kind: 'v2',
      file: { format: 2, credentials: 'vault:v1:os:AAAA' },
    });
    expect(fs.readdirSync(dir)).toEqual(['gmail-oauth.json']);
    if (process.platform !== 'win32') {
      expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
    }
  });

  it('a folder that cannot be fsynced does not fail the write (the file is already synced)', () => {
    const realFsync = fs.fsyncSync;
    let first = true;
    jest.spyOn(fs, 'fsyncSync').mockImplementation((fd: number) => {
      if (first) {
        first = false;
        realFsync(fd);
        return;
      }
      throw Object.assign(new Error('EINVAL: invalid argument, fsync'), { code: 'EINVAL' });
    });

    expect(() =>
      writeGmailSecretFile(filePath, { format: 2, tokens: 'vault:v1:os:BBBB' })
    ).not.toThrow();
    expect(readGmailSecretFile(filePath)).toEqual({
      kind: 'v2',
      file: { format: 2, tokens: 'vault:v1:os:BBBB' },
    });
  });

  it('a failed fsync of the temp file leaves the old file and no temp file', () => {
    writeGmailSecretFile(filePath, { format: 2, credentials: 'vault:v1:os:OLD' });
    const before = fs.readFileSync(filePath);
    jest.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      throw Object.assign(new Error('EIO: i/o error, fsync'), { code: 'EIO' });
    });

    expect(() =>
      writeGmailSecretFile(filePath, { format: 2, credentials: 'vault:v1:os:NEW' })
    ).toThrow('EIO');
    expect(fs.readFileSync(filePath).equals(before)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(['gmail-oauth.json']);
  });
});
