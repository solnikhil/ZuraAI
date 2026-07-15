# AGENTS.md - ZuraAI Agent Guide

This file is the source of truth for automated coding agents working in this repo.

**Hard requirement:** Whenever you change project architecture (new processes/windows, new IPC channels, new storage locations, new tool capabilities, new AI providers, release packaging assumptions, or meaningful data-flow changes), update the Architecture section in this same PR/commit.

---

## What This Project Is

ZuraAI is a desktop AI assistant built with **Electron + React + Vite + TypeScript**.

Core capabilities:

- Dashboard UI for chats, settings, models, extensions, MCP, memory, and reminders
- Multi-provider AI calls: Alibaba Cloud, ChatGPT Codex, Fireworks, Groq, NVIDIA NIM, Ollama, OpenRouter, OpenCode Go, DeepSeek
- Hardened renderer -> preload -> main IPC boundary
- Restricted tool system: built-in main-process tools, renderer-managed MCP tools, Agent Skills activation, artifacts, scheduled tasks, code execution, terminal, and Windows-native/Computer Use surfaces

---

## Quick Start

- Install: `bun install`
- Dev: `bun run dev`
- Tests: `bun run test`
- Tests watch: `bun run test:watch`
- Typecheck: `bun run typecheck`
- Build: `bun run build` (Windows installer/portable by default on Windows hosts)
- Build portable dir: `bun run build:dir`
- Build macOS: `bun run build:mac` / dir-only `bun run build:mac:dir` (requires a macOS host)
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
- If you add a built-in extension that changes assistant behavior, add `src/prompts/default<ExtensionName>Prompt.ts`, wire it through settings defaults/normalization, and inject it only when enabled. Built-in prompts are code-owned; do not add a Settings UI to edit them unless explicitly requested.

---

## Repo Map

| Path                                  | Purpose                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `electron/main.ts`                    | App lifecycle, IPC registration, windows, tray, updater, tool handlers                                    |
| `electron/preload.ts`                 | `contextBridge` surface and IPC allowlists; security boundary                                             |
| `electron/ipc/`                       | Main-process IPC handlers                                                                                 |
| `electron/windows/`                   | Main, About, tray, macOS menu, dev chat-debug windows                                                     |
| `electron/chatStore.ts`               | Chat index/session persistence under `app.getPath('userData')`                                            |
| `electron/secureStorage.ts`           | Encrypted key storage via Electron `safeStorage`                                                          |
| `electron/mcp/`                       | MCP server storage, connection lifecycle, transports, approvals, IPC                                      |
| `electron/tools/`                     | Main-process built-in tools: web search, files, shell, code execution, native Windows tools, Computer Use |
| `electron/providers/`                 | Main-only provider adapters with privileged auth/transport needs, including ChatGPT Codex OAuth           |
| `electron/monitors/`                  | Scheduled reminders/lookouts runtime and persistence                                                      |
| `electron/notifications/email/`       | Brevo transactional email for fixed notification flows                                                    |
| `electron/analytics/`                 | Opt-in PostHog analytics service and consent state                                                        |
| `electron/agentSkills/`               | Main-process Agent Skills discovery/activation/install service                                            |
| `src/App.tsx`                         | Renderer routing and shared shell layout                                                                  |
| `src/main.tsx`                        | Renderer bootstrap, first-paint setup, startup preloads                                                   |
| `src/components/`                     | UI surfaces: dashboard, settings, titlebar, dialogs                                                       |
| `src/contexts/`                       | Renderer state: settings, chat history, shell, streaming, quick-send                                      |
| `src/providers/`                      | Provider registry, runtime dispatch, capabilities, metadata                                               |
| `src/services/`                       | Provider HTTP integrations and stream parsers                                                             |
| `src/tools/`                          | Shared tool definitions, adapters, executor, MCP registry                                                 |
| `src/skills/`                         | Built-in extension catalog and settings normalization/migration                                           |
| `src/agentSkills/`                    | Agent Skills shared types and compact prompt catalog                                                      |
| `src/mcp/`                            | Shared MCP contracts and renderer context                                                                 |
| `src/prompts/`                        | Code-owned prompt defaults                                                                                |
| `dist/`, `dist-electron/`, `release/` | Generated build outputs; do not hand edit                                                                 |
| `packages/zuraai/`                    | npm package for the `zuraai` terminal launcher; opens the desktop app through registered local protocols  |

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
- Agent approval overlay: separate small frameless always-on-top `BrowserWindow` owned by main for Agent Mode tool-call approvals while ZuraAI is not focused. It loads sanitized inline approval HTML only, resolves approve/reject/always-allow-exact-repeat decisions back to the requesting renderer, and does not execute tools or expose general desktop APIs.
- Unknown renderer routes render the dedicated 404 view.
- Renderer-backed windows deny all in-window navigation and new-window creation. Explicit HTTP(S)
  links may open only through the OS browser; development-server URLs are recognized by exact
  origin rather than string prefix, and non-HTTP protocols are never forwarded.
- Packaged app registers `zuraai` for terminal/app-launch handoff and `zura-chat` for trusted local chat deep links. `zuraai://open` may only focus/create the main window. Debug and CLI chat references keep the shape `zura-chat://<sessionId>?userData=<base64urlUserData>`; session-only links open/switch to that chat, while continuation links may include `message=` or `messageBase64=`. CLI-created new-chat links may include `createIfMissing=1`, but must still pass the userData path validation before the renderer creates a new chat and sends the message.

Platform chrome:

- **Windows:** frameless main window with acrylic `backgroundMaterial`, custom title bar + window controls in the renderer, CSS resize handles.
- **macOS:** `titleBarStyle: 'hidden'` with native traffic lights (`trafficLightPosition`), sidebar `vibrancy`, application menu from `electron/windows/applicationMenu.ts`, and a renderer drag region + sidebar controls (no custom traffic-light buttons). Double-clicking the Mac drag region toggles zoom/maximize through `window.windowControls`. About window uses `titleBarStyle: 'hiddenInset'`. Red traffic light / window close **hides** the main window to the Dock unless `setAppQuitting(true)` was set from `before-quit` (Cmd+Q, menu Quit, tray Quit); dock `activate` shows or recreates the main window. Tray icons on macOS use a black+alpha **template** image (`public/trayTemplate.png` / `build/trayTemplate.png`) so the menu bar can invert for light/dark.

Memory / performance:

- The main window uses `backgroundThrottling: true` so Chromium can idle when unfocused.
- Chat index embeds at most a thin recent tail (`RECENT_TAIL_SIZE` ≈ 20 messages) with images/tool payloads stripped; full history lives in per-session files and is loaded in a window (`SESSION_WINDOW_SIZE` ≈ 80) on open. Older messages load on demand (scroll-top / “Load earlier”). Inactive sessions prune to **empty** message arrays (metadata only).
- Chat message list is **virtualized** (`VirtualMessageList` / react-virtuoso).
- Usage settings use `chat-store:get-usage-sessions` (slim message fields only), not `chat-store:get-all`.
- MCP manager initializes without auto-connect on the critical path; auto-connect servers connect after the main window is visible via deferred startup.
- Markdown/Prism preloads only a small core language set; extra languages register on first use.

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
- Chat index `recentMessages` are compact text-only previews (no base64 images, toolResults, thinkingBlocks, or agentRun payloads)
- Tool media files under `tool-media/{sessionId}/` for externalized Computer Use / UI automation screenshots referenced from chat messages via `mediaRef` (`tool-media:{sessionId}/{file}`)
- Conversation summaries and assistant run metadata on chat messages
- MCP server metadata, runtime metadata, and non-secret config
- Secure-storage JSON encrypted through `safeStorage`
- Memories and memory summaries
- Scheduled task definitions, lookout snapshots, reminder logs, and run history
- Non-secret installed-app discovery snapshot (`app-index.json`) used only by agent app tools
- Analytics consent/install metadata
- Dev-only chat diagnostics JSONL
- Artifact export files for external opening

Secrets:

- API keys and MCP secrets live in `electron/secureStorage.ts`.
- Stored provider keys include OpenRouter, Groq, Alibaba, Fireworks, DeepSeek, OpenCode Go, NVIDIA, Tavily, and Brevo.
- ChatGPT Codex access and refresh tokens are stored as one encrypted main-only `chatGptCodexOAuth` bundle. The renderer can request sign-in/sign-out and receive only `{ signedIn: boolean }`; tokens, account IDs, OAuth codes, PKCE values, and endpoint parameters never cross IPC.
- The renderer may read secret presence and may replace a secret, but cannot read or reveal stored values. Provider calls resolve credentials in main.
- `safeStorage` is required for secret reads/writes. Do not add plaintext secret persistence fallback.

### IPC Surface

The renderer never imports Electron APIs directly.

All renderer-invokable main handlers must register through
`electron/ipc/trustedIpc.ts` rather than raw `ipcMain.handle`. The shared guard
rejects requests unless they originate from the top frame of a live ZuraAI
`BrowserWindow` whose URL is either the exact development-server origin or the
exact packaged `dist/index.html` entry. Subframes, unknown/destroyed windows, origin
lookalikes, other local files, and non-HTTP(S) remote documents are rejected
before channel-specific code runs. Tests for individual handler behavior may
mock the shared registration wrapper, but `trustedIpc.test.ts` must exercise the
real rejection boundary.

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
- `window.agentApproval`
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
- `window.providerRuntime`

`window.windowControls.setAppearance(...)` uses the narrow
`window-controls:set-appearance` channel to synchronize the caller's native
window backdrop (`solid` or `acrylic`) with Electron's validated `light`,
`dark`, or `system` native theme source. The renderer cannot provide arbitrary
materials, colors, window IDs, or native options. On Windows, main applies the
material only to the sender's `BrowserWindow`; the native theme source remains
app-wide so Electron-owned UI and other app windows use the same appearance.

If you add, rename, or remove an IPC channel:

1. Add/update the preload allowlist or dedicated bridge.
2. Add/update `src/electron.d.ts`.
3. Register/dispose the main handler.
4. Validate all renderer input in main.
5. Update this Architecture section.

`tool-media:load` is a narrow channel that accepts only a `mediaRef` string of the form
`tool-media:{sessionId}/{fileName}` and returns a data URL (or null). Main resolves the
ref against `app.getPath('userData')/tool-media` only; the renderer must never supply
filesystem paths. Session delete also removes that session's tool-media directory.

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
Scheduled tasks support `reminder`, `web_lookout`, and `ai_automation`. AI
automations are persisted in `scheduled-tasks.json` with sanitized prompt,
schedule, context-source metadata, output destinations, approval mode, notify
policy, allowed tools, and run-budget fields; provider keys and tool/MCP
secrets are never stored there. Main owns timing, catch-up, notifications,
email delivery, run logs, and the narrow `scheduled-tasks:automation-run-request`
/ `scheduled-tasks:resolve-automation-run` bridge. Renderer code creates a new
background chat session for every AI automation run, writes the scheduled prompt
as the user message, streams the assistant response into that chat through the
existing settings, provider runtime, MCP, tool exposure, and approval surfaces,
then returns sanitized run output, metadata, and the per-run chat session ID to
main. The automation chat is visible in chat history but must not steal focus or
switch the active conversation. If no renderer is available, main records an
error run and reschedules normally rather than inventing or silently skipping
output. Agent automation run budgets are enforced in the shared tool execution
policy for web searches and total tool calls, in addition to the automation run
timeout owned by main.

### Desktop OS Integration

Agent Mode exposes narrow, main-owned desktop primitives through the existing `execute-tool` IPC path. Retained cross-platform tools include `system_active_window`, `system_status`, `system_settings_open`, `system_open_path`, and `window_snap`; Windows also exposes the existing bounded app, window, filesystem, UI Automation, and Computer Use tool sets. Mutating actions continue through normal approval policy. These tools are assistant capabilities only: there is no global launcher overlay, global shortcut, direct-action palette, renderer-provided path/URI/command execution, or background clipboard context.

Installed-app discovery used by `app_find`, `app_list`, and `app_launch` remains main-owned in `electron/appIndexService.ts`. Its non-secret snapshot is stored as `app-index.json` under `app.getPath('userData')`; Windows and macOS refresh from bounded platform-owned application sources, and the renderer/model never provides launch authority. The service may use local launch counts and platform usage metadata for app ranking, but no raw launcher queries or search-learning HMAC data are collected.

The removed Command Center architecture included a second renderer/window, global shortcuts, workflows, Windows Search helper, emoji insertion, search learning, the manifest-based Zura Store extension runtime, and GitHub Workspace. Their IPC/preload bridges, packaged resources, CLI authoring commands, OAuth/token storage, repository storage, and extension storage are no longer part of the application. Existing orphaned files from older installations are not read or migrated.

### Provider Network Boundary

- Production provider chat streams, lightweight title/memory generations, authenticated model catalogs, connectivity checks, and Ollama discovery run in main through `window.providerRuntime`.
- `provider-runtime:start` streams sanitized events tagged by an opaque request ID. `provider-runtime:generate` and `provider-runtime:list-models` are bounded operations; `provider-runtime:cancel` can cancel only a request owned by the calling renderer. ChatGPT account actions are narrow, argument-free `provider-runtime:codex-sign-in`, `provider-runtime:codex-auth-status`, and `provider-runtime:codex-sign-out` channels.
- Main resolves provider credentials immediately before the request. Provider keys never appear in provider runtime requests, events, catalog results, or renderer settings.
- Ollama URLs are restricted in main to loopback HTTP(S) addresses without credentials, query strings, or fragments. Alibaba endpoints are selected from the fixed Singapore, US (Virginia), and China (Beijing) regional allowlist.
- There is no provider HTTP proxy or renderer CORS bypass. Do not add arbitrary URLs, headers, or methods to the provider runtime bridge.
- ChatGPT Codex is a main-only OAuth/HTTP exception. An explicit Settings click starts a five-minute PKCE browser flow using the fixed OpenAI Codex public client, a loopback-only callback on port 1455, exact state validation, and OS-encrypted token persistence. The transport uses Vercel AI SDK 7 plus `@ai-sdk/openai`, rewrites only `POST https://api.openai.com/v1/responses` to the fixed `https://chatgpt.com/backend-api/codex/responses` endpoint, strips unsupported `metadata`/`max_output_tokens`, sets `store: false`, injects account auth in main, disables SDK retries, and rejects every other URL/method. Account-aware models come only from the fixed `/backend-api/codex/models` endpoint. This unofficial subscription path is for local/personal use, supports text/reasoning only in ZuraAI, receives no Zura tool definitions, and must not become a broad ChatGPT proxy or second tool-execution loop.

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
- Computer Use is Windows-only, default disabled, current-desktop only. Screenshot/list-window capture uses Electron desktop APIs, while click/type/key/scroll/cursor actions use a fixed main-process User32 PowerShell helper with validated coordinates and allowlisted virtual keys. Do not reintroduce a separate virtual desktop mode, `agent_desktop` settings, or `agent-desktop:*` IPC.
- Desktop OS integration is an Agent Mode tool capability, not a launcher surface. It provides active-window context plus narrow OS actions such as OS-default path opening and snap layouts. macOS integration uses bounded code-owned platform calls and never accepts script source from the renderer. It must not become arbitrary shell execution, background clipboard scraping, or broad unapproved OS automation.
- Agent Mode UI automation is Windows-only and uses a model-facing `ui_*` tool family over the existing restricted `execute-tool` IPC path. `ui_get_app_state` is the primary observation primitive and returns a screenshot, active-window metadata, a compact Microsoft UI Automation accessibility tree, stable main-owned `element_id` values, supported actions, bounds, and truncation metadata. `ui_find` searches the latest/requested state, and `ui_wait_for` waits for bounded UI conditions. Mutating `ui_click`, `ui_type_text`, `ui_set_value`, `ui_select`, `ui_scroll`, `ui_focus`, and `ui_key` require approval and return fresh state after execution. Element IDs are opaque, cached only in main, and should be preferred over coordinate actions; coordinate-based `computer_*` tools remain fallback/legacy Computer Use primitives.
- MCP resources and prompts are user-visible browsing/preview surfaces only; do not merge them into model-callable tools without an explicit architecture update.

### Providers

- Provider metadata/capabilities live in `src/providers/providerRegistry.ts`.
- Shared runtime dispatch lives in `src/providers/providerRuntime.ts`.
- Platform-neutral contracts, typed errors, strict tool validation, and lossless usage aggregation live in the private `packages/provider-core` package.
- Provider service files own request shaping and stream parsing only.
- The ChatGPT Codex adapter lives in `electron/providers/codexProvider.ts` because OAuth credentials, refresh serialization, fixed-host request rewriting, and account headers are main-only concerns. It is intentionally excluded from renderer/shared HTTP dispatch and from the platform-neutral provider SDK package.
- SSE providers use `eventsource-parser` and fail visibly on malformed events; NDJSON parsing also fails rather than dropping malformed records.
- Only native provider tool calls are executable. XML/DSML-like text is stripped from display and logged for diagnostics, but is never repaired into a tool call.
- Tool arguments are parsed once and validated with Ajv against the complete declared JSON Schema before execution. Do not coerce, remove, or invent arguments.
- Usage aggregates every model round (including tool/research rounds) without dropping cache, image, audio, cost, or request-count fields. Estimated usage must be marked `estimated`.
- Alibaba's picker is a small versioned catalog derived from documented models; never scrape private Model Studio page payloads or send a credential to a documentation page.
- New providers must define auth, model enablement, capabilities, title/memory support, streaming behavior, and storage/secrets boundaries explicitly.
- Do not hardcode real model IDs/names in runtime dispatch. A documented, dated curated catalog may contain model IDs when the provider has no supported model-list endpoint. Tests should otherwise use clearly fake IDs.
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

- Artifacts live on their source chat session (`ChatSession.artifacts`). Do not add a separate artifact store or main-process artifact mutation API; external open is the only artifact IPC path. Artifact external open writes a generated file under `app.getPath('userData')/artifact-exports`; on macOS, main may show a native `.app` picker and launch the selected app with that generated file only.
- Folder `memoryMode` is selected when a folder is created and controls project memory scope: `default` includes global plus folder memories, while `folder-only` excludes global memories for chats in that folder.
- Settings -> Extensions -> Memory lists global and folder-scoped background memories together, labels folder-scoped memories with folder metadata, and provides a project-memory filter.
- Scheduled web lookouts may fetch public `http`/`https` URLs and local loopback hosts only. Keep private LAN URLs rejected.
- Scheduled reminders/lookouts catch up overdue enabled tasks when the Reminders extension state is restored on startup after a one-shot startup delay of about three minutes, or immediately when the monitor runtime is rescheduled later; the same overdue timestamp is launched only once per runtime.
- Email notification settings in renderer are non-secret preferences only. `brevoApiKey` stays in secure storage, and the renderer must not send arbitrary email bodies over IPC.
- Analytics is opt-in only. Main sanitizes events and must never accept prompts, responses, file paths, clipboard data, API keys, MCP payloads, or conversation content.
- Discord RPC is always-on in main and lazy-requires `discord-rpc`; missing optional native dependencies must not crash the app.

---

## Build & Release

### Desktop Release

- Packaging uses `electron-builder` (`package.json#build`).
- ChatGPT Codex uses JavaScript-only `ai` and `@ai-sdk/openai` dependencies; no Codex executable or platform-specific `@openai/codex-*` package is shipped or unpacked.
- `npmRebuild` is `false`; packaging should use installable/prebuilt native dependencies and should not require local Visual Studio Build Tools just to rebuild optional native dependencies.
- `package.json#build.electronDist` points at `node_modules/electron/dist`; Windows packaging copies the installed Electron distribution instead of unpacking Electron from the builder cache.
- `bun run build` emits Windows installer and portable artifacts, then writes `release/checksums.txt`.
- `bun run build:mac` emits macOS DMG/zip artifacts (arm64 + x64) on a macOS host, then writes `release/checksums.txt`. Notarization/signing with an Apple Developer ID is a separate ops step (env credentials only; never commit certs or passwords).
- Build outputs are gitignored under `dist/`, `dist-electron/`, and `release/`.
- Auto-updater is production-only in `electron/updater.ts`.
- GitHub publishing is configured for `solnikhil/ZuraAI`; update `package.json#build.publish` if packaging from a fork.
- Windows packaging uses the NSIS wizard installer with install-directory selection. The selected directory is the final install path; do not force an extra `\ZuraAI` subfolder.
- macOS packaging uses `public.app-category.productivity`, hardened runtime enabled, and `gatekeeperAssess: false` until notarization is wired.
- Installer assets (`build/icon.ico`, `build/sidebar.bmp`, `build/icon.png`, optional `build/icon.icns`, tray template) are generated by `scripts/generate-icons.mjs`. The `build/` directory is gitignored; `public/trayTemplate.png` is generated for macOS menu-bar template icons in dev.

Windows artifacts:

- `ZuraAI-Setup-{version}.exe`
- `ZuraAI-Setup-{version}.exe.blockmap`
- `ZuraAI-Portable-{version}-x64.exe`
- `latest.yml`
- `checksums.txt`

macOS artifacts:

- `ZuraAI-{version}-mac-arm64.dmg` / `.zip`
- `ZuraAI-{version}-mac-x64.dmg` / `.zip`
- `checksums.txt`

### npm Package

- `zuraai` is the npm package for the macOS/Windows terminal launcher.
- It exposes the `zuraai` bin, includes only the launcher script plus README/package metadata, and points to `https://zuraai.in`.
- `zura` is not available on npm (`zura@6.6.7` was already published by another owner when checked).

Launcher publish checklist:

1. Keep npm package small; do not embed Electron binaries.
2. Align package version with GitHub app release tag (`0.0.6` -> `v0.0.6`).
3. Upload desktop artifacts and `checksums.txt` to GitHub first.
4. Run `cd packages/zuraai && npm pack --dry-run --json`.
5. Publish with `npm publish --access public`.
6. If using a token, pass it through the environment for one command; never commit `.npmrc` tokens.
7. Verify `bunx zuraai --version`, `bunx zuraai --help`, and `npm view zuraai name version homepage description bin --json`.

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
- The npm launcher opens installed desktop apps through registered local protocols; it does not install the Electron app itself.
