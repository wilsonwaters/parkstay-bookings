/**
 * @jest-environment node
 *
 * `getBrandIconPath`: the WA Stay icon for the window and OS notifications. Packaged, it is
 * the copy `extraResources` puts next to app.asar; from source, the committed file.
 */
import fs from 'fs';
import path from 'path';
import { getBrandIconPath } from '@main/app/paths';

const mockApp = { isPackaged: false, getAppPath: jest.fn(() => '/repo') };
jest.mock('electron', () => ({
  get app() {
    return mockApp;
  },
}));

const ROOT = path.resolve(__dirname, '../../..');

describe('getBrandIconPath', () => {
  it('packaged: the icon extraResources copies to <resources>/icons, outside app.asar', () => {
    const icon = getBrandIconPath({
      isPackaged: true,
      appPath: path.join('C:', 'WA Stay', 'resources', 'app.asar'),
      resourcesPath: path.join('C:', 'WA Stay', 'resources'),
    });
    expect(icon).toBe(path.join('C:', 'WA Stay', 'resources', 'icons', 'icon.png'));
    expect(icon).not.toContain('app.asar');

    const builder = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron-builder.json'), 'utf8'));
    expect(builder.extraResources).toContainEqual(
      expect.objectContaining({ from: 'resources/icons', to: 'icons' })
    );
    expect(builder.extraResources[0].filter).toContain(path.basename(icon));
  });

  it('from source: resources/icons/icon.png under the app path, which exists', () => {
    const icon = getBrandIconPath({ isPackaged: false, appPath: ROOT, resourcesPath: '/unused' });
    expect(icon).toBe(path.join(ROOT, 'resources', 'icons', 'icon.png'));
    expect(fs.existsSync(icon)).toBe(true);
  });

  it('reads the running app by default', () => {
    mockApp.isPackaged = false;
    expect(getBrandIconPath()).toBe(path.join('/repo', 'resources', 'icons', 'icon.png'));

    mockApp.isPackaged = true;
    const resourcesPath = process.resourcesPath;
    Object.defineProperty(process, 'resourcesPath', {
      value: '/opt/wa-stay/resources',
      configurable: true,
    });
    try {
      expect(getBrandIconPath()).toBe(path.join('/opt/wa-stay/resources', 'icons', 'icon.png'));
    } finally {
      Object.defineProperty(process, 'resourcesPath', { value: resourcesPath, configurable: true });
      mockApp.isPackaged = false;
    }
  });
});
