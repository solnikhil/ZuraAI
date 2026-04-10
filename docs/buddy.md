# Buddy Overlay Phase 1 Plan

Status: PROPOSED
Scope: Windows-first desktop overlay foundation + compact chat surface; no voice, no browser extension, no full autonomy

This document is the Phase 1 source of truth for the Buddy Overlay feature in ZuraAI.

- The Buddy Overlay is a separate desktop overlay window, not a browser extension and not an in-app-only panel.
- Phase 1 interaction is a right-edge mascot "peek" plus an expandable compact chat sheet.
- Phase 1 entry points are mascot click plus a dedicated global shortcut.
- Phase 1 autonomy is user-driven only; there is no proactive long-running autonomous workflow behavior.
- Phase 1 reuses the existing chat, tool, MCP, approval, and settings pipeline instead of introducing a second assistant runtime.
- Any implementation PR that lands the architecture described here must update `AGENTS.md` in the same change.

---

## Phase 1 Goal

Ship a reliable, optional Buddy Overlay that lives on the right edge of the desktop and lets users talk to ZuraAI without opening the full dashboard.

Phase 1 is constrained by the following:

- The overlay is implemented as a dedicated Electron `BrowserWindow`.
- The renderer remains untrusted; privileged overlay lifecycle and window control stay in Electron main.
- The overlay reuses existing provider, tool, MCP, approval, settings, and chat infrastructure.
- The overlay is enableable and disableable from Settings.
- The overlay is additive and must not regress the main dashboard, shared shell, or About window flows.

---

## Decisions Locked For Phase 1

These decisions are the working contract for Phase 1:

1. Windows is the primary supported platform for Phase 1 polish.
2. The Buddy Overlay is a separate `BrowserWindow` loaded from a dedicated renderer route such as `#/buddy`.
3. The Buddy window is always-on-top, skip-taskbar, frameless, and docked to the right edge of the active display work area.
4. Phase 1 uses click + global hotkey entry; there is no tray-only, hover-only, or browser-extension-first flow.
5. Phase 1 is not click-through by default.
6. Phase 1 uses user-driven prompts and explicit quick actions only.
7. Phase 1 reuses the existing streaming/chat/tool pipeline centered on `useStreamingChat`.
8. Phase 1 reuses the existing chat history store and current-session model; there is no new buddy-only persistence file.
9. Phase 1 introduces a narrow dedicated preload bridge for overlay lifecycle only; it does not widen the generic IPC bridge.
10. Voice, screenshot capture, browser-extension delivery, and proactive autonomous task execution are out of scope.

---

## Architecture Plan

### Main Process

Phase 1 should add a dedicated Buddy window module under `electron/windows/` that owns:

- Buddy window creation and reuse
- show / hide / toggle behavior
- peek / expanded state transitions
- right-edge docking and repositioning
- cleanup on close and on app shutdown

The window implementation should:

- use Electron `screen` APIs to dock against the active display `workArea`
- respond to `display-metrics-changed` and related display changes so the Buddy stays correctly positioned
- register a dedicated global shortcut in main
- handle shortcut registration failure cleanly because Electron documents that `globalShortcut.register(...)` can silently fail when another app already owns the accelerator

Privileged overlay behavior stays in main. The renderer should never receive raw Electron window control access.

### Preload / IPC

Phase 1 should add a dedicated bridge such as `window.buddyOverlay` in `electron/preload.ts`.

The bridge should stay narrow and lifecycle-focused. Expected surface:

- `show()`
- `hide()`
- `toggle()`
- `expand()`
- `collapse()`
- `getState()`
- optional `focusMainWindow()`

Implementation requirements:

- add explicit IPC handlers in main
- add allowlisted preload exposure for the Buddy bridge only
- add corresponding typings in `src/electron.d.ts`
- validate all renderer-provided arguments in main before use

### Renderer

Phase 1 should add a standalone route such as `#/buddy` outside `AppShellLayout`, similar to the existing `#/about` route pattern.

The Buddy surface should be a compact UI that mounts the same provider tree needed for:

- settings access
- chat history/session access
- streaming state
- MCP runtime state and approvals
- quick-send style handoff behavior where useful

The Buddy surface should reuse existing chat send, stream, stop, and tool orchestration rather than duplicating provider runtime logic.

The Buddy surface should also expose an "Open in main app" handoff path for users who want the full dashboard conversation experience.

### Settings

Phase 1 should add a `buddyOverlay` settings group to existing renderer settings storage. The expected fields are:

- `enabled`
- `launchOnStartup`
- `hotkey`
- `edge` with default `right`
- `peekWidth`
- `expandedWidth`

These settings are non-secret UI/configuration state and should remain in the existing sanitized renderer settings persistence path rather than creating a new secure-storage location.

---

## User Experience Contract

Phase 1 defines the following Buddy states:

- Hidden: overlay disabled or dismissed
- Peek: mascot partially visible from the right edge
- Expanded: compact chat panel slides out from the right
- Busy: overlay shows streaming or tool-running state
- Error: overlay shows recoverable failures without crashing the surface

Phase 1 interaction defaults are:

- Clicking the mascot expands the panel.
- Clicking close collapses back to peek instead of fully destroying the feature, unless the user has disabled the overlay.
- The global shortcut toggles expanded visibility.
- The Buddy can submit prompts, stop streaming, and trigger a small set of explicit quick actions.
- Approval-required MCP or tool actions still use the existing approval model; the Buddy does not bypass approvals.

---

## Research Basis

Phase 1 decisions above are based on the current Electron 41 windowing and shortcut APIs:

- Electron BaseWindow / BrowserWindow docs: [Electron BaseWindow](https://www.electronjs.org/docs/latest/api/base-window)
  - supports the Phase 1 window primitives we need, including `alwaysOnTop`, `skipTaskbar`, `focusable`, `transparent`, `thickFrame`, `setAlwaysOnTop(...)`, and `setShape(...)`
- Electron screen docs: [Electron screen](https://www.electronjs.org/docs/latest/api/screen)
  - the Buddy should dock using display `workArea` rather than raw display bounds and should react to `display-metrics-changed`
- Electron globalShortcut docs: [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)
  - global shortcut registration can silently fail when another application already owns the accelerator, so Phase 1 must include failure handling and fallback UX

Explicit conclusions for Phase 1:

- Do not promise "all workspaces" semantics on Windows because Electron documents that `setVisibleOnAllWorkspaces(...)` does nothing on Windows.
- Do not make click-through a Phase 1 requirement because input-shaping and click-through behavior add avoidable reliability and focus-management risk.
- Use `workArea` docking instead of raw screen bounds so the Buddy stays clear of the Windows taskbar.

---

## Out Of Scope

The following are explicitly out of scope for Phase 1:

- browser extension packaging
- click-through idle mode
- voice input or voice output
- screenshot capture and OCR flows
- freeform draggable mascot behavior with arbitrary edge positions
- full task timeline or autonomous workspace UI
- new secure-storage locations
- new tool backends or provider runtimes

---

## Acceptance Criteria

Phase 1 is ready for implementation sign-off when the following future implementation targets are clear and testable:

- the overlay can be enabled in settings and reopened after app restart if `launchOnStartup` is enabled
- the Buddy opens from both mascot click and global hotkey
- the Buddy sends prompts through the same chat/tool pipeline as the dashboard
- tool and MCP approvals still respect existing guardrails
- the overlay stays docked to the right side of the active display work area after display metric changes
- main app behavior remains unchanged when the Buddy feature is disabled

---

## Test Plan

Implementation work following this plan should include verification for:

- window creation, reuse, collapse, and teardown
- right-edge positioning on single-display and multi-display setups
- hotkey registration success paths and conflict fallback behavior
- settings persistence for enablement, startup, widths, and hotkey
- chat send, stream, and stop behavior from the Buddy surface
- MCP approval behavior from the Buddy surface
- recovery when the main window is closed while the Buddy remains open
- preload hardening so no generic IPC widening is introduced
- no regressions to the About window flow or the main dashboard routes

---

## Important Repo References

This plan is grounded in the current live architecture and should be implemented with these files as the primary references:

- `electron/windows/mainWindow.ts`
- `electron/windows/aboutWindow.ts`
- `electron/preload.ts`
- `src/App.tsx`
- `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts`
- `src/contexts/SettingsContext.tsx`
- `src/electron.d.ts`
- `AGENTS.md`

---

## Assumptions And Defaults

Phase 1 assumes the following defaults unless a later product decision replaces them:

- platform priority is Windows because the requested UX is explicitly Windows-shaped
- default dock edge is `right`
- default interaction model is click + hotkey
- default autonomy level is user-driven only
- default persistence approach is reuse of existing settings and chat history stores rather than a new Buddy-only storage location
- default implementation stance is additive and conservative: minimal new IPC, minimal new window types, and maximal reuse of the existing assistant runtime

---

## Later Phases

Later phases can expand the Buddy feature once the Phase 1 foundation is stable:

- Phase 2: richer Buddy UI, improved handoff between Buddy and dashboard, optional session targeting
- Phase 3: controlled semi-autonomous workflows, richer activity timeline, and optional click-through experimentation
- Phase 4: voice and deeper desktop integration if those still provide clear product value
