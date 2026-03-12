# Support

Use this guide to decide where to ask for help and what to include when reporting a problem.

## Before opening an issue

- Search existing issues first to avoid duplicates.
- Make sure the problem is in Zura AI itself and not just an upstream provider outage or account limitation.
- Remove API keys, tokens, prompts with private data, and personal information from anything you share.

## How to open an issue

Use the single GitHub issue form and choose the matching `Issue type` in the form.

Common choices:

- `Bug or regression` for reproducible app issues in the UI, desktop shell, storage, packaging, or general chat flow.
- `Provider or model issue` for provider-specific failures such as model discovery, streaming, tool calling, title generation, or auth behavior.
- `Feature request` for product improvements, workflow changes, and missing capabilities.
- `Documentation issue` or `Developer experience or tooling issue` for docs gaps, test tooling, CI, or contributor workflow problems.

## Troubleshooting checklist

Before filing an issue, please try the basics:

```bash
npm install
npm run typecheck
npm test
```

If the issue affects packaging or the Electron app build, also try:

```bash
npm run build
```

Other helpful checks:

- Confirm your Node.js version is `>= 18`.
- If you use Ollama, make sure the Ollama server is running and reachable.
- Re-check the provider API key or endpoint in Settings.
- Note whether the problem happens with one provider/model or all of them.
- Note whether the problem only happens in `npm run dev` or also in the packaged app.

## What to include in a good report

- The Zura AI version, release tag, or commit SHA you tested.
- Your operating system.
- The exact provider and model involved, if relevant.
- Short, reliable steps to reproduce the issue.
- What you expected to happen and what happened instead.
- Sanitized logs, screenshots, or recordings when available.

## Security issues

Do not open a public issue for vulnerabilities or exposed secrets.

Report them privately through GitHub Security Advisories:

- https://github.com/solnikhil/ZuraAI/security/advisories/new

See `SECURITY.md` for the full policy.

## Contributing fixes

If you want to work on a fix, review:

- `CONTRIBUTING.md`
- `AGENTS.md`
- `CODE_OF_CONDUCT.md`

Before opening a PR, run:

```bash
npm run typecheck
npm test
```

If your change affects packaging, Electron startup, or release behavior, also run:

```bash
npm run build
```
