<div align="center">
  <a name="readme-top"></a>
  <img src="public/icon.png" alt="ZuraAI icon" width="96" height="96" />

  <h1>ZuraAI</h1>

  <p><strong>A desktop AI assistant with model choice, tools, research, and local control.</strong></p>

  <p>
    ZuraAI is a desktop app for Windows and macOS.<br />
    Chat with the models you already pay for (or run locally with Ollama), search the web,
    use tools with clear approval steps, and keep your history on your machine.
  </p>

  <p><sub>No ZuraAI account. No cloud sync. Bring your own providers.</sub></p>

  <p>
    <a href="https://github.com/solnikhil/ZuraAI/releases">Releases</a> ·
    <a href="https://github.com/solnikhil/ZuraAI/issues">Issues</a> ·
    <a href="CONTRIBUTING.md">Contributing</a> ·
    <a href="TELEMETRY.md">Telemetry</a> ·
    <a href="AGENTS.md">Architecture</a> ·
    <a href="SECURITY.md">Security</a> ·
    <a href="https://github.com/solnikhil/ZuraAI/security/advisories/new">Report a security issue</a>
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

- [What you get](#what-you-get)
- [Quick start](#quick-start)
- [Useful commands](#useful-commands)
- [Releases](#releases)
- [How security works](#how-security-works)
- [Contributing](#contributing)
- [License](#license)

</details>

## What you get

ZuraAI is for people who want one desktop app instead of juggling browser tabs and provider dashboards.

- **Use the models you already pay for** — or run local ones. Drop your keys in Settings and go.
- **Research in the chat.** Web search can pull current sources into the conversation with progress and citations.
- **Agent mode when you need tools.** Web search, code (with approval), MCP, memory, and Windows desktop help when you allow it. Tool steps show up in the chat so you can see what ran.
- **Local by default.** Chats stay on your computer. API keys use Electron secure storage.
- **Desktop polish.** Streaming replies, image attachments, pinned chats, a command palette, and local usage views.

## Quick start

### Requirements

- Node.js 18 or newer
- Bun 1.3.14 or newer (see `package.json` for the exact range)
- Windows or macOS

### Install and run

```bash
git clone https://github.com/solnikhil/ZuraAI.git
cd ZuraAI
bun install
bun run dev
```

You do not need a `.env` file. Add provider keys inside **Settings**. If you use Ollama, start it locally first (usually `http://localhost:11434`).

### Build installers

```bash
bun run build
```

Use `bun run build:dir` if you only need an unpacked app folder.

## Useful commands

| Command                     | What it does                        |
| --------------------------- | ----------------------------------- |
| `bun run dev`               | Start development                   |
| `bun run typecheck`         | TypeScript checks                   |
| `bun run test`              | Unit tests                          |
| `bun run test:watch`        | Tests in watch mode                 |
| `bun run build`             | Production Electron package         |
| `bun run build:dir`         | Unpacked directory build            |
| `bun run release:checksums` | SHA-256 checksums for release files |
| `bun run preview`           | Preview the renderer build          |

## Releases

Desktop builds are published on [GitHub Releases](https://github.com/solnikhil/ZuraAI/releases).

There is also a small npm package (`zuraai`) that installs the matching verified GitHub desktop release when needed, then opens the app through local protocols. Details live in [`docs/RELEASE.md`](docs/RELEASE.md).

## How security works

- The UI process is treated as untrusted.
- Sensitive work runs in the Electron main process.
- The UI only talks to main through a small, allowlisted bridge.
- Chats and files stay under Electron’s local user data folder.
- API keys never sit in plain settings JSON when secure storage is available.
- Anonymous analytics is **opt-in**. See [`TELEMETRY.md`](TELEMETRY.md).

Deeper design notes are in [`AGENTS.md`](AGENTS.md).

## Contributing

1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. Skim [`AGENTS.md`](AGENTS.md) if you touch architecture, IPC, storage, or tools.
3. Run `bun run typecheck` and `bun run test`.
4. In the PR, call out anything that changes security boundaries or packaging.

## License

MIT. See [`LICENSE`](LICENSE).

---

This is still early open-source software. Rough edges are expected. Thanks for the patience, feedback, and help.
