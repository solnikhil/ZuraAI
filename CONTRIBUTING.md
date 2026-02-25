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

## Development expectations

- Use TypeScript and existing project patterns
- Keep renderer untrusted; validate privileged inputs in main-process handlers
- Avoid broadening IPC without explicit allowlisting and typing updates
- Do not commit secrets, keys, or `.env`
- Do not commit generated output (`dist/`, `dist-electron/`)

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

## Architecture updates

If you change architecture-level behavior (IPC channels, storage locations, tools, providers, windows, or data flow), update the `Architecture` section in `AGENTS.md` in the same PR.
