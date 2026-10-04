/**
 * The browser automation runtime's dependency and packaging (V7, architecture-notes §10):
 * `playwright-core` is pinned to 1.56.1 because Electron 28 runs Node 18, and electron-builder
 * unpacks it from the asar archive so its files exist on disk.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
interface PackageJson {
  version: string;
  engines: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface BuilderConfig {
  asar: boolean;
  asarUnpack?: string[];
  files: string[];
}

const readJson = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as T;

describe('playwright-core dependency', () => {
  it('is pinned to exactly 1.56.1 in dependencies (not a range, not a devDependency)', () => {
    const pkg = readJson<PackageJson>('package.json');
    expect(pkg.dependencies['playwright-core']).toBe('1.56.1');
    expect(pkg.devDependencies?.['playwright-core']).toBeUndefined();
  });

  it('is installed at 1.56.1, which still supports Node 18 (Electron 28)', () => {
    const installed = readJson<PackageJson>('node_modules/playwright-core/package.json');
    expect(installed.version).toBe('1.56.1');
    expect(installed.engines.node).toBe('>=18');
  });
});

describe('electron-builder.json', () => {
  const builder = readJson<BuilderConfig>('electron-builder.json');

  it('packs the app in asar and unpacks playwright-core, whose files must exist on disk', () => {
    expect(builder.asar).toBe(true);
    expect(builder.asarUnpack).toContain('node_modules/playwright-core/**');
  });

  it('ships the production node_modules', () => {
    expect(builder.files).toContain('node_modules/**/*');
  });
});
