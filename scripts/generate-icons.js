/**
 * Generate Icon Assets
 * Creates Windows icon files from source images
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { default: pngToIco } = require('png-to-ico');

const BASE_ICON = path.join(__dirname, '..', 'resources', 'icon-source.png');
const BANNER_SOURCE = path.join(__dirname, '..', 'resources', 'banner-source.png');
const OUTPUT_DIR = path.join(__dirname, '..', 'resources', 'icons');

async function generateIcons() {
  console.log('Generating icon assets...');

  // Verify source files exist
  if (!fs.existsSync(BASE_ICON)) {
    console.error(`❌ Error: Base icon not found at ${BASE_ICON}`);
    console.log('Please place your icon source image at resources/icon-source.png');
    process.exit(1);
  }

  if (!fs.existsSync(BANNER_SOURCE)) {
    console.error(`❌ Error: Banner source not found at ${BANNER_SOURCE}`);
    console.log('Please place your banner source image at resources/banner-source.png');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    // 1. Generate icon.ico with multiple sizes (16, 32, 48, 64, 128, 256)
    console.log('\n1. Generating icon.ico...');
    const sizes = [16, 32, 48, 64, 128, 256];
    const pngBuffers = [];

    for (const size of sizes) {
      const buffer = await sharp(BASE_ICON)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      pngBuffers.push(buffer);
      console.log(`   - Generated ${size}x${size} PNG`);
    }

    const icoBuffer = await pngToIco(pngBuffers);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'icon.ico'), icoBuffer);
    console.log('   ✓ icon.ico created');

    // 2. Generate installer-header.bmp (150x57px)
    // Note: electron-builder can use PNG files, but expects BMP naming
    console.log('\n2. Generating installer-header.bmp (150x57px)...');
    await sharp(BANNER_SOURCE)
      .resize(150, 57, { fit: 'cover', position: 'center' })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'installer-header.png'));
    console.log('   ✓ installer-header.png created');

    // 3. Generate installer-sidebar.bmp (164x314px)
    console.log('\n3. Generating installer-sidebar.bmp (164x314px)...');
    await sharp(BANNER_SOURCE)
      .resize(164, 314, { fit: 'cover', position: 'center' })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'installer-sidebar.png'));
    console.log('   ✓ installer-sidebar.png created');

    console.log('\n✅ All icon assets generated successfully!');
    console.log(`\nOutput directory: ${OUTPUT_DIR}`);
    console.log('\nGenerated files:');
    console.log('  - icon.ico (16x16, 32x32, 48x48, 64x64, 128x128, 256x256)');
    console.log('  - installer-header.png (150x57) - rename to .bmp if needed');
    console.log('  - installer-sidebar.png (164x314) - rename to .bmp if needed');
    console.log('\nNote: electron-builder accepts PNG files. If BMP is strictly required,');
    console.log('use ImageMagick: magick convert installer-header.png installer-header.bmp');
  } catch (error) {
    console.error('\n❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
