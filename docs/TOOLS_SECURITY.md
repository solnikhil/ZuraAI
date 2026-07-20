# Built-in tool security

Built-in tools run privileged code in the main process. Treat every tool name and every argument as untrusted until main validates it.

## Arguments are not permission

The model can request an action. The model must not grant permission for it.

Never accept authority through model-visible fields such as:

- `autoApprove`
- `approvalToken`
- `_agentSkills`
- fake “trusted” flags from renderer settings
- background window IDs, HWNDs, process identities, or overlay placement options

Main validates arguments against a closed JSON Schema and rejects reserved authority properties out loud. Silent stripping hides bugs.

Schema validation uses the shared CSP-safe interpreter in `packages/provider-core`. No `eval`, no runtime code generation, no inventing missing fields.

## How approval actually works

After a real user approval (or a main-verified exact-repeat trust match), main issues a short-lived, one-use token bound to:

- the requesting window
- the exact tool name
- a hash of the exact validated arguments

The token lives in execution context, not in model arguments. It is consumed before the tool runs. Reuse, expiry, wrong sender, wrong tool, or changed args all fail closed.

Exact-repeat trust stores only main-generated signatures. Raw tokens are never persisted. Renderer `localStorage` is not a source of authority for code, terminal, filesystem, UI automation, or Computer Use.

## Fully autonomous Agent Mode

Fully autonomous mode is off by default. Enabling it requires a main-owned native confirmation and stores the resulting policy only through encrypted main-process storage. The renderer can request enable/disable and read the sanitized boolean, but renderer state is never the authority.

When enabled, an Agent Mode approval request receives the same short-lived, one-use token bound to its sender, exact tool name, and canonical arguments as a manual approval. Built-in tools and MCP consume that exact token at their existing main boundaries. Autonomous mode does not weaken schemas, tool exposure, filesystem/network restrictions, run budgets, HWND ownership, cancellation, or Esc+Esc emergency stop. Direct IPC calls without a matching token and ordinary Chat-mode approval managers are not auto-approved. Disabling takes effect immediately without another confirmation.

## Background window (Windows agent)

Reserving an external app window is approval-gated. Main stores the exact window identity and binds it to the current chat run. Observation and element actions must match that owner.

While a reservation is active:

- screenshots stay scoped to that window when possible
- missing capture surfaces return typed “screenshot unavailable” results — not a sneaky full-screen grab
- focus-stealing physical actions stay restricted until the run releases the guard

Physical click/type/scroll actions need a fresh main-issued screenshot ID. Stale or cross-run IDs fail.

Background-safe UI Automation uses real accessibility patterns only (invoke, value, selection, scroll). No silent fallback to paste, global keys, or coordinate clicks.

An approved targeted left click first maps its screenshot-derived point to the smallest enabled and visible exact-window UIA/MSAA element advertising Invoke, SelectionItem/Toggle, or a legacy default action. A provider action runs without focus, cursor movement, shared input, or guard release. Provider execution failures propagate; only a typed unsupported result may release the guard and continue to the separately verified physical click path. The renderer/model cannot provide the internal element ID or choose a weaker delivery mode.

OCR, when available, is visual evidence only. It never authorizes input by itself.

## Contributor checklist for new tools

1. Add the exact tool name to the shared built-in contract.
2. Define a complete, closed JSON Schema with bounds.
3. Validate in main; test extra/reserved properties.
4. Keep approval state outside model arguments.
5. Require approval for anything mutating or high risk.
6. Bind approval to the exact validated arguments.
7. Return sanitized, size-limited results.
8. Test forged, reused, expired, and wrong-sender authorization attempts.

Mechanical steps: [`CREATING_BUILTIN_TOOLS.md`](CREATING_BUILTIN_TOOLS.md). IPC boundary: [`IPC.md`](IPC.md).
