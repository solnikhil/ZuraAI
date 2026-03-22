# MCP Task-Wise Master Plan

Status: COMPLETE (all planned MCP phases and cross-phase checks are marked done)
Scope: full MCP rollout across all phases, with concrete tasks mapped to this repo

This is the master implementation plan for MCP in ZuraAI.

- Use this file as the execution checklist across the whole project.
- Use `docs/mcp-phase-1-plan.md` as the Phase 1 deep dive.
- Keep `AGENTS.md` updated in the same PR whenever a phase changes architecture.

---

## Objectives

Implement MCP in a way that matches ZuraAI's current architecture and security model:

- renderer remains untrusted
- privileged MCP work stays in Electron main
- preload remains narrow and allowlisted
- secrets stay out of renderer `localStorage`
- MCP tools integrate into the existing tool-calling pipeline without weakening current guardrails

---

## Repo-Aware Design Rules

These rules should hold for every phase:

1. MCP connection lifecycle lives in `electron/`, not `src/`.
2. Renderer gets a dedicated `window.mcp` bridge, not raw IPC or Node access.
3. Secrets for MCP servers must use main-process secure storage.
4. Built-in tools keep working during every migration step.
5. Dynamic MCP tools must not break provider-specific tool support rules.
6. Perplexity stays excluded from external tool exposure unless product policy changes.
7. Architecture, IPC, storage, and tool-surface changes must update `AGENTS.md`.

---

## Current State Snapshot

The repo now has these MCP foundations in place alongside the existing tool system:

- restricted tool system with built-in `web_search` in main process
- renderer-side `research_plan`
- existing preload hardening in `electron/preload.ts`
- settings split across renderer storage and secure storage
- shared MCP contracts and naming helpers in `src/mcp/types.ts`
- versioned MCP server metadata storage in `electron/mcp/mcpStorage.ts`
- shared MCP transport base primitives in `electron/mcp/transports/base.ts`
- managed stdio MCP transport in `electron/mcp/transports/stdio.ts`
- strict, feature-gated remote transport placeholders in `electron/mcp/transports/sse.ts` and `electron/mcp/transports/websocket.ts`
- MCP connection handshake and tool discovery runtime in `electron/mcp/mcpConnection.ts`
- MCP server registry/aggregation runtime in `electron/mcp/mcpManager.ts`
- MCP main-process handler registration and renderer state broadcasts in `electron/mcp/index.ts`
- dedicated renderer bridge for MCP in `window.mcp`
- provider tool orchestration in:
  - `src/hooks/useToolCalling.ts`
  - `src/tools/toolManager.ts`
  - `src/tools/executor.ts`

Main gaps that MCP still needs to address:

- no dynamic runtime tool registry yet
- no approval flow for external tools yet
- no generic result UI for non-search tools yet
- remote transports are still placeholder-only and remain feature-gated

---

## Recommended Rollout Order

Execute work in this order:

1. Phase 0 - Product and security foundation
2. Phase 1 - Main-process MCP host
3. Phase 2 - Settings UI and persistence workflow
4. Phase 3 - Dynamic tool-schema refactor
5. Phase 4 - MCP tool execution in chat
6. Phase 5 - Approval, trust, and guardrails
7. Phase 6 - Tool result UX and observability
8. Phase 7 - MCP resources and prompts
9. Phase 8 - Remote transport hardening and release polish

Note: if you want SSE and WebSocket available earlier, keep the API shape ready in Phase 1, but the safest production path is still to land `stdio` first and harden remote transports later.

---

## Phase Summary

| Phase | Goal | Main output |
| --- | --- | --- |
| 0 | Lock scope and security rules | agreed MCP contract for this repo |
| 1 | Add main-process host/runtime | `electron/mcp/*` lifecycle modules |
| 2 | Make MCP configurable | settings section + persisted server config |
| 3 | Make tool system dynamic | built-in + MCP tools coexist cleanly |
| 4 | Let chat call MCP tools | tool execution pipeline supports MCP |
| 5 | Add approval and trust | safe external tool execution |
| 6 | Improve UX and metrics | readable MCP results and usage info |
| 7 | Add non-tool MCP features | resources/prompts support |
| 8 | Finish remote readiness | SSE/WS hardening, packaging, docs |

---

## Phase 0 - Product and Security Foundation

Goal: finalize the MCP shape before runtime code expands the architecture.

### Tasks

- [x] Confirm initial release scope: tools-first, client-only, no server mode.
- [x] Decide whether public MVP is `stdio` only or `stdio` plus remote transports.
- [x] Finalize tool naming convention for MCP tools.
- [x] Finalize server config schema and versioning strategy.
- [x] Finalize secret-storage strategy for env vars, tokens, and headers.
- [x] Finalize trust and approval defaults for newly added servers.
- [x] Define connection-status model and user-facing error states.
- [x] Define how disconnected/error servers affect tool exposure.
- [x] Define migration strategy so built-in tools continue to work unchanged.
- [x] Decide where the MCP settings section lives in navigation.
- [x] Decide whether `resources` and `prompts` are hidden entirely or shown as capability counts in early phases.

Implementation notes:
- The released MCP shape stays client-only and tools-first; there is no MCP server-host mode in the app.
- The public implementation supports `stdio`, `sse`, and `websocket`, with remote transports guarded by explicit config and diagnostics rather than a separate server mode.
- MCP tool naming is finalized as `mcp__<server_slug>__<tool_slug>`.
- New servers default to `enabled: false`, `trustState: 'untrusted'`, and `requireApproval: true`, while disconnected/error servers are removed from model-visible tool exposure.
- The MCP settings entry lives in Settings, and early capability summaries show tool/resource/prompt counts while keeping resources/prompts user-visible only.

### Repo touchpoints

- `AGENTS.md`
- `docs/mcp-phase-1-plan.md`
- `docs/mcp-taskwise-plan.md`

### Done when

- MCP scope is written down clearly.
- Security defaults are written down clearly.
- There is no ambiguity about storage, preload, or tool-routing direction.

---

## Phase 1 - Main-Process MCP Host

Goal: build the runtime host in Electron main with no model-visible MCP tool calls yet.

### Tasks

#### 1. Types and contracts
- [x] Create shared MCP types for server config, runtime state, tool manifest, and approval request payloads.
- [x] Define namespaced tool identity format and reverse lookup metadata.
- [x] Define normalized transport interface that all transports must satisfy.

#### 2. Storage and secrets
- [x] Create `electron/mcp/mcpStorage.ts`.
- [x] Persist non-secret server metadata under `app.getPath('userData')`.
- [x] Resolve secret references from secure storage at connection time.
- [x] Add config validation on read and write.
- [x] Add migration/version field so config can evolve safely.

#### 3. Transport foundation
- [x] Create `electron/mcp/transports/base.ts`.
- [x] Implement message send/receive abstraction.
- [x] Implement connection lifecycle hooks.
- [x] Implement timeout and error reporting hooks.

#### 4. Stdio transport
- [x] Create `electron/mcp/transports/stdio.ts`.
- [x] Use managed process spawning, not `spawn-terminal-command`.
- [x] Pass explicit command and args arrays only.
- [x] Capture stdout/stderr separately for diagnostics.
- [x] Handle process exit and startup timeout cleanly.

#### 5. Optional early remote transports
- [x] Create `electron/mcp/transports/sse.ts` behind feature-gated usage.
- [x] Create `electron/mcp/transports/websocket.ts` behind feature-gated usage.
- [x] Add strict URL validation for remote transports.
- [x] Add reconnect policy placeholders without auto-enabling aggressive retries.

#### 6. Connection layer
- [x] Create `electron/mcp/mcpConnection.ts`.
- [x] Implement initialize handshake.
- [x] Implement server capability capture.
- [x] Implement `tools/list` discovery.
- [x] Cache tool manifests in runtime state.
- [x] Store last connection error and last success timestamp.

#### 7. Manager layer
- [x] Create `electron/mcp/mcpManager.ts`.
- [x] Register all configured servers.
- [x] Add connect/disconnect methods.
- [x] Add runtime state subscription/broadcast support.
- [x] Aggregate tools from connected servers.
- [x] Keep disconnected/error servers from polluting active tool lists.

#### 8. Main-process IPC surface
- [x] Create `electron/mcp/index.ts`.
- [x] Register MCP IPC handlers.
- [x] Expose list/add/update/remove/connect/disconnect/status/list-tools actions.
- [x] Broadcast runtime state changes to renderer windows.

#### 9. Preload surface
- [x] Add dedicated `window.mcp` bridge in `electron/preload.ts`.
- [x] Add narrow allowlists for MCP invoke/on channels.
- [x] Add `src/electron.d.ts` typings for `window.mcp`.

#### 10. App startup integration
- [x] Register MCP handlers in `electron/main.ts`.
- [x] Initialize manager during app ready.
- [x] Decide whether enabled servers auto-connect on startup.
- [x] Add safe shutdown/disconnect handling on app exit.

### Repo touchpoints

- `electron/main.ts`
- `electron/preload.ts`
- `src/electron.d.ts`
- new `electron/mcp/*`

### Done when

- A configured server can be connected from main process.
- Tool discovery works.
- Renderer can see connection state.
- Chat still cannot execute MCP tools.

---

## Phase 2 - Settings UI and Persistence Workflow

Goal: make MCP configurable through the app in a way that respects the current settings architecture.

### Tasks

#### 1. Settings section plumbing
- [x] Add a new settings section id, recommended: `mcp`.
- [x] Update settings navigation metadata and keywords.
- [x] Render a dedicated MCP section in `src/components/Settings/Settings.tsx`.

#### 2. Renderer state integration
- [x] Create `src/mcp/McpContext.tsx`.
- [x] Subscribe to MCP runtime state changes from `window.mcp`.
- [x] Expose servers, states, tools, and pending approvals to the renderer.

#### 3. Server management UI
- [x] Create `src/components/Settings/sections/McpSection.tsx`.
- [x] Create add/edit dialog for servers.
- [x] Create per-server card/list item UI.
- [x] Show transport type, enabled state, connection state, and discovered tool count.
- [x] Add connect/disconnect actions.

#### 4. Config forms
- [x] Add common fields: name, enabled, auto-connect, timeout settings.
- [x] Add stdio fields: command, args, cwd.
- [x] Add remote fields: URL, headers, token references.
- [x] Add env var editor with secret/plaintext distinction.
- [x] Validate inputs before saving.

#### 5. Secret handling UX
- [x] Reuse secure-storage save flow patterns from provider keys where possible.
- [x] Ensure secret values are not persisted into renderer `localStorage`.
- [x] Display masked secret state in forms.
- [x] Support updating or clearing stored MCP secrets.

#### 6. Persistence behavior
- [x] Ensure save/discard behavior matches existing Settings save bar expectations.
- [x] Ensure server edits survive app restart.
- [x] Ensure runtime state refreshes after save/connect/disconnect.

### Repo touchpoints

- `src/constants/settingsSections.ts`
- `src/components/Settings/Settings.tsx`
- `src/contexts/SettingsContext.tsx` if navigation or settings metadata needs expansion
- new `src/mcp/*`
- new `src/components/Settings/sections/McpSection.tsx`

### Done when

- Users can add, edit, delete, enable, and connect MCP servers from Settings.
- Secret fields do not leak into renderer persistence.
- Connection state is visible and understandable.

---

## Phase 3 - Dynamic Tool Schema Refactor

Goal: let the tool system represent runtime MCP tools alongside built-in tools without breaking existing provider behavior.

### Tasks

#### 1. Tool model refactor
- [x] Introduce a tool descriptor shape that supports dynamic JSON Schema inputs.
- [x] Keep compatibility for built-in `web_search` and renderer-side `research_plan`.
- [x] Add `origin` metadata, for example: `builtin-main`, `builtin-renderer`, `mcp`.
- [x] Add reverse lookup metadata for namespaced MCP tools.

#### 2. Registry split
- [x] Keep static built-in tool definitions separate from runtime MCP tools.
- [x] Create renderer-side MCP tool registry adapter.
- [x] Merge built-in and MCP tools at request time, not through one hardcoded array.

#### 3. Provider adapter compatibility
- [x] Verify OpenRouter/Groq/Ollama/Alibaba adapters accept generic JSON Schema tool definitions.
- [x] Keep Perplexity excluded from external tool exposure.
- [x] Verify tool descriptions and parameter schemas survive provider conversion.

#### 4. Prompt/tool summary updates
- [x] Update any tool-summary prompt helpers to include MCP tools only when connected and eligible.
- [x] Keep skills prompt logic and built-in skill behavior intact.

#### 5. Tool parsing and formatting
- [x] Ensure MCP namespaced tool calls parse back into `{ serverId, originalToolName }`.
- [x] Keep tool result formatting backward compatible.

### Repo touchpoints

- `src/tools/definitions.ts`
- `src/tools/types.ts`
- `src/tools/toolManager.ts`
- `src/tools/executor.ts`
- `src/hooks/useToolCalling.ts`
- `src/utils/promptSelection.ts`
- `src/tools/adapters/*`

### Done when

- Built-in and MCP tools can coexist in one request.
- Existing providers still work.
- No MCP tool is executable yet unless later phases enable routing.

---

## Phase 4 - MCP Tool Execution in Chat

Goal: route MCP tool calls through the current chat loop safely.

### Tasks

#### 1. Execution routing
- [x] Add MCP execution path separate from built-in `execute-tool` IPC usage.
- [x] Route namespaced MCP tools through `window.mcp.executeTool(...)` or equivalent dedicated bridge action.
- [x] Keep `research_plan` renderer-only and `web_search` main-process built-in.

#### 2. Runtime exposure policy
- [x] Expose MCP tools only when the server is enabled.
- [x] Expose MCP tools only when the server is connected.
- [x] Expose MCP tools only when current provider supports tools.
- [x] Expose MCP tools only when trust/approval policy allows them to be surfaced.

#### 3. Main-process tool execution
- [x] Implement `tools/call` in `mcpConnection`.
- [x] Return normalized result payloads back to renderer.
- [x] Add timeout handling and cancellation boundaries.

#### 4. Chat loop integration
- [x] Ensure `handleToolCalls` can process MCP results alongside built-in ones.
- [x] Ensure follow-up tool result messages remain provider-compatible.
- [x] Ensure failures produce model-visible tool errors instead of silent drops.

#### 5. Streaming and state updates
- [x] Surface active MCP tool call state in chat.
- [x] Ensure tool completion updates the current streaming state correctly.
- [x] Avoid search-specific assumptions for generic MCP calls.

Implementation notes:
- MCP tool execution now rides the same chat tool loop as built-in tools, but keeps a dedicated renderer-to-main bridge via `window.mcp.executeTool(...)`.
- Generic MCP tool completions are pushed into active streaming state immediately so the user can see results and audit metadata before the assistant finishes its follow-up answer.
- Built-in search/research behavior stays split: `web_search` remains a restricted main-process built-in tool and `research_plan` remains renderer-only.

### Repo touchpoints

- `src/tools/executor.ts`
- `src/tools/toolManager.ts`
- `src/hooks/useToolCalling.ts`
- `src/components/Dashboard/ChatArea/hooks/streaming/*`
- `electron/mcp/mcpConnection.ts`
- `electron/mcp/mcpManager.ts`

### Done when

- Supported providers can request MCP tools.
- The app can execute MCP tool calls end-to-end.
- Failures are visible and recoverable.

---

## Phase 5 - Approval, Trust, and Guardrails

Goal: enforce the safety model required for external MCP tools.

### Tasks

#### 1. Trust model
- [x] Add per-server trust state.
- [x] Define defaults for newly added servers: disabled, untrusted, approval required.
- [x] Keep untrusted servers from exposing tools to models.

#### 2. Approval manager
- [x] Create `electron/mcp/mcpApprovalManager.ts` if not already present.
- [x] Add pending request registry.
- [x] Add timeout expiry and auto-reject behavior.
- [x] Add renderer resolution path.

#### 3. Approval UI
- [x] Create `src/components/mcp/McpApprovalDialog.tsx`.
- [x] Show server name, tool name, arguments, and risk notice.
- [x] Add approve/reject actions.
- [x] Support one clear pending approval flow at minimum.

#### 4. Policy controls
- [x] Add server-level approval requirements to config UI.
- [x] Optionally add per-server tool allowlist/blocklist scaffolding.
- [x] Add execution timeout policy per server.

#### 5. Failure and recovery guards
- [x] Reject stalled requests cleanly.
- [x] Handle process crash or remote disconnect during pending approval.
- [x] Return structured errors back into the tool pipeline.

#### 6. Auditability
- [x] Attach execution metadata to MCP tool results.
- [x] Include approval state, server id, duration, and outcome.

Implementation notes:
- Trusted servers can still require per-call approval, and untrusted servers remain hidden from model-visible tool exposure even if they are configured or connected.
- Pending approvals are broadcast through the MCP runtime snapshot, resolved through the dedicated renderer bridge, and auto-rejected on timeout, disconnect, server update, remove, or shutdown.
- MCP execution results carry audit metadata used by chat rendering so users can distinguish approval rejection, timeout, cancellation, and execution failure.

### Repo touchpoints

- `electron/mcp/mcpApprovalManager.ts`
- `electron/preload.ts`
- `src/electron.d.ts`
- `src/components/mcp/McpApprovalDialog.tsx`
- chat rendering components used for tool state display

### Done when

- MCP tools never execute silently unless policy explicitly allows it.
- The user can see what tool is about to run and decide.

---

## Phase 6 - Tool Result UX and Observability

Goal: make MCP results readable in chat and measurable in usage reporting.

### Tasks

#### 1. Generic result rendering
- [x] Add generic tool result card UI for non-search tools.
- [x] Show server, tool, status, duration, approval state, and formatted output.
- [x] Fall back to readable JSON for arbitrary objects.
- [x] Preserve special rendering for `web_search`.

#### 2. Error UX
- [x] Show connection errors clearly.
- [x] Show approval rejection distinctly from execution failure.
- [x] Show timeout and disconnect errors distinctly.

#### 3. Streaming/chat polish
- [x] Improve active-tool indicator for MCP tools.
- [x] Avoid web-search-specific copy for generic tool runs.
- [x] Ensure multi-tool sequences remain understandable.

#### 4. Usage and analytics
- [x] Add basic local metrics for MCP executions.
- [x] Count successful vs failed MCP tool calls.
- [x] Track approval accept/reject counts.
- [x] Consider exporting MCP activity in usage snapshots if consistent with existing privacy model.

### Repo touchpoints

- message rendering and tool result UI files

Implementation notes:
- Non-search tool results now render as generic result cards that surface MCP audit metadata, server identity, approval state, duration, and formatted input/output while leaving `web_search` on its richer search-specific renderer.
- Active MCP tool execution now uses generic "Running ..." copy and a tool-oriented indicator instead of inheriting web-search phrasing.
- MCP error cards now classify approval rejection, timeout, cancellation, disconnect, and connection failures separately so the user can tell why a run stopped.
- Chat rendering now surfaces per-message MCP metrics locally (runs, success/failure counts, approval counts) and shows queued active tool calls when multiple MCP tools are in flight.
- Broader usage-snapshot export was evaluated and intentionally left local-only for the current privacy model; MCP analytics stay in message-local UI summaries instead of separate telemetry snapshots.

### Done when

- Users can understand what an MCP tool did.
- Errors are not opaque.
- The app can report basic MCP usage trends locally.

---

## Phase 7 - MCP Resources and Prompts

Goal: add non-tool MCP capabilities after tool execution is stable.

### Tasks

#### 1. Capability discovery
- [x] Extend runtime state to cache resources and prompts in a structured way.
- [x] Define whether resources/prompts are user-visible, model-visible, or both.

#### 2. Resource UX
- [x] Add optional resource browser UI.
- [x] Add fetch/read flow for selected resources.
- [x] Define whether resources become tools, context attachments, or manual user actions.

#### 3. Prompt UX
- [x] Add optional prompt browser.
- [x] Define how MCP prompts are inserted into chat or agent flows.
- [x] Avoid bypassing existing system-prompt controls.

#### 4. Safety and exposure rules
- [x] Apply trust and approval rules to resource and prompt access too.
- [x] Ensure resources/prompts do not widen IPC unsafely.

### Repo touchpoints

- `electron/mcp/*`
- `src/mcp/*`
- chat/input components if prompt insertion is added

Implementation notes:
- Runtime snapshots now carry structured resource and prompt manifests per server, while heavy read/get results stay on dedicated on-demand IPC calls.
- Resource and prompt browsing is user-visible only for trusted, connected, enabled servers; nothing in Phase 7 makes them model-callable.
- Resource reads and prompt expansion flow through the shared MCP library dialog and insert into the composer draft only on explicit user action.

### Done when

- Resources/prompts are integrated intentionally, not ad hoc.
- Their exposure model is documented and safe.

---

## Phase 8 - Remote Transport Hardening and Release Polish

Goal: finish remote readiness and make MCP production-grade.

### Tasks

#### 1. SSE hardening
- [x] Finalize production SSE implementation.
- [x] Add retry/backoff policy.
- [x] Add auth header secret resolution and masking.
- [x] Add robust request/stream error handling.

#### 2. WebSocket hardening
- [x] Finalize production WebSocket implementation.
- [x] Add heartbeat/staleness handling.
- [x] Add reconnect/backoff policy.
- [x] Add disconnect reason diagnostics.

#### 3. Packaging and environment checks
- [x] Verify Electron packaging includes MCP runtime code cleanly.
- [x] Verify no packaging step leaks MCP secrets.
- [x] Verify Windows install/update flows do not break server config loading.

#### 4. DX and supportability
- [x] Add developer docs for adding test MCP servers.
- [x] Add troubleshooting section for local vs remote server failures.
- [x] Add example configs for common servers.

#### 5. Release readiness
- [x] Run full regression on built-in tools.
- [x] Run transport-specific integration tests.
- [x] Update `AGENTS.md` architecture one last time for released MCP shape.
- [x] Update user-facing docs and release notes.

Implementation notes:
- Remote transports now have real SSE and WebSocket implementations with header masking, timeout handling, backoff on initial connect, and connection diagnostics.
- `electron/mcp/mcpConnection.ts` now owns reconnect loops for unexpected remote disconnects so the initialize handshake and capability discovery rerun after the transport comes back.
- Packaging verification now includes a successful `npm run build:dir` check against the unpacked Electron output plus `npm run verify:mcp-release`, which asserts persisted MCP/user data files are not bundled and that Windows uninstall keeps app data intact.
- Remote integration coverage now exercises end-to-end `McpConnection` flows against mock SSE and WebSocket servers.

### Repo touchpoints

- `electron/mcp/transports/*`
- packaging/build docs if needed
- `AGENTS.md`
- `docs/*`

### Done when

- Remote transports are stable enough for production.
- Packaging and updates preserve MCP behavior.
- MCP is documented for both users and contributors.

---

## Cross-Phase Technical Tasks

These should be revisited in every phase, not treated as one-off work.

### Testing

- [x] Add unit tests for type normalization and config validation.
- [x] Add unit tests for transport message handling.
- [x] Add integration tests with a mock `stdio` MCP server.
- [x] Add property tests for MCP manager snapshot aggregation and active-tool filtering.
- [x] Add property tests for MCP server config CRUD round-trips and persisted-state invariants.
- [x] Add property tests for MCP connection lifecycle invariants and auto-connect eligibility rules.
- [x] Add integration tests for SSE/WebSocket when enabled.
- [x] Add UI tests for settings and approval flows.
- [x] Run `npm test` after each meaningful phase.

### Documentation

- [x] Keep `AGENTS.md` architecture current.
- [x] Keep `docs/mcp-phase-1-plan.md` aligned with actual Phase 1 scope.
- [x] Keep `docs/mcp-taskwise-plan.md` updated as tasks are completed or reprioritized.

### Security review

- [x] Re-validate preload allowlists after every new MCP IPC channel.
- [x] Re-check that secrets never flow into renderer persistence.
- [x] Re-check that renderer cannot bypass approval or execute arbitrary tools.

### Migration safety

- [x] Keep built-in `web_search` working at every intermediate step.
- [x] Keep renderer-side `research_plan` working at every intermediate step.
- [x] Keep provider tool support rules unchanged unless deliberately updated.

---

## Major File Areas Likely to Change

### Main process

- `electron/main.ts`
- `electron/preload.ts`
- new `electron/mcp/*`
- `electron/secureStorage.ts` if helper reuse is needed

### Renderer

- `src/electron.d.ts`
- `src/hooks/useToolCalling.ts`
- `src/tools/definitions.ts`
- `src/tools/types.ts`
- `src/tools/toolManager.ts`
- `src/tools/executor.ts`
- `src/tools/adapters/*`
- `src/components/Settings/Settings.tsx`
- `src/constants/settingsSections.ts`
- new `src/mcp/*`
- new MCP settings/approval UI components

### Docs

- `AGENTS.md`
- `docs/mcp-phase-1-plan.md`
- `docs/mcp-taskwise-plan.md`

---

## Definition of Done for the Whole MCP Initiative

MCP is considered fully landed when all of the following are true:

- users can configure trusted MCP servers in-app
- secrets remain in main-process secure storage
- connected server state is visible in renderer
- supported providers can call approved MCP tools
- approval and trust controls are enforced
- tool results are understandable in chat
- resources/prompts are integrated intentionally or explicitly deferred
- SSE and WebSocket transports are hardened if shipped
- `AGENTS.md` accurately documents the final architecture

---

## Suggested Immediate Next Steps

If you want execution to begin right now, start with this order:

1. Finalize Phase 0 decisions in writing.
2. Implement Phase 1 storage, manager, and `stdio` transport.
3. Add the dedicated `window.mcp` preload bridge.
4. Add the MCP settings section so the runtime can be exercised manually.
5. Only then refactor the tool system for dynamic MCP tool exposure.
