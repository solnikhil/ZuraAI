# Support

This page explains where to ask for help and what to include so we can actually fix things.

## Before you open an issue

1. Search existing issues so we do not get duplicates.
2. Check whether the problem is ZuraAI itself, or an upstream outage (provider API down, bad key, Ollama not running).
3. Strip API keys, tokens, private prompts, and personal details from anything you paste.

## How to open an issue

Use the GitHub issue form and choose the closest type:

- **Bug or regression** — something broke in the app UI, desktop shell, storage, packaging, or general chat flow
- **Provider or model issue** — model list, streaming, tools, titles, or auth for a specific provider
- **Feature request** — a workflow or capability you want
- **Documentation or developer tooling** — docs gaps, tests, CI, contributor friction

## Quick checks

From a clone of the repo:

```bash
bun install
bun run typecheck
bun run test
```

If packaging is involved:

```bash
bun run build
```

Also worth checking:

- Node.js is 18 or newer
- Ollama is running if you use local models
- The provider key and endpoint in Settings still look right
- Whether the problem is one model/provider or all of them
- Whether it happens in `bun run dev` and in the packaged app

## What a good report includes

- ZuraAI version, release tag, or commit
- Operating system
- Provider and model (if relevant)
- Short, reliable steps to reproduce
- What you expected vs what happened
- Sanitized logs, screenshots, or a short recording when useful

## Security issues

Do **not** file public issues for vulnerabilities or leaked secrets.

Report privately here:

https://github.com/solnikhil/ZuraAI/security/advisories/new

## Want to fix it yourself?

Read:

- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`AGENTS.md`](AGENTS.md)
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

Before a PR:

```bash
bun run typecheck
bun run test
```

If the change touches packaging or Electron startup:

```bash
bun run build
```
