# Release Process

Windows-only for v1.0.0. macOS and Linux builds are not yet available.

## Quick Reference

```bash
# 1. Verify everything passes
npm run lint && npm run type-check && npm run test

# 2. Bump version (choose one)
npm run version:patch   # 1.0.0 → 1.0.1
npm run version:minor   # 1.0.0 → 1.1.0
npm run version:major   # 1.0.0 → 2.0.0

# 3. Update CHANGELOG.md, then commit
git add -A
git commit -m "chore: prepare release v1.x.x"

# 4. Tag and push
git tag v1.x.x
git push origin main --tags
```

Pushing the tag triggers the full CI/CD pipeline which builds and creates a draft GitHub release.

## Step-by-Step

### 1. Pre-Release Checks

Ensure the following all pass locally before releasing:

```bash
npm run lint
npm run type-check
npm run test
npm run build
```

Optionally test the Windows installer locally:

```bash
npm run dist:win
```

This creates the installer and portable `.exe` in the `release/` directory without publishing.

### 2. Bump Version

Use the version scripts which update `package.json` and push the tag:

| Command | Example |
| --- | --- |
| `npm run version:patch` | 1.0.0 -> 1.0.1 (bug fixes) |
| `npm run version:minor` | 1.0.0 -> 1.1.0 (new features) |
| `npm run version:major` | 1.0.0 -> 2.0.0 (breaking changes) |

For pre-releases:

```bash
npm version prerelease --preid=beta   # 1.1.0-beta.0
```

### 3. Update CHANGELOG.md

Add an entry for the new version following [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [1.1.0] - 2026-03-01

### Added
- Description of new features

### Fixed
- Description of bug fixes
```

### 4. Commit and Tag

```bash
git add -A
git commit -m "chore: prepare release v1.1.0"
git tag v1.1.0
git push origin main --tags
```

### 5. GitHub Actions Pipeline

Pushing a `v*` tag triggers the [build workflow](./../.github/workflows/build.yml) which runs three jobs in sequence:

```text
ci (lint, type-check, test)
  -> build-windows (build installer + portable)
    -> release (create draft GitHub release)
```

**CI job** — Runs on both Ubuntu and Windows:

- `npm run type-check`
- `npm run lint`
- `npm run test:coverage`

**Build Windows job** — Runs on Windows after CI passes:

- Builds the app with `npm run build`
- Packages with `npm run release:win` (runs `electron-builder --win --publish always`)
- Uploads artifacts: `.exe` installer, portable `.exe`, `latest.yml`
- Code signing is applied automatically if `CSC_LINK` and `CSC_KEY_PASSWORD` secrets are configured

**Release job** — Runs on Ubuntu after build passes:

- Downloads the Windows build artifacts
- Creates a **draft** GitHub release using `softprops/action-gh-release@v2`
- Attaches all artifacts to the release
- Pre-release tags (containing `alpha` or `beta`) are marked as pre-release

### 6. Publish the Release

1. Go to the [GitHub Releases page](https://github.com/wilsonwaters/parkstay-bookings/releases)
2. Find the draft release created by CI
3. Review the auto-generated release notes
4. Edit the description if needed
5. Click **Publish release**

Once published, the `latest.yml` file in the release enables auto-updates — existing users will be notified of the new version on next app launch.

### 7. Post-Release Verification

- Download the installer from the release and test on a clean Windows machine
- Verify auto-update works from a previous version (the app checks on startup after a 15-second delay)
- Windows SmartScreen may show a warning for unsigned builds — users click "More info" then "Run anyway"

## Release Artifacts

Each release produces:

| File | Description |
| --- | --- |
| `WA-ParkStay-Bookings-Setup-x.x.x.exe` | NSIS installer (recommended) |
| `WA-ParkStay-Bookings-x.x.x.exe` | Portable executable |
| `latest.yml` | Auto-update metadata |

## Auto-Updates

The app uses `electron-updater` with GitHub Releases as the update provider.

Behaviour:

- Checks for updates 15 seconds after app launch
- Downloads are **not** automatic — user is prompted via the `UpdateNotification` toast
- User clicks "Download" then "Restart Now" when ready
- Updates install on next app restart if `autoInstallOnAppQuit` applies

Configuration is in [electron-builder.json](../electron-builder.json) under the `publish` key.

## Code Signing (Optional)

To enable Windows code signing, add these repository secrets:

| Secret | Description |
| --- | --- |
| `CSC_LINK` | Base64-encoded `.pfx` certificate |
| `CSC_KEY_PASSWORD` | Certificate password |

Without code signing, Windows SmartScreen will warn users on first run.

## npm Scripts Reference

| Script | Description |
| --- | --- |
| `npm run build` | Production build (Vite) |
| `npm run build:win` | Build + package Windows installer (no publish) |
| `npm run dist:win` | Same as `build:win` with `--publish never` |
| `npm run release:win` | Build + package + publish to GitHub Releases |
| `npm run version:patch` | Bump patch version + push tag |
| `npm run version:minor` | Bump minor version + push tag |
| `npm run version:major` | Bump major version + push tag |

## Hotfix Process

For critical issues after a release:

1. Create a hotfix branch: `git checkout -b hotfix/description`
2. Fix the issue and add a regression test
3. Bump the patch version: `npm run version:patch`
4. Update CHANGELOG.md
5. Merge to main, tag, and push — the normal pipeline handles the rest

## Rollback

If a release has critical issues:

1. Mark the broken release as pre-release on GitHub (removes it from auto-update)
2. Create a new patch release with the fix, or revert to the previous version's code
3. The new release must have a **higher** version number to trigger auto-updates
