# MCP Phase 1 Plan

Status: COMPLETE
Scope: main-process MCP host foundation only; no renderer settings UI and no model-visible MCP tool execution yet

This document is the Phase 1 deep dive for MCP in ZuraAI.

- Use `docs/mcp-taskwise-plan.md` as the cross-phase master checklist.
- Keep `AGENTS.md` updated whenever Phase 1 changes storage, IPC, preload, or runtime data flow.

---

## Phase 1 Goal

Land the main-process MCP runtime foundation in a way that matches the repo's security model:

- renderer stays untrusted
- privileged MCP lifecycle work stays in `electron/`
- secrets stay in main-process secure storage
- the existing built-in tool system keeps working unchanged during the rollout
- no MCP tool becomes model-callable until later phases explicitly wire exposure and execution

---

## Decisions Locked For Phase 1

These decisions are either already reflected in code or should be treated as the working contract for the rest of Phase 1:

1. Phase 1 is tools-first and client-only; there is no MCP server mode in ZuraAI.
2. `stdio` is the first production transport. `sse` and `websocket` stay behind later hardening work even if their API shape is prepared now.
3. Shared MCP contracts live in `src/mcp/types.ts` so renderer and main process can share a single source of truth.
4. Namespaced MCP tool identifiers use the format `mcp__<server_slug>__<tool_slug>`.
5. Non-secret MCP server metadata is stored in `app.getPath('userData')/mcp-servers.json`.
6. Secret-backed env vars, headers, and tokens stay in `electron/secureStorage.ts` and are resolved only when a server config is activated.
7. New server configs default to conservative behavior: `enabled: false` unless explicitly set, and `requireApproval: true`.
8. Early renderer-visible connection states are `disconnected`, `connecting`, `connected`, and `error`.
9. Resources and prompts are out of scope for runtime exposure in Phase 1; capability capture is enough for now.

---

## Landed So Far

### Shared contracts and helper utilities

- `src/mcp/types.ts` defines:
  - server config and resolved config shapes
  - runtime state, capabilities, and approval payload types
  - JSON-RPC message types
  - namespaced tool identity helpers and reverse parsing helpers
- `src/mcp/types.test.ts` covers tool-name namespacing helpers.

### Storage and secret resolution

- `electron/mcp/mcpStorage.ts` now provides:
  - versioned MCP server store loading/saving
  - normalization and validation on read/write
  - deterministic secure-storage key generation
  - secret resolution for env vars and headers at connection time
- `electron/mcp/mcpStorage.test.ts` covers normalization, persistence, secret lookup, and secure key generation.

### Transport foundation

- `electron/mcp/transports/base.ts` now provides:
  - MCP JSON-RPC message validation and parsing
  - line-delimited message framing helpers for stdio-style transports
  - base transport lifecycle state handling
  - subscription hooks for messages, errors, close events, and state changes
  - timeout/error normalization via `McpTransportError`
- `electron/mcp/transports/base.test.ts` covers message parsing, lifecycle behavior, timeout wrapping, and remote disconnect handling.

### Concrete transport work

- `electron/mcp/transports/stdio.ts` now provides:
  - direct managed process spawning from Electron main
  - explicit command + args execution without shell passthrough
  - separate stdout/stderr diagnostic capture
  - child-process exit handling and startup/shutdown timeout handling
- `electron/mcp/transports/sse.ts` and `electron/mcp/transports/websocket.ts` now exist as strict, feature-gated remote transport stubs.
- `electron/mcp/transports/remote.test.ts` and `electron/mcp/transports/stdio.test.ts` cover URL validation, feature gating, stdio diagnostics, and unexpected process exit handling.

### Connection layer

- `electron/mcp/mcpConnection.ts` now provides:
  - transport creation from resolved server config
  - MCP `initialize` handshake orchestration
  - capability capture and server info capture
  - `tools/list` discovery with runtime caching
  - runtime state updates with last success timestamp and last connection error tracking
- `electron/mcp/mcpConnection.test.ts` covers initialize + tool discovery success paths, timeout failure handling, and transport factory wiring.

### Manager, IPC, and preload bridge

- `electron/mcp/mcpManager.ts` now provides:
  - configured server registration from persisted storage
  - connect/disconnect lifecycle orchestration per server
  - runtime state subscriptions and snapshot aggregation
  - active-tool aggregation that excludes disconnected/error servers
- `electron/mcp/index.ts` now provides:
  - MCP IPC handler registration for list/add/update/remove/connect/disconnect/status/list-tools actions
  - renderer snapshot broadcasting over `mcp:state-changed`
- `electron/preload.ts` now exposes a dedicated `window.mcp` bridge with narrow MCP invoke/on allowlists.
- `src/electron.d.ts` now types the `window.mcp` renderer contract.

### App startup integration

- `electron/main.ts` now registers MCP handlers during startup, initializes the MCP manager during `app.whenReady()`, auto-connects servers where `enabled === true` and `autoConnect === true`, and performs safe MCP shutdown before quit completes.

### Verification status for this checkpoint

- Every Phase 1 task in `docs/mcp-taskwise-plan.md` is now marked complete through startup integration.
- Cross-phase checklist items already exercised in this phase are also marked complete there, including full `npm test`, preload allowlist review, secret-flow review, and migration-safety checks for built-in tools.
- Property-based testing is not implemented for MCP yet, but dedicated follow-up tasks are now listed in the master plan so that invariants around manager aggregation, CRUD persistence, and lifecycle transitions are tracked explicitly.

---

## Phase 1 Outcome

Phase 1 now lands the full main-process MCP host foundation:

- transports exist for local stdio plus feature-gated remote placeholders
- connection orchestration and tool discovery work from Electron main
- a manager tracks persisted servers, runtime state, and active connected tools
- renderer can observe MCP state through a narrow preload bridge
- chat still cannot execute MCP tools until later phases

---

## Out Of Scope For Phase 1

- renderer MCP settings UI
- dynamic MCP tool exposure in provider adapters
- chat-loop MCP tool execution
- approval dialog UX and policy controls
- resource/prompt browsing
- production hardening for remote transports

Those belong to later phases in `docs/mcp-taskwise-plan.md`.

---

## File Map For Phase 1

- `src/mcp/types.ts`
- `src/mcp/types.test.ts`
- `electron/mcp/mcpStorage.ts`
- `electron/mcp/mcpStorage.test.ts`
- `electron/mcp/transports/base.ts`
- `electron/mcp/transports/base.test.ts`
- `electron/mcp/transports/stdio.ts`
- `electron/mcp/transports/stdio.test.ts`
- `electron/mcp/transports/sse.ts`
- `electron/mcp/transports/websocket.ts`
- `electron/mcp/transports/remote.ts`
- `electron/mcp/transports/remote.test.ts`
- `electron/mcp/mcpConnection.ts`
- `electron/mcp/mcpConnection.test.ts`
- `electron/mcp/mcpManager.ts`
- `electron/mcp/mcpManager.test.ts`
- `electron/mcp/index.ts`
- `electron/preload.ts`
- `src/electron.d.ts`

---

## Acceptance Criteria

Phase 1 is done when all of the following are true:

- a configured MCP server can be connected entirely from Electron main
- the app can complete MCP initialize + tool discovery
- renderer can observe connection state through a narrow preload bridge
- disconnected or errored servers do not pollute the active MCP tool list
- built-in `web_search` and renderer-side `research_plan` still behave exactly as before
- chat still cannot execute MCP tools until later phases land

---

## Suggested Next Implementation Order

1. Build the Phase 2 MCP settings section on top of `window.mcp`.
2. Add manual server CRUD/connect flows in renderer and validate secret-handling UX.
3. Refactor tool exposure so built-in and MCP tools can coexist safely.
4. Only then route MCP tool execution into the chat loop.
