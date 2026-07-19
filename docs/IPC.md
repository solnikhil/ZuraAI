# IPC: how the UI talks to main

The React UI process is untrusted. Anything sensitive must go through a small, allowlisted bridge into Electron main.

## The path

```text
React UI → typed preload bridge → trusted IPC guard → domain validation → main service
```

Handlers the UI can call must register through `electron/ipc/trustedIpc.ts`. Do not treat raw `ipcMain.handle` as a free-for-all extension point. Domain tests may mock the wrapper; `trustedIpc.test.ts` protects the real sender checks.

## Who validates what

| Area | Main home | What must be true |
| ---- | --------- | ----------------- |
| Chats / folders / tool media | `chatStoreHandlers.ts` | Bounded schemas; media refs resolve only inside user data |
| Secrets | `secureStorageHandlers.ts` | Fixed key names; values stay in main after write |
| Provider runtime | `providerRuntimeHandlers.ts` | Fixed providers/ops; credentials resolved in main |
| Built-in tools | `electron/tools/` | Exact tool names + closed schemas; approval is separate from model args |
| Background window | `electron/tools/background-window/` | Main owns HWND/PID identity and run ownership |
| MCP | `electron/mcp/` | Saved server IDs; secrets and OAuth stay main-owned |
| Scheduled tasks | `monitorHandlers.ts` | Bounded task payloads; respect feature enablement |
| Windows / shell | window and system modules | Sender-owned window; capability allowlists |

When you add a channel, write down domain, direction, argument bounds, return shape, privilege, and who cleans it up.

## Subscriptions

Listeners in preload should strip Electron event objects and only forward clean payloads. Subscription APIs return a real unsubscribe function.

Channel allowlists live in `src/electron/ipcChannelManifest.ts` and are derived for preload. Do not invent a second handwritten list in `preload.ts`. Privileged MCP, provider-runtime, and approval traffic stays off the generic invoke bridge.

## Tool calls specifically

`execute-tool` has two inputs:

1. **Model-visible arguments** — closed schema, validated in main
2. **Execution context** — approval tokens, chat-run IDs, and similar authority that main issued

Fields like `autoApprove` are never valid model arguments. See [`TOOLS_SECURITY.md`](TOOLS_SECURITY.md) and [`CREATING_BUILTIN_TOOLS.md`](CREATING_BUILTIN_TOOLS.md).

## Change checklist

1. Update types in `src/electron.d.ts` / related contracts
2. Add the channel to the manifest and a narrow preload bridge
3. Register with `trustedIpc` and validate every input in main
4. Return only sanitized, serializable data
5. Dispose handlers/listeners cleanly
6. Test bad, oversized, wrong-sender, and unauthorized calls
7. Update `AGENTS.md` if capability or data flow changed
