# WA ParkStay Bookings - Installation Guide

**Version:** 1.0
**Last Updated:** 2025-10-31

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Windows Installation](#windows-installation)
3. [macOS Installation](#macos-installation)
4. [Linux Installation](#linux-installation)
5. [First-Run Setup](#first-run-setup)
6. [Troubleshooting](#troubleshooting)
7. [Uninstallation](#uninstallation)
8. [Updating](#updating)

---

## System Requirements

### Minimum Requirements

**Windows:**
- Windows 10 (64-bit) or later
- 4 GB RAM
- 500 MB free disk space
- Internet connection

**macOS:**
- macOS 10.15 (Catalina) or later
- 4 GB RAM
- 500 MB free disk space
- Internet connection

**Linux:**
- Ubuntu 20.04 LTS or later (or equivalent)
- 4 GB RAM
- 500 MB free disk space
- Internet connection

### Recommended Requirements

- 8 GB RAM or more
- 1 GB free disk space
- Stable broadband internet connection
- Modern multi-core processor

---

## Windows Installation

### Method 1: Using the Installer (Recommended)

1. **Download the Installer**
   - Go to the [releases page](https://github.com/your-username/parkstay-bookings/releases)
   - Download the latest `WA-ParkStay-Bookings-Setup-x.x.x.exe` file

2. **Run the Installer**
   - Double-click the downloaded `.exe` file
   - If Windows SmartScreen appears, click "More info" then "Run anyway"
   - The installer will open

3. **Installation Steps**
   - Read and accept the license agreement
   - Choose installation location (default: `C:\Program Files\WA ParkStay Bookings`)
   - Select additional tasks:
     - Create desktop shortcut (recommended)
     - Create Start Menu shortcut (recommended)
   - Click "Install"
   - Wait for installation to complete
   - Click "Finish" to launch the application

4. **First Launch**
   - The application will open automatically
   - Windows Defender Firewall may ask for network access - click "Allow"
   - Proceed to [First-Run Setup](#first-run-setup)

### Method 2: Portable Version

1. **Download Portable Version**
   - Download `WA-ParkStay-Bookings-Portable-x.x.x.exe` from the releases page

2. **Run Directly**
   - Save the file to any location (USB drive, Documents folder, etc.)
   - Double-click to run - no installation required
   - All data will be stored in the same directory as the executable

3. **Notes**
   - Portable version doesn't create shortcuts or registry entries
   - Updates must be downloaded manually
   - Ideal for running from USB drives or testing

### Windows Installation Notes

- **Administrator Rights**: Installation to Program Files requires administrator rights
- **Antivirus**: Some antivirus software may flag the application. Add an exception if needed
- **Auto-Start**: You can configure the app to start with Windows in Settings
- **Multiple Users**: Each Windows user account has separate application data

---

## macOS Installation

### Standard Installation

1. **Download the DMG**
   - Go to the [releases page](https://github.com/your-username/parkstay-bookings/releases)
   - Download the latest `WA-ParkStay-Bookings-x.x.x-arm64.dmg` (Apple Silicon) or
   - Download `WA-ParkStay-Bookings-x.x.x-x64.dmg` (Intel Mac)

2. **Mount the DMG**
   - Double-click the downloaded `.dmg` file
   - A new window will open showing the application icon and Applications folder

3. **Install the Application**
   - Drag the "WA ParkStay Bookings" icon to the "Applications" folder
   - Wait for the copy to complete
   - Eject the DMG by clicking the eject button in Finder

4. **First Launch**
   - Open Applications folder
   - Double-click "WA ParkStay Bookings"
   - macOS may show a security warning: "WA ParkStay Bookings is an app downloaded from the Internet"
   - Click "Open" to confirm you want to run the app
   - Proceed to [First-Run Setup](#first-run-setup)

### Troubleshooting macOS Gatekeeper

If macOS prevents the app from opening:

1. **Method 1: Security & Privacy**
   - Go to System Preferences > Security & Privacy > General tab
   - You'll see a message: "WA ParkStay Bookings was blocked..."
   - Click "Open Anyway"
   - Confirm by clicking "Open" in the dialog

2. **Method 2: Right-Click Open**
   - Right-click (or Control-click) the application
   - Select "Open" from the menu
   - Click "Open" in the warning dialog

3. **Method 3: Remove Quarantine (Advanced)**
   ```bash
   xattr -cr /Applications/WA\ ParkStay\ Bookings.app
   ```

### macOS Installation Notes

- **Apple Silicon vs Intel**: Download the correct version for your Mac
- **Automatic Updates**: The app will check for updates automatically
- **Data Location**: Application data is stored in `~/Library/Application Support/parkstay-bookings`
- **Login Items**: Enable in Settings to launch at login

---

## Linux Installation

### Ubuntu/Debian (AppImage - Recommended)

1. **Download AppImage**
   ```bash
   # Download latest release
   wget https://github.com/your-username/parkstay-bookings/releases/latest/download/WA-ParkStay-Bookings-x.x.x-x86_64.AppImage
   ```

2. **Make Executable**
   ```bash
   chmod +x WA-ParkStay-Bookings-x.x.x-x86_64.AppImage
   ```

3. **Run Application**
   ```bash
   ./WA-ParkStay-Bookings-x.x.x-x86_64.AppImage
   ```

4. **Optional: Integrate with Desktop**
   - The app will ask if you want to integrate with your desktop
   - Click "Yes" to create menu entries and file associations
   - Or use AppImageLauncher for automatic integration

### Ubuntu/Debian (DEB Package)

1. **Download DEB Package**
   ```bash
   wget https://github.com/your-username/parkstay-bookings/releases/latest/download/wa-parkstay-bookings_x.x.x_amd64.deb
   ```

2. **Install Package**
   ```bash
   sudo dpkg -i wa-parkstay-bookings_x.x.x_amd64.deb

   # Fix dependencies if needed
   sudo apt-get install -f
   ```

3. **Launch Application**
   - Find "WA ParkStay Bookings" in your application menu
   - Or run from terminal: `parkstay-bookings`

### Fedora/RHEL (RPM Package)

1. **Download RPM Package**
   ```bash
   wget https://github.com/your-username/parkstay-bookings/releases/latest/download/wa-parkstay-bookings-x.x.x.x86_64.rpm
   ```

2. **Install Package**
   ```bash
   sudo rpm -i wa-parkstay-bookings-x.x.x.x86_64.rpm

   # Or using dnf
   sudo dnf install wa-parkstay-bookings-x.x.x.x86_64.rpm
   ```

3. **Launch Application**
   - Find "WA ParkStay Bookings" in your application menu
   - Or run from terminal: `parkstay-bookings`

### Linux Installation Notes

- **Dependencies**: Most dependencies are bundled, but some system libraries may be required
- **Permissions**: AppImage may need `--no-sandbox` flag on some systems
- **Data Location**: Application data is stored in `~/.config/parkstay-bookings`
- **Autostart**: Configure via your desktop environment's startup applications

---

## First-Run Setup

After installing and launching the application for the first time:

### 1. Welcome Screen

You'll see the welcome screen with a brief introduction to the application.

Click "Get Started" to begin setup.

### 2. Account Setup

**Enter Your ParkStay Credentials:**

- **Email Address**: Your ParkStay account email
- **Password**: Your ParkStay account password

**Security Notes:**
- Your credentials are encrypted and stored locally on your computer
- No data is sent to external servers except ParkStay
- The app uses AES-256 encryption to protect your password

Click "Save Credentials" to continue.

### 3. Verify Connection

The app will test your credentials by logging into ParkStay:

- If successful: You'll see a green checkmark
- If failed: Check your credentials and try again
- If ParkStay is down: Try again later

### 4. Configure Notifications

**Choose Notification Preferences:**

- Desktop Notifications: Show system notifications when availability is found
- Sound Alerts: Play a sound with notifications
- Notification Types: Choose which events trigger notifications

Click "Save Settings" to continue.

### 5. Application Tour (Optional)

Take a quick tour of the main features:

- Dashboard: Overview of active watches and bookings
- Bookings: Manage existing reservations
- Watches: Set up availability monitoring
- Skip The Queue: Automated rebooking
- Settings: Configure application preferences

Click "Skip Tour" or complete the tour.

### 6. Ready to Use

You're all set! The application is now ready to use.

**Next Steps:**
- Import existing bookings
- Create your first watch
- Explore the features

---

## Troubleshooting

### Windows Issues

**Issue: "Windows protected your PC" message**
- **Solution**: Click "More info" then "Run anyway"
- This is normal for newly downloaded applications
- The app is safe and doesn't contain malware

**Issue: Application won't start**
- **Solution 1**: Run as administrator (right-click > Run as administrator)
- **Solution 2**: Check Windows Event Viewer for error details
- **Solution 3**: Reinstall Visual C++ Redistributables

**Issue: Antivirus blocking the application**
- **Solution**: Add an exception for the application in your antivirus settings
- File path: `C:\Program Files\WA ParkStay Bookings\`

**Issue: "Cannot find module" error**
- **Solution**: Reinstall the application
- Delete the installation directory completely before reinstalling

### macOS Issues

**Issue: "App can't be opened because it is from an unidentified developer"**
- **Solution**: See [Troubleshooting macOS Gatekeeper](#troubleshooting-macos-gatekeeper) section above

**Issue: Application crashes on startup**
- **Solution 1**: Check Console app for crash logs
- **Solution 2**: Remove preferences file:
  ```bash
  rm ~/Library/Application\ Support/parkstay-bookings/config.json
  ```
- **Solution 3**: Reinstall the application

**Issue: "Damaged and can't be opened" message**
- **Solution**: Remove quarantine attribute:
  ```bash
  xattr -cr /Applications/WA\ ParkStay\ Bookings.app
  ```

### Linux Issues

**Issue: AppImage won't run**
- **Solution 1**: Make sure it's executable: `chmod +x *.AppImage`
- **Solution 2**: Try with `--no-sandbox` flag:
  ```bash
  ./WA-ParkStay-Bookings-*.AppImage --no-sandbox
  ```
- **Solution 3**: Install FUSE:
  ```bash
  sudo apt install libfuse2  # Ubuntu/Debian
  sudo dnf install fuse-libs  # Fedora
  ```

**Issue: Missing dependencies**
- **Solution**: Install required libraries:
  ```bash
  sudo apt install libnotify4 libappindicator1 libxtst6 libnss3
  ```

**Issue: Icon not showing in menu**
- **Solution**: Update desktop database:
  ```bash
  sudo update-desktop-database
  ```

### General Issues

**Issue: Cannot connect to ParkStay**
- **Check**: Internet connection is active
- **Check**: ParkStay website (parkstay.dbca.wa.gov.au) is accessible
- **Solution**: Wait a few minutes and try again

**Issue: Invalid credentials error**
- **Check**: Email and password are correct
- **Check**: Can you log in to ParkStay website directly?
- **Solution**: Update credentials in Settings

**Issue: Database errors**
- **Solution 1**: Close all instances of the app
- **Solution 2**: Delete database file (will lose data):
  - Windows: `%APPDATA%\parkstay-bookings\parkstay.db`
  - macOS: `~/Library/Application Support/parkstay-bookings/parkstay.db`
  - Linux: `~/.config/parkstay-bookings/parkstay.db`

**Issue: High CPU or memory usage**
- **Check**: Number of active watches (reduce if needed)
- **Check**: Polling intervals (increase to reduce frequency)
- **Solution**: Restart the application

---

## Uninstallation

### Windows

**Method 1: Control Panel**
1. Open Control Panel > Programs > Programs and Features
2. Find "WA ParkStay Bookings" in the list
3. Right-click and select "Uninstall"
4. Follow the uninstaller prompts
5. Choose whether to delete application data

**Method 2: Settings**
1. Open Settings > Apps > Apps & features
2. Search for "WA ParkStay Bookings"
3. Click and select "Uninstall"
4. Confirm uninstallation

**Remove Application Data:**
If you want to completely remove all data:
```
%APPDATA%\parkstay-bookings
%LOCALAPPDATA%\parkstay-bookings
```

### macOS

**Uninstall Application:**
1. Open Finder > Applications
2. Find "WA ParkStay Bookings"
3. Drag to Trash (or right-click > Move to Trash)
4. Empty Trash

**Remove Application Data:**
```bash
rm -rf ~/Library/Application\ Support/parkstay-bookings
rm -rf ~/Library/Preferences/com.parkstay.bookings.plist
rm -rf ~/Library/Caches/parkstay-bookings
rm -rf ~/Library/Logs/parkstay-bookings
```

### Linux

**DEB Package:**
```bash
sudo apt remove parkstay-bookings
# Remove configuration files too
sudo apt purge parkstay-bookings
```

**RPM Package:**
```bash
sudo dnf remove parkstay-bookings
```

**AppImage:**
```bash
# Simply delete the AppImage file
rm WA-ParkStay-Bookings-*.AppImage

# Remove desktop integration if installed
rm ~/.local/share/applications/parkstay-bookings.desktop
rm ~/.local/share/icons/hicolor/*/apps/parkstay-bookings.png
```

**Remove Application Data:**
```bash
rm -rf ~/.config/parkstay-bookings
rm -rf ~/.local/share/parkstay-bookings
rm -rf ~/.cache/parkstay-bookings
```

---

## Updating

### Automatic Updates (Recommended)

The application checks for updates automatically:

1. When a new version is available, you'll see a notification
2. Click "Download Update" to download in the background
3. Once downloaded, click "Install and Restart"
4. The app will close, install the update, and restart
5. Your data and settings are preserved

### Manual Updates

If automatic updates are disabled:

1. Download the latest version from the releases page
2. Follow the installation instructions for your platform
3. The new version will install over the old one
4. Your data and settings are preserved

### Update Settings

Configure update behavior in Settings:

- **Check for Updates**: Automatically check for updates on startup
- **Download Automatically**: Download updates in the background
- **Update Channel**: Stable (recommended) or Beta

---

## Getting Help

If you encounter issues not covered in this guide:

1. **Check the Documentation**: See the [User Guide](./user-guide.md) for feature help
2. **Search Issues**: Check [GitHub Issues](https://github.com/your-username/parkstay-bookings/issues)
3. **Report a Bug**: Create a new issue with details about your problem
4. **Contact Support**: Email support@example.com (if applicable)

### Include in Bug Reports

When reporting issues, please include:

- Operating system and version
- Application version (Help > About)
- Steps to reproduce the problem
- Error messages or screenshots
- Log files (Settings > Advanced > Export Logs)

---

## License

This application is released under the MIT License. See LICENSE file for details.

---

**Next Steps:**
- Read the [User Guide](./user-guide.md) to learn how to use the application
- See [Development Guide](./development.md) if you want to contribute
