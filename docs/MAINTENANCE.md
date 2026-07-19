# Maintenance notes

Longer-lived work that should not get lost between contributors, but does not need to block every release.

## Bun upgrades

**Status:** pinned to a known-good Bun version (see `package.json` `engines.bun` and `.github/actions/setup-bun`).

We do not casually jump major Bun lines until:

1. The new line has a few stable patches
2. Our stack (Vite, Vitest, electron-builder, TypeScript) behaves
3. We have time to run the checklist below

### Checklist before bumping Bun

On a clean branch:

- [ ] Update the setup-bun default version
- [ ] Update `package.json` engines range
- [ ] `bun install --frozen-lockfile`
- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] Icon / MCP release / memory scenario scripts if you use them
- [ ] `bun run build:renderer`
- [ ] Unpacked and/or full installer builds on Windows and macOS
- [ ] CI green with the new version in the logs

If anything fails, revert the pin and note the bad version here.

Files usually touched: setup-bun action, `package.json`, this doc, maybe `CONTRIBUTING.md`.

## macOS signing and notarization

**Status:** deferred. macOS builds can still be produced, but without full Developer ID signing/notarization:

- Users can install manually (may need right-click → Open the first time)
- In-app auto-update on macOS will not apply updates the way signed apps do

### When you have an Apple Developer ID

- [ ] Developer ID Application certificate (`.p12`)
- [ ] Notarization credentials (Apple ID + app-specific password or API key)
- [ ] GitHub secrets: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- [ ] Confirm `package.json` mac build block has hardened runtime / entitlements / notarize settings
- [ ] Ship a canary and confirm update flow on a clean Mac

Never commit certificates or passwords. Env secrets only.

## Windows code signing

Prefer signed installers for public downloads. Until signing is fully wired, be honest in release notes about SmartScreen friction.

## Dependency hygiene

- Prefer Dependabot PRs reviewed by a human
- Run license audit when adding production deps
- Keep third-party GitHub Actions SHA-pinned

## Docs drift

When architecture changes, update `AGENTS.md` in the same PR. When contributor process changes, update `CONTRIBUTING.md` and `docs/CI.md`.
