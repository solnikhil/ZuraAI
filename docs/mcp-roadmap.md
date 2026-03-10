# FUTURE: MCP Support Implementation Order

Status: FUTURE
Scope: add MCP to Zura in small, safe phases

## Goal

Add MCP without weakening Zura's current security model.

Current strengths that make this possible:
- tool execution already routes through Electron main process
- preload IPC is narrow and allowlisted
- settings and secure storage already exist
- provider tool exposure is already centralized in the renderer tool pipeline

Current gaps that mean we should add MCP slowly:
- tools are hardcoded around `web_search`
- tools currently auto-run, which is unsafe for arbitrary MCP servers
- parts of the chat UI assume search-shaped tool results
- there is no MCP server lifecycle, trust model, or approval flow yet

## Principles

1. Keep MCP in the main process.
2. Start with local `stdio` servers only.
3. Ship MCP tools first; defer resources and prompts.
4. Add explicit trust and approvals before broad tool execution.
5. Keep built-in tools working during every phase.
6. Update `AGENTS.md` whenever architecture changes.

## Recommended MVP

First public MCP release should include:
- local `stdio` MCP servers only
- tools only
- per-server trust
- per-tool approval
- generic tool result rendering

Not in MVP:
- remote transports
- MCP resources
- MCP prompts

## Phase 0 - Design And Safety Foundation

Purpose: lock the architecture before writing MCP runtime code.

Deliverables:
- finalize MVP scope
- define server config model
- define trust and approval defaults
- define tool namespacing strategy
- define secret storage approach

Recommended decisions:
- store non-secret MCP server metadata in renderer settings
- store MCP secrets in main-process secure storage
- expose MCP through a dedicated `window.mcp` preload bridge
- only expose tools from enabled and trusted servers
- namespace tools like `mcp__github__create_issue`

Exit criteria:
- agreed data model
- agreed preload surface
- agreed security defaults

## Phase 1 - Main-Process MCP Host

Purpose: build MCP lifecycle management in Electron main, with no model exposure yet.

Deliverables:
- new `electron/mcp/*` runtime modules
- stdio server start/stop/reconnect support
- tool discovery from connected servers
- server status tracking
- preload bridge for MCP management only

Important note:
- do not reuse `spawn-terminal-command`; MCP needs a dedicated managed process runtime

Suggested preload API:
- `window.mcp.listServers()`
- `window.mcp.saveServers()`
- `window.mcp.connectServer(id)`
- `window.mcp.disconnectServer(id)`
- `window.mcp.listTools()`
- `window.mcp.onServerState(...)`

Exit criteria:
- users can configure a local MCP server
- main process can connect safely
- discovered tools are visible in admin UI or debug output
- chat still cannot invoke MCP tools yet

## Phase 2 - MCP Settings UI

Purpose: make MCP configurable before enabling it in chat.

Deliverables:
- new Settings section for MCP
- server list with enabled, trusted, and connection status states
- form for command, args, cwd, env var names, auto-connect, approval mode
- masked secret handling

Important note:
- MCP should be its own Settings section, not part of built-in Skills

Exit criteria:
- users can add and edit MCP servers from the app
- connection state is visible
- secrets are not leaked back into plain renderer state

## Phase 3 - Generic Tool Schema Refactor

Purpose: let the tool system represent runtime MCP tools alongside built-in tools.

Why this phase exists:
- current tool definitions are custom and optimized for built-in tools
- MCP tools need more general JSON Schema support

Deliverables:
- refactor tool types to support generic JSON Schema input
- keep `web_search` working
- add namespaced MCP tool descriptors
- add lookup from namespaced tool back to `{ serverId, toolName }`
- make provider adapters accept built-in and MCP tools together

Exit criteria:
- renderer can represent both built-in and MCP tools
- provider adapters can send MCP tools to supported models

## Phase 4 - MCP Tool Execution In Chat

Purpose: allow models to call MCP tools through the existing chat loop.

Deliverables:
- main-process MCP tool execution path
- renderer tool orchestration extended to include MCP tools
- runtime filtering so only eligible MCP tools are exposed
- safe routing from namespaced tool name to real server and tool

Exposure rules:
- provider must support tools
- server must be enabled
- server must be trusted
- server must be connected
- tool must be allowed by current policy

Exit criteria:
- supported models can call MCP tools
- execution stays in the main process
- results return to the model and UI safely

## Phase 5 - Approval, Trust, And Guardrails

Purpose: add the safety layer MCP requires.

Why this phase is mandatory:
- current tools auto-run
- that is okay for `web_search`, but risky for arbitrary MCP servers

Deliverables:
- per-server trust toggle
- per-tool approval policy
- approval UI in chat
- tool timeout and cancellation handling
- crash and hung-server recovery
- optional per-server allowlist/blocklist
- audit metadata on each MCP tool result

Recommended defaults for newly added servers:
- disabled
- untrusted
- manual connect
- approval required

Exit criteria:
- MCP tools do not run silently unless policy explicitly allows it
- user can see what ran and why

## Phase 6 - Generic Tool Result UI

Purpose: render MCP tool results cleanly without breaking current search UX.

Deliverables:
- generic tool result card
- show server, tool, status, duration, and approval state
- readable JSON or structured object fallback
- preserve richer special handling for `web_search`
- surface MCP errors clearly
- add basic MCP usage metrics

Exit criteria:
- MCP results are understandable in chat
- built-in search results still render well

## Phase 7 - MCP Resources And Prompts

Purpose: add non-tool MCP features after tools are stable.

Deliverables:
- optional resource browser
- optional MCP prompt support
- rules for user-visible vs model-visible exposure

Recommendation:
- keep this out of the first MCP release

Exit criteria:
- resources and prompts do not widen the IPC surface unsafely

## Phase 8 - Remote Transports

Purpose: support remote MCP only after local stdio is solid.

Deliverables:
- transport abstraction beyond `stdio`
- auth handling for remote servers
- network security rules
- remote connection policy and observability

Recommendation:
- do not start here

Exit criteria:
- remote transport security model is explicit and tested

## Implementation Order

Work in this order:

1. Phase 0 - Design And Safety Foundation
2. Phase 1 - Main-Process MCP Host
3. Phase 2 - MCP Settings UI
4. Phase 3 - Generic Tool Schema Refactor
5. Phase 4 - MCP Tool Execution In Chat
6. Phase 5 - Approval, Trust, And Guardrails
7. Phase 6 - Generic Tool Result UI
8. Phase 7 - MCP Resources And Prompts
9. Phase 8 - Remote Transports

## Best Starting Point

Start with Phase 1 after Phase 0 decisions are confirmed.

Reason:
- it keeps MCP isolated in main process first
- it proves lifecycle and discovery before chat exposure
- it avoids rushing unsafe tool execution into the model loop

## Files Most Likely To Change Over Time

- `electron/preload.ts`
- `src/electron.d.ts`
- `electron/tools/index.ts`
- `src/tools/definitions.ts`
- `src/tools/types.ts`
- `src/tools/toolManager.ts`
- `src/tools/executor.ts`
- `src/hooks/useToolCalling.ts`
- `src/contexts/SettingsConfigContext.tsx`
- `src/contexts/SettingsContext.tsx`
- `src/components/Settings/Settings.tsx`
- `src/components/Dashboard/ChatArea/MessageRenderer.tsx`
- `src/components/Dashboard/ChatArea/hooks/streaming/streamingUtils.ts`
- new `electron/mcp/*`
- new `src/components/Settings/sections/McpSection.tsx`
- `AGENTS.md`

## Architecture Reminder

For every phase that changes runtime architecture, update `AGENTS.md` in the same PR when you add or change:
- IPC channels
- preload bridges
- storage locations
- tool capabilities
- MCP data flow
