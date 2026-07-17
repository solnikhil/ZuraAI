# IPC Security and Ownership

The renderer is untrusted. Every renderer-to-main request must cross a narrow preload contract and a trusted top-frame registration guard.

## Required path

```text
React renderer -> typed preload bridge -> trustedIpcMain -> domain validator -> main-owned service
```

Renderer-invokable handlers must use `electron/ipc/trustedIpc.ts`. Raw `ipcMain.handle` is not an application extension point. Tests may mock the wrapper for domain behavior, while `trustedIpc.test.ts` protects the real sender boundary.

## Validation ownership

| Domain                   | Main registration                                   | Validation authority                                                                                        |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Chat/folders/tool media  | `electron/ipc/chatStoreHandlers.ts`                 | Bounded runtime schemas in `chatStoreValidation.ts`; media refs resolve main-side                           |
| Secrets                  | `electron/ipc/secureStorageHandlers.ts`             | Fixed secret-key union; values remain main-only after write                                                 |
| Provider runtime         | `electron/ipc/providerRuntimeHandlers.ts`           | Fixed provider IDs, operations, endpoints, regions, and main-resolved credentials                           |
| Built-in tools           | `electron/tools/index.ts`                           | Exact tool-name contract plus complete closed JSON Schema; approval context is separate from model args     |
| Background window guard  | `electron/tools/background-window/*`                | Main-resolved HWND/PID/start identity, sender + run ownership, fixed overlay actions, and lifecycle release |
| MCP                      | `electron/mcp/index.ts`                             | Saved server IDs and typed payloads; OAuth endpoints and secrets remain main-owned                          |
| Scheduled tasks          | `electron/ipc/monitorHandlers.ts`                   | Typed bounded task inputs plus extension-state gate                                                         |
| System/window operations | `electron/ipc/systemHandlers.ts` and window modules | Capability-specific allowlists and sender-window ownership                                                  |

When adding a channel, document its domain, direction, argument bounds, return shape, privilege level, and cleanup owner in this table or a linked domain document.

## Subscription rules

Preload listeners must wrap `IpcRendererEvent` and forward only validated payload arguments. Never pass Electron event objects, senders, ports, frames, or webContents capabilities into the renderer.

Subscription APIs return an unsubscribe function that removes the exact wrapped listener. Prefer dedicated named subscription bridges for privileged or complex event payloads. The small generic bridge may expose only explicitly allowlisted notification channels.

Generic and grouped dedicated channel allowlists are owned by `src/electron/ipcChannelManifest.ts`
and derived by preload; do not add a second literal allowlist
inside `electron/preload.ts`. Drift tests reject duplicate ownership and verify that privileged MCP,
provider-runtime, and approval channels stay out of the generic invoke bridge.

## Tool execution context

`execute-tool` has two logically separate inputs:

1. Model-visible arguments, validated against a closed schema.
2. Main-verifiable execution context, such as a one-use approval token or opaque chat-run ID.

Reserved authority fields (`autoApprove`, `approvalToken`, `_agentSkills`, and background-window run ownership) are not valid model arguments. Approval tokens are issued by main, bound to sender + exact tool + exact arguments, expire, and are consumed once. The renderer's `window.backgroundWindow` bridge may only release its own run and receive a sanitized stop event; target identity and overlay control stay in main. See `docs/TOOLS_SECURITY.md` and `docs/CREATING_BUILTIN_TOOLS.md`.

## Change checklist

1. Add or update the typed contract in `src/electron/types.ts`.
2. Add the channel to `src/electron/ipcChannelManifest.ts` and implement the narrow preload bridge or allowlisted subscription.
3. Register through `trustedIpcMain` and validate every runtime input in main.
4. Return sanitized serializable data only.
5. Provide disposer/unregister behavior for handlers and listeners.
6. Add rejection tests for malformed, oversized, wrong-sender, and unauthorized requests.
7. Update `AGENTS.md` when channel names, data flow, storage authority, or capabilities change.
