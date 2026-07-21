# AGENTS.md — guide for people and coding agents working on ZuraAI

This file is the source of truth for how ZuraAI is put together.

**Hard rule:** if you change architecture (new processes/windows, IPC channels, storage locations, tools, AI providers, packaging assumptions, or meaningful data flow), update the Architecture section in the **same** PR or commit.

---

## What this project is

ZuraAI is a desktop AI assistant built with **Electron + React + Vite + TypeScript**.

What it does well:

- Dashboard UI for chats, settings, models, MCP, memory, and reminders
- Multi-provider chat: Alibaba Cloud, ChatGPT Codex, Fireworks, Groq, NVIDIA NIM, Ollama, OpenRouter, OpenCode Go, DeepSeek
- A hardened path from the UI process through preload into Electron main
- A restricted tool system: built-in main tools, MCP tools, Agent Skills activation, artifacts, scheduled tasks, code execution, terminal, and Windows-native / Computer Use surfaces

---

## Quick start

| Command                               | Purpose                                                       |
| ------------------------------------- | ------------------------------------------------------------- |
| `bun install`                         | Install deps                                                  |
| `bun run dev`                         | Development app                                               |
| `bun run test`                        | Unit tests                                                    |
| `bun run test:watch`                  | Tests in watch mode                                           |
| `bun run typecheck`                   | TypeScript                                                    |
| `bun run build`                       | Desktop package (Windows installer/portable on Windows hosts) |
| `bun run build:dir`                   | Unpacked directory build                                      |
| `bun run build:mac` / `build:mac:dir` | macOS packages (needs a Mac)                                  |
| `bun run release:checksums`           | SHA-256 checksums for release files                           |
| `bun run preview`                     | Preview renderer bundle                                       |

Needs: Bun `>= 1.1` (see `package.json` for the exact pin), Node.js `>= 18`.

---

## Non-negotiable rules

- The **renderer is untrusted**. Privileged work belongs in main and must go through narrow, allowlisted preload bridges.
- Do not add broad IPC, broad filesystem access, broad HTTP proxying, or broad CORS bypasses.
- Do not add silent fallbacks, local heuristics, provider fallbacks, or “safe defaults” unless the user asked for them. Surface the real failure and fix the root cause.
- API keys, MCP secrets, and Brevo keys live in main-process secure storage only. Renderer settings may store sanitized non-secret state only.
- Built-in prompt templates are code-owned. Do not make them user-editable unless explicitly requested.
- Keep settings cards, chat composer containers, dropdowns, selects, context menus, titlebar menus, and nested model/provider menus visually flat. Use the shared `zura-menu-*` system in `src/styles/shared.css` and `src/components/ui/{dropdown-menu,select,context-menu,menubar}.tsx`.
- If you add a built-in capability that changes assistant behavior, add a code-owned default prompt (for example `src/prompts/default<Name>Prompt.ts`), wire defaults/normalization, and inject it only when enabled. Do not add Settings UI to edit those prompts unless asked.

---

## Repo map

| Path                                  | Purpose                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `electron/main.ts`                    | App lifecycle, IPC registration, windows, tray, updater, tools          |
| `electron/preload.ts`                 | `contextBridge` surface and IPC allowlists                              |
| `electron/ipc/`                       | Main-process IPC handlers                                               |
| `electron/windows/`                   | Main, About, tray, macOS menu, dev chat-debug windows                   |
| `electron/chatStore.ts`               | Chat index/session files under `app.getPath('userData')`                |
| `electron/secureStorage.ts`           | Encrypted keys via Electron `safeStorage`                               |
| `electron/mcp/`                       | MCP storage, connections, transports, approvals, IPC                    |
| `electron/tools/`                     | Built-in main tools (search, files, shell, code, Windows, Computer Use) |
| `electron/providers/`                 | Main-only providers (including ChatGPT Codex OAuth)                     |
| `electron/monitors/`                  | Scheduled reminders / lookouts                                          |
| `electron/notifications/email/`       | Brevo email for fixed notification flows                                |
| `electron/analytics/`                 | Opt-in PostHog analytics                                                |
| `electron/agentSkills/`               | Agent Skills discovery / activation / install                           |
| `src/App.tsx`                         | Renderer routing and shell layout                                       |
| `src/main.tsx`                        | Renderer bootstrap                                                      |
| `src/components/`                     | Dashboard, settings, titlebar, dialogs                                  |
| `src/contexts/`                       | Settings, chat history, shell, streaming, quick-send                    |
| `src/providers/`                      | Provider registry, dispatch, capabilities                               |
| `src/services/`                       | Provider HTTP shaping and stream parsers                                |
| `src/tools/`                          | Tool definitions, adapters, executor, MCP registry                      |
| `src/skills/`                         | Built-in capability catalog and settings normalization                  |
| `src/agentSkills/`                    | Agent Skills types and compact prompt catalog                           |
| `src/mcp/`                            | Shared MCP contracts and renderer context                               |
| `src/prompts/`                        | Code-owned prompt defaults                                              |
| `dist/`, `dist-electron/`, `release/` | Generated outputs — do not hand-edit                                    |
| `packages/zuraai/`                    | npm `zuraai` terminal launcher                                          |

---

## Architecture

### Process model

```text
Renderer (React/Vite) → Preload (allowlisted bridges) → Electron Main
```

- **Renderer** owns UI, sanitized settings, request shaping, and chat interaction state. Details: `docs/RENDERER_ARCHITECTURE.md`.
- **Preload** exposes only approved `window.*` APIs and restricted IPC wrappers.
- **Main** owns windows, secure storage, chat files, MCP processes, native tools, filesystem, notifications, updater, analytics transport, and OS integration.
- `electron/startup/mainProcessComposition.ts` registers privileged pieces and returns one reverse-order disposer. Partial startup rolls back what already registered.

### Windows and routes

- **Main window** loads `#/dashboard`. Routes under the app shell include `/`, `/dashboard`, `/settings`, and `/chat`.
- **About** is a separate window (`#/about`).
- **Chat debug** is a dev-only window (`#/chat-debug?sessionId=…`), disabled in packaged builds.
- **Agent approval overlay** is a small always-on-top window for tool approvals when ZuraAI is not focused. It only shows sanitized approval HTML and returns approve / reject / always-allow-exact-repeat. It does not run tools.
- **Background window guard** (Windows) is a transparent overlay while an agent run owns one external HWND. It tracks that window only, not the whole desktop.
- Unknown routes show a dedicated 404.
- Renderer windows deny in-window navigation and popups. HTTP(S) links open in the OS browser. Dev-server origins are matched exactly.

Packaged protocols:

- `zuraai` — launch/focus handoff (`zuraai://open` only focuses/creates the main window)
- `zura-chat` — trusted local chat deep links of the form `zura-chat://<sessionId>?userData=<base64urlUserData>`

Platform chrome:

- **Windows:** frameless main window with acrylic material, custom title bar in the UI
- **macOS:** hidden title bar with traffic lights, sidebar vibrancy, application menu, red close hides to Dock unless quitting for real

Memory / performance habits:

- Background throttling is on when unfocused
- Chat index keeps a thin recent tail; full history is windowed on open
- Message list is virtualized
- MCP does not auto-connect everything on the critical path

Chat run lifecycle:

- Send and regenerate share `ChatRunController` (one AbortController, clear phases, once-only finish). Details: `docs/CHAT_RUNTIME.md`.
- In-flight assistant state keeps a synchronous authoritative snapshot so completion cannot miss tokens while React is rendering composer edits. Throttled partial updates merge by field, and draft-only renders are isolated from the virtualized message viewport.
- Agent verification uses checkpoints rather than treating every UI mutation as a terminal outcome. A changed action with fresh main-issued screenshot/UI state may advance one necessary step in a multi-action UI workflow; it remains progress evidence, not proof of task completion. Verification alternates between normal agent rounds and recovery rounds exposing only the strategy's preferred read-only tools until success, user cancellation, or the global safety cap; failed attempts do not inject deterministic assistant copy.
- Opaque run ids travel in trusted tool context, never as model-visible arguments.
- Two distinct tools returning the same infrastructure failure stop further tool/model rounds and show a grounded failure message.

All BrowserWindows use `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true` unless this file explicitly justifies an exception.

### Persistence boundaries

**Renderer `localStorage`**

- Sanitized settings (`zura-settings`) with a numbered schema version and migrations
- UI/provider enablement, themes, shell state, and similar non-secret prefs
- Built-in capability state under `settings.extensions` (legacy `settings.skills` may still be normalized as an alias during migration)
- Agent Skills non-secret settings
- Non-Electron chat fallback only

**Main `app.getPath('userData')`**

- Chat index, folders metadata, per-session chat JSON
- Tool media under `tool-media/{sessionId}/`
- MCP config and runtime metadata (non-secret)
- Encrypted secure-storage JSON
- Main-owned Agent Mode autonomous-approval policy, encrypted through secure storage
- Memories, scheduled tasks, analytics consent, artifact exports, etc.

Main persistence rules (see also `docs/PERSISTENCE.md`):

- Atomic JSON writes; serialize full read-modify-write cycles
- Missing file → empty state; invalid JSON → corruption path; operational I/O errors propagate
- Secure storage requires OS encryption; no plaintext secret fallback

Secrets in main include provider keys, Tavily, Brevo, and the ChatGPT Codex OAuth bundle. The UI may see “is set?” and replace secrets, never read them back.

### IPC surface

The renderer never imports Electron APIs directly.

Invokable handlers register through `electron/ipc/trustedIpc.ts`. Requests must come from the top frame of a live ZuraAI window on the real dev origin or packaged `dist/index.html`.

Primary files: `electron/preload.ts`, `src/electron/ipcChannelManifest.ts`, `src/electron.d.ts`, `electron/ipc/*`.

Dedicated bridges include (non-exhaustive): `windowControls`, `appInfo`, `analytics`, `agentApproval`, `agentSkills`, `mcp`, `memory`, `scheduledTasks`, `artifacts`, `codeExecution`, `terminal`, `providerRuntime`, `backgroundWindow`, and a restricted generic `ipcRenderer` wrapper. `agentApproval` exposes request approval plus narrow get/set autonomous-mode calls. Enabling requires a main-owned native confirmation and persists only in encrypted main storage; renderer settings are never approval authority.

When adding/renaming/removing a channel:

1. Preload allowlist or dedicated bridge
2. `src/electron.d.ts`
3. Main handler + validation
4. Architecture section of this file

Details: `docs/IPC.md`.

### Desktop OS integration

Agent mode can use narrow main-owned tools (active window, status, open path, snap layouts; on Windows also apps, UI automation, Computer Use). Mutating actions stay approval-gated. There is no global launcher overlay or renderer-provided shell.

Windows agent runs may reserve one external window via `background_window_attach`. Main owns identity and scoping. Physical Computer Use needs a fresh main-issued screenshot ID. An approved targeted left click first maps its point to the smallest enabled/visible exact-HWND UIA/MSAA element with a provider-advertised Invoke, SelectionItem/Toggle, or default action. Successful provider activation remains background-safe and keeps the guard attached; provider failures propagate, while only an unsupported point may release the guard and use the verified foreground physical fallback. Accessibility state includes provider-advertised accelerator/access keys so shortcut outcomes can be resolved to semantic background actions without injecting keys. While a background reservation exists, main rejects `computer_key` and `computer_type` instead of silently releasing the guard; the agent must use target-scoped UI Automation or report `foreground_required`. Outside a background reservation, keyboard and text actions require a window-targeted screenshot and are automatically bound to its main-issued exact HWND; main briefly foregrounds and verifies that window before input, then restores the user's previous foreground window only if the target retained focus, so a concurrent user focus change is not overwritten. Whole-screen keyboard input is rejected, and the model cannot supply or replace the HWND. Delivery mode is evidence of dispatch, not semantic task completion.

Window capture identity is anchored to the desktop-capture source ID/native HWND and owning process metadata, not a mutable title. `app_name` can resolve against the owner process (for example Spotify while its title is a song), and subsequent work should retain the exact source ID/HWND. `ui_get_app_state` returns the hierarchical UIA/MSAA tree plus compact `ui_blocks`: accessibility blocks use desktop coordinates and may advertise background-safe actions, while OCR blocks use screenshot coordinates and are visual evidence only. OCR text crosses the PowerShell boundary as base64 so recognized control characters cannot corrupt the JSON transport.

Agent Mode may enable a persisted Fully autonomous policy only after explicit confirmation in a main-owned native dialog. While enabled, the main approval handler issues the same short-lived, exact sender/tool/argument-bound one-use authorization that a manual approval would issue; it does not add model-visible authority flags or weaken validation, tool scope, run budgets, background-window ownership, or emergency stop. MCP execution consumes that exact token through its dedicated bridge so an Agent Mode approval is not requested twice. Chat-mode calls and direct renderer invocations without a valid token retain their normal approval behavior. Disabling is immediate and does not require confirmation.

Installed-app discovery is main-owned (`app-index.json`). Launch requests are not proof a window appeared — verify with observation tools.

### Provider network boundary

Production streams, title/memory generations, catalogs, connectivity checks, and Ollama discovery go through `window.providerRuntime`. Credentials resolve in main immediately before the request.

- Ollama URLs: loopback only
- Alibaba: fixed regional allowlist
- No general HTTP proxy or CORS bypass

ChatGPT Codex is a main-only OAuth exception: fixed public client, loopback callback, encrypted tokens, fixed ChatGPT endpoints, text/reasoning only in ZuraAI, no Zura tool definitions on that path. Local/personal use; not a broad ChatGPT proxy.

### Tools

- Built-in manifest: `src/tools/builtinTools.ts`
- Exact name contract: `src/tools/builtinMainToolContract.ts`
- Main registry: `electron/tools/index.ts`

Rules:

- One `execute-tool` channel; exact names only
- Full JSON Schema validation without coercion
- Approval authority is main-issued, one-use, outside model args
- `web_search` is Tavily-only (no silent backend fallback)
- MCP tools use `window.mcp.executeTool`
- Terminal and Computer Use are Windows-oriented, default-disabled, approval-gated

See `docs/TOOLS_SECURITY.md` and `docs/CREATING_BUILTIN_TOOLS.md`.

### Providers

- Registry: `src/providers/providerRegistry.ts`
- Dispatch: `src/providers/providerRuntime.ts`
- Platform-neutral contracts: `packages/provider-core`
- Codex: `electron/providers/codexProvider.ts`

Do not hardcode undated live model ID lists in runtime dispatch. Provider enablement is independent of “key present.” Details: `docs/PROVIDERS.md`.

### Built-in capabilities vs Agent Skills

- **Built-in capabilities** (Settings UI may label them Extensions) are first-party assistant features such as web research, artifacts, memory, reminders, code execution, terminal, computer use. They are code-owned and gated by settings.
- **Agent Skills** are separate open-format skill packs (`.agents/skills/*/SKILL.md`). Their `allowed-tools` frontmatter is advisory metadata only — it never grants permissions or bypasses approvals.

There is **no** third-party extension store, manifest extension runtime, or store CLI in this app. Older “Zura Store / Command Center” pieces were removed and must not be reintroduced without an explicit architecture decision.

### Feature guardrails

- Artifacts live on their chat session. External open is the only artifact IPC path.
- Folder `memoryMode` can be default (global + folder) or folder-only.
- Scheduled lookouts may fetch public http(s) and loopback only — not private LAN.
- AI automations may use `schedule.kind: "agent"` so the running model chooses the next run (clamped 1m–7d) instead of a fixed interval preset; fixed intervals remain available when the user wants a hard cadence.
- The Schedules sidebar (internal route/view id remains `reminders`) is the UI for reminders, lookouts, and AI automations: create/edit forms, delete confirmation, type-aware run history, and open-run-chat for automation sessions. Schedules only fire while the app is open.
- Email notification prefs are non-secret; Brevo key stays in secure storage.
- Analytics is opt-in and sanitized (`TELEMETRY.md`).
- Discord RPC is best-effort; missing optional native deps must not crash the app.

---

## Build and release

### Desktop

- electron-builder config lives in `package.json#build`
- `npmRebuild` is false; prefer prebuilt natives
- Windows: NSIS installer + portable; user-selected install directory is final
- macOS: DMG/zip; signing/notarization is a separate ops step (credentials in env only)
- Auto-updater is production-only (`electron/updater.ts`)
- Publish target defaults to `solnikhil/ZuraAI`

Details: `docs/RELEASE.md`.

### npm package

`packages/zuraai` is a tiny launcher, not the Electron binary. Align versions with GitHub release tags when publishing.

---

## Testing

Default:

```bash
bun run typecheck
bun run test
```

Also run `bun run build` for packaging changes. Prefer focused tests for IPC, storage migrations, providers/tools, and UI you touch.

---

## Agent best practices

**Do**

- Read the relevant source before editing
- Keep changes scoped
- Prefer explicit validation over permissive handling
- Update tests and this file when behavior or architecture changes
- Keep generated outputs out of commits

**Don’t**

- Bypass preload or expose broad Electron APIs
- Store secrets in renderer state, logs, docs, or fixtures
- Introduce unapproved fallbacks
- Silently widen tool permissions
- Invent one-off menu styling
- Revert unrelated dirty worktree changes

---

## Known gaps / watchpoints

- User-configured global shortcut strings in settings are not fully wired to `globalShortcut.register(...)`.
- The npm launcher opens an installed desktop app through protocols; it does not install Electron itself.
- Folders / Projects UI may be temporarily gated in product code; do not delete the feature — follow the current flag if one exists.
- ChatGPT Codex remains an unofficial subscription-path integration with limited capabilities in ZuraAI.
- macOS signing/notarization may still be incomplete for seamless auto-update (see `docs/MAINTENANCE.md`).
