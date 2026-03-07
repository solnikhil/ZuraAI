# Development Guide

This guide walks you through setting up Zura AI for local development. It covers prerequisites, building, testing, the IPC security model, and commit conventions.

## Platform Support

| Platform | Status |
|----------|--------|
| Windows 10/11 | Primary — fully tested and supported |
| macOS | Community-supported |
| Linux | Community-supported |

Electron packaging targets Windows by default. macOS and Linux builds may work but are not tested in CI.

## Prerequisites

- **Node.js >= 18** (LTS recommended)
- **npm 9+** (ships with Node 18+)
- **Git**

Verify your setup:

```bash
node -v   # v18.x or higher
npm -v    # 9.x or higher
git --version
```

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/solnikhil/ZuraAI.git
cd ZuraAI

# 2. Install dependencies
npm install

# 3. Start the dev server (Electron + Vite HMR)
npm run dev
```

That's it. The app opens automatically. No `.env` file or API keys are needed to launch — keys are configured in-app under Settings.

### Ollama (optional)

If you want to use Ollama models, the Ollama server must be running locally:

```bash
# Default endpoint: http://localhost:11434
ollama serve
```

No API key is required for Ollama.

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Electron + Vite dev server with HMR |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm test` | Run Vitest test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Full production build (typecheck + Vite + electron-builder) |
| `npm run build:dir` | Package as unpacked directory (faster, useful for debugging) |
| `npm run build:renderer` | Typecheck + renderer build only |
| `npm run preview` | Preview the renderer bundle |

### Before opening a PR

```bash
npm run typecheck
npm test
```

If your change affects packaging:

```bash
npm run build
```

## Project Structure

```
electron/               # Electron main process
  main.ts               # App lifecycle, IPC registration, tray, windows
  preload.ts            # contextBridge API + IPC allowlists (security boundary)
  ipc/                  # ipcMain handlers (chat store, secure storage, system)
  windows/              # Window creation and management
  chatStore.ts          # Chat history persistence (JSON under userData)
  secureStorage.ts      # Encrypted key storage via safeStorage
  tools/                # Main-process tool implementations
  updater.ts            # Auto-updater (production only)

src/                    # React/Vite renderer
  main.tsx              # Renderer entrypoint
  App.tsx               # Routes (#/dashboard, #/settings, #/chat)
  contexts/             # App state (settings, chat history, app shell)
  components/           # UI components
  services/             # AI provider integrations (streaming HTTP)
  tools/                # Tool schema, adapters, execution coordinator
  hooks/                # Shared React hooks

docs/                   # Project documentation
scripts/                # CI/build scripts (license audit, changelog, etc.)
```

## IPC Security Model

The renderer is treated as **untrusted**. All privileged operations run in the Electron main process and are exposed through a narrow, allowlisted IPC surface defined in `electron/preload.ts`.

### How it works

1. `electron/preload.ts` defines three channel sets: `SEND_CHANNELS`, `INVOKE_CHANNELS`, and `ON_CHANNELS`
2. The `contextBridge` exposes a frozen `window.ipcRenderer` wrapper that blocks any channel not in the allowlist
3. If the renderer tries to use a non-allowlisted channel, the call throws immediately

### Adding a new IPC channel

When you need to add a new IPC channel, update these files in the same PR:

1. **`electron/preload.ts`** — Add the channel name to the appropriate allowlist (`SEND_CHANNELS`, `INVOKE_CHANNELS`, or `ON_CHANNELS`)
2. **`src/electron.d.ts`** — Add TypeScript types for the new channel if it's exposed on `window.*`
3. **`electron/ipc/*`** — Implement and register the handler in the main process
4. **Validate inputs** — Always validate and sanitize inputs in the main-process handler. Never trust data from the renderer.

### Current allowlisted channels

**Send (fire-and-forget):**
`set-native-blur`, `spawn-terminal-command`

**Invoke (request/response):**
- Chat store: `chat-store:get-all`, `chat-store:save-all`, `chat-store:migrate`, `chat-store:get-all-folders`, `chat-store:save-folders`
- Secure storage: `secure-storage:get`, `secure-storage:set`, `secure-storage:get-all`
- Performance: `get-process-metrics`, `memory:get-metrics`, `memory:force-cleanup`, `performance:*`
- Tools: `execute-tool` (restricted to `web_search` only)
- Window: `window-resize`
- Updater: `updater:check-for-updates`, `updater:quit-and-install`, `updater:get-version`

**On (event listeners):**
`update-available`, `update-downloaded`

### Security rules

- Keep `contextIsolation: true` and `nodeIntegration: false` on all windows
- Never expose raw Node APIs to the renderer
- Don't broaden the IPC surface without a clear security justification
- Never commit API keys, tokens, or `.env` files

## Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for changelog generation and clear git history.

### Format

```
type(scope): description

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
|------|------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Maintenance (deps, config, CI) |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `test` | Adding or updating tests |
| `perf` | Performance improvement |
| `ci` | CI/CD changes |
| `build` | Build system or external dependency changes |

### Examples

```bash
# Feature
git commit -m "feat(provider): add Codex provider integration"

# Bug fix
git commit -m "fix(ipc): prevent chat-store race condition on rapid saves"

# Documentation
git commit -m "docs: add cross-platform build instructions"

# Chore
git commit -m "chore(deps): bump electron to v33"

# Breaking change (note the ! after the type)
git commit -m "feat(settings)!: migrate settings schema to v2

BREAKING CHANGE: Settings from v1 require migration. Run the app once to auto-migrate."
```

### Scope (optional)

Use a short label for the area of the codebase: `ipc`, `provider`, `ui`, `settings`, `tools`, `deps`, etc.

## Architecture Updates

If your change affects architecture-level behavior — IPC channels, storage locations, tools, providers, windows, or data flow — update the `Architecture` section in `AGENTS.md` in the same PR.

## Git History Hygiene (Pre-Public-Release)

Before making the repository public, the full git history must be scanned for accidentally committed secrets. This section documents the process.

### Running Gitleaks Against Full History

[Gitleaks](https://github.com/gitleaks/gitleaks) scans every commit for secret patterns (API keys, tokens, private keys).

```bash
# Install gitleaks (pick one)
brew install gitleaks          # macOS
choco install gitleaks         # Windows (Chocolatey)
# or download from https://github.com/gitleaks/gitleaks/releases

# Scan the entire git history
gitleaks detect --source . --verbose

# Scan only staged changes (useful as a pre-commit check)
gitleaks protect --source . --verbose
```

A clean scan prints `no leaks found` and exits with code 0. Any findings are printed with the commit SHA, file path, and matched rule.

### Running the Built-In Secret Scanner

The project also includes a lightweight TypeScript scanner for quick checks:

```bash
# Scan specific files
npx tsx scripts/check-secrets.ts <file1> [file2] ...

# Pipe content via stdin
git log --all -p | npx tsx scripts/check-secrets.ts
```

Exit code 0 means clean; exit code 1 means secrets were detected.

### Rewriting History with git filter-repo

If Gitleaks or the built-in scanner finds secrets in historical commits, use [`git filter-repo`](https://github.com/newren/git-filter-repo) to remove them before the public push.

```bash
# Install git filter-repo
pip install git-filter-repo

# Remove a specific file from all history
git filter-repo --invert-paths --path path/to/leaked-file

# Replace a specific string across all history
git filter-repo --replace-text <(echo 'LEAKED_SECRET_VALUE==>REDACTED')
```

After rewriting:

1. Force-push the rewritten history to the remote.
2. All collaborators must re-clone or `git fetch --all && git reset --hard origin/main`.
3. The old commits still exist in reflog locally — run `git reflog expire --expire=now --all && git gc --prune=now` to purge them.

### Credential Rotation

Any secret found in git history — even in a commit that was later deleted — must be treated as compromised.

1. Immediately revoke/rotate the exposed credential in the provider's dashboard (OpenRouter, Perplexity, Groq, Alibaba, Tavily, GitHub, etc.)
2. Generate a new key and update it in the app's secure storage (Settings → API Keys)
3. Verify the old key no longer works
4. Document the rotation in the PR that rewrites history

### Checklist Before Going Public

- [ ] Run `gitleaks detect --source . --verbose` with zero findings
- [ ] Run `npx tsx scripts/check-secrets.ts` against any suspect files
- [ ] Confirm no `.env` files exist in history (`git log --all --diff-filter=A -- '*.env'`)
- [ ] Confirm no private infrastructure URLs or internal endpoints in history
- [ ] Rotate any credentials that were ever committed, even if later removed

## Related Documents

- [CONTRIBUTING.md](../CONTRIBUTING.md) — Contribution workflow and PR process
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) — Community standards
- [SECURITY.md](../SECURITY.md) — Vulnerability reporting
- [AGENTS.md](../AGENTS.md) — Full architecture reference
- [SUPPORT.md](../SUPPORT.md) — Getting help
