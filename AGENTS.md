# AGENTS.md — Zura AI Agent Guide

This file is the single source of truth for how an automated coding agent should work in this repo.

**Hard requirement:** Whenever you change the project architecture (new processes/windows, new IPC channels, new storage locations, new “tool” capabilities, new AI providers, or meaningful data-flow changes), **update the “Architecture” section of this file in the same PR/commit**.

---

## What This Project Is
Zura AI is a Windows-first desktop AI assistant built with **Electron + React + Vite + TypeScript**.

Core capabilities:
- Dashboard UI (chat history, settings, model selection)
- Overlay UI (always-on-top, click-through, screenshot selection/cropping)
- Multi-provider AI calls (OpenRouter, Ollama, Perplexity, Gemini, Groq, MiniMax)
- Hardened IPC boundary (renderer ↔ preload ↔ main)
- Tool calling system (restricted; only `web_search` is enabled end-to-end)

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
- There are **two UI routes** and (intended) **two windows**:
  - Main window loads `#/dashboard` (and settings)
  - Overlay window loads `#/overlay` (transparent, always-on-top)
- Persistence is split:
  - **Settings + UI state** live in renderer `localStorage`.
  - **Chat history** and **secure storage** live in the main process under `app.getPath('userData')`.

---

## Repo Map
- `electron/` — Electron **main process** + preload + IPC handlers
  - `electron/main.ts` — app lifecycle, IPC registration, tray, windows, updater, tool handlers
  - `electron/preload.ts` — **contextBridge** API + IPC allowlists (security boundary)
  - `electron/ipc/` — `ipcMain` handlers (chat store, secure storage, system actions)
  - `electron/windows/` — main window, overlay window, tray
  - `electron/chatStore.ts` — chat history persistence (JSON under `app.getPath('userData')`)
  - `electron/secureStorage.ts` — encrypted key storage via `safeStorage` (JSON under `userData`)
  - `electron/tools/` — main-process tool implementations (IPC registry is restricted)
  - `electron/updater.ts` — auto-updater (production only)

- `src/` — React/Vite **renderer**
  - `src/main.tsx` — renderer entrypoint; applies saved theme; renders `App`
  - `src/App.tsx` — routes (`#/dashboard`, `#/settings`, `#/overlay`)
  - `src/contexts/` — app state (settings, chat history, app shell)
  - `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts` — primary dashboard chat pipeline (streaming + tools)
  - `src/components/Overlay.tsx` — overlay UI + screenshot selection/crop flow
  - `src/services/` — AI provider integrations (HTTP calls; streaming + non-streaming)
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
|  - UI (Dashboard)      |          |  - windows/ (main/overlay) |
|  - UI (Overlay)        |          |  - tray                    |
|  - AI providers (HTTP) |          |  - chatStore (userData)    |
|  - Tool manager        |          |  - secureStorage (userData)|
|                        |          |  - screenshot capture/crop |
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
|   updater, terminal    |
+------------------------+
```

### Windows & Routing
- **Main Window** (`electron/windows/mainWindow.ts`)
  - Loads `#/dashboard` (HashRouter)
  - `nodeIntegration: false`, `contextIsolation: true`
  - External links are opened via `shell.openExternal`.

- **Overlay Window** (`electron/windows/overlayWindow.ts`)
  - Intended to load `#/overlay`
  - Transparent, always-on-top, click-through when not selecting

- **Dev vs prod loading**
  - In dev, windows load `${process.env.VITE_DEV_SERVER_URL}#/...`
  - In prod, windows load `dist/index.html` with `hash: 'dashboard'` / `hash: 'overlay'`

### IPC Surface (Security-Critical)
The renderer never imports Electron APIs directly; it uses what preload exposes.

- IPC bridge and allowlists live in `electron/preload.ts`.
- `window.ipcRenderer` is a **restricted wrapper** around `ipcRenderer`.

**Allowlisted channels (as implemented today):**
- `SEND_CHANNELS`:
  - `close-overlay`
  - `set-ignore-mouse-events`
  - `open-settings`
  - `set-titlebar-overlay`
  - `spawn-terminal-command`
- `INVOKE_CHANNELS`:
  - `chat-store:get-all`, `chat-store:save-all`, `chat-store:migrate`
  - `secure-storage:get`, `secure-storage:set`, `secure-storage:get-all`, `secure-storage:clear`, `secure-storage:status`
  - `capture-screen`, `crop-screenshot`
  - `execute-tool`
  - `updater:check-for-updates`, `updater:quit-and-install`, `updater:get-version`
  - `ollama:list-models` (list local Ollama models)
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
  - `src/services/gemini.ts` (`streamGeminiCompletion`)
  - `src/services/ollama.ts` (`streamOllamaCompletion`)
  - `src/services/perplexity.ts` (`streamPerplexityCompletion`)
  - `src/services/minimax.ts` (`streamMiniMaxCompletion`)
- Tool calling:
  - `src/hooks/useToolCalling.ts` → `src/tools/toolManager.ts` → `src/tools/executor.ts`
  - Executor calls main process: `window.ipcRenderer.invoke('execute-tool', toolName, args)`
  - Main tool registry: `electron/tools/index.ts` (restricted)

#### “Research Mode” (Web Search / Deep Research toggles)
- User toggles live in settings: `settings.webSearchEnabled`, `settings.deepResearchEnabled`.
- Dashboard currently starts research mode with `startResearchMode(25, false)` when either toggle is enabled.
  - Mandatory/exact-search enforcement exists in `useToolCalling`, but is not currently started in mandatory mode by the dashboard.

#### Overlay Screenshot Capture/Crop
- Renderer: `src/components/Overlay.tsx`
  - `invoke('capture-screen')` then `invoke('crop-screenshot', selection)`
- Main process: `electron/ipc/systemHandlers.ts`
  - Captures primary display via `desktopCapturer`
  - Crops with bounds clamping and returns `data:image/jpeg;base64,...`
  - Clears the full-screen screenshot after crop to reduce memory

#### Theme + Windows Titlebar Overlay
- Startup theme apply: `src/main.tsx` reads `localStorage['zura-settings']` and applies theme.
- Titlebar overlay sync (Windows): `src/contexts/SettingsContext.tsx` sends `set-titlebar-overlay` → `electron/ipc/systemHandlers.ts` → `electron/windows/mainWindow.ts#setTitleBarOverlay`.

### Data Persistence

**Renderer (localStorage)**
- Settings: `zura-settings`
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
  - UI collapsed flags: `zura-commandbar-recents-collapsed`, `zura-commandbar-shortcuts-collapsed`

**Main process (`app.getPath('userData')`)**
- Chat history: `chat-history.json` (`electron/chatStore.ts`)
- Secure storage: `secure-storage.json` (`electron/secureStorage.ts`)
  - Encryption: `safeStorage` when available; otherwise plaintext fallback
  - Stored API keys: `openRouterApiKey`, `perplexityApiKey`, `geminiApiKey`, `groqApiKey`, `tavilyApiKey`, `minimaxApiKey`

### Tool System (Function Calling)
Tool execution is intentionally restricted.

- Renderer side:
  - Tool schemas: `src/tools/definitions.ts` (**currently only `web_search`**) 
  - Provider adapters: `src/tools/adapters/*` (Perplexity is explicitly excluded)
  - Execution: `src/tools/executor.ts` → IPC invoke `execute-tool`

- Main process side:
  - Tool IPC: `electron/tools/index.ts` (**currently only `web_search` enabled**)
  - Web search: `electron/tools/webSearch.ts`
    - Uses Tavily if key exists (`TAVILY_API_KEY` env or secure storage `tavilyApiKey`)
    - Falls back to DuckDuckGo Instant Answer API

**Note:** Other tool implementations exist in `electron/tools/*` (e.g. `datetime`, `clipboard`, `calculator`, `urlFetcher`) but are not wired to IPC by default.

### Providers
- OpenRouter: `src/services/openrouter.ts` (OpenAI-compatible tool calling)
- Groq: `src/services/groq.ts` (OpenAI-compatible)
- Gemini: `src/services/gemini.ts` (Gemini function calling)
- Ollama: `src/services/ollama.ts` (local server; tools supported for compatible models)
- Perplexity: `src/services/perplexity.ts` (native web/research; excluded from external tools)
- MiniMax: `src/services/minimax.ts` (OpenAI-compatible; streaming, tool calling, interleaved thinking/reasoning)
- Chat title generation: `src/services/titleGenerator.ts` (uses `settings.titleModel`)

### Environment & Secrets
- `VITE_OPENROUTER_API_KEY` — optional default OpenRouter key for renderer (Vite env)
- `TAVILY_API_KEY` — optional Tavily key for main-process `web_search`
- `VITE_DEV_SERVER_URL` — set in dev (used by Electron windows)

Never commit `.env` or API keys.

### Known Architecture Gaps / TODOs (Current Code)
These are useful breadcrumbs for agents:
- No `globalShortcut.register(...)` calls were found; shortcut strings exist in settings, but main-process global hotkey registration appears pending.
- `src/contexts/SettingsContext.tsx` sends `settings-changed`, but that channel is not allowlisted/handled; settings sync primarily happens via `localStorage` + `storage` events.
- `electron/windows/overlayWindow.ts` can `send('settings-updated', ...)`, but there is no renderer listener wired (and `settings-updated` is not in the preload `ON_CHANNELS`).

---

## Agent Best Practices (Do/Don’t)

### Do
- Keep changes scoped and consistent with existing patterns.
- Treat the renderer as untrusted; validate/sanitize everything in main-process handlers.
- Keep `contextIsolation: true` and `nodeIntegration: false` for all BrowserWindows.
- Use shadcn UI components for all UI work; do not introduce other UI component libraries.
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
- Add/remove a BrowserWindow or change routing boundaries (`#/dashboard`, `#/overlay`, etc.)
- Add/remove/rename IPC channels or exposed `window.*` APIs
- Change where data is persisted (settings/chat history/secure storage)
- Add/enable tools or change tool execution policy
- Add a new AI provider or change provider/tool support rules
- Change build outputs/packaging assumptions (`dist/`, `dist-electron/`, installer)
