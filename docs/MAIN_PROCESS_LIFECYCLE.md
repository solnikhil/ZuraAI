# Main-process lifecycle

## Registration ownership

`electron/startup/mainProcessComposition.ts` is the composition root for privileged runtime
registrations. It installs aggregate IPC domains, MCP and built-in tool handlers, approval surfaces,
updater handlers, terminal/code/computer-use handlers, Discord RPC, session permission denials, and
runtime disposers.

Every registration must have a matching disposer. The composition returns one idempotent disposer,
which runs registrations in reverse order. If startup fails partway through registration, completed
registrations are rolled back before the error propagates. `main.ts` invokes the disposer from
`will-quit`; asynchronous MCP connection shutdown remains in `before-quit`, before synchronous
handler/resource disposal.

When adding a main-process capability:

1. Keep its registrar and unregistrar in the owning module.
2. Add both to the composition root.
3. Make local disposal idempotent and cancel pending requests, listeners, and timers.
4. Add a lifecycle test for registration rollback or repeated disposal.

## System IPC capabilities

Window controls are isolated in `electron/ipc/windowControlHandlers.ts`. These channels derive the
target `BrowserWindow` from the trusted sender and never accept a renderer-provided window ID. The
`systemHandlers.ts` is the composition/app-menu layer. `externalOpenHandlers.ts` owns validated browser
and artifact opening, `appInfoHandlers.ts` owns runtime info/About/development inspection, and
`nativeInteractionHandlers.ts` owns clipboard, context menu, and fixed native dialogs.

Main-window creation and renderer-driven resizing share `windows/windowBounds.ts`; changing minimum
bounds in one place updates both policies and their regression test.

## Scheduled-task runtime

The scheduled-task runtime has four boundaries:

- `scheduler.ts`: timers, enable/disable state, overdue startup catch-up, and one launch per due key.
- `rendererBroker.ts`: renderer selection, timeout-bounded summary/automation requests, response
  sanitization, and rejection of pending requests during shutdown.
- `delivery.ts`: email log mutation and notification eligibility/status.
- `runtime.ts`: task execution, page comparison, automation result construction, and persistence.

The scheduler clears timers when the extension is disabled or the runtime stops. The renderer broker
owns and removes its IPC handlers. Notification clicks receive an explicit main-window resolver; they
do not search `BrowserWindow.getAllWindows()` and accidentally focus About, debug, or approval windows.
