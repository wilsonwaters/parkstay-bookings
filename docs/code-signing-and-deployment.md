# WA ParkStay Bookings - Code Signing and Deployment Guide

**Version:** 1.0
**Last Updated:** 2025-10-31

## Table of Contents

1. [Code Signing Overview](#code-signing-overview)
2. [Windows Code Signing](#windows-code-signing)
3. [macOS Code Signing](#macos-code-signing)
4. [Linux Packaging](#linux-packaging)
5. [App Icons and Assets](#app-icons-and-assets)
6. [Auto-Update Configuration](#auto-update-configuration)
7. [Build Scripts](#build-scripts)
8. [Troubleshooting](#troubleshooting)

---

## Code Signing Overview

### Why Code Signing?

Code signing is essential for:
- **User Trust**: Users know the software comes from a verified source
- **Security**: Prevents tampering and ensures integrity
- **Operating System Requirements**: Required for certain OS features
- **Auto-Update**: Necessary for automatic updates to work properly

### Requirements by Platform

**Windows:**
- Code signing certificate (EV or OV certificate)
- Certificate must be from trusted CA (DigiCert, Sectigo, etc.)
- Required for SmartScreen reputation
- Required for auto-updates

**macOS:**
- Apple Developer account ($99/year)
- Developer ID Application certificate
- Developer ID Installer certificate (for pkg)
- Notarization required for macOS 10.15+

**Linux:**
- No code signing required
- GPG signing recommended for repositories

---

## Windows Code Signing

### Obtaining a Certificate

**Option 1: EV (Extended Validation) Certificate**
- Provides immediate SmartScreen reputation
- Requires hardware token (USB key)
- Higher cost (~$300-500/year)
- Recommended for commercial applications

**Option 2: OV (Organization Validation) Certificate**
- Requires building reputation with Microsoft
- Software certificate (no hardware token)
- Lower cost (~$100-200/year)
- Suitable for open source projects

**Certificate Authorities:**
- DigiCert
- Sectigo (formerly Comodo)
- GlobalSign
- Entrust

### Setting Up Windows Code Signing

#### 1. Export Certificate

If you have a PFX/P12 file:

```bash
# Certificate file: certificate.pfx
# Password: stored in safe location
```

#### 2. Configure Environment Variables

Add to GitHub Secrets or local environment:

```bash
# Certificate as base64 (for CI/CD)
base64 -i certificate.pfx -o certificate-base64.txt

# GitHub Secrets:
WINDOWS_CERTIFICATE: <base64 content>
WINDOWS_CERTIFICATE_PASSWORD: <password>
```

#### 3. Create Signing Script

Create `scripts/sign-windows.js`:

```javascript
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(configuration) {
  // Only sign if we have a certificate
  if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD) {
    console.log('Skipping Windows code signing (no certificate configured)');
    return;
  }

  const file = configuration.path;

  console.log(`Signing ${file}...`);

  try {
    // Sign using signtool (from Windows SDK)
    execSync(`signtool sign /f "${process.env.CSC_LINK}" /p "${process.env.CSC_KEY_PASSWORD}" /tr http://timestamp.digicert.com /td sha256 /fd sha256 "${file}"`, {
      stdio: 'inherit'
    });

    console.log(`Successfully signed ${file}`);
  } catch (error) {
    console.error(`Failed to sign ${file}:`, error);
    throw error;
  }
};
```

#### 4. Configure electron-builder

In `electron-builder.json`:

```json
{
  "win": {
    "sign": "./scripts/sign-windows.js",
    "signingHashAlgorithms": ["sha256"],
    "signDlls": false,
    "verifyUpdateCodeSignature": true
  }
}
```

#### 5. Build with Signing

```bash
# Set environment variables
export CSC_LINK="path/to/certificate.pfx"
export CSC_KEY_PASSWORD="certificate-password"

# Build
npm run build:win
```

### Windows SmartScreen

**Building Reputation:**
1. Sign all releases consistently
2. Distribute to users
3. Build download/usage history
4. Takes weeks to months
5. EV certificates skip this step

**Checking Status:**
- Monitor download rates
- Watch for SmartScreen warnings
- User feedback

---

## macOS Code Signing

### Prerequisites

#### 1. Apple Developer Account

- Sign up at [developer.apple.com](https://developer.apple.com)
- Enroll in Apple Developer Program ($99/year)
- Wait for approval (can take 1-2 days)

#### 2. Create Certificates

**Using Xcode:**

1. Open Xcode → Preferences → Accounts
2. Add Apple ID
3. Click "Manage Certificates"
4. Click "+" and create:
   - Developer ID Application
   - Developer ID Installer (if needed)

**Using command line:**

```bash
# Request certificate
security find-identity -v -p codesigning

# Export certificate
security find-certificate -c "Developer ID Application" -a -p > certificate.pem
```

#### 3. Get Team ID

```bash
# Find your team ID
xcrun altool --list-teams -u "your@email.com" -p "@keychain:AC_PASSWORD"
```

### Setting Up macOS Code Signing

#### 1. Export Certificates

```bash
# Export as P12
# In Keychain Access:
# - Right-click certificate
# - Export
# - Save as .p12 with password
```

#### 2. Configure Environment Variables

```bash
# For CI/CD (GitHub Actions)
# Convert to base64
base64 -i certificate.p12 -o certificate-base64.txt

# GitHub Secrets:
MACOS_CERTIFICATE: <base64 content>
MACOS_CERTIFICATE_PASSWORD: <password>
APPLE_ID: <your apple id email>
APPLE_APP_SPECIFIC_PASSWORD: <app-specific password>
APPLE_TEAM_ID: <your team id>
```

#### 3. Create App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in
3. Security → App-Specific Passwords
4. Generate new password
5. Save securely

#### 4. Create Notarization Script

Create `scripts/notarize.js`:

```javascript
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip if credentials not provided
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('Skipping notarization (no credentials configured)');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}...`);

  try {
    await notarize({
      appBundleId: 'com.parkstay.bookings',
      appPath: appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });

    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
```

#### 5. Configure electron-builder

In `electron-builder.json`:

```json
{
  "mac": {
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "resources/entitlements.mac.plist",
    "entitlementsInherit": "resources/entitlements.mac.plist",
    "notarize": {
      "teamId": "TEAM_ID_PLACEHOLDER"
    }
  },
  "afterSign": "scripts/notarize.js"
}
```

#### 6. Create Entitlements File

Create `resources/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
  <key>com.apple.security.device.audio-input</key>
  <false/>
  <key>com.apple.security.device.camera</key>
  <false/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

#### 7. Build with Signing and Notarization

```bash
# Set environment variables
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOUR_TEAM_ID"

# Build
npm run build:mac

# Notarization happens automatically after signing
```

### Verifying macOS Signing

```bash
# Check code signature
codesign -dv --verbose=4 "WA ParkStay Bookings.app"

# Verify signature
codesign --verify --deep --strict --verbose=2 "WA ParkStay Bookings.app"

# Check notarization
spctl -a -vv -t install "WA ParkStay Bookings.app"

# Check entitlements
codesign -d --entitlements :- "WA ParkStay Bookings.app"
```

---

## Linux Packaging

Linux doesn't require code signing but there are best practices.

### AppImage

AppImages are self-contained and don't require signing.

```bash
# Build AppImage
npm run build:linux

# Make executable
chmod +x dist/ParkStay-Bookings-*.AppImage

# Run
./dist/ParkStay-Bookings-*.AppImage
```

### DEB Package

```bash
# Install dpkg-sig for signing
sudo apt install dpkg-sig

# Sign package
dpkg-sig --sign builder parkstay-bookings_*.deb

# Verify
dpkg-sig --verify parkstay-bookings_*.deb
```

### RPM Package

```bash
# Sign with GPG
rpm --addsign parkstay-bookings-*.rpm

# Verify
rpm --checksig parkstay-bookings-*.rpm
```

### Snap Package

```bash
# Build snap
snapcraft

# Sign with store credentials
snapcraft login
snapcraft push parkstay-bookings_*.snap
```

---

## App Icons and Assets

### Icon Requirements

**Windows (.ico):**
- Multiple sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
- Format: ICO file
- Location: `resources/icons/icon.ico`

**macOS (.icns):**
- Sizes: 16x16, 32x32, 128x128, 256x256, 512x512, 1024x1024
- Support for Retina (@2x)
- Format: ICNS file
- Location: `resources/icons/icon.icns`

**Linux (.png):**
- Sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512
- Format: PNG files
- Location: `resources/icons/*.png`

### Creating Icons

#### From SVG Source

```bash
# Install required tools
npm install -g icon-gen

# Generate all icons from SVG
icon-gen -i icon-source.svg -o resources/icons --icns --ico --sizes 16,32,48,64,128,256,512,1024
```

#### Using Online Tools

- [iConvert Icons](https://iconverticons.com/online/)
- [CloudConvert](https://cloudconvert.com/)
- [IconKitchen](https://icon.kitchen/)

### Installer Assets

**Windows NSIS:**
```
resources/icons/
├── installer-header.bmp      # 150x57 px
├── installer-sidebar.bmp     # 164x314 px
└── icon.ico
```

**macOS DMG:**
```
resources/dmg/
├── background.png            # 540x380 px
├── background@2x.png         # 1080x760 px
└── icon.icns
```

### System Tray Icons

```
resources/icons/tray/
├── icon-tray.png             # 16x16 or 22x22
├── icon-tray@2x.png          # 32x32 or 44x44
├── icon-tray-active.png
└── icon-tray-active@2x.png
```

### Configuring in electron-builder

```json
{
  "mac": {
    "icon": "resources/icons/icon.icns"
  },
  "win": {
    "icon": "resources/icons/icon.ico"
  },
  "linux": {
    "icon": "resources/icons"
  },
  "dmg": {
    "icon": "resources/icons/icon.icns",
    "background": "resources/dmg/background.png"
  },
  "nsis": {
    "installerIcon": "resources/icons/icon.ico",
    "uninstallerIcon": "resources/icons/icon.ico",
    "installerHeader": "resources/icons/installer-header.bmp",
    "installerSidebar": "resources/icons/installer-sidebar.bmp"
  }
}
```

---

## Auto-Update Configuration

### electron-updater Setup

#### 1. Install Dependencies

```bash
npm install electron-updater electron-log
```

#### 2. Configure Update Server

In `electron-builder.json`:

```json
{
  "publish": {
    "provider": "github",
    "owner": "your-username",
    "repo": "parkstay-bookings",
    "releaseType": "release"
  }
}
```

**Alternative: Generic Provider**

```json
{
  "publish": {
    "provider": "generic",
    "url": "https://your-update-server.com/releases"
  }
}
```

#### 3. Implement Auto-Update in Main Process

Create `src/main/services/auto-updater.service.ts`:

```typescript
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { BrowserWindow } from 'electron';

export class AutoUpdaterService {
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.configure();
  }

  private configure() {
    // Configure logger
    autoUpdater.logger = log;

    // Check for updates automatically
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      this.sendStatusToWindow('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      this.sendStatusToWindow('Update available', info);
      // Ask user if they want to download
      this.mainWindow.webContents.send('update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      this.sendStatusToWindow('Up to date', info);
    });

    autoUpdater.on('error', (err) => {
      this.sendStatusToWindow('Error in auto-updater', err);
    });

    autoUpdater.on('download-progress', (progress) => {
      this.mainWindow.webContents.send('update-download-progress', progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.sendStatusToWindow('Update downloaded', info);
      // Prompt user to restart and install
      this.mainWindow.webContents.send('update-downloaded', info);
    });
  }

  checkForUpdates() {
    autoUpdater.checkForUpdates();
  }

  downloadUpdate() {
    autoUpdater.downloadUpdate();
  }

  quitAndInstall() {
    autoUpdater.quitAndInstall(false, true);
  }

  private sendStatusToWindow(message: string, data?: any) {
    log.info(message, data);
    this.mainWindow.webContents.send('update-status', { message, data });
  }
}
```

#### 4. Initialize in Main Process

In `src/main/index.ts`:

```typescript
import { AutoUpdaterService } from './services/auto-updater.service';

app.whenReady().then(() => {
  const mainWindow = createMainWindow();

  // Initialize auto-updater
  const autoUpdater = new AutoUpdaterService(mainWindow);

  // Check for updates on startup (delay 3 seconds)
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);

  // IPC handlers
  ipcMain.handle('check-for-updates', () => {
    autoUpdater.checkForUpdates();
  });

  ipcMain.handle('download-update', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
  });
});
```

#### 5. UI Component for Updates

Create `src/renderer/components/UpdateNotification.tsx`:

```typescript
import React, { useEffect, useState } from 'react';

export const UpdateNotification: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    // Listen for update events
    window.api.onUpdateAvailable((info) => {
      setUpdateAvailable(true);
    });

    window.api.onUpdateDownloaded((info) => {
      setUpdateDownloaded(true);
    });

    window.api.onUpdateProgress((progress) => {
      setDownloadProgress(progress.percent);
    });
  }, []);

  const handleDownload = () => {
    window.api.downloadUpdate();
  };

  const handleInstall = () => {
    window.api.installUpdate();
  };

  if (updateDownloaded) {
    return (
      <div className="update-notification">
        <p>Update downloaded! Restart to install.</p>
        <button onClick={handleInstall}>Restart Now</button>
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div className="update-notification">
        <p>A new version is available!</p>
        {downloadProgress > 0 ? (
          <div>Downloading... {downloadProgress.toFixed(0)}%</div>
        ) : (
          <button onClick={handleDownload}>Download Update</button>
        )}
      </div>
    );
  }

  return null;
};
```

### Update Server Setup

#### GitHub Releases (Recommended)

No server needed! electron-updater reads from GitHub Releases API.

**Requirements:**
- Public repository OR
- GitHub token for private repos

**Configuration:**
```json
{
  "publish": {
    "provider": "github",
    "owner": "your-org",
    "repo": "parkstay-bookings"
  }
}
```

#### Self-Hosted Server

**File Structure:**
```
/releases/
├── latest.yml                 # Windows metadata
├── latest-mac.yml             # macOS metadata
├── latest-linux.yml           # Linux metadata
├── ParkStay-Setup-1.0.0.exe
├── ParkStay-1.0.0.dmg
└── ParkStay-1.0.0.AppImage
```

**latest.yml Example:**
```yaml
version: 1.0.0
files:
  - url: ParkStay-Setup-1.0.0.exe
    sha512: <hash>
    size: 123456789
path: ParkStay-Setup-1.0.0.exe
sha512: <hash>
releaseDate: '2025-10-31T00:00:00.000Z'
```

### Testing Auto-Update

#### Development Testing

```bash
# Build with publish config
npm run build

# Serve locally
npx http-server release -p 8080

# Update electron-builder.json temporarily
{
  "publish": {
    "provider": "generic",
    "url": "http://localhost:8080"
  }
}

# Create a new version
# Update version in package.json
# Build again
# App should detect update
```

#### Production Testing

1. Release beta version (v1.0.0-beta.1)
2. Install on test machine
3. Release next beta (v1.0.0-beta.2)
4. Verify auto-update works
5. Check logs for errors

---

## Build Scripts

### Helper Scripts

Create `scripts/` directory with these files:

#### scripts/clean.js

```javascript
const fs = require('fs-extra');
const path = require('path');

async function clean() {
  const dirs = ['dist', 'release', 'out'];

  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', dir);
    if (fs.existsSync(dirPath)) {
      console.log(`Cleaning ${dir}...`);
      await fs.remove(dirPath);
    }
  }

  console.log('Clean complete!');
}

clean().catch(console.error);
```

#### scripts/before-build.js

```javascript
exports.default = async function(context) {
  console.log('Running pre-build tasks...');

  // Verify environment
  if (context.electronPlatformName === 'darwin') {
    if (!process.env.APPLE_ID) {
      console.warn('Warning: APPLE_ID not set, notarization will be skipped');
    }
  }

  // Add any pre-build checks here
  console.log('Pre-build tasks complete!');
};
```

#### scripts/after-pack.js

```javascript
exports.default = async function(context) {
  console.log('Running post-pack tasks...');

  // Log build info
  console.log('Platform:', context.electronPlatformName);
  console.log('Arch:', context.arch);
  console.log('Output:', context.appOutDir);

  console.log('Post-pack tasks complete!');
};
```

### Platform-Specific Scripts

#### scripts/build-windows.sh

```bash
#!/bin/bash
set -e

echo "Building for Windows..."

# Check for certificate
if [ -z "$CSC_LINK" ]; then
  echo "Warning: No code signing certificate configured"
fi

# Build
npm run build:win

echo "Windows build complete!"
```

#### scripts/build-mac.sh

```bash
#!/bin/bash
set -e

echo "Building for macOS..."

# Check for certificates
if [ -z "$APPLE_ID" ]; then
  echo "Warning: No Apple ID configured for notarization"
fi

# Build
npm run build:mac

echo "macOS build complete!"
```

---

## Troubleshooting

### Windows Signing Issues

**Issue: "SignTool Error: No certificates were found"**
```bash
# Solution: Verify certificate is valid
certutil -dump certificate.pfx

# Check certificate store
certutil -store My
```

**Issue: Timestamp server timeout**
```bash
# Solution: Try alternative timestamp servers
# In sign script, use:
/tr http://timestamp.comodoca.com
# or
/tr http://timestamp.globalsign.com
```

### macOS Notarization Issues

**Issue: "Notarization failed: Invalid credentials"**
```bash
# Solution: Verify app-specific password
xcrun notarytool history --apple-id "your@email.com" --password "your-app-password"
```

**Issue: "Notarization stuck"**
```bash
# Check status
xcrun notarytool log <submission-id> --apple-id "your@email.com"

# Common issues:
# - Hardened runtime not enabled
# - Missing entitlements
# - Unsigned frameworks/libraries
```

### Auto-Update Issues

**Issue: Updates not detected**
```bash
# Check:
1. Verify publish configuration in electron-builder.json
2. Check latest.yml is uploaded
3. Verify app can reach update server
4. Check logs: autoUpdater.logger = log
```

**Issue: "Update signature verification failed"**
```bash
# Ensure:
1. All builds signed with same certificate
2. Certificate valid and not expired
3. verifyUpdateCodeSignature is true
```

---

## Security Best Practices

### Certificate Management

1. **Never commit certificates to git**
   - Add to .gitignore
   - Use environment variables
   - Store securely (password manager, CI/CD secrets)

2. **Protect passwords**
   - Use strong passwords
   - Rotate regularly
   - Use CI/CD secrets

3. **Monitor certificate expiration**
   - Set calendar reminders
   - Renew before expiration
   - Test new certificates before old ones expire

### Build Security

1. **Verify builds**
   - Check signatures after build
   - Test on clean systems
   - Verify update URLs

2. **Secure CI/CD**
   - Use GitHub Secrets
   - Limit access to workflows
   - Review logs for secrets leakage

3. **Distribution**
   - Use HTTPS for downloads
   - Provide checksums
   - Document verification steps

---

## Checklist for New Releases

- [ ] Code signing certificates valid
- [ ] Build scripts tested
- [ ] Icons and assets updated
- [ ] Auto-update configuration verified
- [ ] Build on all platforms successful
- [ ] Signatures verified
- [ ] Notarization successful (macOS)
- [ ] Update metadata correct
- [ ] Installation tested on clean systems
- [ ] Auto-update tested from previous version

---

## Additional Resources

- [Electron Builder Documentation](https://www.electron.build/)
- [electron-updater Guide](https://www.electron.build/auto-update)
- [Apple Code Signing Guide](https://developer.apple.com/support/code-signing/)
- [Microsoft Code Signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)

---

For assistance with code signing and deployment, please open an issue on GitHub or contact the maintainers.
