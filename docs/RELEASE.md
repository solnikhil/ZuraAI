# Releasing ZuraAI

How we package the desktop app and the small npm launcher.

## Desktop builds

Production packaging uses electron-builder:

```bash
bun run build
```

Native modules are expected as prebuilt/installable packages. The build is set up so you do not need Visual Studio Build Tools just to rebuild optional native deps (`npmRebuild: false`).

Outputs land in `release/`:

| File | What it is |
| ---- | ---------- |
| `ZuraAI-Setup-{version}.exe` | Windows installer (NSIS wizard) |
| `ZuraAI-Portable-{version}-x64.exe` | Portable Windows binary |
| `checksums.txt` | SHA-256 hashes of the release files |

Checksums are written after the build by `scripts/generate-release-checksums.mjs`. If you add files later, run:

```bash
bun run release:checksums
```

On a Mac host you can also build macOS packages with `bun run build:mac` (see `AGENTS.md` for signing/notarization notes).

## npm package (`zuraai`)

The package in `packages/zuraai` is a small launcher/helper, **not** the full Electron app.

- Package name: `zuraai` (the name `zura` is already taken on npm)
- Keep it tiny: launcher script + README/metadata only

Publish checklist (high level):

```bash
cd packages/zuraai
npm pack --dry-run --json
npm publish --access public
```

If you need a token for one command (PowerShell example):

```powershell
$env:NPM_TOKEN="paste_token_here"
npm publish --access public --//registry.npmjs.org/:_authToken=$env:NPM_TOKEN
Remove-Item Env:\NPM_TOKEN
```

Check what landed:

```bash
npm view zuraai name version homepage description bin --json
```

## Recommended release order

1. Bump the root app version and `packages/zuraai/package.json` together when they should match.
2. Run `bun run build` (and mac builds on a Mac if you ship macOS).
3. Upload installers, portable builds, update metadata, blockmaps, and `checksums.txt` to the GitHub release for that tag (for example `v0.0.6`).
4. Dry-run `npm pack` for the launcher package.
5. Publish the npm package only after GitHub release assets are available.

The launcher should open an installed desktop app through registered local protocols. It should not try to embed Electron binaries inside the npm package.
