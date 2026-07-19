# Security

We take security seriously. Please report vulnerabilities privately so we can fix them before they are public knowledge.

## How to report

Use GitHub Security Advisories (private):

https://github.com/solnikhil/ZuraAI/security/advisories/new

Please include:

- A clear description of the issue
- Steps to reproduce
- Impact (what an attacker could do)
- Affected version, branch, or commit if you know it

Do **not** open a public issue for suspected vulnerabilities or leaked secrets.

## Scope notes

ZuraAI is a local desktop app. High-risk areas include:

- Electron main / preload / IPC boundaries
- Secure storage of API keys
- Built-in tools (shell, filesystem, Computer Use, approvals)
- MCP server connections and OAuth
- Update packaging and download verification

We do not want reports that only describe “user installed a malicious MCP server and approved it.” That is a trust decision by the user. We do want issues where the app lets untrusted UI content or model text escalate privileges without a clear approval.

## Coordinated disclosure

We will acknowledge private reports as soon as we can, work on a fix, and credit reporters who want credit once a release is ready.
