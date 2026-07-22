# ZuraAI v0.0.8

ZuraAI v0.0.8 makes the npm experience complete: running `npx zuraai` now installs the matching desktop release when needed and then opens the app.

## Highlights

- Downloads the fixed Windows or universal macOS asset from the matching stable GitHub release.
- Verifies the complete installer/archive with its published SHA-256 checksum before using it.
- Starts the normal visible Windows installer so installation remains user-controlled.
- Installs the verified macOS app under `~/Applications` without requiring the Electron binary to be bundled into npm.
- Detects real packaged installations while ignoring development Electron protocol registrations.
- Adds `zuraai install` for an explicit reinstall.
- Prevents accidental publication of the root Electron workspace to the unrelated `zura` npm package.

## Usage

```bash
npx zuraai
npx zuraai chat "hello from the terminal"
```
