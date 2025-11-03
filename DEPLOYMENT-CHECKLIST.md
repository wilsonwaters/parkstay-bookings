# WA ParkStay Bookings - Deployment Checklist

Use this checklist when preparing for a new release.

## Pre-Release Preparation

### Code Quality
- [ ] All tests passing (unit, integration, E2E)
- [ ] No linting errors (`npm run lint`)
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] Code coverage ≥ 80% (`npm run test:coverage`)
- [ ] Code reviewed and approved
- [ ] All critical bugs fixed
- [ ] All TODOs resolved or documented

### Documentation
- [ ] CHANGELOG.md updated with all changes
- [ ] README.md updated if needed
- [ ] User guide updated with new features
- [ ] Installation guide reviewed
- [ ] API documentation updated
- [ ] Migration guide created (for major versions)
- [ ] Screenshots updated

### Database
- [ ] Migration scripts created and tested
- [ ] Rollback scripts prepared
- [ ] Database schema documented
- [ ] Migration tested on sample data

### Security
- [ ] Security audit completed
- [ ] Dependencies checked for vulnerabilities (`npm audit`)
- [ ] Secrets removed from code
- [ ] Credentials properly encrypted
- [ ] Code signing certificates valid

## Configuration Files

### electron-builder.json
- [ ] App ID correct: `com.parkstay.bookings`
- [ ] Product name: `WA ParkStay Bookings`
- [ ] Version number updated
- [ ] Build output directory configured
- [ ] File patterns correct
- [ ] Platform-specific settings verified

### package.json
- [ ] Version number matches release
- [ ] Dependencies up to date
- [ ] Dev dependencies up to date
- [ ] Scripts tested and working
- [ ] Repository URL correct
- [ ] License specified

### Resources
- [ ] App icons created (Windows .ico)
- [ ] App icons created (macOS .icns)
- [ ] App icons created (Linux .png)
- [ ] Installer images created (Windows)
- [ ] DMG background created (macOS)
- [ ] All icons tested at various sizes

## Code Signing Setup

### Windows
- [ ] Code signing certificate obtained
- [ ] Certificate in PFX/P12 format
- [ ] Certificate password secured
- [ ] CSC_LINK environment variable set
- [ ] CSC_KEY_PASSWORD environment variable set
- [ ] Signing script tested (`scripts/sign-windows.js`)
- [ ] Timestamp servers accessible

### macOS
- [ ] Apple Developer account active
- [ ] Developer ID certificate installed
- [ ] Team ID obtained
- [ ] App-specific password generated
- [ ] APPLE_ID environment variable set
- [ ] APPLE_APP_SPECIFIC_PASSWORD environment variable set
- [ ] APPLE_TEAM_ID environment variable set
- [ ] Entitlements file created (`resources/entitlements.mac.plist`)
- [ ] Notarization script tested (`scripts/notarize.js`)

### Linux
- [ ] GPG key created (optional)
- [ ] Package signing configured (optional)

## GitHub Configuration

### Repository Settings
- [ ] Repository public or private (configured)
- [ ] Branch protection rules set
- [ ] Required reviews configured
- [ ] Status checks required

### Secrets (if using CI/CD)
- [ ] WINDOWS_CERTIFICATE (base64 encoded)
- [ ] WINDOWS_CERTIFICATE_PASSWORD
- [ ] MACOS_CERTIFICATE (base64 encoded)
- [ ] MACOS_CERTIFICATE_PASSWORD
- [ ] APPLE_ID
- [ ] APPLE_APP_SPECIFIC_PASSWORD
- [ ] APPLE_TEAM_ID
- [ ] GITHUB_TOKEN (automatic)
- [ ] CODECOV_TOKEN (optional)

### GitHub Actions
- [ ] CI workflow configured (`.github/workflows/ci.yml`)
- [ ] Build workflow configured (`.github/workflows/build.yml`)
- [ ] Workflows tested and passing
- [ ] Artifacts uploaded correctly
- [ ] Release creation automated

## Build Process

### Local Build Testing
- [ ] Clean build performed (`npm run clean && npm run build`)
- [ ] Windows build tested (`npm run build:win`)
- [ ] macOS build tested (`npm run build:mac`)
- [ ] Linux build tested (`npm run build:linux`)
- [ ] All builds complete without errors
- [ ] Code signing successful (all platforms)
- [ ] Notarization successful (macOS)

### Build Verification
- [ ] Windows executable runs
- [ ] macOS app bundle runs
- [ ] Linux AppImage runs
- [ ] Icons display correctly
- [ ] App name and version correct
- [ ] No console errors on startup
- [ ] All features working

### Installer Testing
- [ ] Windows installer created
- [ ] Windows installer runs successfully
- [ ] macOS DMG created
- [ ] macOS DMG mounts and installs
- [ ] Linux packages created
- [ ] Installation tested on clean VMs
- [ ] Shortcuts created correctly
- [ ] Start menu entries correct (Windows)
- [ ] Applications folder install correct (macOS)

## Auto-Update Configuration

### Update Server
- [ ] Update server configured (GitHub Releases or custom)
- [ ] Provider settings correct in electron-builder.json
- [ ] Update URL accessible
- [ ] HTTPS enabled

### Update Files
- [ ] latest.yml generated (Windows)
- [ ] latest-mac.yml generated (macOS)
- [ ] latest-linux.yml generated (Linux)
- [ ] Files include correct version
- [ ] SHA512 hashes correct
- [ ] File sizes correct

### Update Testing
- [ ] Auto-update implemented in main process
- [ ] Update check on startup working
- [ ] Update download working
- [ ] Update installation working
- [ ] UI notifications working
- [ ] Rollback mechanism tested

## Release Creation

### Version Bump
- [ ] Version bumped in package.json
- [ ] Version bumped in electron-builder.json
- [ ] Git tag created (`git tag -a v1.0.0`)
- [ ] Tag pushed to remote (`git push --tags`)

### GitHub Release
- [ ] Release draft created
- [ ] Release title formatted correctly
- [ ] Release notes written
- [ ] Changelog included
- [ ] Breaking changes highlighted
- [ ] Migration guide linked (if needed)
- [ ] Build artifacts attached:
  - [ ] Windows installer (.exe)
  - [ ] Windows portable (.exe)
  - [ ] macOS DMG (Intel and ARM)
  - [ ] macOS ZIP (Intel and ARM)
  - [ ] Linux AppImage
  - [ ] Linux DEB
  - [ ] Linux RPM
- [ ] Update metadata files attached (latest*.yml)
- [ ] Source code archives attached (automatic)
- [ ] Release published (not draft)

## Post-Release Verification

### Installation Testing
- [ ] Windows installer tested on Windows 10
- [ ] Windows installer tested on Windows 11
- [ ] macOS installer tested on Intel Mac
- [ ] macOS installer tested on Apple Silicon Mac
- [ ] Linux packages tested on Ubuntu
- [ ] Linux packages tested on other distros
- [ ] All platforms: Clean install
- [ ] All platforms: First run successful
- [ ] All platforms: Settings persist

### Auto-Update Testing
- [ ] Previous version detects update
- [ ] Update downloads successfully
- [ ] Update installs successfully
- [ ] App restarts correctly
- [ ] Data preserved after update
- [ ] Settings preserved after update

### Functional Testing
- [ ] All core features working
- [ ] User can log in with ParkStay credentials
- [ ] Bookings can be imported
- [ ] Watches can be created
- [ ] Skip The Queue can be enabled
- [ ] Notifications working
- [ ] Settings can be modified
- [ ] Database operations working

## Distribution

### GitHub Release
- [ ] Release visible on releases page
- [ ] Download links working
- [ ] Assets downloadable
- [ ] README links updated

### Website (if applicable)
- [ ] Download page updated
- [ ] Version number displayed
- [ ] Installation instructions current
- [ ] Changelog published
- [ ] Screenshots updated

### Package Managers (future)
- [ ] Chocolatey package submitted (Windows)
- [ ] Winget manifest submitted (Windows)
- [ ] Homebrew Cask updated (macOS)
- [ ] Snap Store updated (Linux)
- [ ] Flathub updated (Linux)

## Communication

### Users
- [ ] Release announcement prepared
- [ ] Breaking changes communicated
- [ ] Migration guide shared
- [ ] Social media posts scheduled
- [ ] Email notification sent (if applicable)

### Documentation
- [ ] Documentation site updated
- [ ] API documentation published
- [ ] FAQ updated
- [ ] Troubleshooting guide updated

## Monitoring

### Error Tracking
- [ ] Error tracking enabled
- [ ] Alerts configured
- [ ] Dashboard monitored
- [ ] Critical errors addressed immediately

### Analytics (if applicable)
- [ ] Download metrics tracked
- [ ] Usage metrics reviewed
- [ ] Feature adoption monitored
- [ ] Performance metrics tracked

### User Feedback
- [ ] GitHub issues monitored
- [ ] User feedback collected
- [ ] Bug reports triaged
- [ ] Feature requests evaluated

## Rollback Plan

### Preparation
- [ ] Previous version tagged and accessible
- [ ] Rollback procedure documented
- [ ] Team aware of rollback process
- [ ] Database backup created

### Triggers
- [ ] Critical bug criteria defined
- [ ] Security vulnerability criteria defined
- [ ] Data corruption criteria defined
- [ ] Decision makers identified

### Execution (if needed)
- [ ] Users notified of issue
- [ ] Rollback version prepared
- [ ] New version number assigned
- [ ] Emergency release created
- [ ] Update server updated
- [ ] Users instructed to update

## Post-Release Tasks

### Immediate (Day 1)
- [ ] Monitor error reports
- [ ] Check download metrics
- [ ] Verify auto-update working
- [ ] Respond to user feedback
- [ ] Update documentation if needed

### Short-term (Week 1)
- [ ] Review crash reports
- [ ] Address critical bugs
- [ ] Update FAQ with common issues
- [ ] Collect user feedback
- [ ] Plan hotfix if needed

### Medium-term (Month 1)
- [ ] Analyze usage metrics
- [ ] Review feature adoption
- [ ] Plan next release
- [ ] Archive old releases (optional)
- [ ] Update roadmap

## Sign-off

Release Manager: ___________________________ Date: ___________

QA Lead: ___________________________ Date: ___________

Technical Lead: ___________________________ Date: ___________

---

## Notes

Use this space to document any issues, special circumstances, or deviations from the standard process:

---

**Version:** 1.0
**Last Updated:** 2025-10-31
