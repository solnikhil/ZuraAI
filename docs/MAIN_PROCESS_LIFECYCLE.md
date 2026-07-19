# Main-process lifecycle

## Startup composition

`electron/startup/mainProcessComposition.ts` is the place that wires privileged runtime pieces together: IPC domains, MCP, built-in tools, approvals, updater, terminal/code/computer-use handlers, Discord RPC, permission denials, and disposers.

Every registration needs a matching disposer. Composition returns one idempotent reverse-order disposer. If startup fails halfway, completed registrations roll back before the error bubbles. `main.ts` runs the disposer on `will-quit`. MCP connections shut down earlier on `before-quit`.

When you add a main capability:

1. Keep register/unregister next to the feature.
2. Hook both into the composition root.
3. Make disposal safe to call twice; cancel timers, listeners, and pending work.
4. Add a test for rollback or double dispose when the risk is real.

## System / window IPC

Window controls live in `windowControlHandlers.ts` and always target the **sender’s** window — never a window id from the UI.

Related modules:

- `externalOpenHandlers.ts` — open URLs/artifacts safely
- `appInfoHandlers.ts` — about/runtime info
- `nativeInteractionHandlers.ts` — clipboard, context menu, fixed dialogs
- `systemHandlers.ts` — composition / app menu layer

Shared min bounds for the main window live in `windows/windowBounds.ts` so creation and resize policy stay aligned.

## Background window guard (Windows)

`electron/tools/background-window/` owns reserving one external app window for an agent run, watching its bounds, and showing a small sandboxed guard overlay. The overlay is not globally always-on-top; it tracks the target.

Clean up on every exit path: success, cancel, failure, explicit release, target loss, renderer death, emergency stop, tool disposal, and app quit. Do not leave PowerShell watchers or windows behind. The watcher never runs model- or renderer-provided scripts.

Esc+Esc emergency stop uses a fixed key-state helper so normal Escape still reaches the user’s app.

## Scheduled tasks

Four pieces:

| Module | Job |
| ------ | --- |
| `scheduler.ts` | Timers, enablement, overdue catch-up, one launch per due key |
| `rendererBroker.ts` | Ask the UI for automation/summary work with timeouts |
| `delivery.ts` | Notifications / email policy |
| `runtime.ts` | Run the task and persist results |

When the reminders feature is off, timers clear and mutations should refuse. Notification clicks must focus the real main window you pass in — not “first BrowserWindow we find.”
