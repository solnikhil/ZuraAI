<div align="center">
  <a name="readme-top"></a>
  <img src="public/icon.png" alt="ZuraAI icon" width="96" height="96" />

  <h1>ZuraAI</h1>

  <p><strong>Desktop AI for people who want model choice, agentic workflows, fast research, and local control.</strong></p>

  <p>
    ZuraAI is a desktop assistant built with Electron, React, Vite, and TypeScript.<br />
    Chat across leading cloud providers and Ollama, stream answers, run built-in web research,
    use agent tools with approval gates, and keep your data local.
  </p>

  <p><sub>macOS and Windows supported. No ZuraAI account. No cloud sync. Bring your own providers.</sub></p>

  <p>
    <a href="https://github.com/solnikhil/ZuraAI/releases">Releases</a> |
    <a href="https://github.com/solnikhil/ZuraAI/issues">Issues</a> |
    <a href="CONTRIBUTING.md">Contributing</a> |
    <a href="TELEMETRY.md">Telemetry</a> |
    <a href="AGENTS.md">Architecture</a> |
    <a href="https://github.com/solnikhil/ZuraAI/security/advisories/new">Report Security Issue</a>
  </p>

  <p>
    <a href="https://github.com/solnikhil/ZuraAI/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/solnikhil/ZuraAI/ci.yml?branch=main&label=CI&style=flat-square" alt="CI status" /></a>
    <a href="https://github.com/solnikhil/ZuraAI/actions/workflows/codeql.yml"><img src="https://img.shields.io/github/actions/workflow/status/solnikhil/ZuraAI/codeql.yml?branch=main&label=CodeQL&style=flat-square" alt="CodeQL status" /></a>
    <a href="https://github.com/solnikhil/ZuraAI/actions/workflows/secret-scan.yml"><img src="https://img.shields.io/github/actions/workflow/status/solnikhil/ZuraAI/secret-scan.yml?branch=main&label=Secret%20Scan&style=flat-square" alt="Secret Scan status" /></a>
    <a href="https://securityscorecards.dev/viewer/?uri=github.com/solnikhil/ZuraAI"><img src="https://api.securityscorecards.dev/projects/github.com/solnikhil/ZuraAI/badge" alt="OpenSSF Scorecard" /></a>
    <img src="https://img.shields.io/badge/storage-local--first-1f6feb?style=flat-square" alt="Local-first storage" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-4b5563?style=flat-square" alt="macOS and Windows support" />
    <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 18 or newer" />
    <a href="LICENSE"><img src="https://img.shields.io/github/license/solnikhil/ZuraAI?style=flat-square" alt="License" /></a>
  </p>
</div>

<details>
  <summary><strong>Contents</strong></summary>

- [Why ZuraAI](#why-zuraai)
- [At a glance](#at-a-glance)
- [Agentic capabilities](#agentic-capabilities)
- [Provider lineup](#provider-lineup)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Security model](#security-model)
- [Project docs](#project-docs)
- [Contributing](#contributing)
- [License](#license)

</details>

## Why ZuraAI

Most desktop AI apps make you pick one provider, one workflow, or one trust model. ZuraAI is built for people who want all three under control.

- Multi-provider by design: use `OpenRouter`, `Ollama`, `Groq`, `Alibaba Cloud`, `Fireworks`, and `DeepSeek` from one desktop app.
- Research that stays in the flow: turn on built-in web search for current facts, follow-up searches, live progress, and citations.
- Agent Workspace mode: let capable models plan and use gated tools for search, code, MCP actions, memory, and desktop assistance.
- Local-first storage: chat history lives in the Electron main process and API keys are stored with Electron secure storage.
- Better chat organization: pin sessions, sort them into folders, tag them, and generate titles automatically.
- Desktop workflow polish: use the command palette, quick-send actions, image attachments, and per-model enable or disable controls.
- Useful insight with privacy controls: review local usage analytics, latency, provider mix, and tool activity from inside the app. Anonymous product analytics is opt-in only.

## At a glance

| Area            | What ZuraAI gives you                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Models          | One interface for cloud models and local Ollama models                                                |
| Agent Workspace | Tool-using assistant mode with visible step timelines, approval gates, and per-skill controls         |
| Research        | Built-in web search, batched follow-up searches, citations, and inline search results                 |
| Tools           | Web research, approved code execution, trusted MCP tools, memory tools, and Windows-only computer use |
| Media           | Image attachments for vision-capable models                                                           |
| Organization    | Pinned chats, folders, tags, recency grouping, and title generation                                   |
| Platform        | Desktop app support for macOS and Windows                                                             |
| Privacy         | Local chat history, secure API key storage, and opt-in anonymous analytics                            |
| Workflow        | Command palette quick-send, provider hub controls, and local usage analytics                          |

## Agentic capabilities

ZuraAI has two assistant modes: normal chat for direct conversations and Agent Workspace for tool-using workflows. Agent Workspace exposes capabilities only when the matching skill is enabled and the selected provider/model supports tool calls.

| Capability     | What it does                                                                                                             | Safety and scope                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Web research   | Calls `web_search` for current facts, source-backed answers, and multi-query research loops                              | Skill-gated, budgeted per response, and rendered with inline source results                 |
| Code execution | Runs JavaScript or Python through the built-in `code_execution` tool for calculations, data transforms, and quick checks | Disabled by default; every execution requires explicit approval                             |
| MCP tools      | Connects trusted Model Context Protocol servers and exposes their namespaced tools to capable models                     | Servers must be enabled and trusted; optional per-call approval plus tool allow/block lists |
| Memory         | Saves, updates, deletes, and searches short durable user facts for personalization across chats                          | Stored locally under Electron `userData`; user-visible and manageable in Settings           |
| Computer use   | Takes screenshots, clicks, types, scrolls, launches apps, and closes windows for desktop automation                      | Windows-only, disabled by default, approval-gated, with an emergency stop path              |

Agent runs are visible in the chat timeline: ZuraAI records planning, tool calls, approvals, running state, results, failures, and final synthesis on the assistant message. Tool-only turns and approval outcomes are persisted with the chat so the history reflects what actually happened.

## Provider lineup

| Provider        | Best for                      | Notes                                                              |
| --------------- | ----------------------------- | ------------------------------------------------------------------ |
| `OpenRouter`    | Broad model access            | Great default choice when you want one API for many model families |
| `Ollama`        | Local and offline workflows   | No API key required; just run an Ollama server locally             |
| `Groq`          | Fast responses                | Useful when low latency matters more than provider breadth         |
| `Alibaba Cloud` | Qwen-based workflows          | Good option for teams already using Alibaba Cloud models           |
| `Fireworks`     | Open-weight serverless models | Useful for fast access to hosted open models                       |
| `DeepSeek`      | DeepSeek-native workflows     | Good option for DeepSeek chat and reasoning models                 |

ZuraAI is actively adding and testing new providers. If the model stack you want is missing, open an issue and we can prioritize it.

## Quick start

### Requirements

- Node.js `>= 18`
- Bun `>= 1.1`
- macOS or Windows

### Install and run

```bash
git clone https://github.com/solnikhil/ZuraAI.git
cd ZuraAI
bun install
bun run dev
```

> [!NOTE]
> ZuraAI does not require a `.env` file. Add provider keys inside the app under Settings. If you use `Ollama`, make sure the local server is running at `http://localhost:11434` or your configured endpoint.

### Build production artifacts

```bash
bun run build
```

Use `bun run build:dir` if you want an unpacked directory build instead of the installer package.

## Scripts

| Command                     | Purpose                                          |
| --------------------------- | ------------------------------------------------ |
| `bun run dev`               | Start the Vite development server                |
| `bun run typecheck`         | Run TypeScript checks with `tsc --noEmit`        |
| `bun run test`              | Run the Vitest suite                             |
| `bun run test:watch`        | Run tests in watch mode                          |
| `bun run build:renderer`    | Typecheck and build the renderer                 |
| `bun run build`             | Create the production Electron package           |
| `bun run build:dir`         | Create an unpacked Electron directory build      |
| `bun run release:checksums` | Generate SHA-256 checksums for release artifacts |
| `bun run preview`           | Preview the renderer build locally               |

## Release Packaging

ZuraAI ships desktop binaries through GitHub Releases. The package-manager entrypoint is a small launcher package in `packages/zuraai`, so users can run:

```bash
bunx zuraai
npx zuraai
```

The launcher downloads the matching GitHub release artifact, verifies it against `checksums.txt`, caches it locally, and launches the app. See `docs/RELEASE.md` for the release checklist.

## Security model

ZuraAI is built around a narrow desktop security boundary.

- The renderer is treated as untrusted.
- Privileged work stays in the Electron main process.
- Preload exposes a small, allowlisted IPC surface.
- Chat history is stored locally under Electron `userData`.
- API keys are stored locally with Electron `safeStorage` when available.
- Anonymous analytics is opt-in only and documented in [`TELEMETRY.md`](TELEMETRY.md).

For the full architecture and security notes, see `AGENTS.md`.

## Project docs

- `AGENTS.md` - architecture, IPC boundaries, data flow, and agent rules for this repo
- `CONTRIBUTING.md` - local workflow, quality checks, and commit conventions
- `CODE_OF_CONDUCT.md` - community expectations

## Contributing

Contributions are welcome. Before opening a pull request:

1. Read `CONTRIBUTING.md`.
2. Review the architecture notes in `AGENTS.md`.
3. Run `bun run typecheck` and `bun run test`.
4. Call out any IPC, storage, provider, or tool-surface changes clearly.

## License

MIT. See `LICENSE`.

---

If things feel a little rough around the edges, that is honest: this is my first open-source app, and I am still figuring things out as I build in public. Thanks for the patience, the feedback, and the help.
