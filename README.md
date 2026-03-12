<div align="center">
  <a name="readme-top"></a>
  <img src="public/icon.png" alt="Zura AI icon" width="96" height="96" />

  <h1>Zura AI</h1>

  <p><strong>Desktop AI for people who want model choice, fast research, and local control.</strong></p>

  <p>
    Zura AI is a desktop assistant built with Electron, React, Vite, and TypeScript.<br />
    Chat across leading cloud providers and Ollama, stream answers, run built-in web research, and keep your data local.
  </p>

  <p><sub>macOS and Windows supported. No Zura account. No cloud sync. Bring your own providers.</sub></p>

  <p>
    <a href="https://github.com/solnikhil/ZuraAI/releases">Releases</a> |
    <a href="https://github.com/solnikhil/ZuraAI/issues">Issues</a> |
    <a href="CONTRIBUTING.md">Contributing</a> |
    <a href="AGENTS.md">Architecture</a> |
    <a href="SECURITY.md">Security</a>
  </p>

  <p>
    <a href="https://github.com/solnikhil/ZuraAI/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/solnikhil/ZuraAI/ci.yml?branch=main&label=CI&style=flat-square" alt="CI status" /></a>
    <a href="https://github.com/solnikhil/ZuraAI/actions/workflows/codeql.yml"><img src="https://img.shields.io/github/actions/workflow/status/solnikhil/ZuraAI/codeql.yml?branch=main&label=CodeQL&style=flat-square" alt="CodeQL status" /></a>
    <a href="https://github.com/solnikhil/ZuraAI/actions/workflows/secret-scan.yml"><img src="https://img.shields.io/github/actions/workflow/status/solnikhil/ZuraAI/secret-scan.yml?branch=main&label=Secret%20Scan&style=flat-square" alt="Secret Scan status" /></a>
    <img src="https://img.shields.io/badge/storage-local--first-1f6feb?style=flat-square" alt="Local-first storage" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-4b5563?style=flat-square" alt="macOS and Windows support" />
    <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 18 or newer" />
    <a href="LICENSE"><img src="https://img.shields.io/github/license/solnikhil/ZuraAI?style=flat-square" alt="License" /></a>
  </p>
</div>

<details>
  <summary><strong>Contents</strong></summary>

- [Why Zura](#why-zura)
- [At a glance](#at-a-glance)
- [Provider lineup](#provider-lineup)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Security model](#security-model)
- [Project docs](#project-docs)
- [Contributing](#contributing)
- [License](#license)

</details>

## Why Zura

Most desktop AI apps make you pick one provider, one workflow, or one trust model. Zura is built for people who want all three under control.

- Multi-provider by design: use `OpenRouter`, `Ollama`, `Perplexity`, `Groq`, and `Alibaba Cloud` from one desktop app.
- Research that stays in the flow: turn on built-in web search or use structured research mode with live progress and citations.
- Local-first storage: chat history lives in the Electron main process and API keys are stored with Electron secure storage.
- Better chat organization: pin sessions, sort them into folders, tag them, and generate titles automatically.
- Desktop workflow polish: use the command palette, quick-send actions, image attachments, and per-model enable or disable controls.
- Useful insight without telemetry: review local usage analytics, latency, provider mix, and tool activity from inside the app.

## At a glance

| Area | What Zura gives you |
| --- | --- |
| Models | One interface for cloud models and local Ollama models |
| Research | Built-in web search, structured research planning, citations, and inline search results |
| Media | Image attachments for vision-capable models |
| Organization | Pinned chats, folders, tags, recency grouping, and title generation |
| Platform | Desktop app support for macOS and Windows |
| Privacy | Local chat history, secure API key storage, and no telemetry |
| Workflow | Command palette quick-send, provider hub controls, and local usage analytics |

## Provider lineup

| Provider | Best for | Notes |
| --- | --- | --- |
| `OpenRouter` | Broad model access | Great default choice when you want one API for many model families |
| `Ollama` | Local and offline workflows | No API key required; just run an Ollama server locally |
| `Perplexity` | Research-heavy chats | Strong fit for answers grounded in live web information |
| `Groq` | Fast responses | Useful when low latency matters more than provider breadth |
| `Alibaba Cloud` | Qwen-based workflows | Good option for teams already using Alibaba Cloud models |

Zura is actively adding and testing new providers. If the model stack you want is missing, open an issue and we can prioritize it.

## Quick start

### Requirements

- Node.js `>= 18`
- npm `>= 9`
- macOS or Windows

### Install and run

```bash
git clone https://github.com/solnikhil/ZuraAI.git
cd ZuraAI
npm install
npm run dev
```

> [!NOTE]
> Zura does not require a `.env` file. Add provider keys inside the app under Settings. If you use `Ollama`, make sure the local server is running at `http://localhost:11434` or your configured endpoint.

### Build production artifacts

```bash
npm run build
```

Use `npm run build:dir` if you want an unpacked directory build instead of the installer package.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run typecheck` | Run TypeScript checks with `tsc --noEmit` |
| `npm run test` | Run the Vitest suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build:renderer` | Typecheck and build the renderer |
| `npm run build` | Create the production Electron package |
| `npm run build:dir` | Create an unpacked Electron directory build |
| `npm run preview` | Preview the renderer build locally |

## Security model

Zura is built around a narrow desktop security boundary.

- The renderer is treated as untrusted.
- Privileged work stays in the Electron main process.
- Preload exposes a small, allowlisted IPC surface.
- Chat history is stored locally under Electron `userData`.
- API keys are stored locally with Electron `safeStorage` when available.

> [!IMPORTANT]
> The current shipped tool path is intentionally narrow and centered on built-in web research. Future MCP support is tracked separately in `docs/mcp-roadmap.md`.

For the full architecture and security notes, see `AGENTS.md`.

## Project docs

- `AGENTS.md` - architecture, IPC boundaries, data flow, and agent rules for this repo
- `CONTRIBUTING.md` - local workflow, quality checks, and commit conventions
- `SECURITY.md` - responsible disclosure process and security notes for contributors
- `CODE_OF_CONDUCT.md` - community expectations
- `docs/mcp-roadmap.md` - planned MCP implementation phases

## Contributing

Contributions are welcome. Before opening a pull request:

1. Read `CONTRIBUTING.md`.
2. Review the architecture notes in `AGENTS.md`.
3. Run `npm run typecheck` and `npm run test`.
4. Call out any IPC, storage, provider, or tool-surface changes clearly.

## License

MIT. See `LICENSE`.
