# AGENTS.md - ZuraAI Agent Guide

This file is the source of truth for automated coding agents working in this repo.

**Hard requirement:** Whenever you change project architecture (new processes/windows, new IPC channels, new storage locations, new tool capabilities, new AI providers, release packaging assumptions, or meaningful data-flow changes), update the Architecture section in this same PR/commit.

---

## What This Project Is

ZuraAI is a desktop AI assistant built with **Electron + React + Vite + TypeScript**.

Core capabilities:

- Dashboard UI for chats, settings, models, extensions, MCP, memory, and reminders
- Multi-provider AI calls: Alibaba Cloud, Fireworks, Groq, NVIDIA NIM, Ollama, OpenRouter, OpenCode Go, Perplexity, DeepSeek
- Hardened renderer -> preload -> main IPC boundary
- Restricted tool system: built-in main-process tools, renderer-managed MCP tools, Agent Skills activation, artifacts, scheduled tasks, code execution, terminal, and Windows-native/Computer Use surfaces

---

## Quick Start

- Install: `bun install`
- Dev: `bun run dev`
- Tests: `bun run test`
- Tests watch: `bun run test:watch`
- Typecheck: `bun run typecheck`
- Build: `bun run build`
- Build portable dir: `bun run build:dir`
- Release checksums: `bun run release:checksums`
- Preview renderer bundle: `bun run preview`

Prereqs: Bun `>= 1.1`, Node.js `>= 18`.

---

## Non-Negotiable Rules

- The **renderer is untrusted**. Privileged work belongs in main and must be exposed through narrow, allowlisted preload bridges.
- Do not add broad IPC, broad filesystem access, broad HTTP proxying, or broad CORS bypasses.
- Do not add fallback paths, silent substitutions, local heuristics, provider fallbacks, or "safe defaults" unless the user explicitly asks or approves. Surface the real failure and fix the root cause.
- API keys, MCP secrets, and Brevo keys live in main-process secure storage only. Renderer settings may store sanitized non-secret state only.
- Built-in prompt templates are code-owned defaults. Do not make them user-editable unless explicitly requested.
- Keep settings cards, chat composer containers, dropdowns, selects, context menus, titlebar menus, and nested model/provider menus visually flat. Preserve the shared `zura-menu-*` system in `src/styles/shared.css` and `src/components/ui/{dropdown-menu,select,context-menu,menubar}.tsx`.
- If you add a built-in extension that changes assistant behavior, add `src/prompts/default<ExtensionName>Prompt.ts`, wire it through settings defaults/normalization, render it read-only in Settings -> System Prompt, and inject it only when enabled.

---

## Repo Map

| Path                                  | Purpose                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `electron/main.ts`                    | App lifecycle, IPC registration, windows, tray, updater, tool handlers                                            |
| `electron/preload.ts`                 | `contextBridge` surface and IPC allowlists; security boundary                                                     |
| `electron/ipc/`                       | Main-process IPC handlers                                                                                         |
| `electron/windows/`                   | Main, About, tray, macOS menu, dev chat-debug windows                                                            |
| `electron/chatStore.ts`               | Chat index/session persistence under `app.getPath('userData')`                                                    |
| `electron/secureStorage.ts`           | Encrypted key storage via Electron `safeStorage`                                                                  |
| `electron/mcp/`                       | MCP server storage, connection lifecycle, transports, approvals, IPC                                              |
| `electron/tools/`                     | Main-process built-in tools: web search, files, shell, code execution, native Windows tools, Computer Use         |
| `electron/monitors/`                  | Scheduled reminders/lookouts runtime and persistence                                                              |
| `electron/notifications/email/`       | Brevo transactional email for fixed notification flows                                                            |
| `electron/analytics/`                 | Opt-in PostHog analytics service and consent state                                                                |
| `electron/agentSkills/`               | Main-process Agent Skills discovery/activation/install service                                                    |
| `src/App.tsx`                         | Renderer routing and shared shell layout                                                                          |
| `src/main.tsx`                        | Renderer bootstrap, first-paint setup, startup preloads                                                           |
| `src/components/`                     | UI surfaces: dashboard, settings, titlebar, dialogs                                                              |
| `src/contexts/`                       | Renderer state: settings, chat history, shell, streaming, quick-send                                              |
| `src/providers/`                      | Provider registry, runtime dispatch, capabilities, metadata                                                       |
| `src/services/`                       | Provider HTTP integrations and stream parsers                                                                     |
| `src/tools/`                          | Shared tool definitions, adapters, executor, MCP registry                                                         |
| `src/skills/`                         | Built-in extension catalog and settings normalization/migration                                                   |
| `src/agentSkills/`                    | Agent Skills shared types and compact prompt catalog                                                              |
| `src/mcp/`                            | Shared MCP contracts and renderer context                                                                         |
| `src/prompts/`                        | Code-owned prompt defaults                                                                                        |
| `dist/`, `dist-electron/`, `release/` | Generated build outputs; do not hand edit                                                                         |
| `packages/zuraai/`                    | npm package reserved for ZuraAI; currently `zuraai@0.0.0` README-only placeholder pointing to `https://zuraai.in` |

---

## Architecture

### Process Model

```
Renderer (React/Vite) -> Preload (allowlisted bridges) -> Electron Main
```

- Renderer owns UI, local sanitized settings, provider request shaping, and chat interaction state.
- Preload exposes only approved `window.*` APIs and restricted `ipcRenderer` wrappers.
- Main owns windows, secure storage, chat persistence, MCP server processes/connections, native tools, filesystem access, notifications, updater, analytics transport, and OS integration.

### Windows & Routes

- Main window: loads `#/dashboard`; routes `/`, `/dashboard`, `/settings`, and `/chat` under `AppShellLayout`.
- About window: separate `BrowserWindow`, loads `#/about`, opened through `window.appInfo.openAboutWindow()`.
- Chat debug window: dev-only separate `BrowserWindow`, loads `#/chat-debug?sessionId=<id>`, disabled in packaged builds.
- Unknown renderer routes render the dedicated 404 view.
- Packaged app registers the `zura-chat` protocol for trusted local chat deep links. Debug references keep the shape `zura-chat://<sessionId>?userData=<base64urlUserData>` and may include `message=` or `messageBase64=`.

All BrowserWindows must use `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true` unless a change is explicitly justified in this file.

### Persistence Boundaries

Renderer `localStorage`:

- Sanitized settings and UI state (`zura-settings`)
- Extensions/settings compatibility state (`settings.extensions`, legacy `settings.skills` alias while migration continues)
- Agent Skills non-secret settings (`settings.agentSkills`)
- Provider model lists, enablement, reasoning preferences, theme settings, command bar state, sidebar/shell state
- Last-open dashboard folder selection (`zura-ui:selectedFolderId`) when dashboard view persistence is enabled
- Trusted exact tool signatures for renderer approval gating
- Non-Electron chat fallback only

Main `app.getPath('userData')`:

- Chat index, folder metadata, and per-session chat JSON
- Conversation summaries and assistant run metadata on chat messages
- MCP server metadata, runtime metadata, and non-secret config
- Secure-storage JSON encrypted through `safeStorage`
- Memories and memory summaries
- Scheduled task definitions, lookout snapshots, reminder logs, and run history
- Analytics consent/install metadata
- Dev-only chat diagnostics JSONL
- Artifact export files for external opening

Secrets:

- API keys and MCP secrets live in `electron/secureStorage.ts`.
- Stored provider keys include OpenRouter, Perplexity, Groq, Alibaba, Fireworks, DeepSeek, OpenCode Go, NVIDIA, Tavily, and Brevo.
- Renderer should read key presence when possible and hydrate actual secrets only when required for a provider/tool call.
- `safeStorage` is required for secret reads/writes. Do not add plaintext secret persistence fallback.

### IPC Surface

The renderer never imports Electron APIs directly.

Primary files:

- `electron/preload.ts` - allowlists and dedicated `window.*` bridges
- `src/electron.d.ts` - renderer-visible API types
- `electron/ipc/*` - main-process handlers

Dedicated preload bridges include:

- `window.ipcRenderer` - restricted generic invoke/on wrapper
- `window.windowControls`
- `window.appInfo`
- `window.appMenu`
- `window.analytics`
- `window.agentSkills`
- `window.shell`
- `window.devTools`
- `window.contextMenu`
- `window.nativeDialog`
- `window.mcp`
- `window.memory`
- `window.scheduledTasks`
- `window.emailNotifications`
- `window.artifacts`
- `window.codeExecution`
- `window.terminal`
- `window.chatDebug`
- `window.chatLinks`
- `window.discordRpc`

If you add, rename, or remove an IPC channel:

1. Add/update the preload allowlist or dedicated bridge.
2. Add/update `src/electron.d.ts`.
3. Register/dispose the main handler.
4. Validate all renderer input in main.
5. Update this Architecture section.

MCP includes a narrow `mcp:open-config-file` channel that opens ZuraAI's own
`mcp-servers.json` under `app.getPath('userData')` with the OS default editor.
It must not accept renderer-provided paths.

Scheduled tasks include a narrow `scheduled-tasks:set-extension-enabled` channel
that accepts only a boolean Reminders & Lookouts extension state from the
renderer settings runtime. Main uses this state to start/stop scheduling and to
reject scheduled-task mutations/runs while the extension is disabled.

### CORS / Provider Proxy

- `electron/main.ts` has a narrow CORS header handler for known provider domains that lack browser CORS headers, currently including NVIDIA NIM.
- OpenCode Go uses a narrow main-process proxy constrained to `https://opencode.ai/zen/go/*`.
- Do not add arbitrary HTTP proxying or all-domain CORS bypasses.

### Tools

Tool execution is restricted and gated by settings/extension state.

- Built-in manifest: `src/tools/builtinTools.ts`
- Renderer definitions/adapters: `src/tools/definitions.ts`, `src/tools/adapters/*`
- Tool exposure/merge: `src/hooks/useToolCalling.ts`, `src/tools/toolManager.ts`, `src/tools/mcpRegistry.ts`
- Main registry: `electron/tools/index.ts`

Important tool rules:

- `web_search` is a main-process Tavily-only pipeline. No fallback backend.
- Renderer-only artifact tools mutate active chat session state and do not cross IPC.
- Scheduled task tools execute in main and are gated by the reminders extension.
- The scheduled-task runtime also has a main-process extension gate synced from
  renderer settings; disabling Reminders & Lookouts clears active timers and
  prevents manual or model-callable task execution until re-enabled.
- MCP tools use `window.mcp.executeTool(...)`, not the generic built-in tool IPC.
- Mutating/high-risk tools require user approval unless an explicit trusted signature/auto-approve setting applies.
- Agent mode should prefer native structured tools before visual Computer Use and verify mutating actions with read-only inspection where possible.
- Terminal (`system_shell`) is Windows-only, default disabled, non-interactive PowerShell with approval, timeout, output caps, and no OS sandbox. Treat any relaxation as security-sensitive.
- Computer Use is Windows-only, default disabled, current-desktop only. Do not reintroduce a separate virtual desktop mode, `agent_desktop` settings, or `agent-desktop:*` IPC.
- MCP resources and prompts are user-visible browsing/preview surfaces only; do not merge them into model-callable tools without an explicit architecture update.

### Providers

- Provider metadata/capabilities live in `src/providers/providerRegistry.ts`.
- Shared runtime dispatch lives in `src/providers/providerRuntime.ts`.
- Provider service files own request shaping and stream parsing only.
- Perplexity is search-native and should not receive external tool definitions.
- OpenRouter-compatible tool-call parsing/recovery lives in `src/tools/adapters/openrouterToolCalls.ts`.
- New providers must define auth, model enablement, capabilities, title/memory support, streaming behavior, and storage/secrets boundaries explicitly.
- Do not hardcode real model IDs/names in runtime code. Models are user-configured and resolved from settings plus provider registry metadata. Tests should use clearly fake IDs.
- Provider-level enablement is independent from API key presence; model pickers should list only manually enabled providers and models where `enabled !== false`.
- DeepSeek reasoning is user-controlled per model; do not infer capability or add fallback reasoning behavior.

### Extension / Skill State

- UI-facing built-in assistant capabilities are Extensions.
- Legacy `settings.skills` is still normalized into `settings.extensions` and mirrored back as a compatibility alias while migration continues.
- Agent Skills are separate from built-in extensions and use the open `.agents/skills/*/SKILL.md` format.
- Agent Skills discovery returns compact catalog metadata; full SKILL.md bodies are loaded only through explicit activation.
- Agent Skills `allowed-tools` frontmatter is advisory metadata only; it must not grant new tool permissions or bypass approvals.
- Folders are first-class dashboard workspaces opened through `dashboardView: 'folders'`; folder chats still store `folderId` on `ChatSession`, and folder metadata lives in the chat index rather than a separate store.

### Feature Guardrails

- Artifacts live on their source chat session (`ChatSession.artifacts`). Do not add a separate artifact store or main-process artifact mutation API; external open is the only artifact IPC path.
- Folder `memoryMode` is selected when a folder is created and controls project memory scope: `default` includes global plus folder memories, while `folder-only` excludes global memories for chats in that folder.
- Settings -> Extensions -> Memory lists global and folder-scoped background memories together, labels folder-scoped memories with folder metadata, and provides a project-memory filter.
- Scheduled web lookouts may fetch public `http`/`https` URLs and local loopback hosts only. Keep private LAN URLs rejected.
- Email notification settings in renderer are non-secret preferences only. `brevoApiKey` stays in secure storage, and the renderer must not send arbitrary email bodies over IPC.
- Analytics is opt-in only. Main sanitizes events and must never accept prompts, responses, file paths, clipboard data, API keys, MCP payloads, or conversation content.
- Discord RPC is always-on in main and lazy-requires `discord-rpc`; missing optional native dependencies must not crash the app.

---

## Build & Release

### Desktop Release

- Packaging uses `electron-builder` (`package.json#build`).
- `npmRebuild` is `false`; packaging should use installable/prebuilt native dependencies and should not require local Visual Studio Build Tools just to rebuild optional native dependencies.
- `bun run build` emits Windows installer and portable artifacts, then writes `release/checksums.txt`.
- Build outputs are gitignored under `dist/`, `dist-electron/`, and `release/`.
- Auto-updater is production-only in `electron/updater.ts`.
- GitHub publishing is configured for `solnikhil/ZuraAI`; update `package.json#build.publish` if packaging from a fork.
- Windows packaging uses the NSIS wizard installer with install-directory selection. The selected directory is the final install path; do not force an extra `\ZuraAI` subfolder.
- Installer assets (`build/icon.ico`, `build/sidebar.bmp`) are generated by `scripts/generate-icons.mjs` and are gitignored.

Windows artifacts:

- `ZuraAI-Setup-{version}.exe`
- `ZuraAI-Setup-{version}.exe.blockmap`
- `ZuraAI-Portable-{version}-x64.exe`
- `latest.yml`
- `checksums.txt`

### npm Package

- `zuraai@0.0.0` is published on npm as a README-only placeholder.
- It has no `bin`, includes only `README.md` plus `package.json`, and points to `https://zuraai.in`.
- `zura` is not available on npm (`zura@6.6.7` was already published by another owner when checked).

Placeholder publish checklist:

1. Keep `packages/zuraai/package.json` free of `bin`.
2. Keep `files` limited to `README.md`.
3. Run `cd packages/zuraai && npm pack --dry-run --json`.
4. Publish with `npm publish --access public`.
5. If using a token, pass it through the environment for one command; never commit `.npmrc` tokens.
6. Verify with `npm view zuraai name version homepage description --json`.

Future launcher release checklist:

1. Add `bin` only when the launcher is working.
2. Keep npm package small; do not embed Electron binaries.
3. Align package version with GitHub app release tag (`0.0.6` -> `v0.0.6`).
4. Upload desktop artifacts and `checksums.txt` to GitHub first.
5. Publish npm only after release URLs are live.
6. Verify `bunx zuraai --version` and `bunx zuraai`.

---

## Testing

Default checks:

- `bun run typecheck`
- `bun run test`
- `bun run build` for release/packaging changes

Targeted checks:

- IPC/preload changes: run preload and relevant IPC tests.
- Storage migrations: run affected store/context tests and inspect old-data migration paths.
- Provider/tool changes: run provider, tool adapter, executor, and streaming tests.
- UI changes: run affected component tests and check responsive/overflow behavior.
- Release/npm changes: run `npm pack --dry-run --json` in `packages/zuraai` and verify `release/checksums.txt`.

---

## Agent Best Practices

Do:

- Read the relevant source before editing.
- Keep changes scoped to the user's request.
- Preserve existing patterns and helper APIs.
- Prefer explicit validation over permissive handling.
- Add or update tests when behavior, storage, IPC, provider logic, or release output changes.
- Update this file when architecture or release assumptions change.
- Keep generated outputs out of commits unless the repo already tracks them.

Don't:

- Do not bypass preload or expose broad Electron APIs.
- Do not store secrets in renderer state, logs, docs, fixtures, or committed files.
- Do not introduce unapproved fallbacks.
- Do not silently widen tool permissions.
- Do not add one-off menu/dropdown styling when the shared menu system applies.
- Do not revert unrelated dirty worktree changes.

---

## Known Gaps / Watchpoints

- User-configured global shortcut strings in settings are still not fully wired to `globalShortcut.register(...)`.
- Package-manager launcher support is planned but not active in the published npm package; `zuraai@0.0.0` is currently only a placeholder.
