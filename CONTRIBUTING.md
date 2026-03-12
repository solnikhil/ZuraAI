# Contributing to Zura AI

Thanks for contributing to Zura AI.

Zura AI is a Windows-first desktop AI assistant built with Electron, React, Vite, and TypeScript. Contributions should stay aligned with the app's security model, desktop architecture, and existing UI patterns.

## Before you start

- Read `AGENTS.md` before making architecture, IPC, provider, tool, or storage changes.
- Read `SUPPORT.md` if you are debugging a user-reported issue or want to understand the issue flow.
- Search existing issues and pull requests before starting new work.
- Keep changes scoped. Small focused PRs are easier to review and safer to merge.

## Local setup

Requirements:

- Node.js `>= 18`
- npm

Clone and install:

```bash
git clone https://github.com/solnikhil/ZuraAI.git
cd ZuraAI
npm install
```

Useful commands:

```bash
npm run dev
npm run typecheck
npm test
npm run build
```

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
npm run typecheck
npm test
```

Also run this when your change affects packaging, Electron build behavior, release flow, or app startup integration:

```bash
npm run build
```

If you changed UI behavior, include a short note in the PR about how you verified it manually.

## Pull requests

- Use a clear title.
- Explain what changed and why.
- Link the related issue when there is one.
- Include screenshots or recordings for UI changes.
- Call out security-sensitive or architecture-sensitive changes explicitly.
- Follow the checklist in `.github/pull_request_template.md`.

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
