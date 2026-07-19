# Contributing to ZuraAI

Thanks for helping improve ZuraAI.

ZuraAI is a desktop AI assistant built with Electron, React, Vite, and TypeScript. The security model, process boundaries, and existing UI patterns matter a lot here — please keep changes aligned with them.

## Before you start

- Read [`AGENTS.md`](AGENTS.md) before changing architecture, IPC, providers, tools, or storage.
- Use [`SUPPORT.md`](SUPPORT.md) if you are chasing a user-facing bug.
- Search existing issues and pull requests first.
- Prefer small, focused PRs. They review faster and break less.

## Local setup

You need:

- Node.js 18 or newer
- Bun in the range listed in `package.json` (`engines.bun`)

Then:

```bash
git clone https://github.com/solnikhil/ZuraAI.git
cd ZuraAI
bun install
```

Common commands:

```bash
bun run dev
bun run typecheck
bun run test
bun run build
```

### Bun version note

CI and packaging pin a known-good Bun version (see `.github/actions/setup-bun` and `package.json`). If you upgrade Bun, re-run typecheck, tests, and a package build before relying on it.

Longer notes live in [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md).

## Good ways to help

- Fix bugs and regressions
- Improve providers, streaming, or tool calling
- Polish UI and settings flows
- Add tests
- Improve docs, CI, or release tooling

## Issues

- Use the GitHub issue form and pick the right type.
- For bugs: steps to reproduce, expected vs actual, OS, and sanitized logs.
- For provider problems: provider name, model, and non-secret settings.
- For features: describe the user problem, not only a solution.
- Never post API keys, tokens, private prompts, or personal data.

Security problems go through a private advisory, not a public issue:

https://github.com/solnikhil/ZuraAI/security/advisories/new

## Development rules of thumb

- Stick to TypeScript and existing project structure.
- Treat the renderer as untrusted.
- Keep privileged work in the Electron main process.
- Do not widen IPC casually. Validate inputs on the main side.
- Do not commit secrets or `.env` files.
- Do not commit build output (`dist/`, `dist-electron/`, `release/`).
- Reuse the shared UI components and menu styles instead of inventing a second design system.

## Architecture-sensitive changes

If you change how the app is put together, update the Architecture section in `AGENTS.md` in the same PR. That includes:

- IPC channels or preload bridges
- Where data is stored
- Tools and approval policy
- AI providers
- Windows, routes, or major data flow

When you expose a new Electron capability, keep these in sync:

- `electron/preload.ts`
- `src/electron.d.ts`
- the matching handlers under `electron/`

## Style

- Prefer clear code over clever code.
- Comment intent, security boundaries, and non-obvious tradeoffs — not the obvious.
- Update docs when process or contributor expectations change.

## Testing before a PR

Always:

```bash
bun run typecheck
bun run test
```

Also run this if packaging, Electron startup, or release flow is involved:

```bash
bun run build
```

For UI work, leave a short note in the PR about how you checked it by hand.

## Pull requests

- Clear title (Conventional Commits style)
- Explain what changed and why
- Link the issue when there is one
- Screenshots or short clips for UI changes
- Call out security or architecture impact
- Follow the checklist in `.github/pull_request_template.md`

## What CI runs

Full detail is in [`docs/CI.md`](docs/CI.md). In short:

- Typecheck, unit tests, and renderer build
- PR title check (Conventional Commits)
- CodeQL and secret scanning
- Extra jobs for cross-platform tests, package smoke, dependency review, and lint when paths match

Docs-only PRs skip the heavy packaging jobs.

## Commit messages

Use Conventional Commits:

```text
type(scope): short description
```

Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `build`, `perf`.

Examples:

```bash
git commit -m "feat(provider): add model list refresh for Groq"
git commit -m "fix(ipc): reject invalid tool payloads"
git commit -m "docs: rewrite support guide in plain language"
```

Optional DCO sign-off:

```bash
git commit -s -m "fix(settings): keep provider enablement when keys change"
```

## Community

Please follow [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) in all project spaces.
