/**
 * Where the renderer is loaded from, and which URLs count as the app's own origin.
 *
 * `index.ts` loads the window from `resolveRendererEntry`, and the IPC sender guard uses
 * `createAppUrlMatcher` on the same entry, so the two cannot disagree.
 */

import { pathToFileURL } from 'url';

export type RendererEntry =
  | { readonly kind: 'dev-server'; readonly url: string }
  | { readonly kind: 'file'; readonly path: string };

/** Default Vite dev server (`vite.config.ts`). `start-electron.js` sets ELECTRON_RENDERER_URL instead. */
export const DEFAULT_DEV_SERVER_URL = 'http://localhost:3000';

export function resolveRendererEntry(
  env: NodeJS.ProcessEnv,
  builtIndexPath: string
): RendererEntry {
  if (env.ELECTRON_RENDERER_URL || env.NODE_ENV === 'development') {
    return { kind: 'dev-server', url: env.ELECTRON_RENDERER_URL || DEFAULT_DEV_SERVER_URL };
  }
  return { kind: 'file', path: builtIndexPath };
}

/** True when `url` is a page of the app: same origin as the dev server, or the built index.html. */
export function createAppUrlMatcher(entry: RendererEntry): (url: string) => boolean {
  if (entry.kind === 'dev-server') {
    const origin = new URL(entry.url).origin;
    return (url) => parseUrl(url)?.origin === origin;
  }
  return createFileUrlMatcher(pathToFileURL(entry.path).href);
}

/**
 * Matches `file:` URLs of the same file as `expectedHref`, ignoring the hash and query (the
 * renderer routes in the hash). Percent-encoding differences and the case of a Windows
 * drive letter are ignored: Chromium may report `file:///c:/...` for `C:\...`.
 */
export function createFileUrlMatcher(expectedHref: string): (url: string) => boolean {
  const expected = fileKey(expectedHref);
  if (expected === null) throw new Error(`Not a file URL: ${expectedHref}`);
  return (url) => fileKey(url) === expected;
}

function fileKey(href: string): string | null {
  const url = parseUrl(href);
  if (!url || url.protocol !== 'file:') return null;
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // keep the encoded form
  }
  pathname = pathname.replace(
    /^\/([A-Za-z]):/,
    (_match, drive: string) => `/${drive.toLowerCase()}:`
  );
  return `${url.host.toLowerCase()}|${pathname}`;
}

function parseUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}
