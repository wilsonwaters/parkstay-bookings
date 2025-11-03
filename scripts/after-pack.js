/**
 * Post-Pack Script
 *
 * This script runs after the app has been packaged but before installers are created.
 * Use it for final modifications, adding extra files, or verification.
 */

const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  console.log('\n📦 Running post-pack tasks...\n');

  const { electronPlatformName, appOutDir, packager } = context;
  const appInfo = packager.appInfo;

  // Log pack information
  console.log('📋 Package Information:');
  console.log(`   App Name: ${appInfo.productName}`);
  console.log(`   Version: ${appInfo.version}`);
  console.log(`   Platform: ${electronPlatformName}`);
  console.log(`   Output Directory: ${appOutDir}`);
  console.log('');

  // Verify output exists
  if (!fs.existsSync(appOutDir)) {
    console.error('❌ Output directory not found!');
    process.exit(1);
  }

  // Platform-specific post-pack tasks
  if (electronPlatformName === 'darwin') {
    await handleMacOSPostPack(appOutDir, appInfo);
  } else if (electronPlatformName === 'win32') {
    await handleWindowsPostPack(appOutDir, appInfo);
  } else if (electronPlatformName === 'linux') {
    await handleLinuxPostPack(appOutDir, appInfo);
  }

  // Add README or LICENSE to package
  const rootReadme = path.join(process.cwd(), 'README.md');
  const rootLicense = path.join(process.cwd(), 'LICENSE');

  if (fs.existsSync(rootReadme)) {
    const targetReadme = path.join(appOutDir, 'README.md');
    fs.copyFileSync(rootReadme, targetReadme);
    console.log('   ✅ Copied README.md');
  }

  if (fs.existsSync(rootLicense)) {
    const targetLicense = path.join(appOutDir, 'LICENSE');
    fs.copyFileSync(rootLicense, targetLicense);
    console.log('   ✅ Copied LICENSE');
  }

  console.log('\n✅ Post-pack tasks complete!\n');
};

async function handleMacOSPostPack(appOutDir, appInfo) {
  console.log('🍎 macOS-specific tasks:');

  const appPath = path.join(appOutDir, `${appInfo.productFilename}.app`);

  // Verify app bundle exists
  if (!fs.existsSync(appPath)) {
    console.error(`   ❌ App bundle not found: ${appPath}`);
    return;
  }

  console.log(`   ✅ App bundle created: ${appInfo.productFilename}.app`);

  // Check code signature
  try {
    const { execSync } = require('child_process');
    execSync(`codesign -dv "${appPath}" 2>&1`, { stdio: 'pipe' });
    console.log('   ✅ App is code signed');
  } catch (error) {
    console.warn('   ⚠️  App is not code signed');
  }

  // Verify Info.plist
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
  if (fs.existsSync(infoPlistPath)) {
    console.log('   ✅ Info.plist present');
  }

  console.log('');
}

async function handleWindowsPostPack(appOutDir, appInfo) {
  console.log('🪟 Windows-specific tasks:');

  const exePath = path.join(appOutDir, `${appInfo.productFilename}.exe`);

  // Verify exe exists
  if (!fs.existsSync(exePath)) {
    console.error(`   ❌ Executable not found: ${exePath}`);
    return;
  }

  console.log(`   ✅ Executable created: ${appInfo.productFilename}.exe`);

  // Check code signature
  try {
    const { execSync } = require('child_process');
    // Try to find signtool
    execSync(`signtool verify /pa "${exePath}" 2>&1`, { stdio: 'pipe' });
    console.log('   ✅ Executable is code signed');
  } catch (error) {
    console.warn('   ⚠️  Executable is not code signed');
  }

  console.log('');
}

async function handleLinuxPostPack(appOutDir, appInfo) {
  console.log('🐧 Linux-specific tasks:');

  const executablePath = path.join(appOutDir, appInfo.productFilename.toLowerCase());

  // Verify executable exists
  if (!fs.existsSync(executablePath)) {
    console.error(`   ❌ Executable not found: ${executablePath}`);
    return;
  }

  console.log(`   ✅ Executable created: ${appInfo.productFilename.toLowerCase()}`);

  // Ensure executable permission
  try {
    fs.chmodSync(executablePath, '755');
    console.log('   ✅ Executable permissions set');
  } catch (error) {
    console.warn('   ⚠️  Failed to set executable permissions');
  }

  console.log('');
}
