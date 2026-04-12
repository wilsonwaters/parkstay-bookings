# Release

Cut a new release of the application. The full release process is documented in `docs/release-process.md` — read that file first, it is the single source of truth.

## Instructions

### Step 1: Preflight

Gather context and verify the working tree is ready:

- Confirm you are on the `main` branch. If not, stop and tell the user.
- Run `git fetch origin` then compare `git rev-parse HEAD` vs `git rev-parse origin/main`. If local main is behind, stop and tell the user to pull first.
- Check `git status` for uncommitted changes. If dirty, stop and tell the user.
- Read `package.json` for the current version.
- Get the latest tag with `git tag --sort=-v:refname | head -1`.
- Show commits since last tag with `git log <latest-tag>..HEAD --oneline --no-merges`.

### Step 2: Choose release type

Ask the user what type of release this is (patch, minor, or major) using AskUserQuestion, showing them the current version and commit summary.

### Step 3: Pre-release checks

Run the checks from `docs/release-process.md` (lint, format:check, type-check, test). If any fail, fix and re-run before proceeding.

### Step 4: Update CHANGELOG.md

Add a new entry derived from the git log since the last tag. Follow the Keep a Changelog format already in the file. Categorise using conventional commit prefixes (`feat` -> Added, `fix` -> Fixed, `docs`/`chore`/etc -> Changed or omit if trivial). Write human-readable descriptions. Only include sections that have entries.

### Step 5: Bump version and release

1. `npm version <patch|minor|major> --no-git-tag-version` (updates package.json only)
2. `git add package.json package-lock.json CHANGELOG.md`
3. `git commit -m "chore: prepare release vX.Y.Z"`
4. `git tag vX.Y.Z`
5. `git push origin main --tags`

Do NOT use `npm run version:patch/minor/major` — those auto-push tags before the changelog is committed.

### Step 6: Confirm

Tell the user the new version, that GitHub Actions will build a draft release, and link to https://github.com/wilsonwaters/parkstay-bookings/releases to publish once CI completes.

## Rules

- Do NOT add Co-Authored-By trailers to the commit message.
- Do NOT add AI attribution to any files.
- Do NOT proceed past failed checks — fix issues first.
- Do NOT proceed if the branch is dirty, not on main, or behind origin/main.
