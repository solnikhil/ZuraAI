# AGENTS.md — Zura AI Agent Guide

This file is the single source of truth for how an automated coding agent should work in this repo.

**Hard requirement:** Whenever you change the project architecture (new processes/windows, new IPC channels, new storage locations, new “tool” capabilities, new AI providers, or meaningful data-flow changes), **update the “Architecture” section of this file in the same PR/commit**.

---

## What This Project Is
Zura AI is a Windows-first desktop AI assistant built with **Electron + React + Vite + TypeScript**.

Core capabilities:
- Dashboard UI (chat history, settings, model selection)
- Multi-provider AI calls (OpenRouter, Ollama, Perplexity, Groq, Alibaba Cloud)
- Hardened IPC boundary (renderer ↔ preload ↔ main)
- Tool calling system (restricted; `web_search` and `research_plan` — the latter expands to `web_search` in renderer)

---

## Quick Start (Agent Commands)
- Install: `npm install`
- Dev: `npm run dev`
- Tests: `npm test`
- Tests (watch): `npm run test:watch`
- Build (typecheck + Vite build + electron-builder): `npm run build`
- Build portable dir: `npm run build:dir`
- Preview renderer bundle: `npm run preview`

**Prereqs:** Node.js `>= 18`.

---

## Key Concepts (Read First)
- The **renderer is untrusted**. Anything privileged must be implemented in the **main process** and exposed via a **narrow, allowlisted** IPC surface.
- The app uses a **single BrowserWindow**. Renderer routes live inside that window (`#/dashboard`, `#/settings`, `#/chat`).
- Persistence is split:
  - **Settings + UI state** live in renderer `localStorage`.
  - **Chat history** and **secure storage** live in the main process under `app.getPath('userData')`.

---

## Repo Map
- `electron/` — Electron **main process** + preload + IPC handlers
  - `electron/main.ts` — app lifecycle, IPC registration, tray, windows, updater, tool handlers
  - `electron/preload.ts` — **contextBridge** API + IPC allowlists (security boundary)
  - `electron/ipc/` — `ipcMain` handlers (chat store, secure storage, system actions)
  - `electron/windows/` — main window, tray
  - `electron/chatStore.ts` — chat history persistence (JSON under `app.getPath('userData')`)
  - `electron/secureStorage.ts` — encrypted key storage via `safeStorage` (JSON under `userData`)
  - `electron/tools/` — main-process tool implementations (IPC registry is restricted)
  - `electron/updater.ts` — auto-updater (production only)

- `src/` — React/Vite **renderer**
  - `src/main.tsx` — renderer entrypoint; applies saved theme; renders `App`
  - `src/App.tsx` — routes (`#/dashboard`, `#/settings`, `#/chat`)
  - `src/contexts/` — app state (settings, chat history, app shell)
  - `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts` — primary dashboard chat pipeline (streaming + tools)
  - `src/services/` — AI provider integrations (HTTP calls; streaming + non-streaming)
  - `src/services/streamUtils.ts` — shared SSE (`parseSSEStream`) and NDJSON (`parseNDJSONStream`) stream parsing utilities used by all providers
  - `src/skills/` — built-in skill catalog + settings normalization/migration + skill/tool gating helpers
  - `src/tools/` — tool schema + adapters + tool execution coordinator

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
|   secureStorage,       |
|   updater, terminal,   |
|   windowControls       |
+------------------------+
```

### Windows & Routing
- **Main Window** (`electron/windows/mainWindow.ts`)
  - Loads `#/dashboard` (HashRouter)
  - `nodeIntegration: false`, `contextIsolation: true`
  - Windows uses a hidden title bar with **renderer-driven window controls** (`window.windowControls.*`), with native `titleBarOverlay` disabled to avoid separator artifacts in frosted mode
  - External links are opened via `shell.openExternal`.

- **Dev vs prod loading**
  - In dev, windows load `${process.env.VITE_DEV_SERVER_URL}#/...`
  - In prod, windows load `dist/index.html` with `hash: 'dashboard'`

### CORS Bypass (Main Process)
There is currently no active CORS-bypass header injection in `electron/main.ts`.

If a new provider lacks CORS headers and renderer `fetch()` is blocked, add a narrowly scoped `session.defaultSession.webRequest.onHeadersReceived` handler in main process for that provider domain only.

### IPC Surface (Security-Critical)
The renderer never imports Electron APIs directly; it uses what preload exposes.

- IPC bridge and allowlists live in `electron/preload.ts`.
- `window.ipcRenderer` is a **restricted wrapper** around `ipcRenderer`.

**Allowlisted channels (as implemented today):**
- `SEND_CHANNELS`:
  - `open-settings`
  - `set-titlebar-overlay`
  - `set-native-blur`
  - `spawn-terminal-command`
- `INVOKE_CHANNELS`:
  - `chat-store:get-all`, `chat-store:save-all`, `chat-store:migrate`, `chat-store:get-all-folders`, `chat-store:save-folders`
  - `secure-storage:get`, `secure-storage:set`
  - `get-process-metrics`
  - `memory:get-metrics`, `memory:force-cleanup`
  - `performance:report-renderer-metrics`, `performance:get-metrics`, `performance:get-renderer-metrics`, `performance:check-thresholds`
  - `execute-tool`
  - `window-resize`
  - `updater:check-for-updates`, `updater:quit-and-install`, `updater:get-version`
- `ON_CHANNELS`:
  - `update-available`, `update-downloaded`

**Important:** IPC handlers may exist in `electron/ipc/*` but are not reachable unless they’re also in the preload allowlist.

**If you add/rename any IPC channel:**
1. Add it to the correct allowlist(s) in `electron/preload.ts`
2. Add/adjust types in `src/electron.d.ts` (if exposed on `window.*`)
3. Implement/register handlers in `electron/ipc/*` (or other main modules)
4. Validate all inputs in main process (treat renderer as untrusted)

### Key Runtime Flows

#### Dashboard Chat (Streaming + Tools + History)
- Main orchestration: `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts`
- State/persistence: `src/contexts/ChatHistoryContext.tsx`
  - Electron path: `window.ipcRenderer.invoke('chat-store:get-all'|'chat-store:save-all'|'chat-store:migrate')`
  - Main storage: `electron/chatStore.ts` → `chat-history.json` under `app.getPath('userData')`
- Provider streaming entry points:
  - `src/services/openrouter.ts` (`streamOpenRouterCompletion`)
  - `src/services/groq.ts` (`streamGroqCompletion`)
  - `src/services/alibaba.ts` (`streamAlibabaCompletion`)
  - `src/services/ollama.ts` (`streamOllamaCompletion`)
  - `src/services/perplexity.ts` (`streamPerplexityCompletion`)
- Tool calling:
  - `src/hooks/useToolCalling.ts` → `src/tools/toolManager.ts` → `src/tools/executor.ts`
  - Executor calls main process: `window.ipcRenderer.invoke('execute-tool', toolName, args)`
  - Main tool registry: `electron/tools/index.ts` (restricted)

#### Skills-Based Research (`settings.skills`)
- Research capability is now controlled by built-in skills, not direct tool toggles.
- Built-in skill: `web_research` (`settings.skills.web_research`).
- **Normal mode** (`settings.skills.web_research.config.mode = "normal"`): model can call `web_search` directly; model decides depth. No hard cap (safety cap remains in loop guard).
- **Structured mode** (`mode = "structured"`): model is guided to call `research_plan` first for 2–6 steps; renderer (`src/tools/researchPlanHandler.ts`) expands steps into multiple `web_search` calls, renders the plan (`ResearchPlanBlock`), and returns aggregated results for final synthesis.
- Tool schema exposure is skill-gated in renderer:
  - Skill OFF: expose neither `web_search` nor `research_plan`
  - Skill ON (normal): expose `web_search`
  - Skill ON (structured): expose `web_search` + `research_plan`

#### Theme + Windows Titlebar Overlay
- Startup theme apply: `src/main.tsx` reads `localStorage['zura-settings']` and applies theme (including `softenedContrast` when set).
- Window controls are driven from renderer (`src/components/TitleBar.tsx`) through `window.windowControls` (preload) → `window-controls:*` IPC handlers (`electron/ipc/systemHandlers.ts`). Main emits `window-controls:state` on maximize/unmaximize/fullscreen transitions.
- `set-titlebar-overlay` remains exposed for compatibility, but `electron/windows/mainWindow.ts#setTitleBarOverlay` is currently a guarded no-op when native overlay is disabled.

#### Response Streaming Cadence
- Streaming updates use a fixed cadence from `getStreamingUpdateInterval()` in `src/components/Dashboard/ChatArea/hooks/streaming/streamingUtils.ts` (`120ms`).

#### Model Enablement (Provider Hub)
- Provider model rows in `src/components/Settings/sections/ProviderHubSection.tsx` support per-model enable/disable toggles.
- Model records in settings arrays (`configuredModels`, `ollamaModels`, `perplexityModels`, `groqModels`, `alibabaModels`) now support optional `enabled?: boolean`.
- Dashboard model selector (`src/components/Dashboard/ModelSelector/useModelSelector.ts`) only lists models where `enabled !== false`.

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

### Data Persistence

**Renderer (localStorage)**
- Settings: `zura-settings`
  - Model arrays may include optional `enabled` flags per model entry to control selector visibility.
  - Skills map: `skills` (built-in IDs keyed by `skillId`, currently `web_research` with `enabled` + `config.mode`).
  - Legacy `webSearchEnabled` / `structuredResearchEnabled` are migrated into `skills.web_research` and no longer used by runtime logic.
  - `softenedContrast` (Experimental): When true, reduces theme contrast for a gentler look.
- Chat history fallback (non-Electron): `zura-chat-history`
- Secure-key migration flag: `zura-api-keys-migrated`
- Last active chat session: `zura-ui:lastChatSessionId`
- App shell UI state:
  - `zura-ui:dashboardView`
  - `zura-ui:settingsSection`
  - `zura-ui:sidebarCollapsed`
  - `zura-ui:sidebarHidden`
- Command bar:
  - History: `zura-commandbar-history-v1`

**Main process (`app.getPath('userData')`)**
- Chat history: `chat-history.json` (`electron/chatStore.ts`)
- Secure storage: `secure-storage.json` (`electron/secureStorage.ts`)
  - Encryption: `safeStorage` when available; otherwise plaintext fallback
  - Stored API keys: `openRouterApiKey`, `perplexityApiKey`, `groqApiKey`, `alibabaApiKey`, `tavilyApiKey`

### Tool System (Function Calling)
Tool execution is intentionally restricted.

- Renderer side:
  - Tool schemas: `src/tools/definitions.ts` (`web_search`, `research_plan` definitions)
  - Skill gating: `src/hooks/useToolCalling.ts` + `src/skills/index.ts` decide which schemas are exposed to the model per request
  - Provider adapters: `src/tools/adapters/*` (Perplexity is explicitly excluded)
  - Execution: `src/tools/executor.ts` → IPC invoke `execute-tool`

- Main process side:
  - Tool IPC: `electron/tools/index.ts` (**currently only `web_search` enabled**)
  - Web search: `electron/tools/webSearch.ts`
    - Primary: Tavily API when key exists in secure storage (`tavilyApiKey`)
    - Fallback: duck-duck-scrape (real DuckDuckGo web search) when no key or Tavily fails

**Note:** Only `web_search` is implemented in `electron/tools/`. Previously existing but unused tool files (`datetime`, `clipboard`, `calculator`, `urlFetcher`) have been removed.

### Providers
- OpenRouter: `src/services/openrouter.ts` (OpenAI-compatible tool calling)
- Groq: `src/services/groq.ts` (OpenAI-compatible)
- Alibaba Cloud: `src/services/alibaba.ts` (DashScope/Tongyi Qwen; OpenAI-compatible at dashscope-intl.aliyuncs.com/compatible-mode/v1)
- Ollama: `src/services/ollama.ts` (local server; tools supported for compatible models)
- Perplexity: `src/services/perplexity.ts` (native web/research; excluded from external tools)
- Chat title generation: `src/services/titleGenerator.ts` (uses `settings.titleModel`)

### Environment & Secrets
- `VITE_DEV_SERVER_URL` — set in dev (used by Electron windows)

API keys are configured in-app and stored via secure storage (`secure-storage.json` under `app.getPath('userData')`).

Never commit `.env` or API keys.

### Known Architecture Gaps / TODOs (Current Code)
These are useful breadcrumbs for agents:
- Only the built-in debug shortcut (`Shift+Escape`) is registered in main; user-configured global shortcut strings in settings are still not wired to `globalShortcut.register(...)`.

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
- `package.json#build.publish` currently contains placeholders; update repo/owner for real releases.

---

## When to Update the Architecture Section
Update **this file’s “Architecture”** whenever you:
- Add/remove a BrowserWindow or change routing boundaries (`#/dashboard`, `#/settings`, etc.)
- Add/remove/rename IPC channels or exposed `window.*` APIs
- Change where data is persisted (settings/chat history/secure storage)
- Add/enable tools or change tool execution policy
- Add a new AI provider or change provider/tool support rules
- Change build outputs/packaging assumptions (`dist/`, `dist-electron/`, installer)
