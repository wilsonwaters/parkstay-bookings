# WA ParkStay Bookings - Release Process

**Version:** 1.0
**Last Updated:** 2025-10-31

## Table of Contents

1. [Overview](#overview)
2. [Version Numbering](#version-numbering)
3. [Release Checklist](#release-checklist)
4. [Creating a Release](#creating-a-release)
5. [Changelog Management](#changelog-management)
6. [Distribution Strategy](#distribution-strategy)
7. [Rollback Procedure](#rollback-procedure)
8. [Post-Release Tasks](#post-release-tasks)

---

## Overview

This document outlines the complete release process for the WA ParkStay Bookings application. Following this process ensures consistent, high-quality releases with proper versioning, testing, and documentation.

### Release Types

**Major Release (x.0.0)**
- Breaking changes
- Major new features
- Significant architecture changes
- Database schema breaking changes

**Minor Release (1.x.0)**
- New features
- Enhancements to existing features
- Non-breaking changes
- Database schema additions

**Patch Release (1.0.x)**
- Bug fixes
- Security patches
- Minor improvements
- Documentation updates

**Pre-releases**
- Alpha: Early testing (x.x.x-alpha.1)
- Beta: Feature complete, testing (x.x.x-beta.1)
- RC: Release candidate (x.x.x-rc.1)

---

## Version Numbering

We follow [Semantic Versioning 2.0.0](https://semver.org/):

### Format: MAJOR.MINOR.PATCH

**MAJOR**: Increment when making incompatible API changes
- Example: 1.0.0 → 2.0.0
- Breaking changes to data models
- Incompatible database schema changes
- Major UI/UX overhauls

**MINOR**: Increment when adding functionality in a backward-compatible manner
- Example: 1.0.0 → 1.1.0
- New features added
- Enhanced existing features
- New API methods added

**PATCH**: Increment when making backward-compatible bug fixes
- Example: 1.0.0 → 1.0.1
- Bug fixes
- Security patches
- Performance improvements

### Pre-release Identifiers

**Alpha** (x.x.x-alpha.1)
- Early development
- Not feature complete
- For internal testing

**Beta** (x.x.x-beta.1)
- Feature complete
- May have bugs
- For wider testing

**Release Candidate** (x.x.x-rc.1)
- Release ready
- Final testing
- No new features

### Version Commands

```bash
# Patch release (1.0.0 → 1.0.1)
npm run version:patch

# Minor release (1.0.0 → 1.1.0)
npm run version:minor

# Major release (1.0.0 → 2.0.0)
npm run version:major

# Pre-release
npm version prerelease --preid=alpha
npm version prerelease --preid=beta
npm version prerelease --preid=rc
```

---

## Release Checklist

### Pre-Release Phase

- [ ] **Code Complete**
  - [ ] All features implemented and merged
  - [ ] No open critical bugs
  - [ ] All TODOs resolved or documented

- [ ] **Testing**
  - [ ] All unit tests passing
  - [ ] All integration tests passing
  - [ ] All E2E tests passing
  - [ ] Manual testing on Windows completed
  - [ ] Manual testing on macOS completed
  - [ ] Manual testing on Linux completed

- [ ] **Code Quality**
  - [ ] No linting errors
  - [ ] No TypeScript errors
  - [ ] Code coverage ≥ 80%
  - [ ] Code reviewed and approved

- [ ] **Documentation**
  - [ ] CHANGELOG.md updated
  - [ ] README.md updated if needed
  - [ ] User guide updated with new features
  - [ ] API documentation updated
  - [ ] Migration guide created (for major versions)

- [ ] **Database**
  - [ ] Migration scripts tested
  - [ ] Rollback scripts prepared
  - [ ] Database backup strategy verified

- [ ] **Security**
  - [ ] Security audit completed
  - [ ] Dependencies checked for vulnerabilities
  - [ ] Credentials and secrets removed from code
  - [ ] Code signing certificates valid

### Release Phase

- [ ] **Version Bump**
  - [ ] Version number updated in package.json
  - [ ] Version number updated in electron-builder.json
  - [ ] Git tag created

- [ ] **Build**
  - [ ] Clean build completed
  - [ ] Windows installer created and tested
  - [ ] macOS DMG created and tested
  - [ ] Linux packages created and tested
  - [ ] Code signing successful (all platforms)

- [ ] **Distribution**
  - [ ] Release notes prepared
  - [ ] GitHub release created
  - [ ] Installers uploaded to release
  - [ ] Update server configured

### Post-Release Phase

- [ ] **Verification**
  - [ ] Auto-update working
  - [ ] Download links functional
  - [ ] Installation tested on clean systems
  - [ ] Update from previous version tested

- [ ] **Communication**
  - [ ] Release announcement posted
  - [ ] Users notified
  - [ ] Documentation site updated
  - [ ] Social media posted (if applicable)

- [ ] **Monitoring**
  - [ ] Error tracking enabled
  - [ ] Usage metrics reviewed
  - [ ] User feedback collected
  - [ ] Issues triaged

---

## Creating a Release

### Step-by-Step Guide

#### 1. Prepare the Release Branch

```bash
# Ensure you're on the main branch and up to date
git checkout main
git pull origin main

# Create release branch
git checkout -b release/v1.2.0
```

#### 2. Update Version Number

```bash
# For patch release
npm run version:patch

# For minor release
npm run version:minor

# For major release
npm run version:major

# This will:
# - Update package.json version
# - Create a git tag
# - Push tag to remote
```

#### 3. Update CHANGELOG.md

```markdown
# Changelog

## [1.2.0] - 2025-10-31

### Added
- New notification sound options
- Export bookings to CSV feature
- Dark mode support

### Changed
- Improved watch performance
- Updated UI design for settings page

### Fixed
- Fixed crash when importing bookings
- Resolved timezone issues
- Fixed auto-update on Windows

### Security
- Updated dependencies with security patches
```

#### 4. Commit Changes

```bash
git add CHANGELOG.md
git commit -m "chore: prepare release v1.2.0"
git push origin release/v1.2.0
```

#### 5. Create Pull Request

- Open PR from `release/v1.2.0` to `main`
- Title: "Release v1.2.0"
- Include changelog in description
- Request reviews
- Ensure CI/CD passes

#### 6. Merge and Tag

```bash
# After PR approval, merge to main
git checkout main
git pull origin main

# Create and push tag
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

#### 7. Automated Build

The GitHub Actions workflow automatically:
- Builds for all platforms
- Signs the code
- Creates installers
- Uploads artifacts

#### 8. Create GitHub Release

```bash
# Using GitHub CLI
gh release create v1.2.0 \
  --title "WA ParkStay Bookings v1.2.0" \
  --notes-file release-notes.md \
  --draft

# Or manually on GitHub:
# 1. Go to Releases page
# 2. Click "Draft a new release"
# 3. Choose tag v1.2.0
# 4. Enter release title and notes
# 5. Attach build artifacts (if not auto-uploaded)
# 6. Publish release
```

#### 9. Verify Release

```bash
# Test downloads
wget https://github.com/your-org/parkstay-bookings/releases/download/v1.2.0/ParkStay-Setup-1.2.0.exe

# Test installation on clean system
# Test auto-update from previous version
# Verify functionality
```

#### 10. Publish Release

- Change GitHub release from draft to published
- Update server metadata updated
- Auto-update available to users

---

## Changelog Management

### Changelog Format

Follow [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Feature in development

## [1.2.0] - 2025-10-31

### Added
- New features

### Changed
- Changes to existing features

### Deprecated
- Features to be removed

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security fixes

## [1.1.0] - 2025-10-15
...
```

### Categories

**Added**: New features
**Changed**: Changes to existing functionality
**Deprecated**: Soon-to-be removed features
**Removed**: Removed features
**Fixed**: Bug fixes
**Security**: Security updates

### Writing Good Changelog Entries

**Good:**
```markdown
- Added support for flexible date ranges in watches
- Fixed crash when importing bookings with special characters
- Improved performance of Skip The Queue checks by 50%
```

**Bad:**
```markdown
- Added feature
- Fixed bug
- Updated code
```

### Automation

Use conventional commits to auto-generate changelog:

```bash
# Install standard-version
npm install -D standard-version

# Generate changelog
npx standard-version
```

---

## Distribution Strategy

### Distribution Channels

**Primary: GitHub Releases**
- All platform installers
- Source code archives
- Release notes
- Update metadata

**Secondary: Website**
- Download page with links to GitHub
- Documentation
- Installation instructions

**Future: Package Managers**
- Windows: Chocolatey, Winget
- macOS: Homebrew Cask
- Linux: Snap Store, Flathub

### Auto-Update Configuration

**Update Server:**
```json
{
  "provider": "github",
  "owner": "your-org",
  "repo": "parkstay-bookings",
  "releaseType": "release"
}
```

**Update Channels:**
- **Stable**: Production releases only
- **Beta**: Beta and stable releases
- **Alpha**: All pre-releases

**Update Frequency:**
- Check on app startup
- Check daily if app is running
- Manual check in settings

### Release Artifacts

Each release includes:

**Windows:**
- `ParkStay-Setup-x.x.x.exe` (NSIS installer)
- `ParkStay-Portable-x.x.x.exe` (Portable)
- `latest.yml` (Update metadata)

**macOS:**
- `ParkStay-x.x.x-arm64.dmg` (Apple Silicon)
- `ParkStay-x.x.x-x64.dmg` (Intel)
- `ParkStay-x.x.x-arm64.zip` (Apple Silicon)
- `ParkStay-x.x.x-x64.zip` (Intel)
- `latest-mac.yml` (Update metadata)

**Linux:**
- `ParkStay-x.x.x-x86_64.AppImage`
- `parkstay-bookings_x.x.x_amd64.deb`
- `parkstay-bookings-x.x.x.x86_64.rpm`
- `latest-linux.yml` (Update metadata)

---

## Rollback Procedure

### When to Rollback

- Critical bug discovered post-release
- Security vulnerability introduced
- Data corruption issues
- Widespread crashes
- Auto-update failures

### Rollback Steps

#### 1. Assess Severity

Determine if immediate rollback is needed or if a hotfix is better.

#### 2. Prepare Previous Version

```bash
# Tag the problematic version
git tag -a v1.2.0-broken -m "Broken release"

# Revert to previous version
git checkout v1.1.0

# Create hotfix branch
git checkout -b hotfix/rollback-to-1.1.0
```

#### 3. Increment Version

```bash
# Update to v1.2.1 (higher than broken version)
npm version patch

# Update changelog
# CHANGELOG.md:
## [1.2.1] - 2025-11-01

### Fixed
- Rolled back to v1.1.0 due to critical bug in v1.2.0
- Issue: [Description of problem]
- Hotfix release while investigating issue
```

#### 4. Build and Release

```bash
# Create tag
git tag -a v1.2.1 -m "Rollback release"
git push origin v1.2.1

# Build and publish as normal
# Mark v1.2.0 as pre-release in GitHub
```

#### 5. Notify Users

- Post announcement about rollback
- Explain issue clearly
- Provide workaround if applicable
- Timeline for proper fix

#### 6. Fix and Re-release

```bash
# Fix the issue
git checkout -b fix/critical-bug

# Make fixes
# Test thoroughly
# Create new release v1.3.0
```

---

## Post-Release Tasks

### Immediate Tasks (Day 1)

- [ ] Monitor error tracking for new issues
- [ ] Check download metrics
- [ ] Verify auto-update working
- [ ] Respond to user feedback
- [ ] Update documentation site

### Short-term Tasks (Week 1)

- [ ] Review crash reports
- [ ] Address critical bugs
- [ ] Update FAQ with new questions
- [ ] Collect user feedback
- [ ] Plan hotfix if needed

### Medium-term Tasks (Month 1)

- [ ] Analyze usage metrics
- [ ] Review feature adoption
- [ ] Plan next release
- [ ] Archive old releases
- [ ] Update roadmap

### Metrics to Monitor

**Technical:**
- Crash rate
- Error rate by type
- Performance metrics
- Auto-update success rate

**User:**
- Download count
- Active users
- Feature usage
- Support requests

**Quality:**
- Bug reports
- User satisfaction
- Performance complaints
- Feature requests

---

## Emergency Hotfix Process

For critical issues requiring immediate fix:

### Fast-Track Process

1. **Identify Issue**
   - Critical bug discovered
   - Security vulnerability
   - Data loss risk

2. **Create Hotfix Branch**
   ```bash
   git checkout -b hotfix/critical-fix
   ```

3. **Fix and Test**
   - Implement minimal fix
   - Add regression test
   - Test on all platforms

4. **Version Bump**
   ```bash
   npm run version:patch
   ```

5. **Fast-Track Release**
   - Skip normal review if trusted team
   - Build immediately
   - Publish as soon as tested

6. **Monitor Closely**
   - Watch for issues
   - Ready to rollback
   - Communicate with users

---

## Release Schedule

### Recommended Cadence

**Major Releases**: 1-2 per year
- January: Spring release
- July: Fall release

**Minor Releases**: Monthly or as needed
- New features ready
- Significant improvements

**Patch Releases**: As needed
- Bug fixes
- Security updates
- Can be released anytime

**Pre-releases**: Continuous
- Alpha: Weekly builds for testing
- Beta: 2 weeks before release
- RC: 1 week before release

### Release Planning

**6 Weeks Before:**
- Feature freeze for major/minor
- Focus on bug fixes
- Begin documentation updates

**4 Weeks Before:**
- Beta release
- User testing
- Performance testing

**2 Weeks Before:**
- Release candidate
- Final testing
- Prepare release notes

**Release Day:**
- Final build
- Publish release
- Monitor closely

---

## Tools and Resources

### Required Tools

- **Git**: Version control
- **GitHub CLI**: Release management
- **Node.js**: Building
- **Electron Builder**: Packaging
- **Code signing certificates**: All platforms

### Helpful Resources

- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Electron Builder](https://www.electron.build/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)

---

## Troubleshooting Releases

### Common Issues

**Build fails on CI/CD:**
- Check node version
- Verify dependencies
- Check code signing certificates
- Review build logs

**Auto-update not working:**
- Verify update server configuration
- Check latest.yml metadata
- Ensure code signing valid
- Test update URL

**Installation fails:**
- Check code signing
- Verify installer integrity
- Test on clean system
- Review installer logs

---

## Conclusion

Following this release process ensures:
- Consistent, high-quality releases
- Proper versioning and documentation
- Smooth distribution to users
- Quick response to issues

For questions about the release process, contact the maintainers or open a discussion.

---

**Related Documentation:**
- [Development Guide](./development.md)
- [Code Signing Guide](./code-signing.md)
- [Installation Guide](./installation.md)
