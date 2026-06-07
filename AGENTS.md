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
- Tests: `bun run test`
- Tests (watch): `bun run test:watch`
- Build (typecheck + Vite build + electron-builder): `bun run build`
- Build portable dir: `bun run build:dir`
- Preview renderer bundle: `bun run preview`

**Prereqs:** Bun `>= 1.1`, Node.js `>= 18` (required by Electron at runtime).

---

## Key Concepts (Read First)
- The **renderer is untrusted**. Anything privileged must be implemented in the **main process** and exposed via a **narrow, allowlisted** IPC surface.
- The app uses a **primary BrowserWindow** for the main app plus a dedicated **About window**. Main-app renderer routes live inside the primary window (`#/dashboard`, `#/settings`, `#/chat`) under a shared shell layout, while `#/about` is rendered in the separate utility window.
- The app supports an optional **Overlay window** on non-macOS platforms. `#/overlay` renders in its own always-on-top frameless `BrowserWindow` and reuses the standard chat/runtime stack rather than introducing a second assistant runtime; macOS disables this floating-window surface for now.
- Persistence is split:
  - **Sanitized non-secret settings + UI state** live in renderer `localStorage`.
  - **API keys and MCP secrets** live in main-process secure storage and are hydrated/resolved at runtime.
  - **Chat history, conversation summaries, MCP server metadata, and secure storage** live in the main process under `app.getPath('userData')`.
  - **Agent run metadata** lives on assistant messages inside the existing per-session chat JSON files, not in a separate store.
  - Built-in prompt templates (`systemPrompt`, `webSearchPrompt`, tool prompts, memory prompt, and title-generation prompt) are code-owned runtime defaults. `normalizeStoredSettings(...)` replaces stale persisted prompt overrides with the current defaults, and Settings renders them as read-only viewers instead of editable fields.
- UI styling guardrail: keep settings cards, chat composer containers, and dropdown/menu surfaces flat. Do **not** reintroduce outer drop shadows on those surfaces unless the user explicitly asks for them.
- Fallback behavior guardrail: do **not** add new fallback paths, silent substitutions, local heuristics, provider fallbacks, or “safe default” behavior unless it is explicitly required by the user or you ask and get confirmation first. Prefer surfacing the real failure and fixing the root cause; unnecessary fallbacks can hide bugs and change product behavior.

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
- `electron/memoryStore.ts` — ChatGPT-style saved-memories persistence (JSON under `app.getPath('userData')`); single `memory-index.json`; atomic whole-file writes; in-memory TTL cache; serialized read-modify-write so concurrent model + user mutations cannot clobber each other; FIFO cap at `MEMORY_CAP=200`; per-entry `MAX_MEMORY_CONTENT_LENGTH=1000`
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
  - `electron/tools/windows-uia/` — Windows-only Microsoft UI Automation bridge for native desktop snapshots and supported control actions (`InvokePattern`, `ValuePattern`, selection/toggle patterns)
  - `electron/tools/system-shell/` — bounded non-interactive PowerShell execution with timeout, output caps, and working-directory validation
  - `electron/tools/files/` — structured main-process filesystem tools for read/write/search/move with path normalization and size/result limits
  - `electron/tools/app-management/` — Windows app discovery/launch/install/uninstall via Start Menu scanning, Electron shell launch, and non-interactive `winget`
  - `electron/tools/window-management/` — Windows native window listing/focus/move/close by HWND/title/process metadata, excluding ZuraAI-owned windows by default
  - `electron/tools/native-common.ts` — shared Windows-native tool validation, PowerShell execution, timeout/output limits, unsupported-platform errors, and approval checks
- `electron/updater.ts` — auto-updater (production only)
  - `electron/tools/code-execution/` — built-in code execution skill: Piston API service, approval manager, IPC registration, types, and constants
- `electron/agentDesktop/` — Windows-only **Agent Desktop (Agent View)** main-process module: provisions/reuses a dedicated Windows Virtual Desktop and parks agent windows there during agent mode. Thin orchestration layer over the existing Computer Use surface (no new model-callable tools).
  - `electron/agentDesktop/vdaBinding.ts` — the **single isolation point** over `VirtualDesktopAccessor.dll`, loaded lazily via FFI (`koffi`) inside try/catch; load-time export/arity probing, per-call `VdaError` wrapping, and `dispose()` for app-quit release
  - `electron/agentDesktop/service.ts` — top-level orchestrator (`AgentDesktopService`): provisioning/teardown lifecycle, per-tool readiness verification/reprovisioning, window placement, presence transitions, the Computer Use action gate, kill switch, action cap, settings mirroring, and `AgentDesktopState` broadcast plumbing
  - `electron/agentDesktop/approvalPolicy.ts` — pure allowlist-driven `auto-approve` vs `approval-required` classification
  - `electron/agentDesktop/approvalManager.ts` — `AgentDesktopApprovalManager extends BaseApprovalManager` (mirrors Computer Use / Code Execution); configurable timeout, treats timeout as rejection
  - `electron/agentDesktop/presence.ts` — pure `background` ↔ `take-over` presence state machine and per-mode action permission rules
  - `electron/agentDesktop/windowRegistry.ts` — in-memory HWND → Agent_Window records keyed by the Agent_Run that launched them, with placement-attempt tracking
  - `electron/agentDesktop/targeting.ts` — pure residence/targeting checks (Agent_Desktop vs User_Desktop vs ZuraAI-owned windows; `close_app` restricted to current-run windows)
  - `electron/agentDesktop/heldInputQueue.ts` — 60s held-input queue (injectable clock) for input requested while the Agent_Desktop is not displayed
  - `electron/agentDesktop/settings.ts` — preference validation/normalization; forces `launch_app`/`close_app` to `approval-required`, clamps approval timeout, falls back to the safe disabled default
  - `electron/agentDesktop/index.ts` — narrow allowlisted IPC registration + renderer broadcasts; Windows-only (defense-in-depth macOS rejection)
  - `electron/agentDesktop/constants.ts` / `electron/agentDesktop/types.ts` — timing constants/limits (re-exporting the shared Computer Use action cap + kill-switch window) and shared types
- `electron/discordRpc/` — Discord Rich Presence main-process module: singleton client (`rpcClient.ts`), IPC registration (`index.ts`), and shared types (`types.ts`). Lazy-requires `discord-rpc` so a missing native dependency never crashes the app. Reconnects with backoff when Discord is not running.

- `src/` — React/Vite **renderer**
  - `src/main.tsx` — renderer entrypoint; initializes performance tracking, lazy-image styles, applies saved theme, mounts `App`, and schedules non-critical preloads after first paint
- `src/App.tsx` — routes (`#/dashboard`, `#/settings`, `#/chat`) under `AppShellLayout`, plus wildcard `*` fallback to a dedicated 404 renderer view
- `src/components/OverlayView.tsx` — compact overlay chat surface for the dedicated `#/overlay` route
- `src/components/OverlaySync.tsx` — renderer-side bridge that syncs persisted overlay settings into the trusted main-process Overlay runtime
- `src/components/AgentDesktopSync.tsx` — Windows-only renderer bridge that mirrors persisted `settings.agentDesktop` into the trusted Agent Desktop runtime via `window.agentDesktop.applySettings(...)`
- `src/components/DiscordRpcSync.tsx` — (removed) Discord RPC is now always-on in main process; no renderer sync needed
- `src/components/Settings/sections/AgentDesktopSection.tsx` — Windows-only Agent Desktop settings UI (disclosure-gated enable toggle, persistence mode, per-action approval-policy editor); hidden on macOS
- `src/settings/agentDesktopSettings.ts` — renderer-side mirror of the main-process Agent Desktop preference normalization (lives in `zura-settings` under `settings.agentDesktop`)
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
  - macOS keeps the native menu bar active, preserves traffic-light window controls with hidden-titlebar styling, and uses normal macOS app activation to recreate the main window after all windows are closed
  - Global right-click context menu is handled by `src/components/AppContextMenu.tsx`: macOS requests a native Electron `Menu.popup()` context menu through the dedicated `window.contextMenu` preload bridge, while Windows/Linux keep the existing React/Radix renderer menu
  - External links are opened via `shell.openExternal` through the `window.shell.openExternal` IPC bridge

- **About Window** (`electron/windows/aboutWindow.ts`)
  - Loads `#/about` in its own `BrowserWindow`
  - Opens from the titlebar info menu via `window.appInfo.openAboutWindow()` → `app-info:open-about-window`
  - Uses the shared preload bridge, native OS window chrome, fixed utility-window sizing, `skipTaskbar: true`, and `sandbox: true`

- **Chat Debug Window** (`electron/windows/chatDebugWindow.ts`) — dev-only
  - Loads `#/chat-debug?sessionId=<id>` in its own `BrowserWindow`
  - Disabled in packaged builds (`app.isPackaged` check returns `null` and the IPC handler returns `false`)
  - Opens from the dev-only command palette entry **`Show Chat Debug Logs`** via `window.chatDebug.open(sessionId)` → `chat-debug-window:open`
  - Reuses the shared preload bundle plus a dedicated `window.chatDebug` bridge for lifecycle
  - Window is reused across opens: subsequent opens reload it onto the requested session id rather than creating a new window
  - Closed automatically during app `will-quit` cleanup; `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, DevTools enabled in dev only

- **Overlay Window** (`electron/windows/overlayWindow.ts`)
  - Loads `#/overlay` in its own dedicated `BrowserWindow`
  - Disabled on macOS for now; main-process overlay APIs report disabled state and do not create floating windows or register shortcuts
  - Platform-polished overlay surface on supported platforms: frameless, `alwaysOnTop`, `skipTaskbar`, non-click-through, and positioned against the active display `workArea`
  - Reuses the shared preload bundle plus a dedicated `window.overlay` bridge for lifecycle actions
  - Supports compact and expanded bounds, hide/show/toggle behavior, and display-metrics repositioning
  - Opens from explicit UI entry points plus the global Overlay shortcut; the shortcut now opens the Overlay directly at the cursor position in expanded mode (single-step flow)
  - Close/hide behavior is controlled in main rather than the untrusted renderer

- **Prompt Popup** (`electron/windows/promptPopup.ts`)
  - Loads `#/prompt-popup` in its own dedicated frameless `BrowserWindow`
  - Disabled on macOS while the Overlay floating-window surface is disabled
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
 - Standalone utility routes outside `AppShellLayout` currently include `#/about` and the dev-only `#/chat-debug` window, plus `#/overlay` and `#/prompt-popup` on non-macOS platforms.

- **Shared shell layout**
  - `src/App.tsx` wraps `/`, `/dashboard`, `/settings`, and `/chat` in `AppShellLayout`
  - `src/components/AppShellLayout.tsx` owns the title bar, command palette, Windows resize handles, and route-level shell behavior
  - `AppShellLayout` now passes the active router pathname into `AppShellProvider`, which maintains a renderer-local shell history across pathname changes plus in-shell `dashboardView` / settings-section transitions for the titlebar back/forward controls
  - `/` is a dashboard alias
  - `/about` is intentionally outside `AppShellLayout` and renders a standalone About window surface (`src/components/AboutWindow.tsx`)

- **Platform menus and status item**
  - `electron/windows/applicationMenu.ts` installs the native macOS application menu during startup using Electron menu roles plus app-specific actions for showing the app, opening Settings, and starting a new chat via the renderer
  - `electron/windows/tray.ts` keeps Windows tray behavior separate from the macOS status-item menu; macOS menu actions can show the app, open Settings/About, start a new chat, or quit without changing Windows tray flows

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
  - `chat-store:get-metadata`, `chat-store:get-session`, `chat-store:save-session`, `chat-store:delete-session`, `chat-store:save-index`, `chat-store:get-all`, `chat-store:save-all`, `chat-store:migrate`, `chat-store:get-all-folders`, `chat-store:save-folders`
  - `chat-diagnostics:append-event`, `chat-diagnostics:get-debug-reference`, `chat-diagnostics:list-events` (development diagnostics only; main process ignores diagnostics persistence/reference generation/listing in packaged builds)
  - `secure-storage:get`, `secure-storage:set`, `secure-storage:get-presence`, `secure-storage:get-all`
  - `execute-tool`
  - `window-resize`
  - `context-menu:show`
  - `native-dialog:confirm-delete-chat`
  - `updater:check-for-updates`, `updater:quit-and-install`, `updater:get-version`
- `ON_CHANNELS`:
  - `update-available`, `update-downloaded`, `app:new-chat`, `context-menu:action`

**Dedicated preload bridges (not part of `window.ipcRenderer` allowlists):**
- `window.windowControls`
  - invokes: `window-controls:minimize`, `window-controls:toggle-maximize`, `window-controls:close`, `window-controls:is-maximized`
  - listens for: `window-controls:state`
- `window.appInfo`
  - invokes: `app-info:get`, `app-info:get-memory-report` (development-only), `app-info:open-about-window`
- `window.appMenu`
  - invokes: `app-menu:command` for fixed custom-titlebar menu commands only (`new-chat`, settings/about/help, zoom/fullscreen, reload/devtools, and window controls)
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
- `window.contextMenu`
  - invokes: `context-menu:show` (macOS native app-shell context menu request with sanitized target metadata)
  - listens for: `context-menu:action` (main→renderer callbacks for `undo`, `redo`, `cut`, `copy`, `paste`, `select-all`)
- `window.nativeDialog`
  - invokes: `native-dialog:confirm-delete-chat` (macOS native chat-delete confirmation only; Windows/Linux keep the renderer alert dialog)
- `window.mcp`
  - invokes: `mcp:list-servers`, `mcp:add-server`, `mcp:update-server`, `mcp:remove-server`, `mcp:connect-server`, `mcp:disconnect-server`, `mcp:get-state`, `mcp:list-tools`, `mcp:list-resources`, `mcp:read-resource`, `mcp:list-prompts`, `mcp:get-prompt`, `mcp:execute-tool`, `mcp:resolve-approval`
  - listens for: `mcp:state-changed`
- `window.memory`
  - invokes: `memory:list`, `memory:add`, `memory:update`, `memory:delete`, `memory:clear`, `memory:search`
  - listens for: `memory-store:changed` (broadcast on any mutation so the settings UI and other windows stay in sync)

**Important:** IPC handlers may exist in `electron/ipc/*` but are not reachable unless they’re also wired through preload allowlists or a dedicated preload bridge.
- `window.codeExecution`
  - invokes: `code-execution:resolve-approval`
  - listens for: `code-execution:pending-approval`
- `window.agentDesktop` (Windows-only; every channel validated + macOS-rejected in main)
  - invokes: `agent-desktop:get-state`, `agent-desktop:apply-settings`, `agent-desktop:take-over`, `agent-desktop:end-take-over`, `agent-desktop:resolve-approval`, `agent-desktop:acknowledge-disclosure`
  - listens for: `agent-desktop:state-changed`, `agent-desktop:pending-approval`, `agent-desktop:killed`
- `window.chatDebug` (dev-only)
  - invokes: `chat-debug-window:open`
- `window.resourceMonitor`
  - invokes: `resource-monitor:get-now`
  - sends: `resource-monitor:subscribe`, `resource-monitor:unsubscribe`
  - listens for: `resource-monitor:sample` (broadcast every 2s while at least one renderer is subscribed)
- `window.discordRpc`
  - invokes: `discord-rpc:get-state`, `discord-rpc:set-activity`
  - listens for: `discord-rpc:state-changed`


**If you add/rename any IPC channel:**
1. Add it to the correct allowlist(s) in `electron/preload.ts`
2. Add/adjust types in `src/electron.d.ts` (if exposed on `window.*`)
3. Implement/register handlers in `electron/ipc/*` (or other main modules)
4. Validate all inputs in main process (treat renderer as untrusted)

### Key Runtime Flows

#### Startup + Shell Initialization
- Main-process startup uses `electron/startup/deferredInit.ts` to defer non-critical work until the main window is visible.
- Current deferred tasks include delayed React DevTools install in development and deferred auto-updater initialization after first paint.
- Startup installs the native macOS app menu before creating the main window and only disables native window animations on Windows.
- Main-process startup also denies Chromium permission requests/checks on the default session and relies on explicit IPC bridges plus `shell.openExternal` for outbound navigation instead of granting renderer permissions.
- Renderer context-menu paste now uses a clipboard read fallback via `window.shell.readClipboardText()` → `clipboard:read-text` when direct `navigator.clipboard.readText()` is unavailable/blocked.
- macOS app-shell right-click now flows through `window.contextMenu.show(...)` → `context-menu:show` in the main process, which builds a native Electron menu and sends narrow `context-menu:action` callbacks back only to the originating renderer window for DOM-bound edit operations.
- Sidebar chat rows on macOS also route right-click through that same native `context-menu:show` bridge with a row-specific menu variant, so native menus can invoke renderer-side `rename` / `pin` / `duplicate` / `delete` chat actions without stacking the generic app-shell menu on top.
- Renderer secure-key hydration reads only key-presence metadata at startup via `secure-storage:get-presence`; actual Keychain-backed decryption is deferred until a provider/tool call needs a specific secret.
- MCP startup integration now registers `electron/mcp/index.ts` handlers during `app.whenReady()`, initializes the singleton MCP manager with renderer-facing client info, and auto-connects only servers where both `enabled` and `autoConnect` are true.
- App shutdown now performs an MCP disconnect pass before quit completes so managed transports can exit cleanly.
- Overlay startup initializes the dedicated overlay runtime only on non-macOS platforms, keeps shortcut registration and display listeners on the trusted side, and relies on renderer-synced `settings.overlay` values instead of a new storage file.
- The global Overlay hotkey opens the Overlay window directly at the cursor position in expanded mode on supported platforms (single-step flow).
- Prompt Popup remains available as an optional path on non-macOS platforms; submitting from it opens the Overlay at the cursor position and sends the prompt text via `overlay:pending-prompt`.
- `OverlaySync` runs inside the shared provider tree on non-macOS platforms and mirrors persisted `settings.overlay` values into the trusted overlay runtime through the dedicated preload bridge. If startup auto-open is enabled, the main window renderer triggers the initial overlay show after settings hydrate.
- Overlay preferences are persisted in the existing sanitized renderer settings blob under `settings.overlay` with `enabled`, `launchOnStartup`, `hotkey`, `anchor`, `compactWidth`, `expandedWidth`, `promptAutoHideEnabled`, and `promptAutoHideTimeout`. No new secure-storage or Overlay-only settings file is introduced for Phase 1.
- Discord RPC is **always-on** in the main process. The client connects automatically at app startup (constructor-driven, no renderer toggle). It lazily loads the `discord-rpc` module inside try/catch so a missing native dependency never crashes the app; it reconnects with backoff when Discord is not running and surfaces connection errors in `DiscordRpcState.lastError`.
- Main-shell navigation history is now tracked entirely in the renderer through `AppShellProvider` + `src/contexts/appShellNavigation.ts`; both the titlebar arrows and side-mouse buttons call the same history controller instead of using raw `react-router` delta navigation.
- Native macOS app-menu `New Chat` requests are routed back into the shared renderer shell through `app:new-chat`, so session creation still uses the existing `ChatHistoryContext` flow and unsaved-settings guard instead of a main-process shortcut.

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
  - Electron path: metadata-first IPC uses `chat-store:get-metadata`, `chat-store:get-session`, `chat-store:save-session`, `chat-store:delete-session`, and `chat-store:save-index`; legacy `get-all` / `save-all` remain as compatibility wrappers.
  - Main storage: `electron/chatStore.ts` → `chat-index.json` for folders + session metadata and `chat-sessions/{sessionId}.json` for full message arrays under `app.getPath('userData')`; old `chat-history.json` is migrated into this split layout on first read.
  - Renderer memory policy: sidebar/session lists keep metadata-shaped sessions with `messages: []` for unloaded histories; only the active session plus two recent sessions keep full message arrays in memory.
- Provider streaming entry points:
  - `src/services/openrouter.ts` (`streamOpenRouterCompletion`)
  - `src/services/groq.ts` (`streamGroqCompletion`)
  - `src/services/alibaba.ts` (`streamAlibabaCompletion`)
  - `src/services/fireworks.ts` (`streamFireworksCompletion`)
  - `src/services/ollama.ts` (`streamOllamaCompletion`)
  - `src/services/perplexity.ts` (`streamPerplexityCompletion`)
- Provider services now only own request shaping and transport parsing. `src/providers/providerRuntime.ts` is the centralized execution layer for provider-specific streaming/non-streaming calls, title-generation text extraction, OpenRouter model normalization, and normalized event emission (`text-delta`, `reasoning-delta`, `tool-call-delta`, `file-delta`, `usage`, `citation`, `finish`, `error`) consumed by the shared orchestrator; `providerStreamClient.ts` is now a thin wrapper over that runtime.
- Provider prompt caching is coordinated by `src/providers/promptCaching.ts` plus provider-registry cache capability metadata. Chat streaming requests can add documented explicit cache markers for eligible OpenRouter/Alibaba routes, Fireworks session-affinity headers, and normalized cache telemetry (`cachedInputTokens`, `cachedOutputTokens`, `cacheMissInputTokens`, `cacheWriteInputTokens`) while title generation and provider utility calls remain unmodified.
- In development builds, chat streaming and tool execution append sanitized diagnostics through the narrow `chat-diagnostics:append-event` IPC channel into `debug-sessions/{sessionId}.jsonl` under `app.getPath('userData')`. These traces include provider/model, message summaries, context-optimization traces, request-shape summaries, per-round lifecycle, normalized and raw provider usage/cache stats, tool lifecycle, finish reasons, latency, and errors; they intentionally omit API keys, secure-storage values, raw response streams, full request bodies, file data, image data, and full message bodies.
- External coding agents can inspect a local chat by running `bun scripts/inspect-chat-session.mjs <sessionId-or-zura-chat-url>` (or `--json`) after the user copies the active debug reference from the dev-only command palette action `Copy Chat Debug ID`. The copied reference is `zura-chat://<sessionId>?userData=<base64url app.getPath('userData')>` so local agents can resolve the correct Electron data directory; plain session ids and `ZURA_USER_DATA_DIR` remain supported. This diagnostics path is a local script workflow, not an in-app model-callable tool.
- A dev-only in-app chat debug panel (`Show Chat Debug Logs` in the command palette) renders the same sanitized diagnostic events live for the active chat session. The panel hydrates its history through `chat-diagnostics:list-events` and subscribes to the `chat-diagnostics:event` broadcast channel; it offers a chronological timeline view and a categorized view (Request/Tool Calls/Streaming/Usage/Errors) selectable from the panel header. Streaming deltas captured during a response are coalesced (~50ms windows) into a new `stream-chunk` diagnostic phase via `src/diagnostics/streamChunkCoalescer.ts` so the panel can show provider activity without flooding the JSONL log. The panel and stream-chunk instrumentation are gated behind `import.meta.env.DEV` and the dynamic panel chunk is dropped from production bundles.
- Send and regenerate now use the same normalized provider-stream pipeline. Regeneration no longer maintains a separate direct-stream code path.
- Provider capabilities, auth checks, default endpoints, retry policy, tool support, image support, prompt-cache policy, provider accent colors, and title/model selector provider availability are resolved through `src/providers/providerRegistry.ts` instead of repeated provider switches.
- Fireworks is a first-class active provider again. It participates in provider selection, chat dispatch, title generation, model enablement, tool-capability checks, usage metrics, and the shared streaming pipeline through the provider registry.
- Fireworks model discovery now has a dedicated serverless catalog path in `src/services/fireworksModels.ts`, surfaced from `src/components/Settings/sections/FireworksModelSearchDialog.tsx` through Provider Hub in the same custom-model workflow style as OpenRouter.
- Tool calling:
  - Agent mode is plan-aware and verification-driven. `createAgentRun(...)` records a short task-specific `kind: 'plan'` step in `message.agentRun.steps`; the streaming orchestrator then prefers native structured tools before visual Computer Use. After any successful mutating/high-risk tool batch, `src/agent/reliability.ts` selects a read-only verification strategy (`file_search`/`file_read`, `window_list`/`windows_uia_snapshot`, or targeted `computer_screenshot`) and `useProviderStreaming.ts` injects an internal verification prompt before final synthesis. Verification is stored as a `kind: 'verify'` step and is bounded to one recovery attempt before the agent reports the failure instead of continuing blind. No new model-callable planning tool, IPC channel, or renderer bridge is introduced.
  - `src/hooks/useToolCalling.ts` → `src/tools/toolManager.ts` → `src/tools/executor.ts`
  - Assistant mode (`settings.assistantMode`) controls request-time tool exposure. Both `chat` and `agent` modes expose `web_search`, `code_execution`, memory tools, and trusted MCP tools based on their respective skill toggles. Agent mode on Windows additionally exposes native Windows tools (`file_*`, `app_*`, `window_*`, `windows_uia_*`, `system_shell`) for direct OS operations. The desktop-control fallback surface (`computer_*` tools) is exposed only when `assistantMode === 'agent'` AND the corresponding Windows-only skill (`computer_use` or `agent_desktop`) is enabled.
  - Agent mode tool approval uses renderer-side risk gating before execution: read-only tools (for example `web_search`, `file_read`, `file_search`, `app_find`, `app_list`, `window_list`, `windows_uia_snapshot`, `computer_screenshot`, and `computer_list_windows`) auto-run, while mutating/high-risk tools (for example shell/code execution, file writes/moves, app launch/install/uninstall, window mutation, UIA actions, MCP tools, and Computer Use input actions) require approval. The approval dialog supports reject, approve once, or trust the exact tool-name + argument signature; trusted signatures are stored in renderer `localStorage` under `zura-agent:trusted-tool-signatures`. Approval and execution state are mirrored into persisted `message.agentRun.steps` metadata.
  - Built-in main-process tools still execute through `window.ipcRenderer.invoke('execute-tool', toolName, args)`.
  - Namespaced MCP tools now execute through `window.mcp.executeTool(toolName, args)` so built-ins and MCP stay on separate IPC paths.
- Main tool registry: `electron/tools/index.ts` (restricted)
  - OpenRouter-compatible tool-call parsing/recovery now lives in `src/tools/adapters/openrouterToolCalls.ts`, keeping `src/tools/adapters/openrouter.ts` focused on request/response formatting.
- The Overlay reuses this same renderer chat pipeline through `useStreamingChat`; it does not create a parallel provider/tool execution path or a separate conversation store.
- The Overlay also listens for `overlay:pending-prompt` events from the main process (triggered when a prompt popup submission opens the overlay) and auto-sends the received prompt text.
- Active-response renderer state is split between persisted chat history and ephemeral `StreamingContext` data in `src/contexts/StreamingContext.tsx`.
  - `StreamingContext` can carry active assistant `agentRun` metadata for approval/execution bookkeeping and commits it back to chat history with the final assistant message; the dashboard no longer renders a dedicated agent timeline panel.
  - `StreamingContext` now tracks an explicit per-response `phase` (`reasoning`, `searching`, `tool`, `answering`) so the thinking/search UI stays stable across multi-search loops without persisting transient renderer-only state.
  - Reasoning is now segmented per round: in-flight `streamingState.thinking` represents only the current active thought, while completed reasoning rounds are appended to `thinkingBlocks` alongside search blocks so resumed research continues in a new block instead of extending the previous one.
  - Completed MCP tool executions are now appended into persisted `thinkingBlocks` as inline tool-history entries (alongside web search/search blocks) so the renderer can replay MCP activity inside the same thought timeline instead of only in the generic post-message tool card area.
- Completed MCP and built-in tool results are pushed into the active streaming state as soon as they finish, so generic tool runs remain visible in-chat before the assistant emits its follow-up answer.
- Final streaming commits now persist tool-only responses too; an assistant turn no longer needs non-empty text content for tool results, reasoning blocks, or approval outcomes to survive the handoff from `StreamingContext` into chat history.
- Persisted assistant-message response stats (`usage`) now reflect only the final visible answer round for that assistant turn. Pre-search planning/tool-call rounds and no-tools recovery rounds remain part of orchestration latency/tool history, but they are no longer merged into the final answer's token stats.
- Research-mode finalization now runs bounded no-tools synthesis retries inside `src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts`: after tool rounds finish, the orchestrator first requests a normal final synthesis, then escalates to stricter recovery prompts including a plain-text-only pass if the provider still returns blank output or `tool_calls` despite tools being disabled. If every no-tools pass still fails, the renderer commits a concise failure message while preserving the gathered `web_search` results in the timeline/tool UI.
  - OpenRouter image-generation models now flow through the same chat pipeline: renderer model metadata persists `inputModalities` / `outputModalities`, `src/services/openrouter.ts` sends `modalities` to `/api/v1/chat/completions` for image-capable models, the streaming hook captures `delta.images` payloads, and generated images are persisted back into chat history `files` so assistant image outputs render inline in the dashboard.
- Computer Use is disabled on macOS for now: main does not register the approval IPC handlers, built-in `computer_*` tool execution is rejected in the main process, and renderer tool exposure/UI hides Computer Use. On supported platforms, screen captures record a main-process coordinate context for the captured display (`electron/tools/computer-use/coordinates.ts`), including rendered screen image size, native capture size, display bounds, and DPI scale factor.
- `computer_screenshot` can capture either a full display or a specific visible app/window. Window-targeted capture accepts `window_id` from `computer_list_windows`, `window_title`, or `app_name`; it uses Electron `desktopCapturer` window sources and stores coordinate context against the captured window bounds when available, so follow-up click/scroll/cursor actions map coordinates to the same app-specific capture instead of the whole display. Post-action screenshots reuse the latest screenshot target.
- The default Computer Use prompt no longer instructs agents to always screenshot first. Agent mode should inspect through native `file_*` / `app_*` / `window_*` / `windows_uia_snapshot` tools first, use app/window-targeted screenshots second, and use full-screen screenshots only as the fallback for truly visual tasks.

#### Memory & Personalization (`settings.skills.memory`)
- ChatGPT-style "saved memories" — short, user-visible facts that the model and the user can both manage. Persisted locally only.
- Storage: `electron/memoryStore.ts` writes a single `memory-index.json` under `app.getPath('userData')`. Atomic whole-file writes; in-memory TTL cache; `withWriteLock` serializes the read-modify-write cycle so concurrent model + user mutations cannot clobber each other. FIFO cap at `MEMORY_CAP=200` (oldest by `createdAt` evicted), per-entry max length `MAX_MEMORY_CONTENT_LENGTH=1000`.
- Memory writes support an ADD-only lifecycle: entries are `active` or `superseded`, and `addMemoryWithDedupeAsync(...)` can NOOP near-duplicates or link a new memory to an older superseded one through `supersedes` / `supersededBy`. Superseded entries remain stored for history but are excluded from normal retrieval and prompt injection.
- Conversation summaries live in `electron/conversationSummaryStore.ts` as `conversation-summaries.json` under `app.getPath('userData')`. The store keeps one rolling summary per chat session, capped at `SUMMARY_CAP=15`, using the same atomic-write, TTL-cache, serialized-write pattern as saved memories.
- Data shape includes a forward-compatible `scope: { type: 'global' } | { type: 'project'; projectId: string }`. v1 only writes global memories. When the projects/folders feature ships, callers thread `projectId` through `buildMemoryBlock` and `loadMemoryBlock`; no schema migration required.
- Current renderer bridge: `window.memory.{list, add, addDeduped, update, delete, clear, search, summaries, onChanged}` (see `electron/preload.ts` and `src/electron/types.ts`). Summary APIs expose `window.memory.summaries.list()` and `window.memory.summaries.upsert(sessionId, summary)`. All channels are private to that bridge; they are not part of the generic `window.ipcRenderer` allowlist.
- Current prompt injection: `loadMemoryBlock(settings, scope, { userMessage })` uses main-process memory search to inject only the top relevant memories for the current user message; when no user message is supplied, it injects the most-recent K memories. It does not silently fall back from a no-match search to unrelated recent memories. Superseded memories are excluded. When auto-management is enabled, the block appends the built-in memory instruction from `src/prompts/defaultMemoryPrompt.ts`; in manual-only mode, saved memories still inject but the save/update/search nudge is omitted.
- Recent-activity prompt injection: `src/prompts/buildRecentActivityBlock.ts` builds a compact "## Recent Activity" block from conversation summaries and `getEffectiveSystemPrompt(...)` inserts it before saved memories. This gives new conversations continuity without embedding/vector retrieval.
- Current skill gating: `skills.memory.enabled` gates memory injection as a whole. `skills.memory.config.autoManage` (default true) gates model-callable memory tools, background extraction, and the autosave nudge; when false, memory is manual-only.
- Background extraction ("dreaming") runs after a completed chat turn in `src/services/memoryExtraction.ts`, called from `useStreamingChat`. It sends the recent conversation tail plus the just-finished turn to the resolved memory model, asks for durable user facts and one short session summary, writes facts through `window.memory.addDeduped(...)`, and upserts the session summary. The model is resolved from `settings.memoryModel` when set, otherwise it defaults to the active chat model (`settings.aiModel`); this is a documented default, not an error-masking fallback. The flow is best-effort and silent on failure, but it is a meaningful model-call data flow and is gated by `skills.memory.config.autoManage`.
- Built-in prompt templates are code-owned runtime defaults. Settings -> System Prompt renders the system, web search, tool, memory, chart, and title prompts as read-only viewers. `normalizeStoredSettings(...)` replaces persisted prompt overrides with the current defaults instead of preserving user edits.
- Memory is shipped as a built-in skill (`skills.memory`, default enabled). Current enablement and auto-management semantics are described above.
- Model-callable tools (renderer-only, gated by `isMemoryAutoManageEnabled(settings.skills)` in `useToolCalling.getEnabledToolsForProvider`): `save_memory`, `update_memory`, `delete_memory`, `search_memories`. Defined in `src/tools/memoryTools.ts`; routed by `src/tools/executor.ts` ahead of the MCP / built-in main IPC paths. Each successful mutation fires a sonner toast and returns a `MemoryToolEvent` payload on `ToolResult.data` so the inline `MemoryUpdatePill` (see below) can render diffs without re-fetching.
- Settings UI: Settings -> Personalization -> Memory (`src/components/Settings/sections/MemorySection.tsx`). Lists memories, supports inline add/edit/delete and clear-all, exposes the auto-management sub-toggle, exposes the background memory-extraction model selector (`settings.memoryModel`, with a "use current chat model" default option), displays recent-activity summaries, writes through `window.memory.*` directly, and live-syncs via `memory-store:changed`.
- Memory autosave instruction is code-owned as part of the built-in default memory prompt. Settings -> System Prompt renders it read-only alongside the other built-in prompt templates.
- Inline chat surface: `src/components/chat/MemoryUpdatePill.tsx` renders inside assistant messages (`MessageRenderer`). It groups all memory tool events from a single turn into one collapsed pill ("Memory updated" / "Memory updated · N changes" / "Searched memories"); expanding shows added / updated / removed rows with a "was: …" line for updates. Memory tool calls are filtered out of the generic `ToolResultDisplay` list so they only appear through this pill.
- Out of scope for v1 (deliberately): embeddings / vector search, dense AI-generated profile summary (ChatGPT's "User Knowledge Memories"), per-provider memory.

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

#### Agent Desktop / Agent View (`settings.agentDesktop`, `skills.agent_desktop`)
- **Windows-only**, default disabled. Provisions or reuses a dedicated Windows Virtual Desktop and parks the agent's app windows there during agent mode, keeping agent activity off the user's working desktop. It is a **workspace-separation and supervision** feature, **not** an isolation boundary: all Virtual Desktops for one Windows user share the same filesystem, registry, clipboard, network identity, and Input_Session.
- Built as a **mode of the existing Computer Use surface** — it introduces **no new model-callable tools**. The model keeps calling the existing `computer_*` tools through `execute-tool`; when `settings.agentDesktop.enabled` / `skills.agent_desktop.enabled` is active, `electron/tools/index.ts` first calls `agentDesktopService.ensureReadyForTool(...)` for every routed `computer_*` action. That readiness step initializes/validates the VDA integration, provisions an Agent Desktop session if needed, verifies that an active session's recorded Agent_Desktop still exists, and recreates a missing/stale Agent_Desktop before work proceeds. `computer_launch_app` additionally displays/switches to the Agent_Desktop before launching so new app windows are not opened on the current User_Desktop, then returns to the recorded User_Desktop after the launch attempt; if the Agent_Desktop cannot be displayed, the launch is blocked with an error. Only after readiness succeeds are calls routed through `agentDesktopService.gateComputerAction(...)`, screenshots redirected to the Agent Desktop, and the existing Computer Use executors invoked. Normal `computer_use` and `agent_desktop` are mutually exclusive UI modes in the composer plus-button and Skills catalog. The gate applies placement, presence, targeting, the approval policy, the shared kill switch, and the shared action cap before delegation. It reuses the existing `BaseApprovalManager` pattern, the double-Escape kill switch (`KILL_SWITCH_WINDOW_MS = 500`), the per-session action cap (`MAX_ACTIONS_PER_SESSION = 50`), the coordinate mapping (`electron/tools/computer-use/coordinates.ts`), and the `AgentRun` timeline.
- Main-process module: `electron/agentDesktop/` (see Repo Map for the per-submodule responsibilities). `AgentDesktopService` (`service.ts`) is the single orchestration entry point; `getAgentDesktopService()` resolves a process-wide singleton so the IPC layer and the Computer Use gate share one VDA binding, one session, and one shared action counter / abort state.
- **Presence model:** sessions start in `background` (non-input actions like screenshot/list/find allowed; launches staged; input actions **held** for up to 60s in `heldInputQueue.ts`). The user activates **Take_Over** to switch the displayed desktop to the Agent_Desktop, which transitions to `take-over` **only after the display switch succeeds**; input is then delivered subject to the approval policy. Ending Take_Over returns the display to the recorded User_Desktop and sets `background`.
- **Approval policy** (`approvalPolicy.ts`, pure): per-action-type `auto-approve` vs `approval-required` classification driven by a configurable allowlist; an action is `auto-approve` only on an explicit allowlist match. `launch_app`, `close_app`, and file deletion are always forced to `approval-required` during normalization regardless of stored value.
- **IPC channels** (dedicated `window.agentDesktop` bridge, registered in `electron/agentDesktop/index.ts`):
  - invoke (renderer → main): `agent-desktop:get-state`, `agent-desktop:apply-settings`, `agent-desktop:take-over`, `agent-desktop:end-take-over`, `agent-desktop:resolve-approval`, `agent-desktop:acknowledge-disclosure`
  - broadcast (main → renderer): `agent-desktop:state-changed` (full `AgentDesktopState` on any lifecycle/presence/pending-approval change), `agent-desktop:pending-approval` (pending approval list), `agent-desktop:killed` (kill-switch abort so the timeline reflects the aborted session)
- **Windows-only gating (mirrors Computer Use — three gates):**
  1. Handler registration is gated in `electron/main.ts` (`if (!IS_MACOS) registerAgentDesktopHandlers()` during `app.whenReady()`; `will-quit` returns the display to the recorded User_Desktop then calls `disposeAgentDesktopService()`).
  2. Defense-in-depth: every IPC handler in `electron/agentDesktop/index.ts` rejects on `process.platform === 'darwin'` without performing any desktop operation, even though handlers are never registered on macOS.
  3. Renderer tool exposure is gated by `isWindowsRuntime()` in `src/hooks/useToolCalling.ts`; on macOS no Agent Desktop controls render and the `computer_*` surface is filtered out.
- **`VDA_Binding` dependency + graceful degradation:** `electron/agentDesktop/vdaBinding.ts` is the only module that touches `VirtualDesktopAccessor.dll` (via the `koffi` FFI library, both lazily `require()`-d inside try/catch). In development the DLL is resolved from a Windows-build-specific subfolder under `electron/agentDesktop/native/`; packaged builds copy those DLL subfolders through `build.extraResources` and resolve them from `resources/agentDesktop/native/`. Windows build `26100+` uses the 24H2 DLL, while older Windows 11 builds use the 23H2 DLL. Because the DLL's exported function set changes between Windows builds, `load()` probes required exports/arity within `VDA_LOAD_TIMEOUT_MS` and records an outcome of `available` | `unavailable`, and every call is wrapped to throw a structured `VdaError` (`load-failed` | `incompatible-api` | `call-failed`) rather than letting a native exception escape. When the binding is **unavailable** (missing FFI module/DLL, incompatible API, or a runtime call failure): the process never crashes; **only the Agent Desktop capability is disabled** while **all other application capabilities stay operational**; a user-visible error that names the VirtualDesktopAccessor integration is surfaced via `AgentDesktopState.lastError`; and the service **never falls back to performing agent actions on the User_Desktop**.
- **Capability state:** `AgentRunCapabilities.agentDesktop` (`src/chat/types.ts`, resolved by `buildAgentCapabilities`) is `unavailable` on non-Windows / when VDA is unavailable / when the skill is disabled, `active` while a session is provisioned, otherwise `available`. The agent capability description (`AGENT_DESKTOP_CAPABILITY_DESCRIPTION` in `src/agent/agentRun.ts`) documents that input is delivered only while the Agent_Desktop is the displayed Virtual Desktop because all Virtual Desktops share one Input_Session.
- **Settings + disclosure:** preferences live in the existing sanitized `zura-settings` blob under `settings.agentDesktop` (no new file, no secure storage) and are mirrored into the service by `AgentDesktopSync` via `agent-desktop:apply-settings` within `SETTINGS_MIRROR_TIMEOUT_MS`; on an unusable payload the service retains the last-applied settings and surfaces an error. Agent Desktop is also surfaced as a skill (`skills.agent_desktop.enabled`) following the same dual-source-of-truth pattern as Memory. Enabling the skill requires acknowledging an honest "not a sandbox" disclosure (`agent-desktop:acknowledge-disclosure`); without acknowledgement the skill stays disabled and no capability is enabled.



- Startup theme apply: `src/main.tsx` reads `localStorage['zura-settings']` and applies theme with user customization (`themeAccent`, `themeBackground`, `themeForeground`, `themeContrast`).
- Active theme preset (`activeTheme`) selects a base theme; accent/background/foreground colors can be overridden per-user.
- Contrast slider (`themeContrast` 0-100) adjusts theme intensity; 100 = full contrast, lower values = softer.
- Legacy `softenedContrast: boolean` is migrated to `themeContrast: number` (true → 85, false/undefined → 100).
- Window controls are driven from renderer (`src/components/TitleBar.tsx`) through `window.windowControls` (preload) → `window-controls:*` IPC handlers (`electron/ipc/systemHandlers.ts`). Main emits `window-controls:state` on maximize/unmaximize/fullscreen transitions.
- The titlebar info menu (`src/components/TitleBarInfoMenu.tsx`) uses `window.updater` for release actions and `window.appInfo` for both runtime/build metadata (`app-info:get`) and launching the separate About window (`app-info:open-about-window`).
- The main shell still uses the same hidden-titlebar/vibrancy window model on macOS, but the renderer title bar is visually lighter there: traffic-light spacing is preserved while solid sidebar/content overlays remain a Windows/Linux shell treatment.

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
- Title generation configuration UI lives in **Appearance** (`src/components/Settings/sections/AppearanceSection.tsx`) for dedicated title-model selection and sidebar reveal mode.
- Title generation prompt editing lives in **System Prompt** (`src/components/Settings/sections/SystemPromptSection.tsx`) as a dedicated prompt block.
- Runtime generation is handled by `src/services/titleGenerator.ts` using `settings.titleModel` and `settings.titleGenerationPrompt`; the selected title model is resolved through the shared provider registry and executed through the shared non-streaming provider runtime helper in `src/providers/providerRuntime.ts`.
- Title generation no longer follows the active chat model and no longer performs cross-provider fallback attempts; failures reset the session title to `New Chat`.
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
    - `titleModel` (dedicated model used for title generation; provider inferred from the selected model)
    - `titleGenerationPrompt` (prompt template for generating titles; supports `{{userMessage}}` token)
    - `titleGenerationDisplayMode` (`instant` or `typewriter` sidebar reveal)
  - Background memory extraction model: `memoryModel` (dedicated model for background "dreaming"/extraction; provider inferred from the selected model). Empty string = follow the active chat model (`settings.aiModel`). Selected in Settings → Personalization → Memory.
  - Skills map: `skills` (built-in IDs keyed by `skillId`, currently `web_research` (default enabled), `code_execution` (default disabled), `computer_use` (default disabled), `chart_generation` (default disabled), `memory` (default enabled), and `agent_desktop` (Windows-only, default disabled), each with `enabled`).
  - Agent Desktop preferences: `agentDesktop` (Windows-only Agent View; `enabled`, `disclosureAcknowledged`, `persistence` (`persist` | `ephemeral`), per-action `approvalPolicy`, and clamped `approvalTimeoutMs`). Lives in the sanitized settings blob — no new file, no secure storage. `skills.agent_desktop.enabled` mirrors `settings.agentDesktop.enabled` (dual source of truth, same pattern as Memory).
  - Discord RPC preferences: `discordRpc` (`appId`). Lives in the sanitized settings blob — no new file, no secure storage. `appId` defaults to the official ZuraAI Discord Application ID (`1512516130911162610`) so the feature works out of the box; users can override it with their own Client ID. Discord RPC is always-on; there is no enable/disable toggle.
  - Legacy `webSearchEnabled` / `structuredResearchEnabled` are migrated into `skills.web_research.enabled`; `structuredResearchEnabled` is retained only as a migration input and is not used by runtime logic.
  - `themeContrast` (0-100, default 100): Numeric contrast intensity; lower values produce a softer look.
  - `themeAccent`, `themeBackground`, `themeForeground`: Optional hex color overrides for theme base colors; when set, they override the preset's base colors.
  - Legacy `softenedContrast: boolean` is migrated to `themeContrast` (true → 85, false → 100) and removed from persisted state.
- Chat history fallback (non-Electron): `zura-chat-history`
- Secure-key migration flag: `zura-api-keys-migrated`
- Last active chat session: `zura-ui:lastChatSessionId`
- Agent-mode trusted tool approvals: `zura-agent:trusted-tool-signatures` (exact tool-name + argument signatures for user-trusted mutating tool calls; used only by the renderer approval gate).
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
- Chat history: `chat-index.json` plus `chat-sessions/{sessionId}.json` (`electron/chatStore.ts`); legacy `chat-history.json` is a migration input only.
- Dev-only chat diagnostics: `debug-sessions/{sessionId}.jsonl` (`electron/chatDiagnostics.ts`); sanitized rolling JSONL traces capped per session and unavailable in packaged builds.
- Persisted assistant `thinkingBlocks` may now include completed MCP tool-history entries (`type: 'tool'`) with tool name/arguments/result metadata so the renderer can replay inline MCP call history from stored sessions.
- MCP server metadata: `mcp-servers.json` (`electron/mcp/mcpStorage.ts`)
  - Stores versioned non-secret server config, last-known tools, last-known resources, last-known prompts, and last connection metadata.
  - Secret-bearing env/header/token entries store secure-storage references, not raw secret values.
- Secure storage: `secure-storage.json` (`electron/secureStorage.ts`)
  - Encryption: `safeStorage` is required for reads/writes; the app no longer falls back to plaintext persistence when OS-backed encryption is unavailable
  - Legacy plaintext secret entries from older builds are only migrated forward into encrypted values when `safeStorage` is available
  - Stored API keys: `openRouterApiKey`, `perplexityApiKey`, `groqApiKey`, `alibabaApiKey`, `fireworksApiKey`, `deepseekApiKey`, `tavilyApiKey`
  - Also stores MCP secret entries under deterministic keys like `mcp.server.<serverId>.(env|header|token).<name>`
  - The preload presence bridge (`secure-storage:get-presence`) reads only allowlisted key existence without decrypting values; the batch read bridge (`secure-storage:get-all`) remains restricted to the provider-key allowlist for explicit full hydration paths.
- No dedicated performance metrics file is persisted by the app.

### Tool System (Function Calling)
Tool execution is intentionally restricted.

- Renderer side:
- Built-in main-process tool manifest: `src/tools/builtinTools.ts` (shared `web_search`, Computer Use, and Windows-native tool manifests plus built-in tool names)
- Built-in tool schemas: `src/tools/definitions.ts` (renderer-facing definitions derived from `builtinTools.ts`)
  - Runtime MCP tool adapter: `src/tools/mcpRegistry.ts` maps connected MCP tools into generic request-time descriptors
  - Skill gating + runtime merge: `src/hooks/useToolCalling.ts` + `src/skills/index.ts` decide which built-in tools are exposed and merge them with eligible MCP tools at request time
  - Provider adapters: `src/tools/adapters/*` (Perplexity is explicitly excluded)
  - Execution: `src/tools/executor.ts` keeps built-in IPC execution for built-in main-process tools and routes namespaced MCP tools through the dedicated `window.mcp.executeTool(...)` bridge
    - Before invoking built-in `web_search`, the renderer resolves omitted `search_depth` values from `settings.tavilySearchDepthPreference`; `auto` applies a lightweight query heuristic and manual modes inject the selected Tavily tier directly.
    - `src/tools/toolManager.ts` applies the renderer-side batch execution policy for `web_search`: duplicate/facet-deduping within the current assistant response, remaining-budget enforcement, synthetic skipped tool results for over-budget or duplicate calls, and parallel execution for the executable subset of the batch.
  - MCP resources and prompts are not merged into the model tool surface; the renderer only exposes them through user-driven browsing/preview flows in the MCP library UI.

- Main process side:
  - Tool IPC: `electron/tools/index.ts` (restricted registry for `web_search`, code execution, Computer Use, and Windows-native built-ins)
  - MCP tool IPC: `electron/mcp/index.ts` (`mcp:execute-tool`, `mcp:resolve-approval`) with approval gating handled by `electron/mcp/mcpApprovalManager.ts`
  - Native Windows tools (normal Agent mode + Agent Desktop mode supplement): `windows_uia_snapshot`, `windows_uia_invoke`, `windows_uia_set_value`, `windows_uia_select`, `system_shell`, `file_read`, `file_write`, `file_search`, `file_move`, `app_find`, `app_launch`, `app_list`, `app_install`, `app_uninstall`, `window_list`, `window_focus`, `window_move`, and `window_close` are exposed through the existing `execute-tool` path and preload validation, with no new renderer IPC channel. Read-only tools auto-run. Mutating tools require explicit approval/`autoApprove` and fail closed when approval is absent or rejected. UIA/app/window tools return clear unsupported-platform errors off Windows. These tools are intended to reduce screenshot/click/type usage; `computer_*` remains the fallback for unsupported controls and genuinely visual tasks. Browser and Office automation are intentionally not included in this version.
  - Agent Desktop (Windows-only): no new model-callable tools. When the `agent_desktop` skill is enabled on Windows, `electron/tools/index.ts` routes the existing `computer_*` calls through `agentDesktopService.ensureReadyForTool(...)` and then `agentDesktopService.gateComputerAction(...)` (in `electron/agentDesktop/`) before delegating to the Computer Use executors; readiness can provision or recreate a missing/stale Agent_Desktop, while the gate enforces placement, presence, targeting, the allowlist approval policy, the shared kill switch, and the shared action cap, and redirects captures to the Agent_Desktop. See the "Agent Desktop / Agent View" runtime-flow section above.
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
- DeepSeek: `src/services/deepseek.ts` (OpenAI-compatible at api.deepseek.com; supports streaming, tool calling, thinking mode via `reasoning_content`, JSON output, and model catalog via `/models`; balance check via `/user/balance`)
- Fireworks: `src/services/fireworks.ts` (OpenAI-compatible inference) plus `src/services/fireworksModels.ts` for the serverless model catalog
- Ollama: `src/services/ollama.ts` (local server; tools supported for compatible models)
- Perplexity: `src/services/perplexity.ts` (native web/research; excluded from external tools)
- Chat title generation: `src/services/titleGenerator.ts` (uses `settings.titleModel` and `settings.titleGenerationPrompt`, resolves provider from the chosen model, and executes through the shared provider runtime)

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
- Don’t hardcode model IDs/names anywhere in the codebase. Models are user-configured and resolved at runtime through `settings.*` and the shared provider registry (`src/providers/providerRegistry.ts`). Use the active selection (`settings.aiModel`, `settings.titleModel`, etc.) and the configured model arrays (`configuredModels`, `ollamaModels`, `perplexityModels`, `groqModels`, `alibabaModels`, `fireworksModels`, `deepseekModels`) instead of baking in a specific model. This applies to runtime code, tests should use clearly-fake placeholder IDs, and never add a hardcoded "default"/"fallback" model (see the fallback guardrail in Key Concepts).
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
