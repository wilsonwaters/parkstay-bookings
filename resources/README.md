# Resources Directory

This directory contains static resources used for building and packaging the application.

## Directory Structure

```
resources/
├── icons/                  # Application icons
│   ├── icon.icns          # macOS icon (required)
│   ├── icon.ico           # Windows icon (required)
│   ├── icon.png           # Base PNG icon (512x512 or larger)
│   ├── 16x16.png          # Linux icon 16x16
│   ├── 32x32.png          # Linux icon 32x32
│   ├── 48x48.png          # Linux icon 48x48
│   ├── 64x64.png          # Linux icon 64x64
│   ├── 128x128.png        # Linux icon 128x128
│   ├── 256x256.png        # Linux icon 256x256
│   ├── 512x512.png        # Linux icon 512x512
│   ├── installer-header.bmp    # Windows NSIS header (150x57)
│   ├── installer-sidebar.bmp   # Windows NSIS sidebar (164x314)
│   └── file-icon.icns          # File association icon (macOS)
├── sounds/                # Notification sounds
│   ├── notification.mp3   # Default notification sound
│   ├── success.mp3        # Success sound
│   └── alert.mp3          # Alert sound
├── dmg/                   # macOS DMG background
│   ├── background.png     # DMG background (540x380)
│   └── background@2x.png  # Retina DMG background (1080x760)
├── entitlements.mac.plist # macOS entitlements
└── installer.nsh          # Custom NSIS installer script
```

## Icon Requirements

### Windows (.ico)
- **Required sizes**: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
- **Format**: ICO file with multiple sizes
- **File**: `icon.ico`

### macOS (.icns)
- **Required sizes**: 16x16, 32x32, 128x128, 256x256, 512x512, 1024x1024
- **Format**: ICNS file (includes @2x retina variants)
- **File**: `icon.icns`

### Linux (PNG)
- **Required sizes**: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512
- **Format**: Individual PNG files
- **Files**: Named by size (e.g., `256x256.png`)

## Creating Icons

### Option 1: From PNG Source

If you have a high-resolution PNG (512x512 or larger):

```bash
# Install icon-gen
npm install -g icon-gen

# Generate all icons
icon-gen -i icon.png -o icons --icns --ico --sizes 16,32,48,64,128,256,512,1024
```

### Option 2: From SVG Source

For best quality, start with an SVG:

```bash
# Generate PNG first
# Then use icon-gen to create platform-specific icons
```

### Option 3: Online Tools

Use these online converters:
- [iConvert Icons](https://iconverticons.com/online/)
- [CloudConvert](https://cloudconvert.com/)
- [Icon Generator](https://icon.kitchen/)

## Icon Design Guidelines

### General
- Use simple, recognizable designs
- Ensure visibility at small sizes (16x16)
- Use bold lines and shapes
- Avoid fine details that disappear when scaled

### Color
- Use a distinctive color scheme
- Ensure good contrast
- Consider both light and dark backgrounds
- Test on various OS themes

### Shape
- Rounded corners work well on all platforms
- Square icons (with padding) are safe
- Avoid very thin elements

### Testing
Test your icons at all sizes:
- 16x16 (system tray, file explorer)
- 32x32 (toolbar, small windows)
- 48x48 (desktop shortcut)
- 256x256+ (app stores, high-DPI displays)

## Notification Sounds

### Format Requirements
- **Format**: MP3, WAV, or OGG
- **Duration**: 1-3 seconds recommended
- **Size**: Keep under 100KB each
- **Sample Rate**: 44.1kHz or 48kHz

### Sound Guidelines
- Keep volumes consistent
- Avoid jarring or loud sounds
- Test on different systems
- Provide option to disable

### Creating Sounds
- Use tools like Audacity (free)
- Record or find royalty-free sounds
- Normalize audio levels
- Export in multiple formats

## DMG Background (macOS)

### Requirements
- **Size**: 540x380 pixels (1x), 1080x760 pixels (2x)
- **Format**: PNG with transparency
- **Design**: Show app icon and Applications folder
- **Colors**: Match your brand colors

### Creating DMG Background

```bash
# Create with graphic design tool
# Export as PNG
# Place in resources/dmg/
```

## NSIS Installer Assets (Windows)

### Header Image
- **Size**: 150x57 pixels
- **Format**: BMP (24-bit)
- **Shows**: Top of installer window

### Sidebar Image
- **Size**: 164x314 pixels
- **Format**: BMP (24-bit)
- **Shows**: Left side of installer

### Creating Installer Images

Use graphic design tools (Photoshop, GIMP, Figma):
1. Create images at exact sizes
2. Export as 24-bit BMP
3. Test installer appearance

## Entitlements (macOS)

The `entitlements.mac.plist` file specifies app capabilities:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <!-- Add more as needed -->
</dict>
</plist>
```

## Custom NSIS Script

Create `installer.nsh` for custom installer behavior:

```nsis
; Custom NSIS installer script
; This runs during Windows installation

!macro customInstall
  ; Add registry keys
  ; Create additional shortcuts
  ; etc.
!macroend

!macro customUnInstall
  ; Clean up custom changes
!macroend
```

## File Size Recommendations

- Icons (all): < 500KB total
- Sounds: < 100KB each
- DMG background: < 200KB each
- Installer images: < 100KB each

Total resources should be under 2MB.

## Testing Resources

### Before Building

1. **Verify all files exist**:
   ```bash
   ls -R resources/
   ```

2. **Check file sizes**:
   ```bash
   du -sh resources/*
   ```

3. **Validate icon formats**:
   ```bash
   file resources/icons/*
   ```

### After Building

1. **Check icon in installed app**
2. **Test sounds play correctly**
3. **Verify DMG appearance (macOS)**
4. **Check installer appearance (Windows)**

## Updating Resources

When updating icons or assets:

1. Replace files in this directory
2. Clear build cache:
   ```bash
   npm run clean
   ```
3. Rebuild application:
   ```bash
   npm run build
   ```
4. Test thoroughly on all platforms

## Licensing

Ensure all resources are properly licensed:
- Own the original artwork, or
- Use royalty-free resources, or
- Have proper licenses for third-party assets

Document licenses in `resources/LICENSES.md` if using third-party assets.

## Additional Notes

- All resources are copied during build
- Keep files small for faster downloads
- Test on all target platforms
- Update version numbers in assets if needed

## Need Help?

- See [Code Signing and Deployment Guide](../docs/code-signing-and-deployment.md)
- Check [Development Guide](../docs/development.md)
- Open an issue on GitHub
