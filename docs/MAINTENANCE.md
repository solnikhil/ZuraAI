# Maintenance Notes

This document tracks longer-running maintenance tasks for ZuraAI that aren't urgent enough to block a release but shouldn't be lost between contributors.

## Rust-Bun upgrade

**Status:** deferred. ZuraAI is pinned to Bun **1.3.14** (the last Zig-based release).

### Background

In May 2026 the Bun team merged an AI-generated Rust rewrite (~1M LOC) to `main`. Bun 1.3.14 was explicitly tagged as the last Zig version, and the next minor release will ship the Rust implementation. The lockfile format (`bun.lock`, text-based) does not change across the rewrite.

We pin until:

1. Several patch releases have landed on the Rust line and there are no obviously broken features in our usage path.
2. Major projects in our build stack (`vite`, `vitest`, `electron-builder`, `tsc`) have confirmed compatibility on a Rust-Bun release.
3. We have a reasonable validation window to run the checklist below.

### Validation checklist (run before bumping the pin)

When a new Bun release is selected for evaluation, on a clean branch:

- [ ] Update `.github/actions/setup-bun/action.yml` `bun-version` default to the candidate version.
- [ ] Update `package.json` `engines.bun` upper/lower bound to allow the candidate.
- [ ] Locally on macOS:
  - [ ] `bun install --frozen-lockfile`
  - [ ] `bun run typecheck`
  - [ ] `bun run test`
  - [ ] `bun scripts/generate-icons.mjs`
  - [ ] `bun scripts/verify-mcp-release.mjs`
  - [ ] `bun scripts/memory-scenario.mjs`
  - [ ] `bun scripts/generate-changelog.mjs --to-ref HEAD` (smoke run)
  - [ ] `bun run build:renderer`
  - [ ] `bun run build:dir` (full electron-builder unpacked build)
- [ ] Locally on Windows (or via CI):
  - [ ] `bun run build` produces a valid `.exe` installer
- [ ] CI:
  - [ ] `validate`, `build-windows`, and `build-macos` jobs are green
  - [ ] `bun --version` step in CI logs reports the candidate version
- [ ] Cut a canary release (e.g. `v0.0.X-canary`) and confirm in-app auto-update detects it from a previous version.

If any step fails, capture the failure, revert the pin, and add a tracking note here with the offending Bun version.

### Files touched during a Bun upgrade

- `.github/actions/setup-bun/action.yml`
- `package.json` (`engines.bun`)
- `CONTRIBUTING.md` (version policy section)
- This file (record of the bump)

## macOS signing and notarization

**Status:** deferred. ZuraAI's macOS builds are currently **unsigned and un-notarized**.

### What works today

- The release workflow (`build-macos` job) produces `.dmg` and `.zip` artifacts plus `latest-mac.yml` and uploads them to the GitHub Release.
- macOS users can download the `.dmg` from GitHub Releases and install it manually. They will need to right-click → Open the first time and accept the Gatekeeper prompt.

### What does not work

- In-app auto-update on macOS will fail. `electron-updater` requires the downloaded update to be signed by an Apple Developer ID and notarized by Apple. Unsigned/un-notarized updates are rejected at the Gatekeeper assessment step.
- The `Check for Updates` menu item in the title bar info menu may detect that a new version is available and download it, but `quitAndInstall` will surface an error rather than apply the update. Users currently need to download the new `.dmg` manually until signing is wired.

### Unblock checklist (when an Apple Developer ID is available)

- [ ] Acquire an active Apple Developer Program membership (USD 99/year).
- [ ] Generate a "Developer ID Application" certificate from the Apple Developer portal and export as `.p12`.
- [ ] Generate an app-specific password (or App Store Connect API key) for `notarytool`.
- [ ] Add the following secrets to the GitHub repository:
  - `CSC_LINK` — base64-encoded `.p12` certificate
  - `CSC_KEY_PASSWORD` — `.p12` password
  - `APPLE_ID` — Apple ID email used for notarization
  - `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password generated above
  - `APPLE_TEAM_ID` — Apple Developer team identifier
- [ ] Add a `mac` block to `package.json` `build` with:
  - `hardenedRuntime: true`
  - `gatekeeperAssess: false`
  - `entitlements` and `entitlementsInherit` pointing at a `build/entitlements.mac.plist`
  - `notarize` config (electron-builder will pick up `APPLE_*` env vars automatically when this is set)
- [ ] Create `build/entitlements.mac.plist` with the minimum entitlements needed by Electron + our dependencies (typically `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`, `com.apple.security.cs.disable-library-validation`).
- [ ] Update `.github/workflows/release.yml` `build-macos` job to expose the secrets to the build step.
- [ ] Locally verify a signed build with:
  - `spctl --assess --verbose=4 --type execute /Applications/ZuraAI.app`
  - `xcrun notarytool history --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"`
- [ ] Cut a canary release and confirm in-app auto-update successfully applies a signed update on a fresh install.

### Files touched when signing is wired

- `package.json` (`build.mac` config)
- `build/entitlements.mac.plist` (new)
- `.github/workflows/release.yml` (`build-macos` env)
- This file (record of the change and remove the deferred status)

## CI / GitHub Actions inventory

For the full per-workflow trigger / path-filter / failure-recovery breakdown, see [`docs/CI.md`](CI.md). A quick reference:

| Workflow                | Purpose                                  | Trigger                                                               | Required check?                                          |
| ----------------------- | ---------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `ci.yml`                | Ubuntu typecheck + test + renderer build | PR + push to main                                                     | yes                                                      |
| `lint.yml`              | ESLint + Prettier check                  | PR + push to main                                                     | informational (continue-on-error until cleanup PR lands) |
| `knip.yml`              | Unused dep / export detection            | PR + push to main                                                     | informational (same reason)                              |
| `pr-title.yml`          | Conventional-commits PR title            | PR opened/edited                                                      | yes                                                      |
| `dependency-review.yml` | Vuln / license check on dep changes      | PR touching `package.json` or lockfiles                               | yes when triggered                                       |
| `ci-cross-platform.yml` | Mac + Windows + Linux test matrix        | PR touching code/configs                                              | informational                                            |
| `ci-package-smoke.yml`  | `electron-builder --dir` on Win + Mac    | PR touching electron/installer/icons                                  | informational                                            |
| `actions-pinned.yml`    | Enforce SHA-pinned third-party actions   | PR touching `.github/workflows` or `.github/actions`                  | yes when triggered                                       |
| `labeler.yml`           | Auto-apply area / dependencies labels    | every PR                                                              | n/a (labels only)                                        |
| `stale.yml`             | Stale-issue / stale-PR bot               | daily cron 01:00 UTC                                                  | n/a                                                      |
| `scorecard.yml`         | OpenSSF Scorecard analysis               | weekly Monday + push to main                                          | n/a (Security tab + public badge)                        |
| `codeql.yml`            | CodeQL static analysis                   | PR + push to main + weekly                                            | yes                                                      |
| `secret-scan.yml`       | Gitleaks secret scan                     | PR + push to main + weekly                                            | yes                                                      |
| `license-audit.yml`     | License audit on dep changes             | PR touching `package.json` (note: triggers on stale `bun.lockb` path) | yes when triggered                                       |
| `release.yml`           | Win + Mac build + GitHub Release         | tag `v*`                                                              | n/a (release flow)                                       |

Configuration files referenced by these workflows:

- `.github/dependabot.yml` — weekly grouped npm + github-actions updates, no auto-merge
- `.github/labeler.yml` — path-to-label rules used by `labeler.yml`
- `.github/actions/setup-bun/action.yml` — shared composite that installs Bun and runs `bun install --frozen-lockfile`
- `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `knip.json` — tool configs surfaced by `lint.yml` and `knip.yml`

### Branch protection

Apply these manually under Settings → Branches → `main` (GitHub Actions can't configure branch protection itself):

Required status checks:

- `CI / test`
- `CodeQL / Analyze`
- `Validate PR Title / validate`
- `Secret Scan / gitleaks`

Required when triggered (path-filtered):

- `Dependency Review / review`
- `Pinned Actions / ensure-pinned`

Other recommended settings:

- Require a pull request before merging
- Dismiss stale approvals on new commits
- Require linear history
- Disallow force pushes and branch deletions

Flip `Lint / lint`, `Knip / knip`, the cross-platform matrix, and the package-smoke jobs from informational to required after a dedicated cleanup PR resolves the existing lint / format / unused-dep debt (see `docs/CI.md` "How to fix common failures").

### Pre-existing CI debt at the time these workflows landed

- **ESLint:** ~136 errors, ~94 warnings on `src/` + `electron/`.
- **Prettier:** ~294 unformatted files.
- **`license-audit.yml`** triggers on `bun.lockb` but the actual lockfile is `bun.lock`. The other new workflows use `bun.lock` correctly; the audit workflow needs a one-line fix in a follow-up PR.

These are tracked here so the next person to touch CI knows what's outstanding without spelunking through workflow logs.
