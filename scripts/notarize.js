/**
 * macOS Notarization Script
 *
 * This script handles notarization of the macOS application.
 * Notarization is required for macOS 10.15 (Catalina) and later.
 *
 * Prerequisites:
 * - Apple Developer account
 * - Developer ID Application certificate installed
 * - App-specific password generated
 *
 * Environment Variables Required:
 * - APPLE_ID: Your Apple ID email
 * - APPLE_APP_SPECIFIC_PASSWORD: App-specific password
 * - APPLE_TEAM_ID: Your Apple Developer Team ID
 */

const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize on macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not a macOS build');
    return;
  }

  // Check if credentials are provided
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('⚠️  Skipping notarization - credentials not configured');
    console.log('Set APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD to enable notarization');
    return;
  }

  if (!process.env.APPLE_TEAM_ID) {
    console.log('⚠️  Warning: APPLE_TEAM_ID not set, notarization may fail');
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`\n🔐 Starting notarization for: ${appPath}`);
  console.log(`📧 Using Apple ID: ${process.env.APPLE_ID}`);
  console.log(`👥 Team ID: ${process.env.APPLE_TEAM_ID || 'Not specified'}\n`);

  try {
    await notarize({
      appBundleId: 'com.parkstay.bookings',
      appPath: appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });

    console.log('✅ Notarization complete!\n');
  } catch (error) {
    console.error('❌ Notarization failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify your Apple ID and password are correct');
    console.error('2. Check that your app is properly signed');
    console.error('3. Ensure hardened runtime is enabled');
    console.error('4. Review entitlements.mac.plist');
    console.error('5. Check Apple notarization logs:\n');
    console.error('   xcrun notarytool log <submission-id> \\');
    console.error('     --apple-id "your@email.com" \\');
    console.error('     --password "your-app-password"\n');
    throw error;
  }
};
