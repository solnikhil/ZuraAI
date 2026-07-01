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
- Command Center overlay: separate frameless always-on-top `BrowserWindow`, loads `#/command-center`, opened only while Agent Mode is active.
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
- Command Center saved workflow definitions (`command-center-workflows.json`)
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
- `window.commandCenter`
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

MCP auth is modeled explicitly on each server as `none`, `envSecret`,
`headerSecret`, `bearerToken`, `basicAuth`, `oauth2Pkce`, `jsonCredential`, or
`connectionString`. Local `stdio` secrets resolve through existing secure env
handling; remote manual secrets resolve through secure headers/tokens; JSON
credentials and connection strings are typed secret wrappers rather than new
transport behavior. OAuth 2.1 PKCE is owned by main and is currently used only
for saved remote `sse` servers. The renderer may request auth actions only by
saved server ID through narrow MCP channels (`mcp:start-oauth`,
`mcp:clear-oauth`, `mcp:get-auth-status`) and receives sanitized status such as
signed-in, needs sign-in, or auth failed. Renderer code must not provide OAuth
target URLs, authorization endpoints, token endpoints, verifiers, state values,
tokens, refresh tokens, or client secrets over IPC. Main performs protected
resource metadata discovery, authorization server metadata discovery, dynamic
client registration when available, loopback callback handling, code exchange,
token refresh, and bearer header injection. OAuth access tokens, refresh tokens,
and client secrets use deterministic per-server secure-storage keys and must
never be stored in renderer settings or shown after save. `websocket` MCP auth
remains manual header/bearer unless an explicit compatible flow is added later.

Agent Mode may expose a model-callable `mcp_request_add` built-in tool that
creates a pending MCP add review only. The tool must not add servers directly,
edit `mcp-servers.json`, trust tools, or accept raw secret values. Catalogue
requests resolve only against the bundled Zura-owned catalogue; custom requests
must show the exact command or URL for user review. Main owns pending request
IDs and the reviewed payload. The renderer can resolve, approve, or cancel a
pending add through narrow request-ID-only channels (`mcp:resolve-add-request`,
`mcp:approve-add-request`, `mcp:cancel-add-request`). Approval adds the server as
enabled, untrusted, and approval-required, then connects only when required auth
or secrets are already satisfied. Discovered tools remain hidden from the model
until the user explicitly trusts the server/tools through the MCP review UI.

Settings -> MCP Servers -> Browse Library loads a bundled, curated, Zura-owned
MCP catalogue JSON in the renderer. The bundled catalogue should stay small
(currently 50 common installable entries), not mirror the full MCP registry.
Supported catalogue entries with complete config persist immediately as enabled,
untrusted MCP servers through the existing preload MCP bridge; users must still
explicitly connect them and must explicitly trust them before tools are exposed
to chat. Catalogue entries that require secrets must not persist placeholder
secrets; the catalogue card should collect required keys inline and persist them
through main-process secure storage as part of the add action. The catalogue must
not fetch remote catalogue metadata, must not introduce a main-process HTTP proxy
or IPC channel, and must leave unsupported registry transports (such as
streamable HTTP until implemented) visibly unavailable rather than silently
substituting another transport.

Scheduled tasks include a narrow `scheduled-tasks:set-extension-enabled` channel
that accepts only a boolean Reminders & Lookouts extension state from the
renderer settings runtime. Main uses this state to start/stop scheduling and to
reject scheduled-task mutations/runs while the extension is disabled.

Command Center is an internal Agent Mode OS overlay/capability that exposes
explicit Windows-native tool primitives through the existing `execute-tool` IPC
path rather than a broad new desktop API. Its tools are `system_active_window`,
`system_volume_get`,
`system_status`, `system_settings_open`, `system_theme_get`, `system_theme_set`,
`system_mute_set`, `system_volume_set`, `system_open_path`, and `window_snap`.
Read-only context tools return foreground-window, local machine status, or audio
state; mutating tools require the normal tool approval path. These tools are
Windows-only, gated by Agent Mode in renderer tool exposure, and implemented in main under
`electron/tools/os-integration/`. The root Command Center overlay is owned by
main through `electron/commandCenter.ts` and `electron/windows/commandCenterOverlay.ts`.
Its global shortcut is registered only after the renderer syncs Agent Mode state
through `command-center:set-extension-enabled`; leaving Agent Mode unregisters
the shortcut and hides the overlay. Direct overlay actions
are a fixed main-process allowlist (`snap-left`, `snap-right`, `maximize-window`,
`volume-30`, `volume-60`, `toggle-mute`, `system-status`, `toggle-theme`,
`clipboard-to-chat`, `focus-zuraai`, `settings-display`, `settings-sound`,
`settings-network`, `settings-bluetooth`, `open-downloads`) and must not accept
renderer-provided commands, paths, protocol URIs, shell strings, or arbitrary
tool names. Action aliases are search metadata only and must not affect the
main-process execution allowlist. Clipboard content may only be read for the
explicit `clipboard-to-chat` user action, is capped before chat handoff, and
must not be read as background context.
Command Center search uses narrow `window.commandCenter` bridge methods to read
a typed index of saved workflows, apps from the main-process
`appIndexService`, live top-level windows, fixed actions, and recent chats. The
app index service loads a non-secret persisted snapshot from
`app.getPath('userData')/command-center-app-index.json`, serves that snapshot
immediately on overlay open, refreshes Windows app data in the background from
`Get-StartApps`, query-specific `Get-StartApps -Name` lookups, and
Start Menu/Desktop shortcuts enriched with shortcut metadata where available,
and writes refreshed snapshots atomically. App indexing is warmed at app ready
and when Command Center is enabled; Start Menu/Desktop shortcut roots are watched
opportunistically for debounced background refresh. App icons are loaded lazily
through a bounded in-memory main-process cache so first overlay paint is not
blocked by icon extraction. The app index may return non-secret diagnostics
(`diagnostics.apps`) including stale state, source counts, refresh timing, and
sanitized errors so renderer UI can show app-index failures without exposing
arbitrary shell commands or renderer-supplied launch data. A narrow
`command-center:refresh-app-index` bridge exists only for explicit/manual app
index refresh.
Search execution passes typed item/workflow IDs and the current search query back
to main; main resolves those IDs against its own typed index to allowlisted
actions, shortcut/AppUserModelID app launches, exact `hwnd` window focus, or
chat-session promotion. Saved workflows
are non-secret userData JSON and may contain only typed OS/action/window/app
steps plus AI prompt steps; they must not store shell strings, unrestricted
paths, arbitrary tool names, or secrets. Workflow runs require an explicit
renderer confirmation before main execution. Overlay AI chats use the normal
chat providers, message model, streaming, and approval surfaces; the renderer
setting `commandCenterChatPersistence` controls whether overlay chats are
temporary until promoted or saved immediately, and `command-center:open-chat-session`
is the narrow bridge for opening a promoted overlay chat in the main ZuraAI chat
surface. The overlay may request only the fixed `search` or `chat` layout through
`command-center:set-layout`; main owns the actual BrowserWindow bounds so the
renderer cannot set arbitrary window geometry.
When the assistant is in Agent Mode, the renderer may expose existing app/window
tools for app discovery/launch and window focus
(`app_find`, `app_list`, `app_launch`, `window_list`, `window_focus`). Chat mode
may still open the fixed Command Center overlay and run its fixed direct action
allowlist, but must not expose model-callable OS tools through Command Center.
Freeform commands submitted from the overlay are routed through
`src/components/CommandCenterSettingsSync.tsx`, which adds active-window context
and switches the assistant to Agent Mode before queueing the message so the run
uses the Agent Mode OS tool surface. Do not include app install/uninstall, file
mutation, arbitrary window movement/close, or shell execution in that Command
Center exposure set without an explicit architecture update. The internal
Command Center capability has a code-owned
`src/prompts/defaultCommandCenterPrompt.ts` prompt shown read-only in Settings
-> System Prompt and injected while Agent Mode is active.

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
- Command Center is Windows-only, activated by Agent Mode, and provides active-window context plus narrow OS actions such as volume, OS-default path opening, and snap layouts. It must not become arbitrary shell execution, input simulation, clipboard scraping, or broad OS automation.
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
- Scheduled reminders/lookouts catch up overdue enabled tasks when the Reminders extension state is restored on startup or when the monitor runtime is rescheduled; the same overdue timestamp is launched only once per runtime.
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
