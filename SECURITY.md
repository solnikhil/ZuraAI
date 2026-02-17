# Security Policy

## Supported versions

Security fixes are prioritized for the latest code on the default branch.

## Reporting a vulnerability

Please do not open public issues for security reports.

Use GitHub Security Advisories:

- https://github.com/solnikhil/ZuraAI/security/advisories/new

Include:

- A clear description of the issue
- Steps to reproduce
- Impact assessment
- Any suggested remediation

You can expect an initial response within 5 business days.

## Security notes for contributors

- Treat renderer input as untrusted
- Keep privileged operations in Electron main process
- Keep preload IPC channels narrow and allowlisted
- Validate all IPC inputs server-side (main process)
- Never commit API keys, tokens, or `.env` files

## If a secret is exposed

- Rotate/revoke the secret immediately at the provider
- Remove it from the current branch
- Rewrite git history before release if the secret reached commits
