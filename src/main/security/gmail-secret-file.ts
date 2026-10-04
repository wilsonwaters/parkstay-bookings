/**
 * `<userData>/gmail-oauth.json`, format 2: the Gmail OAuth client credentials and tokens,
 * each a SecretVault envelope of its JSON.
 *
 *   { "format": 2, "credentials": "vault:v1:…", "tokens": "vault:v1:…" }
 *
 * Either field may be absent (nothing stored). The v1.x file was an electron-store file
 * encrypted with a hard-coded key; `migrateLegacySecrets` rewrites it in this format.
 * Writes are atomic: a temp file in the same folder, then a rename.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface GmailSecretFileV2 {
  format: 2;
  credentials?: string;
  tokens?: string;
}

export type GmailSecretFileRead =
  | { kind: 'missing' }
  | { kind: 'v2'; file: GmailSecretFileV2 }
  /** Anything else: a legacy (v1.x) file, or damaged content. */
  | { kind: 'other'; data: Buffer };

/** Parses `data` as a format-2 file, or returns null. */
export function parseGmailSecretFile(data: Buffer): GmailSecretFileV2 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { format, credentials, tokens } = parsed as Record<string, unknown>;
  if (format !== 2) return null;
  if (credentials !== undefined && typeof credentials !== 'string') return null;
  if (tokens !== undefined && typeof tokens !== 'string') return null;
  return {
    format: 2,
    ...(credentials !== undefined && { credentials }),
    ...(tokens !== undefined && { tokens }),
  };
}

export function readGmailSecretFile(filePath: string): GmailSecretFileRead {
  let data: Buffer;
  try {
    data = fs.readFileSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    throw error;
  }
  const file = parseGmailSecretFile(data);
  return file ? { kind: 'v2', file } : { kind: 'other', data };
}

/** Writes the file atomically (temp file + rename), mode 0600. */
export function writeGmailSecretFile(filePath: string, file: GmailSecretFileV2): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(
    dir,
    `.${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );
  try {
    fs.writeFileSync(temp, `${JSON.stringify(file, null, '\t')}\n`, { mode: 0o600 });
    fs.renameSync(temp, filePath);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * Moves an unreadable file aside to `<name>.corrupt-<timestamp>` before it is replaced, so
 * its content is kept. Returns the new path.
 */
export function preserveCorruptGmailSecretFile(filePath: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const target = `${filePath}.corrupt-${stamp}`;
  fs.renameSync(filePath, target);
  return target;
}
