# AGENTS.md — Zura AI Agent Guide

This file is the single source of truth for how an automated coding agent should work in this repo.

**Hard requirement:** Whenever you change the project architecture (new processes/windows, new IPC channels, new storage locations, new “tool” capabilities, new AI providers, or meaningful data-flow changes), **update the “Architecture” section of this file in the same PR/commit**.

---

## What This Project Is
 Zura AI is a desktop AI assistant built with **Electron + React + Vite + TypeScript**.

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
- The app uses a **single BrowserWindow**. Renderer routes live inside that window (`#/dashboard`, `#/settings`, `#/chat`) under a shared shell layout, with a hash-route fallback for unmatched paths.
- Persistence is split:
  - **Sanitized non-secret settings + UI state** live in renderer `localStorage`.
  - **API keys** live in main-process secure storage and are hydrated into renderer settings at runtime.
  - **Chat history** and **secure storage** live in the main process under `app.getPath('userData')`.

---

## Repo Map
- `electron/` — Electron **main process** + preload + IPC handlers
  - `electron/main.ts` — app lifecycle, IPC registration, tray, windows, updater, tool handlers
  - `electron/preload.ts` — **contextBridge** API + IPC allowlists (security boundary)
  - `electron/ipc/` — `ipcMain` handlers (chat store, secure storage, system actions)
  - `electron/startup/` — deferred startup orchestration and startup metrics
  - `electron/windows/` — main window, tray
  - `electron/chatStore.ts` — chat history persistence (JSON under `app.getPath('userData')`)
  - `electron/secureStorage.ts` — encrypted key storage via `safeStorage` (JSON under `userData`)
  - `electron/tools/` — main-process tool implementations (IPC registry is restricted)
  - `electron/updater.ts` — auto-updater (production only)

- `src/` — React/Vite **renderer**
  - `src/main.tsx` — renderer entrypoint; initializes performance tracking, lazy-image styles, markdown preloading, applies saved theme, renders `App`
  - `src/App.tsx` — routes (`#/dashboard`, `#/settings`, `#/chat`) under `AppShellLayout`, plus wildcard `*` fallback to a dedicated 404 renderer view
- `src/contexts/` — app state (split settings contexts, chat history, app shell, quick-send)
- `src/components/AppShellLayout.tsx` — shared renderer shell (title bar, command palette, resize handles, frosted-mode sync)
- `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts` — primary dashboard chat pipeline (streaming + tools)
- `src/utils/rendererPerformance.ts` — renderer-local performance tracker used for TTI-aware lazy loading
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
  - Main window web contents register a native global right-click menu via `electron/windows/contextMenu.ts` (`webContents.on('context-menu')`) with safe defaults (edit actions, copy/select-all, safe external link actions, and Inspect Element in both development and packaged builds)
  - External links are opened via `shell.openExternal`.

- **Dev vs prod loading**
  - In dev, windows load `${process.env.VITE_DEV_SERVER_URL}#/...`
  - In prod, windows load `dist/index.html` with `hash: 'dashboard'`

- **Renderer route fallback**
  - `src/App.tsx` defines `Route path="*"` to render the `NotFound404` component (`src/components/ui/demo.tsx`) for unknown hash routes.

- **Shared shell layout**
  - `src/App.tsx` wraps `/`, `/dashboard`, `/settings`, and `/chat` in `AppShellLayout`
  - `src/components/AppShellLayout.tsx` owns the title bar, command palette, Windows resize handles, frosted-mode sync, and route-level shell behavior
  - `/` is a dashboard alias

### Windows Installer Packaging
- Windows packaging uses `electron-builder` + NSIS **wizard installer** (`oneClick: false`) with install-directory selection enabled via `allowToChangeInstallationDirectory: true`, plus a repo-local include override at `installer/installer.nsh`.
- The installer uses the directory the user selects as the **final install path** for app files; it does not force an extra `\Zura` subfolder when the user picks a custom location.
- The installer applies Windows dark mode APIs (DWM dark title bar, `SetPreferredAppMode(ForceDark)`, `SetWindowTheme("DarkMode_Explorer")`, `SetCtlColors`) for a dark-themed install experience.
- Personalized install: greets the user by Windows username, shows branded progress messages, and dark-themes the wizard chrome plus visible controls (including progress bar, details listbox, and buttons).
- Installer assets (`build/icon.ico`, `build/sidebar.bmp`) are generated at build time by `scripts/generate-icons.mjs` and are gitignored.
- Build output goes to `release/` directory (gitignored). Installer artifact: `Zura-Setup-{version}.exe`.

### CORS Bypass (Main Process)
There is currently no active CORS-bypass header injection in `electron/main.ts`.

If a new provider lacks CORS headers and renderer `fetch()` is blocked, add a narrowly scoped `session.defaultSession.webRequest.onHeadersReceived` handler in main process for that provider domain only.

### IPC Surface (Security-Critical)
The renderer never imports Electron APIs directly; it uses what preload exposes.

- IPC bridge and allowlists live in `electron/preload.ts`.
- `window.ipcRenderer` is a **restricted wrapper** around `ipcRenderer`.
- `window.windowControls` is a **separate dedicated bridge** exposed from preload for minimize / maximize / close state, rather than part of the generic `window.ipcRenderer` allowlists.

**Allowlisted channels (as implemented today):**
- `SEND_CHANNELS`:
  - `set-native-blur`
  - `spawn-terminal-command`
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

**Important:** IPC handlers may exist in `electron/ipc/*` but are not reachable unless they’re also wired through preload allowlists or a dedicated preload bridge.

**If you add/rename any IPC channel:**
1. Add it to the correct allowlist(s) in `electron/preload.ts`
2. Add/adjust types in `src/electron.d.ts` (if exposed on `window.*`)
3. Implement/register handlers in `electron/ipc/*` (or other main modules)
4. Validate all inputs in main process (treat renderer as untrusted)

### Key Runtime Flows

#### Startup + Shell Initialization
- Main-process startup uses `electron/startup/deferredInit.ts` to defer non-critical work until the main window is visible.
- Current deferred tasks include delayed React DevTools install in development and deferred auto-updater initialization after first paint.
- Renderer startup in `src/main.tsx` initializes renderer performance tracking, injects lazy-image styles, preloads markdown rendering, applies saved theme settings, and then mounts `App`.
- Shared shell behavior lives in `src/components/AppShellLayout.tsx`, which wraps dashboard/settings/chat routes and coordinates title bar state, frosted-mode blur sync, command palette, and Windows resize handles.
- Renderer settings are split between `SettingsUIContext` and `SettingsConfigContext`, with the combined `SettingsContext` retained as a compatibility layer.

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
- **Structured mode** (`mode = "structured"`): model is guided to call `research_plan` first for 2–6 steps; renderer (`src/tools/researchPlanHandler.ts`) expands steps into multiple `web_search` calls, updates streaming research metadata (`researchPlan`, `researchProgress`), and returns aggregated results for final synthesis.
- Tool schema exposure is skill-gated in renderer:
  - Skill OFF: expose neither `web_search` nor `research_plan`
  - Skill ON (normal): expose `web_search`
  - Skill ON (structured): expose `web_search` + `research_plan`

#### Theme + Windows Titlebar Overlay
- Startup theme apply: `src/main.tsx` reads `localStorage['zura-settings']` and applies theme (including `softenedContrast` when set).
- Window controls are driven from renderer (`src/components/TitleBar.tsx`) through `window.windowControls` (preload) → `window-controls:*` IPC handlers (`electron/ipc/systemHandlers.ts`). Main emits `window-controls:state` on maximize/unmaximize/fullscreen transitions.
- Frosted/native blur mode is toggled from renderer via `set-native-blur` (preload allowlist) and applied in main window via `setNativeBlur`.

#### Renderer Performance Tracking
- Renderer startup/performance metrics are tracked locally in `src/utils/rendererPerformance.ts`.
- The tracker is initialized in `src/main.tsx` and consumed by `src/hooks/useLazyLoad.ts` for TTI-aware lazy loading.
- There is no longer a main-process performance-monitor IPC pipeline or persisted performance metrics log.

#### Response Streaming Cadence
- Streaming updates use a fixed cadence from `getStreamingUpdateInterval()` in `src/components/Dashboard/ChatArea/hooks/streaming/streamingUtils.ts` (`120ms`).

#### Model Enablement (Provider Hub)
- Provider model rows in `src/components/Settings/sections/ProviderHubSection.tsx` support per-model enable/disable toggles.
- Model records in settings arrays (`configuredModels`, `ollamaModels`, `perplexityModels`, `groqModels`, `alibabaModels`) now support optional `enabled?: boolean`.
- Provider-level toggles are persisted in `settings.providerEnabled` (`openrouter`, `ollama`, `perplexity`, `groq`, `alibaba`) and are independent from whether API keys/endpoints are filled.
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
- Current shell width calculations (sidebar panel, frosted glass continuation, titlebar overlays) consume `sidebarWidth` from `AppShellContext` when not hidden/collapsed.

#### Chat Title Generation Controls
- Title generation configuration UI lives in **Appearance** (`src/components/Settings/sections/AppearanceSection.tsx`) for provider/model selection and sidebar reveal mode.
- Title generation prompt editing lives in **System Prompt** (`src/components/Settings/sections/SystemPromptSection.tsx`) as a dedicated prompt block.
- Runtime generation is handled by `src/services/titleGenerator.ts` using `settings.titleModelProvider`, `settings.titleModel`, and `settings.titleGenerationPrompt`.
- New-session title reveal behavior is applied in `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts`:
  - `instant`: apply generated title immediately
  - `typewriter`: progressively reveal generated title in sidebar

### Data Persistence

**Renderer (localStorage)**
- Settings: `zura-settings`
  - Persisted settings are sanitized before write; secret API key fields are stripped and sourced from secure storage instead.
  - Model arrays may include optional `enabled` flags per model entry to control selector visibility.
  - Provider-level enablement map: `providerEnabled` (per-provider manual on/off state, independent from API key presence).
  - Title generation settings:
    - `titleModelProvider` (provider used for title generation)
    - `titleModel` (model used for title generation)
    - `titleGenerationPrompt` (prompt template for generating titles; supports `{{userMessage}}` token)
    - `titleGenerationDisplayMode` (`instant` or `typewriter` sidebar reveal)
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
  - `zura-ui:sidebarWidth`
  - `zura-ui:sidebarHidden`
- Command bar:
  - History: `zura-commandbar-history-v1`
- Model color assignments: `zura-model-colors`

**Main process (`app.getPath('userData')`)**
- Chat history: `chat-history.json` (`electron/chatStore.ts`)
- Secure storage: `secure-storage.json` (`electron/secureStorage.ts`)
  - Encryption: `safeStorage` when available; otherwise plaintext fallback
  - Stored API keys: `openRouterApiKey`, `perplexityApiKey`, `groqApiKey`, `alibabaApiKey`, `tavilyApiKey`
- No dedicated performance metrics file is persisted by the app.

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
    - Input classification happens at the top of `executeWebSearch`:
      - **URL-dominant input** (URL only) → Tavily **Extract** (`/extract`) with `format: markdown`, `extract_depth: basic`
      - **Query + URL** → Tavily **Extract** (`/extract`) with attached `query`, `chunks_per_source`, `extract_depth: advanced`
      - **Natural-language query (no URL)** → Tavily **Search** (`/search`)
      - **Docs/site exploration wording + URL** currently follows the URL extract path (future `map`/`crawl` integration can be added separately)
    - Tavily-first routing uses `tavilyApiKey` from secure storage; if extraction/search fails, fallback is duck-duck-scrape web search

**Note:** Only `web_search` is implemented in `electron/tools/`. Previously existing but unused tool files (`datetime`, `clipboard`, `calculator`, `urlFetcher`) have been removed.

### Providers
- OpenRouter: `src/services/openrouter.ts` (OpenAI-compatible tool calling)
- Groq: `src/services/groq.ts` (OpenAI-compatible)
- Alibaba Cloud: `src/services/alibaba.ts` (DashScope/Tongyi Qwen; OpenAI-compatible at dashscope-intl.aliyuncs.com/compatible-mode/v1)
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
