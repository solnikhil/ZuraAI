# AGENTS.md — ZuraAI Agent Guide

This file is the single source of truth for how an automated coding agent should work in this repo.

**Hard requirement:** Whenever you change the project architecture (new processes/windows, new IPC channels, new storage locations, new “tool” capabilities, new AI providers, or meaningful data-flow changes), **update the “Architecture” section of this file in the same PR/commit**.

---

## What This Project Is
 ZuraAI is a desktop AI assistant built with **Electron + React + Vite + TypeScript**.

Core capabilities:
- Dashboard UI (chat history, settings, model selection)
- Multi-provider AI calls (Alibaba Cloud, Fireworks, Groq, Ollama, OpenRouter, Perplexity)
- Hardened IPC boundary (renderer ↔ preload ↔ main)
- Tool calling system (restricted; built-in `web_search` in main process, plus renderer-managed MCP tool exposure)

---

## Quick Start (Agent Commands)
- Install: `bun install`
- Dev: `bun run dev`
- Tests: `bun test`
- Tests (watch): `bun run test:watch`
- Build (typecheck + Vite build + electron-builder): `bun run build`
- Build portable dir: `bun run build:dir`
- Preview renderer bundle: `bun run preview`

**Prereqs:** Bun `>= 1.1`, Node.js `>= 18` (required by Electron at runtime).

---

## Key Concepts (Read First)
- The **renderer is untrusted**. Anything privileged must be implemented in the **main process** and exposed via a **narrow, allowlisted** IPC surface.
- The app uses a **primary BrowserWindow** for the main app plus a dedicated **About window**. Main-app renderer routes live inside the primary window (`#/dashboard`, `#/settings`, `#/chat`) under a shared shell layout, while `#/about` is rendered in the separate utility window.
- The app now also supports an optional **Overlay window**. `#/overlay` renders in its own always-on-top frameless `BrowserWindow` and reuses the standard chat/runtime stack rather than introducing a second assistant runtime.
- Persistence is split:
  - **Sanitized non-secret settings + UI state** live in renderer `localStorage`.
  - **API keys and MCP secrets** live in main-process secure storage and are hydrated/resolved at runtime.
  - **Chat history, MCP server metadata, and secure storage** live in the main process under `app.getPath('userData')`.
- UI styling guardrail: keep settings cards, chat composer containers, and dropdown/menu surfaces flat. Do **not** reintroduce outer drop shadows on those surfaces unless the user explicitly asks for them.

---

## Repo Map
- `electron/` — Electron **main process** + preload + IPC handlers
  - `electron/main.ts` — app lifecycle, IPC registration, tray, windows, updater, tool handlers
  - `electron/preload.ts` — **contextBridge** API + IPC allowlists (security boundary)
  - `electron/ipc/` — `ipcMain` handlers (chat store, secure storage, system actions)
- `electron/startup/` — deferred startup orchestration and startup metrics
- `electron/windows/` — main window, tray
- `electron/windows/overlayWindow.ts` — Overlay window creation/reuse, compact/expanded state, display-aware positioning, and shortcut-backed lifecycle
- `electron/windows/promptPopup.ts` — optional lightweight cursor-position prompt popup route/bridge that can submit to the overlay and dismisses on blur/Escape
- `electron/chatStore.ts` — chat history persistence (JSON under `app.getPath('userData')`)
- `electron/mcp/mcpConnection.ts` — MCP initialize/tool-discovery connection orchestration
- `electron/mcp/mcpManager.ts` — MCP server registry, runtime state aggregation, connection lifecycle coordination, and cache/persistence orchestration across the extracted MCP manager helper modules
- `electron/mcp/mcpManagerState.ts` — MCP manager clone/state helpers plus persisted runtime-metadata diffing
- `electron/mcp/mcpManagerPolicies.ts` — MCP manager exposure policy helpers, tool allow/block enforcement, and namespaced-tool collision handling
- `electron/mcp/mcpManagerUtils.ts` — MCP manager cache-key helpers and shared input normalization utilities
- `electron/mcp/index.ts` — MCP IPC registration, singleton manager access, and renderer state broadcasts
- `electron/mcp/mcpStorage.ts` — MCP server metadata persistence + secret resolution helpers
- `electron/secureStorage.ts` — encrypted key storage via `safeStorage` (JSON under `userData`)
- `electron/mcp/transports/` — MCP transport foundation primitives and concrete transport implementations
- `electron/tools/` — main-process tool implementations (IPC registry is restricted)
  - `electron/tools/web-search/` — built-in web-search intent classification, backend adapters (Tavily / DuckDuckGo), result normalization, and orchestration service
- `electron/updater.ts` — auto-updater (production only)
  - `electron/tools/code-execution/` — built-in code execution skill: Piston API service, approval manager, IPC registration, types, and constants


- `src/` — React/Vite **renderer**
  - `src/main.tsx` — renderer entrypoint; initializes performance tracking, lazy-image styles, applies saved theme, mounts `App`, and schedules non-critical preloads after first paint
- `src/App.tsx` — routes (`#/dashboard`, `#/settings`, `#/chat`) under `AppShellLayout`, plus wildcard `*` fallback to a dedicated 404 renderer view
- `src/components/OverlayView.tsx` — compact overlay chat surface for the dedicated `#/overlay` route
- `src/components/OverlaySync.tsx` — renderer-side bridge that syncs persisted overlay settings into the trusted main-process Overlay runtime
- `src/components/PromptPopupView.tsx` — lightweight prompt input surface for the dedicated `#/prompt-popup` route; auto-focuses, submits via prompt-popup IPC, dismisses on Escape
- `src/contexts/` — app state (split settings contexts, chat history, app shell, quick-send)
- `src/components/AppShellLayout.tsx` — shared renderer shell (title bar, command palette, resize handles, solid shell surfaces, global context menu via AppContextMenu)
- `src/contexts/appShellNavigation.ts` — pure renderer-side app-shell history model for titlebar back/forward navigation, mouse-button navigation, and shell-state snapshot deduping
- `src/components/AppContextMenu.tsx` — global right-click context menu (copy/paste/cut, undo/redo, select all, open link, inspect element)
- `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts` — primary dashboard chat pipeline (streaming + tools)
- `src/components/Dashboard/ChatArea/hooks/chatProviderRuntime.ts` — thin compatibility wrapper over the shared provider registry for dashboard chat provider normalization/tests
- `src/components/Dashboard/ChatArea/hooks/streaming/providerStreamClient.ts` — normalized provider stream client adapters that convert provider chunks into shared streaming events
- `src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts` — shared streaming orchestrator for send/regenerate flows, tool loops, reasoning blocks, and final commits
- `src/providers/` — provider registry, capabilities/auth metadata, endpoint defaults, retry policy, centralized provider runtime adapters (`providerRuntime.ts`), shared provider-runtime contracts (`providerRuntimeTypes.ts`), and shared streaming/title/model constants
- `src/utils/rendererPerformance.ts` — renderer-local performance tracker used for TTI-aware lazy loading
- `src/utils/startupPreloads.ts` — deferred startup preload scheduler for non-critical settings and markdown chunks
- `src/services/` — AI provider integrations (HTTP calls; streaming + non-streaming)
- `src/services/streamUtils.ts` — shared SSE (`parseSSEStream`) and NDJSON (`parseNDJSONStream`) stream parsing utilities used by all providers; SSE parsing accepts `data:` with/without spaces, CRLF framing, multi-line payloads, and terminal flushes
- `src/skills/` — built-in skill catalog + settings normalization/migration + skill/tool gating helpers
- `src/mcp/` — shared MCP contracts, draft helpers, and renderer MCP runtime/settings context
- `src/components/Settings/sections/McpSection.tsx` — MCP Settings UI for server CRUD, secret-masked forms, and connect/disconnect controls
- `src/components/Settings/sections/OverlaySection.tsx` — Overlay settings UI for enablement, startup behavior, sizing, and global shortcut configuration
- `src/tools/` — shared built-in tool manifest (`builtinTools.ts`), tool schema + adapters + runtime tool registry/execution coordinator
  - `src/tools/adapters/openrouterToolCalls.ts` — provider-agnostic OpenRouter tool-call parsing, JSON repair, and fallback query inference shared by OpenRouter-compatible adapters

- `dist/` — renderer build output (generated)
- `dist-electron/` — electron build output (generated)

---

## Architecture

### High-Level Diagram

```
+------------------------+          +---------------------------+
|   Renderer (Vite/React)|          |   Electron Main Process    |
|  src/*                 |          |  electron/*                |
|                        |          |                           |
|  - UI (Dashboard)      |          |  - windows/ (main)         |
|                        |          |  - tray                    |
|  - AI providers (HTTP) |          |  - chatStore (userData)    |
|  - Tool manager        |          |  - secureStorage (userData)|
|                        |          |  - window controls + IPC   |
|    window.ipcRenderer  |          |  - updater (prod only)     |
+-----------^------------+          +------------^--------------+
            |                                     |
            | contextBridge (preload)             | ipcMain handlers
            v                                     v
+------------------------+
| Preload (electron/*)   |
| electron/preload.ts    |
| - allowlisted IPC only |
| - exposes safe APIs:   |
|   ipcRenderer,         |
|   appInfo,             |
|   secureStorage,       |
|   updater,             |
|   windowControls       |
+------------------------+
```

### Windows & Routing
- **Main Window** (`electron/windows/mainWindow.ts`)
  - Loads `#/dashboard` (HashRouter)
  - `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
  - Windows uses a hidden title bar with **renderer-driven window controls** (`window.windowControls.*`), with native `titleBarOverlay` disabled and a solid background path for stable compositor behavior
  - Global right-click context menu is handled via a **React/Radix UI context menu** (`src/components/AppContextMenu.tsx`) wrapped around the app shell, providing copy/paste/cut, undo/redo, select all, open link in browser, and inspect element (dev only) actions
  - External links are opened via `shell.openExternal` through the `window.shell.openExternal` IPC bridge

- **About Window** (`electron/windows/aboutWindow.ts`)
  - Loads `#/about` in its own `BrowserWindow`
  - Opens from the titlebar info menu via `window.appInfo.openAboutWindow()` → `app-info:open-about-window`
  - Uses the shared preload bridge, native OS window chrome, fixed utility-window sizing, `skipTaskbar: true`, and `sandbox: true`

- **Overlay Window** (`electron/windows/overlayWindow.ts`)
  - Loads `#/overlay` in its own dedicated `BrowserWindow`
  - Windows-first overlay surface: frameless, `alwaysOnTop`, `skipTaskbar`, non-click-through, and positioned against the active display `workArea`
  - Reuses the shared preload bundle plus a dedicated `window.overlay` bridge for lifecycle actions
  - Supports compact and expanded bounds, hide/show/toggle behavior, and display-metrics repositioning
  - Opens from explicit UI entry points plus the global Overlay shortcut; the shortcut now opens the Overlay directly at the cursor position in expanded mode (single-step flow)
  - Close/hide behavior is controlled in main rather than the untrusted renderer

- **Prompt Popup** (`electron/windows/promptPopup.ts`)
  - Loads `#/prompt-popup` in its own dedicated frameless `BrowserWindow`
  - Lightweight cursor-position prompt input surface for optional prompt-only entry flows
  - Appears at cursor position, auto-focuses the text input, and submits the prompt to the overlay via main-process relay
  - On submit, hides the popup, opens/creates the overlay window at the cursor position, and sends the prompt text to the overlay renderer via `overlay:pending-prompt`
  - Dismisses on Escape key or window blur (click outside); the popup is never truly closed by the user — only hidden or destroyed on app quit
  - Reuses the shared preload bundle plus a dedicated `window.promptPopup` bridge

- **Dev vs prod loading**
- In dev, windows load `${process.env.VITE_DEV_SERVER_URL}#/...`
- In prod, windows load `dist/index.html` with the target route hash (`dashboard`, `about`, `overlay`, etc.)

- **Renderer route fallback**
- `src/App.tsx` defines `Route path="*"` to render the `NotFound404` component (`src/components/ui/demo.tsx`) for unknown hash routes.
 - Standalone utility routes outside `AppShellLayout` currently include `#/about`, `#/overlay`, and `#/prompt-popup`.

- **Shared shell layout**
  - `src/App.tsx` wraps `/`, `/dashboard`, `/settings`, and `/chat` in `AppShellLayout`
  - `src/components/AppShellLayout.tsx` owns the title bar, command palette, Windows resize handles, and route-level shell behavior
  - `AppShellLayout` now passes the active router pathname into `AppShellProvider`, which maintains a renderer-local shell history across pathname changes plus in-shell `dashboardView` / settings-section transitions for the titlebar back/forward controls
  - `/` is a dashboard alias
  - `/about` is intentionally outside `AppShellLayout` and renders a standalone About window surface (`src/components/AboutWindow.tsx`)

### Windows Installer Packaging
- Windows packaging uses `electron-builder` + NSIS **wizard installer** (`oneClick: false`) with install-directory selection enabled via `allowToChangeInstallationDirectory: true`, plus a repo-local include override at `installer/installer.nsh`.
- The installer uses the directory the user selects as the **final install path** for app files; it does not force an extra `\ZuraAI` subfolder when the user picks a custom location.
- The installer applies Windows dark mode APIs (DWM dark title bar, `SetPreferredAppMode(ForceDark)`, `SetWindowTheme("DarkMode_Explorer")`, `SetCtlColors`) for a dark-themed install experience.
- Personalized install: greets the user by Windows username, shows branded progress messages, and dark-themes the wizard chrome plus visible controls (including progress bar, details listbox, and buttons).
- Installer assets (`build/icon.ico`, `build/sidebar.bmp`) are generated at build time by `scripts/generate-icons.mjs` and are gitignored.
- Build output goes to `release/` directory (gitignored). Installer artifact: `ZuraAI-Setup-{version}.exe`.

### CORS Bypass (Main Process)
There is currently no active CORS-bypass header injection in `electron/main.ts`.

If a new provider lacks CORS headers and renderer `fetch()` is blocked, add a narrowly scoped `session.defaultSession.webRequest.onHeadersReceived` handler in main process for that provider domain only.

### IPC Surface (Security-Critical)
The renderer never imports Electron APIs directly; it uses what preload exposes.

- IPC bridge and allowlists live in `electron/preload.ts`.
- `window.ipcRenderer` is a **restricted wrapper** around `ipcRenderer`.
- `window.windowControls` is a **separate dedicated bridge** exposed from preload for minimize / maximize / close state, rather than part of the generic `window.ipcRenderer` allowlists.

**Allowlisted channels (as implemented today):**
- `INVOKE_CHANNELS`:
  - `chat-store:get-all`, `chat-store:save-all`, `chat-store:migrate`, `chat-store:get-all-folders`, `chat-store:save-folders`
  - `secure-storage:get`, `secure-storage:set`, `secure-storage:get-all`
  - `execute-tool`
  - `window-resize`
  - `updater:check-for-updates`, `updater:quit-and-install`, `updater:get-version`
- `ON_CHANNELS`:
  - `update-available`, `update-downloaded`

**Dedicated preload bridges (not part of `window.ipcRenderer` allowlists):**
- `window.windowControls`
  - invokes: `window-controls:minimize`, `window-controls:toggle-maximize`, `window-controls:close`, `window-controls:is-maximized`
  - listens for: `window-controls:state`
- `window.appInfo`
  - invokes: `app-info:get`, `app-info:open-about-window`
- `window.overlay`
  - invokes: `overlay:show`, `overlay:hide`, `overlay:toggle`, `overlay:expand`, `overlay:collapse`, `overlay:get-state`, `overlay:focus-main-window`, `overlay:apply-settings`
  - listens for: `overlay:pending-prompt`
- `window.promptPopup`
  - invokes: `prompt-popup:show`, `prompt-popup:hide`, `prompt-popup:submit`
  - listens for: `prompt-popup:focus`
- `window.shell`
  - invokes: `shell:open-external` (opens URLs in default browser; only http/https allowed), `clipboard:read-text` (reads plain text clipboard content from trusted main process)
- `window.devTools`
  - invokes: `devtools:inspect-element` (development only; opens DevTools element inspector)
- `window.mcp`
  - invokes: `mcp:list-servers`, `mcp:add-server`, `mcp:update-server`, `mcp:remove-server`, `mcp:connect-server`, `mcp:disconnect-server`, `mcp:get-state`, `mcp:list-tools`, `mcp:list-resources`, `mcp:read-resource`, `mcp:list-prompts`, `mcp:get-prompt`, `mcp:execute-tool`, `mcp:resolve-approval`
  - listens for: `mcp:state-changed`

**Important:** IPC handlers may exist in `electron/ipc/*` but are not reachable unless they’re also wired through preload allowlists or a dedicated preload bridge.
- `window.codeExecution`
  - invokes: `code-execution:resolve-approval`
  - listens for: `code-execution:pending-approval`


**If you add/rename any IPC channel:**
1. Add it to the correct allowlist(s) in `electron/preload.ts`
2. Add/adjust types in `src/electron.d.ts` (if exposed on `window.*`)
3. Implement/register handlers in `electron/ipc/*` (or other main modules)
4. Validate all inputs in main process (treat renderer as untrusted)

### Key Runtime Flows

#### Startup + Shell Initialization
- Main-process startup uses `electron/startup/deferredInit.ts` to defer non-critical work until the main window is visible.
- Current deferred tasks include delayed React DevTools install in development and deferred auto-updater initialization after first paint.
- Main-process startup also denies Chromium permission requests/checks on the default session and relies on explicit IPC bridges plus `shell.openExternal` for outbound navigation instead of granting renderer permissions.
- Renderer context-menu paste now uses a clipboard read fallback via `window.shell.readClipboardText()` → `clipboard:read-text` when direct `navigator.clipboard.readText()` is unavailable/blocked.
- MCP startup integration now registers `electron/mcp/index.ts` handlers during `app.whenReady()`, initializes the singleton MCP manager with renderer-facing client info, and auto-connects only servers where both `enabled` and `autoConnect` are true.
- App shutdown now performs an MCP disconnect pass before quit completes so managed transports can exit cleanly.
- Overlay startup now initializes the dedicated overlay runtime in main, keeps shortcut registration and display listeners on the trusted side, and relies on renderer-synced `settings.overlay` values instead of a new storage file.
- The global Overlay hotkey opens the Overlay window directly at the cursor position in expanded mode (single-step flow).
- Prompt Popup remains available as an optional path; submitting from it opens the Overlay at the cursor position and sends the prompt text via `overlay:pending-prompt`.
- `OverlaySync` runs inside the shared provider tree and mirrors persisted `settings.overlay` values into the trusted overlay runtime through the dedicated preload bridge. If startup auto-open is enabled, the main window renderer triggers the initial overlay show after settings hydrate.
- Overlay preferences are persisted in the existing sanitized renderer settings blob under `settings.overlay` with `enabled`, `launchOnStartup`, `hotkey`, `anchor`, `compactWidth`, `expandedWidth`, `promptAutoHideEnabled`, and `promptAutoHideTimeout`. No new secure-storage or Overlay-only settings file is introduced for Phase 1.
- Main-shell navigation history is now tracked entirely in the renderer through `AppShellProvider` + `src/contexts/appShellNavigation.ts`; both the titlebar arrows and side-mouse buttons call the same history controller instead of using raw `react-router` delta navigation.

#### MCP Runtime Foundation
- Shared MCP contracts and naming helpers live in `src/mcp/types.ts`.
- `src/mcp/McpContext.tsx` hydrates MCP runtime state from `window.mcp`, subscribes to `mcp:state-changed`, exposes on-demand resource/prompt fetch helpers, and keeps the in-memory draft server list that plugs into the standard Settings save/discard bar.
- `src/components/Settings/sections/McpSection.tsx` renders the MCP settings workflow for add/edit/delete/enable/connect actions, transport-specific forms, trust state, approval policy, optional per-server tool allow/block scaffolding, masked secret indicators, live connection/tool state, and entry points into the MCP library browser.
- `src/components/mcp/McpLibraryDialog.tsx` is the shared user-facing browser for trusted MCP resources and prompts; it previews resource reads and prompt expansion results, and only inserts content into the chat composer draft on explicit user action.
- `src/components/mcp/McpApprovalDialog.tsx` renders the pending approval modal for trusted servers that still require per-call approval before MCP execution proceeds.
- `src/tools/mcpRegistry.ts` converts connected MCP runtime tools into request-time tool descriptors with namespaced reverse-lookup metadata and only surfaces tools from servers that are enabled, connected, and explicitly trusted.
- Non-secret MCP server configs persist through `electron/mcp/mcpStorage.ts` into `mcp-servers.json` under `app.getPath('userData')`.
- MCP server configs now persist a per-server `trustState`; new servers default to `enabled: false`, `trustState: 'untrusted'`, and `requireApproval: true`.
- Server configs can also carry optional `toolAllowlist` / `toolBlocklist` arrays; allowlists restrict exposed MCP tools to named entries, while blocklists hide named tools even if the server advertises them.
- Secret-backed MCP env vars, headers, and tokens stay in `electron/secureStorage.ts` and are resolved lazily at connection time.
- Renderer-originated MCP secret edits are funneled through `mcp:add-server` / `mcp:update-server`; main sanitizes those payloads, writes secure values into `electron/secureStorage.ts`, and persists only secret references in `mcp-servers.json`.
- Shared transport primitives live in `electron/mcp/transports/base.ts`.
- The base transport layer now standardizes:
  - JSON-RPC message validation/parsing (`isMcpJsonRpcMessage`, `parseMcpMessage`)
  - line-delimited stdio-style message framing helpers (`serializeMcpMessageLine`, `splitMcpMessageLines`)
  - transport lifecycle state transitions (`idle`, `connecting`, `connected`, `disconnecting`, `disconnected`, `error`)
  - subscriber hooks for message, error, close, and state-change events
  - normalized timeout/error wrapping via `McpTransportError` and `BaseMcpTransport.withTimeout(...)`
- `electron/mcp/transports/stdio.ts` provides managed child-process spawning, explicit command/args execution, stdout/stderr diagnostics, and clean process-exit handling for local MCP servers.
- `electron/mcp/transports/sse.ts` now performs real event-stream connects with strict content-type validation, masked header diagnostics, request timeout handling, same-origin-only server-specified POST endpoint support, and retry/backoff on initial connection attempts. Remote SSE remains gated behind `ZURA_ENABLE_EXPERIMENTAL_MCP_REMOTE_TRANSPORTS=true`.
- `electron/mcp/transports/websocket.ts` now performs real remote connects with secret-backed header support, close-code diagnostics, heartbeat/pong staleness handling, and retry/backoff on initial connection attempts. Remote WebSocket remains gated behind `ZURA_ENABLE_EXPERIMENTAL_MCP_REMOTE_TRANSPORTS=true`.
- `electron/mcp/mcpConnection.ts` sits above transports and now handles the MCP `initialize` handshake, capability capture, `tools/list` discovery, `resources/list` discovery, `prompts/list` discovery, `tools/call` execution, `resources/read`, `prompts/get`, runtime metadata caching, remote reconnect loops, and last-success/last-error connection metadata.
- `electron/mcp/mcpManager.ts` sits above storage + connections and now manages configured server registration, connection lifecycle, trusted-tool exposure, trusted resource/prompt exposure, on-demand resource/prompt reads, runtime-state subscriptions, and active connected-tool aggregation/execution.
- MCP manager helper responsibilities are split across `electron/mcp/mcpManagerState.ts`, `electron/mcp/mcpManagerPolicies.ts`, and `electron/mcp/mcpManagerUtils.ts`; the manager now skips redundant runtime-metadata saves when persisted tool/resource/prompt/error metadata has not changed.
- `electron/mcp/mcpApprovalManager.ts` tracks pending approval requests, auto-rejects expired prompts, and rejects queued requests when a server disconnects, updates, or the app shuts down.
- `electron/mcp/index.ts` exposes the current MCP runtime to renderer through narrow IPC handlers, executes namespaced MCP tools through the approval manager, serves trusted resource/prompt reads through dedicated on-demand IPC calls, and broadcasts `McpRuntimeSnapshot` updates (including `pendingApprovals`) to all windows.
- MCP resources and prompts are intentionally **user-visible only** in the current release shape: trusted connected servers can surface them to the renderer, but they are not exposed as model-callable tools and require explicit user action for preview or composer insertion.

#### Dashboard Chat (Streaming + Tools + History)
- Main orchestration: `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts`
- Shared provider metadata: `src/providers/providerRegistry.ts`
- Shared stream orchestration: `src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts`
- Compatibility provider/runtime wrapper: `src/components/Dashboard/ChatArea/hooks/chatProviderRuntime.ts`
- State/persistence: `src/contexts/ChatHistoryContext.tsx`
  - Electron path: `window.ipcRenderer.invoke('chat-store:get-all'|'chat-store:save-all'|'chat-store:migrate')`
  - Main storage: `electron/chatStore.ts` → `chat-history.json` under `app.getPath('userData')`, written through same-directory temp-file replacement to reduce corruption risk during crashes or interrupted writes
- Provider streaming entry points:
  - `src/services/openrouter.ts` (`streamOpenRouterCompletion`)
  - `src/services/groq.ts` (`streamGroqCompletion`)
  - `src/services/alibaba.ts` (`streamAlibabaCompletion`)
  - `src/services/fireworks.ts` (`streamFireworksCompletion`)
  - `src/services/ollama.ts` (`streamOllamaCompletion`)
  - `src/services/perplexity.ts` (`streamPerplexityCompletion`)
- Provider services now only own request shaping and transport parsing. `src/providers/providerRuntime.ts` is the centralized execution layer for provider-specific streaming/non-streaming calls, title-generation text extraction, OpenRouter model normalization, and normalized event emission (`text-delta`, `reasoning-delta`, `tool-call-delta`, `file-delta`, `usage`, `citation`, `finish`, `error`) consumed by the shared orchestrator; `providerStreamClient.ts` is now a thin wrapper over that runtime.
- Send and regenerate now use the same normalized provider-stream pipeline. Regeneration no longer maintains a separate direct-stream code path.
- Provider capabilities, auth checks, default endpoints, retry policy, tool support, image support, provider accent colors, and title/model selector provider availability are resolved through `src/providers/providerRegistry.ts` instead of repeated provider switches.
- Fireworks is a first-class active provider again. It participates in provider selection, chat dispatch, title generation, model enablement, tool-capability checks, usage metrics, and the shared streaming pipeline through the provider registry.
- Fireworks model discovery now has a dedicated serverless catalog path in `src/services/fireworksModels.ts`, surfaced from `src/components/Settings/sections/FireworksModelSearchDialog.tsx` through Provider Hub in the same custom-model workflow style as OpenRouter.
- Tool calling:
  - `src/hooks/useToolCalling.ts` → `src/tools/toolManager.ts` → `src/tools/executor.ts`
  - Built-in main-process tools still execute through `window.ipcRenderer.invoke('execute-tool', toolName, args)`.
  - Namespaced MCP tools now execute through `window.mcp.executeTool(toolName, args)` so built-ins and MCP stay on separate IPC paths.
- Main tool registry: `electron/tools/index.ts` (restricted)
  - OpenRouter-compatible tool-call parsing/recovery now lives in `src/tools/adapters/openrouterToolCalls.ts`, keeping `src/tools/adapters/openrouter.ts` focused on request/response formatting.
- The Overlay reuses this same renderer chat pipeline through `useStreamingChat`; it does not create a parallel provider/tool execution path or a separate conversation store.
- The Overlay also listens for `overlay:pending-prompt` events from the main process (triggered when a prompt popup submission opens the overlay) and auto-sends the received prompt text.
- Active-response renderer state is split between persisted chat history and ephemeral `StreamingContext` data in `src/contexts/StreamingContext.tsx`.
  - `StreamingContext` now tracks an explicit per-response `phase` (`reasoning`, `searching`, `tool`, `answering`) so the thinking/search UI stays stable across multi-search loops without persisting transient renderer-only state.
  - Reasoning is now segmented per round: in-flight `streamingState.thinking` represents only the current active thought, while completed reasoning rounds are appended to `thinkingBlocks` alongside search blocks so resumed research continues in a new block instead of extending the previous one.
  - Completed MCP tool executions are now appended into persisted `thinkingBlocks` as inline tool-history entries (alongside web search/search blocks) so the renderer can replay MCP activity inside the same thought timeline instead of only in the generic post-message tool card area.
- Completed MCP and built-in tool results are pushed into the active streaming state as soon as they finish, so generic tool runs remain visible in-chat before the assistant emits its follow-up answer.
- Final streaming commits now persist tool-only responses too; an assistant turn no longer needs non-empty text content for tool results, reasoning blocks, or approval outcomes to survive the handoff from `StreamingContext` into chat history.
- Persisted assistant-message response stats (`usage`) now reflect only the final visible answer round for that assistant turn. Pre-search planning/tool-call rounds and no-tools recovery rounds remain part of orchestration latency/tool history, but they are no longer merged into the final answer's token stats.
- Research-mode finalization now runs bounded no-tools synthesis retries inside `src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts`: after tool rounds finish, the orchestrator first requests a normal final synthesis, then escalates to stricter recovery prompts including a plain-text-only pass if the provider still returns blank output or `tool_calls` despite tools being disabled. If every no-tools pass still fails, the renderer commits a concise failure message while preserving the gathered `web_search` results in the timeline/tool UI.
  - OpenRouter image-generation models now flow through the same chat pipeline: renderer model metadata persists `inputModalities` / `outputModalities`, `src/services/openrouter.ts` sends `modalities` to `/api/v1/chat/completions` for image-capable models, the streaming hook captures `delta.images` payloads, and generated images are persisted back into chat history `files` so assistant image outputs render inline in the dashboard.

#### Skills-Based Research (`settings.skills`)
- Research capability is now controlled by built-in skills, not direct tool toggles.
- Built-in skill: `web_research` (`settings.skills.web_research`).
- When enabled, the model can call `web_search` directly and decide whether follow-up searches are needed. No separate structured/planned built-in research mode currently exists.
- Shared follow-up search policy now lives in `src/components/Dashboard/ChatArea/hooks/streaming/researchLoopPolicy.ts`. The shared orchestrator in `src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts` now supports batched parallel `web_search` fan-out within a single provider turn, while still enforcing a hard per-response cap of 8 executed searches, repeated-query/facet breaking, and a forced final synthesis pass with tools disabled once the loop should stop.
- Tool schema exposure is skill-gated in renderer:
  - Skill OFF: expose no built-in web research tools
  - Skill ON: expose `web_search`

#### Theme + Windows Titlebar Overlay

#### Code Execution Skill (`settings.skills.code_execution`)
- Built-in skill: `code_execution` (`settings.skills.code_execution`), default disabled.
- When enabled, the model can call `code_execution` with `code` (string) and `language` (`'javascript'` | `'python'`) parameters.
- Execution uses the free public Piston API (`https://emkc.org/api/v2/piston/execute`) — no API key, no local sandbox, no native addons.
- Every execution requires explicit user approval via `CodeExecutionApprovalDialog` (AlertDialog pattern matching MCP approval).
- Approval flow uses `CodeExecutionApprovalManager` in `electron/tools/code-execution/approvalManager.ts` — same Promise-blocking pattern as `McpApprovalManager`.
- Approval timeout: 60 seconds. Renderer executor timeout extended to 90 seconds for `code_execution`.
- IPC channels: `code-execution:resolve-approval` (invoke), `code-execution:pending-approval` (main→renderer broadcast).
- Preload bridge: `window.codeExecution` with `resolveApproval(requestId, approved)` and `onPendingApproval(callback)`.
- Main-process files: `electron/tools/code-execution/` (types, constants, service, approvalManager, index).
- Renderer files: `src/components/CodeExecutionApprovalDialog.tsx`, skill gating in `src/hooks/useToolCalling.ts`.
- Tool results render as expandable cards in chat via `ToolResultDisplay.tsx` (not hidden by `toolResultVisibility`).
- Piston sandbox constraints: no filesystem, no network, 5s run timeout, 64MB memory limit.


- Startup theme apply: `src/main.tsx` reads `localStorage['zura-settings']` and applies theme with user customization (`themeAccent`, `themeBackground`, `themeForeground`, `themeContrast`).
- Active theme preset (`activeTheme`) selects a base theme; accent/background/foreground colors can be overridden per-user.
- Contrast slider (`themeContrast` 0-100) adjusts theme intensity; 100 = full contrast, lower values = softer.
- Legacy `softenedContrast: boolean` is migrated to `themeContrast: number` (true → 85, false/undefined → 100).
- Window controls are driven from renderer (`src/components/TitleBar.tsx`) through `window.windowControls` (preload) → `window-controls:*` IPC handlers (`electron/ipc/systemHandlers.ts`). Main emits `window-controls:state` on maximize/unmaximize/fullscreen transitions.
- The titlebar info menu (`src/components/TitleBarInfoMenu.tsx`) uses `window.updater` for release actions and `window.appInfo` for both runtime/build metadata (`app-info:get`) and launching the separate About window (`app-info:open-about-window`).
- The main shell now uses solid titlebar/sidebar surfaces; there is no renderer-to-main native blur toggle for the main window.

#### Renderer Performance Tracking
- Renderer startup/performance metrics are tracked locally in `src/utils/rendererPerformance.ts`.
- The tracker is initialized in `src/main.tsx` and consumed by `src/hooks/useLazyLoad.ts` for TTI-aware lazy loading.
- There is no longer a main-process performance-monitor IPC pipeline or persisted performance metrics log.

#### Response Streaming Cadence
- Streaming updates use a fixed cadence from `getStreamingUpdateInterval()` in `src/components/Dashboard/ChatArea/hooks/streaming/streamingUtils.ts`, backed by shared provider constants in `src/providers/providerRegistry.ts` (`120ms`).

#### Model Enablement (Provider Hub)
- Provider model rows in `src/components/Settings/sections/ProviderHubSection.tsx` support per-model enable/disable toggles.
- Model records in active settings arrays (`configuredModels`, `ollamaModels`, `perplexityModels`, `groqModels`, `alibabaModels`, `fireworksModels`) support optional `enabled?: boolean`.
- Provider-level toggles are persisted in `settings.providerEnabled` for the active provider surface (`alibaba`, `fireworks`, `groq`, `ollama`, `openrouter`, `perplexity`) and are independent from whether API keys/endpoints are filled.
- Dashboard model selector (`src/components/Dashboard/ModelSelector/useModelSelector.ts`) only lists models where `enabled !== false`, from providers that are both manually enabled (`settings.providerEnabled[provider] !== false`) and configured (key/endpoint present).

#### Command Palette Quick-Send
- The command palette (`Ctrl+Space`) supports sending a chat message directly via **Shift+Enter**.
- When the user types text that doesn't match any command well (top score < 100), a "Send as chat message" suggestion appears automatically.
- Runtime behavior is controlled by `settings.commandBar`: `enabled` gates both mount and hotkey registration, and suggestion/recents limits use `maxSuggestions`, `showRecents`, and `maxRecents`.
- Architecture uses a **`QuickSendContext`** (`src/contexts/QuickSendContext.tsx`) as a lightweight message queue bridge between the command palette and `ChatArea`:
  1. Command palette calls `queueMessage(content)` + navigates to `/dashboard` + sets dashboard view to `chat`.
  2. `ChatArea` (`src/components/Dashboard/ChatArea.tsx`) has a `useEffect` that watches for `pendingMessage` from the context.
  3. When a pending message is detected and the chat is not currently streaming, `ChatArea` calls `sendMessage()` from `useStreamingChat` and then `consumeMessage()` to clear the queue.
- This handles the case where the user is on a non-chat page (e.g., Settings): navigation happens first, `ChatArea` mounts, then picks up the pending message.
- `QuickSendProvider` is mounted in `App.tsx` above the `Router` so it's accessible to both the command palette and `ChatArea`.

#### Sidebar Session Organization
- The chat sidebar no longer supports archiving/unarchiving sessions.
- Session grouping is now based on pinning, folder assignment, and recency buckets only.
- Search overlays and list rendering include all sessions (subject to active filters), with no archive-only section or archive toggle.
- Chat session metadata includes `pinned`, `folderId`, and `tags`; legacy `archived` values in persisted data are ignored during migration.

#### Sidebar Width Resizing
- Sidebar width is user-resizable from the dashboard via a right-edge drag handle in `src/components/Dashboard/Sidebar.tsx`.
- The resize interaction is renderer-only: pointer drag updates `AppShellContext` width state in real time and clamps to shared bounds from `src/constants/sidebar.ts`.
- Current shell width calculations (sidebar panel and titlebar overlays) consume `sidebarWidth` from `AppShellContext` when not hidden/collapsed.

#### Chat Title Generation Controls
- Title generation configuration UI lives in **Appearance** (`src/components/Settings/sections/AppearanceSection.tsx`) for provider/model selection and sidebar reveal mode.
- Title generation prompt editing lives in **System Prompt** (`src/components/Settings/sections/SystemPromptSection.tsx`) as a dedicated prompt block.
- Runtime generation is handled by `src/services/titleGenerator.ts` using `settings.titleModelProvider`, `settings.titleModel`, and `settings.titleGenerationPrompt`, with provider-specific title requests routed through `src/providers/providerRuntime.ts`.
- New-session title reveal behavior is applied in `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts`:
  - `instant`: apply generated title immediately
  - `typewriter`: progressively reveal generated title in sidebar

### Data Persistence

**Renderer (localStorage)**
- Settings: `zura-settings`
  - Persisted settings are sanitized before write; secret API key fields are stripped and sourced from secure storage instead.
  - MCP server drafts are not persisted here; Phase 2 MCP edits live only in renderer memory until the user saves or discards them.
  - Model arrays may include optional `enabled` flags per model entry to control selector visibility.
- Provider-level enablement map: `providerEnabled` (per-provider manual on/off state, independent from API key presence).
  - Search API preference: `tavilySearchDepthPreference` (`auto`, `ultra-fast`, `fast`, `basic`, `advanced`) controls the default Tavily `search_depth` used when the model omits it.
  - Title generation settings:
    - `titleModelProvider` (provider used for title generation)
    - `titleModel` (model used for title generation)
    - `titleGenerationPrompt` (prompt template for generating titles; supports `{{userMessage}}` token)
    - `titleGenerationDisplayMode` (`instant` or `typewriter` sidebar reveal)
  - Skills map: `skills` (built-in IDs keyed by `skillId`, currently `web_research` (default enabled) and `code_execution` (default disabled), each with `enabled`).
  - Legacy `webSearchEnabled` / `structuredResearchEnabled` are migrated into `skills.web_research.enabled`; `structuredResearchEnabled` is retained only as a migration input and is not used by runtime logic.
  - `themeContrast` (0-100, default 100): Numeric contrast intensity; lower values produce a softer look.
  - `themeAccent`, `themeBackground`, `themeForeground`: Optional hex color overrides for theme base colors; when set, they override the preset's base colors.
  - Legacy `softenedContrast: boolean` is migrated to `themeContrast` (true → 85, false → 100) and removed from persisted state.
- Chat history fallback (non-Electron): `zura-chat-history`
- Secure-key migration flag: `zura-api-keys-migrated`
- Last active chat session: `zura-ui:lastChatSessionId`
- App shell UI state:
  - `zura-ui:dashboardView`
  - `zura-ui:settingsSection`
  - `zura-ui:sidebarCollapsed`
  - `zura-ui:sidebarWidth`
  - `zura-ui:sidebarHidden`
- Command bar:
  - History: `zura-commandbar-history-v1`
- Model color assignments: `zura-model-colors`

**Main process (`app.getPath('userData')`)**
- Chat history: `chat-history.json` (`electron/chatStore.ts`)
- Persisted assistant `thinkingBlocks` may now include completed MCP tool-history entries (`type: 'tool'`) with tool name/arguments/result metadata so the renderer can replay inline MCP call history from stored sessions.
- MCP server metadata: `mcp-servers.json` (`electron/mcp/mcpStorage.ts`)
  - Stores versioned non-secret server config, last-known tools, last-known resources, last-known prompts, and last connection metadata.
  - Secret-bearing env/header/token entries store secure-storage references, not raw secret values.
- Secure storage: `secure-storage.json` (`electron/secureStorage.ts`)
  - Encryption: `safeStorage` is required for reads/writes; the app no longer falls back to plaintext persistence when OS-backed encryption is unavailable
  - Legacy plaintext secret entries from older builds are only migrated forward into encrypted values when `safeStorage` is available
  - Stored API keys: `openRouterApiKey`, `perplexityApiKey`, `groqApiKey`, `alibabaApiKey`, `fireworksApiKey`, `tavilyApiKey`
  - Also stores MCP secret entries under deterministic keys like `mcp.server.<serverId>.(env|header|token).<name>`
  - The preload batch read bridge (`secure-storage:get-all`) is restricted to the provider-key allowlist above; MCP secret entries never hydrate into renderer settings payloads.
- No dedicated performance metrics file is persisted by the app.

### Tool System (Function Calling)
Tool execution is intentionally restricted.

- Renderer side:
- Built-in main-process tool manifest: `src/tools/builtinTools.ts` (shared `web_search` manifest and built-in tool names)
- Built-in tool schemas: `src/tools/definitions.ts` (renderer-facing definitions derived from `builtinTools.ts`)
  - Runtime MCP tool adapter: `src/tools/mcpRegistry.ts` maps connected MCP tools into generic request-time descriptors
  - Skill gating + runtime merge: `src/hooks/useToolCalling.ts` + `src/skills/index.ts` decide which built-in tools are exposed and merge them with eligible MCP tools at request time
  - Provider adapters: `src/tools/adapters/*` (Perplexity is explicitly excluded)
  - Execution: `src/tools/executor.ts` keeps built-in IPC execution for `web_search` and routes namespaced MCP tools through the dedicated `window.mcp.executeTool(...)` bridge
    - Before invoking built-in `web_search`, the renderer resolves omitted `search_depth` values from `settings.tavilySearchDepthPreference`; `auto` applies a lightweight query heuristic and manual modes inject the selected Tavily tier directly.
    - `src/tools/toolManager.ts` applies the renderer-side batch execution policy for `web_search`: duplicate/facet-deduping within the current assistant response, remaining-budget enforcement, synthetic skipped tool results for over-budget or duplicate calls, and parallel execution for the executable subset of the batch.
  - MCP resources and prompts are not merged into the model tool surface; the renderer only exposes them through user-driven browsing/preview flows in the MCP library UI.

- Main process side:
  - Tool IPC: `electron/tools/index.ts` (restricted registry: `web_search`)
  - MCP tool IPC: `electron/mcp/index.ts` (`mcp:execute-tool`, `mcp:resolve-approval`) with approval gating handled by `electron/mcp/mcpApprovalManager.ts`
  - Web search: `electron/tools/webSearch.ts`
    - `electron/tools/webSearch.ts` is a thin facade over the modular service in `electron/tools/web-search/`
    - `electron/tools/web-search/intent.ts` classifies query-vs-URL-vs-extract intents and reformulates weak search queries
    - `electron/tools/web-search/backends/tavily.ts` owns Tavily search/extract transport calls
    - `electron/tools/web-search/backends/duckduckgo.ts` owns the DuckDuckGo fallback path
    - `electron/tools/web-search/helpers.ts` normalizes results, images, snippets, sources, and displayed links into the shared web-search result shape
    - Tavily search depth now accepts `ultra-fast`, `fast`, `basic`, and `advanced`; invalid values are still normalized to `basic` in main as a defensive fallback.
    - Input classification happens at the top of `executeWebSearch`:
      - **URL-dominant input** (URL only) → Tavily **Extract** (`/extract`) with `format: markdown`, `extract_depth: basic`
      - **Query + URL** → Tavily **Extract** (`/extract`) with attached `query`, `chunks_per_source`, `extract_depth: advanced`
      - **Natural-language query (no URL)** → Tavily **Search** (`/search`)
      - **Docs/site exploration wording + URL** currently follows the URL extract path (future `map`/`crawl` integration can be added separately)
    - Tavily-first routing uses `tavilyApiKey` from secure storage; if extraction/search fails, fallback is duck-duck-scrape web search

There is currently no built-in trusted browser-testing workflow; any replacement must be documented here when introduced.

**Note:** The main-process built-in tool registry remains intentionally restricted; built-in main-process tools now flow from the shared manifest in `src/tools/builtinTools.ts`, stay skill-gated in renderer through `src/tools/definitions.ts` / `src/hooks/useToolCalling.ts`, and still require explicit handler registration in `electron/tools/index.ts`. MCP tool execution is separate, namespaced, and only available for servers that are enabled, connected, trusted, and allowed by the current approval policy.

### Providers
- OpenRouter: `src/services/openrouter.ts` (OpenAI-compatible tool calling)
- Groq: `src/services/groq.ts` (OpenAI-compatible)
- Alibaba Cloud: `src/services/alibaba.ts` (DashScope/Tongyi Qwen; OpenAI-compatible at dashscope-intl.aliyuncs.com/compatible-mode/v1; thinking models stream `reasoning_content` deltas with `enable_thinking: true` request param)
- Fireworks: `src/services/fireworks.ts` (OpenAI-compatible inference) plus `src/services/fireworksModels.ts` for the serverless model catalog used by Provider Hub
- Ollama: `src/services/ollama.ts` (local server; tools supported for compatible models)
- Perplexity: `src/services/perplexity.ts` (native web/research; excluded from external tools)
- Chat title generation: `src/services/titleGenerator.ts` (uses `settings.titleModelProvider`, `settings.titleModel`, `settings.titleGenerationPrompt`)

### Environment & Secrets
- `VITE_DEV_SERVER_URL` — set in dev (used by Electron windows)

API keys are configured in-app and stored via secure storage (`secure-storage.json` under `app.getPath('userData')`).

Never commit `.env` or API keys.

### Known Architecture Gaps / TODOs (Current Code)
These are useful breadcrumbs for agents:
- User-configured global shortcut strings in settings are still not wired to `globalShortcut.register(...)`.

---

## Agent Best Practices (Do/Don’t)

### Do
- Keep changes scoped and consistent with existing patterns.
- Treat the renderer as untrusted; validate/sanitize everything in main-process handlers.
- Keep `contextIsolation: true` and `nodeIntegration: false` for all BrowserWindows.
- Use shadcn UI components for all UI work; do not introduce other UI component libraries.
- Keep shared interaction states (hover/active/focus) centralized in base classes for reusable controls (e.g. titlebar icon buttons) so variants stay visually consistent.
- When changing IPC:
  - update `electron/preload.ts` allowlists
  - update typings in `src/electron.d.ts`
  - validate inputs in main-process handlers
- Prefer adding new main-process capabilities via explicit, narrow IPC handlers.
- Run `npm test` after meaningful changes.

### Don’t
- Don’t broaden the IPC surface “just to make it work”.
- Don’t expose raw Node APIs to the renderer.
- Don’t add new tools (or allow arbitrary tool names) without a clear security review.
- Don’t commit secrets (API keys, tokens) or `.env` files.
- Don’t edit generated output (`dist/`, `dist-electron/`).
- Don’t add variant-specific hover/active styles for shared titlebar icon controls unless intentional and documented in the PR.

---

## Testing
- Test runner: Vitest (`vitest.config.ts`)
- Setup: `src/test/setup.ts`
- Included patterns:
  - `src/**/*.test.ts`, `src/**/*.test.tsx`
  - `electron/**/*.test.ts`

---

## Build & Release Notes (Electron)
- Packaging uses `electron-builder` (see `package.json#build`).
- Auto-updater is enabled only when `app.isPackaged` (production) in `electron/updater.ts`.
- `package.json#build.publish` is currently configured for GitHub releases on `solnikhil/ZuraAI`; update it if packaging from a fork or different repo.

---

## When to Update the Architecture Section
Update **this file’s “Architecture”** whenever you:
- Add/remove a BrowserWindow or change routing boundaries (`#/dashboard`, `#/settings`, etc.)
- Add/remove/rename IPC channels or exposed `window.*` APIs
- Change where data is persisted (settings/chat history/secure storage)
- Add/enable tools or change tool execution policy
- Add a new AI provider or change provider/tool support rules
- Change build outputs/packaging assumptions (`dist/`, `dist-electron/`, installer)

