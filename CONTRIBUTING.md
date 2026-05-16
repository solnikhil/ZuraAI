# Contributing to ZuraAI

Thanks for contributing to ZuraAI.

ZuraAI is a Windows-first desktop AI assistant built with Electron, React, Vite, and TypeScript. Contributions should stay aligned with the app's security model, desktop architecture, and existing UI patterns.

## Before you start

- Read `AGENTS.md` before making architecture, IPC, provider, tool, or storage changes.
- Read `SUPPORT.md` if you are debugging a user-reported issue or want to understand the issue flow.
- Search existing issues and pull requests before starting new work.
- Keep changes scoped. Small focused PRs are easier to review and safer to merge.

## Local setup

Requirements:

- Node.js `>= 18`
- Bun `>= 1.3.14 < 1.4.0` (see [Bun version policy](#bun-version-policy))

Clone and install:

```bash
git clone https://github.com/solnikhil/ZuraAI.git
cd ZuraAI
bun install
```

Useful commands:

```bash
bun run dev
bun run typecheck
bun run test
bun run build
```

### Bun version policy

ZuraAI pins Bun to **1.3.14** (the last Zig-based release). CI uses the same version via `.github/actions/setup-bun`, and `package.json` `engines.bun` enforces `>=1.3.14 <1.4.0` for local installs.

Why pinned:

- Bun 1.3.14 (released 2026-05-13) is the last Zig version. The next minor will ship the AI-generated Rust rewrite (~1M LOC merged in a single commit). ZuraAI's release pipeline produces installers shipped to users, so we don't want a million-line implementation swap landing in our build chain without explicit validation.
- The text-based `bun.lock` format is stable across the rewrite, so day-to-day workflow won't break — but the install runtime, script runner, and Node-compat surface are all newly-implemented Rust code.

To upgrade locally, install the pinned version with:

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
```

Or via `bun upgrade --to 1.3.14` if you already have a newer build installed.

The upgrade plan to the Rust-Bun release lives in [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md) under "Rust-Bun upgrade". macOS distribution caveats (signing, notarization) are tracked in the same document under "macOS signing and notarization".

## Ways to contribute

- Fix bugs or regressions in the desktop app
- Improve provider integrations, streaming, or tool-calling behavior
- Improve UI, settings flows, and desktop polish
- Add or improve tests
- Improve docs, contributor workflow, and release tooling

## Issue workflow

- Use the single GitHub issue form and choose the right `Issue type`.
- For bugs, include clear repro steps, expected behavior, actual behavior, and sanitized logs.
- For provider issues, include the provider, model, and any relevant non-secret settings.
- For feature requests, explain the user problem and the workflow you want to improve.
- Do not post secrets, tokens, private prompts, or personal data in public issues.

For vulnerabilities, use the private GitHub Security Advisory reporting link instead of opening a public issue.

## Development expectations

- Use TypeScript and follow existing project structure and naming patterns.
- Treat the renderer as untrusted.
- Keep privileged behavior in the Electron main process.
- Do not broaden IPC casually; use narrow allowlists and validate inputs in main-process handlers.
- Do not commit secrets, API keys, tokens, or `.env` files.
- Do not commit generated output such as `dist/` or `dist-electron/`.
- Use shadcn-style project components and existing UI patterns instead of introducing a new component library.

## Architecture-sensitive changes

If your change touches architecture-level behavior, update the `Architecture` section in `AGENTS.md` in the same PR.

This includes changes to:

- IPC channels or preload-exposed APIs
- Storage locations or persistence behavior
- Tool execution policy or available tools
- AI providers or provider capability rules
- Windows, routing boundaries, or major data flow

If you add or change an exposed Electron capability, make sure the related pieces stay in sync:

- `electron/preload.ts`
- `src/electron.d.ts`
- relevant main-process handlers under `electron/`

## Code and docs style

- Prefer clear code over clever code.
- Add comments for intent, invariants, security boundaries, and non-obvious tradeoffs.
- Skip comments that only restate the code.
- Keep docs and templates up to date when process or contributor expectations change.

## Testing expectations

Before opening a PR, run:

```bash
bun run typecheck
bun run test
```

Also run this when your change affects packaging, Electron build behavior, release flow, or app startup integration:

```bash
bun run build
```

If you changed UI behavior, include a short note in the PR about how you verified it manually.

## Pull requests

- Use a clear title.
- Explain what changed and why.
- Link the related issue when there is one.
- Include screenshots or recordings for UI changes.
- Call out security-sensitive or architecture-sensitive changes explicitly.
- Follow the checklist in `.github/pull_request_template.md`.

## What CI runs on your PR

When you open a PR, GitHub Actions will run a series of checks. The full list (with triggers, path filters, and how to fix common failures) lives in [`docs/CI.md`](docs/CI.md). High-level summary:

- **`CI / test`** — typecheck + unit tests + renderer build on Ubuntu (always runs)
- **`Validate PR Title`** — your PR title must start with a Conventional Commits type (`feat:`, `fix:`, etc.)
- **`Lint`** + **`Knip`** — informational ESLint/Prettier/unused-dep checks (will become required after a dedicated cleanup PR)
- **`CI Cross-Platform`** — Mac + Windows + Linux test matrix (only runs on PRs touching code/configs)
- **`Package Smoke`** — `electron-builder --dir` smoke build on Mac + Windows (only on packaging-relevant changes)
- **`Dependency Review`** — vulnerability + license check (only on PRs touching `package.json` or lockfiles)
- **`Pinned Actions`** — enforces SHA-pinned third-party actions (only on PRs touching `.github/`)
- **`CodeQL`**, **`Secret Scan`** — static analysis + gitleaks on every PR

PRs that only touch markdown / docs / images skip the heavy jobs (matrix + package smoke + lint + knip) automatically via path filters, so docs PRs run in well under a minute.

## Commit messages

This repo uses Conventional Commits.

Format:

```text
type(scope): description
```

Common types:

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`
- `ci`
- `build`
- `perf`

Examples:

```bash
git commit -m "feat(provider): add new provider integration"
git commit -m "fix(ipc): validate tool execution payloads"
git commit -m "docs: update issue and support workflow"
```

## Optional DCO sign-off

A DCO sign-off is optional but welcome.

```bash
git commit -s -m "fix(settings): preserve provider enablement state"
```

## Community guidelines

Please follow `CODE_OF_CONDUCT.md` in all project interactions.
