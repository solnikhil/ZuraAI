# Contributing to Zura AI

Thanks for taking the time to contribute.

## Before you start

- Read `AGENTS.md` for architecture and security boundaries
- Search existing issues and pull requests before opening a new one
- Keep changes focused and scoped

## Local setup

```bash
git clone https://github.com/solnikhil/ZuraAI.git
cd ZuraAI
npm install
```

Run locally:

```bash
npm run dev
```

For a detailed development guide covering prerequisites, the IPC security model, cross-platform notes, and more, see [`docs/development.md`](docs/development.md).

## Development expectations

- Use TypeScript and existing project patterns
- Keep renderer untrusted; validate privileged inputs in main-process handlers
- Avoid broadening IPC without explicit allowlisting and typing updates
- Do not commit secrets, keys, or `.env`
- Do not commit generated output (`dist/`, `dist-electron/`)

## Comments and docs

- Comment intent, invariants, security boundaries, and non-obvious tradeoffs
- Skip comments that only restate the code or label obvious JSX sections
- Prefer short docblocks on exported APIs and complex modules over line-by-line narration
- Move requirement traceability, ticket notes, and historical implementation context to PRs or docs instead of source comments

## Conventional commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. This enables automated changelog generation and makes the git history easier to read.

### Format

```
type(scope): description

[optional body]

[optional footer(s)]
```

### Commit types

| Type       | Description                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation-only changes                              |
| `chore`    | Maintenance tasks (deps, configs, tooling)              |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or updating tests                                |
| `perf`     | Performance improvements                                |
| `ci`       | CI/CD configuration changes                             |
| `build`    | Build system or external dependency changes             |

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

## Quality checks

Before opening a PR, run:

```bash
npm run typecheck
npm test
```

If your change affects packaging, also run:

```bash
npm run build
```

## Pull requests

- Use a clear title and describe the why behind the change
- Link related issues
- Include screenshots for UI updates
- Mention any security-sensitive changes explicitly

## DCO sign-off

A [Developer Certificate of Origin](https://developercertificate.org/) (DCO) sign-off is optional but recommended. It certifies that you wrote or have the right to submit the code you are contributing.

Add a sign-off line to your commits with the `-s` flag:

```bash
git commit -s -m "feat(provider): add new provider support"
```

This appends a `Signed-off-by` trailer to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

## Architecture updates

If you change architecture-level behavior (IPC channels, storage locations, tools, providers, windows, or data flow), update the `Architecture` section in `AGENTS.md` in the same PR.
