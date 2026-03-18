# MCP Task-Wise Master Plan

Status: PLANNING
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

Before MCP work starts, the app already has:

- restricted tool system with built-in `web_search` in main process
- renderer-side `research_plan`
- existing preload hardening in `electron/preload.ts`
- settings split across renderer storage and secure storage
- provider tool orchestration in:
  - `src/hooks/useToolCalling.ts`
  - `src/tools/toolManager.ts`
  - `src/tools/executor.ts`

Current gaps that MCP must address:

- no MCP lifecycle manager
- no MCP storage model
- no MCP preload bridge
- no dynamic runtime tool registry
- no approval flow for external tools
- no generic result UI for non-search tools

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

- [ ] Confirm initial release scope: tools-first, client-only, no server mode.
- [ ] Decide whether public MVP is `stdio` only or `stdio` plus remote transports.
- [ ] Finalize tool naming convention for MCP tools.
- [ ] Finalize server config schema and versioning strategy.
- [ ] Finalize secret-storage strategy for env vars, tokens, and headers.
- [ ] Finalize trust and approval defaults for newly added servers.
- [ ] Define connection-status model and user-facing error states.
- [ ] Define how disconnected/error servers affect tool exposure.
- [ ] Define migration strategy so built-in tools continue to work unchanged.
- [ ] Decide where the MCP settings section lives in navigation.
- [ ] Decide whether `resources` and `prompts` are hidden entirely or shown as capability counts in early phases.

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
- [ ] Create shared MCP types for server config, runtime state, tool manifest, and approval request payloads.
- [ ] Define namespaced tool identity format and reverse lookup metadata.
- [ ] Define normalized transport interface that all transports must satisfy.

#### 2. Storage and secrets
- [ ] Create `electron/mcp/mcpStorage.ts`.
- [ ] Persist non-secret server metadata under `app.getPath('userData')`.
- [ ] Resolve secret references from secure storage at connection time.
- [ ] Add config validation on read and write.
- [ ] Add migration/version field so config can evolve safely.

#### 3. Transport foundation
- [ ] Create `electron/mcp/transports/base.ts`.
- [ ] Implement message send/receive abstraction.
- [ ] Implement connection lifecycle hooks.
- [ ] Implement timeout and error reporting hooks.

#### 4. Stdio transport
- [ ] Create `electron/mcp/transports/stdio.ts`.
- [ ] Use managed process spawning, not `spawn-terminal-command`.
- [ ] Pass explicit command and args arrays only.
- [ ] Capture stdout/stderr separately for diagnostics.
- [ ] Handle process exit and startup timeout cleanly.

#### 5. Optional early remote transports
- [ ] Create `electron/mcp/transports/sse.ts` behind feature-gated usage.
- [ ] Create `electron/mcp/transports/websocket.ts` behind feature-gated usage.
- [ ] Add strict URL validation for remote transports.
- [ ] Add reconnect policy placeholders without auto-enabling aggressive retries.

#### 6. Connection layer
- [ ] Create `electron/mcp/mcpConnection.ts`.
- [ ] Implement initialize handshake.
- [ ] Implement server capability capture.
- [ ] Implement `tools/list` discovery.
- [ ] Cache tool manifests in runtime state.
- [ ] Store last connection error and last success timestamp.

#### 7. Manager layer
- [ ] Create `electron/mcp/mcpManager.ts`.
- [ ] Register all configured servers.
- [ ] Add connect/disconnect methods.
- [ ] Add runtime state subscription/broadcast support.
- [ ] Aggregate tools from connected servers.
- [ ] Keep disconnected/error servers from polluting active tool lists.

#### 8. Main-process IPC surface
- [ ] Create `electron/mcp/index.ts`.
- [ ] Register MCP IPC handlers.
- [ ] Expose list/add/update/remove/connect/disconnect/status/list-tools actions.
- [ ] Broadcast runtime state changes to renderer windows.

#### 9. Preload surface
- [ ] Add dedicated `window.mcp` bridge in `electron/preload.ts`.
- [ ] Add narrow allowlists for MCP invoke/on channels.
- [ ] Add `src/electron.d.ts` typings for `window.mcp`.

#### 10. App startup integration
- [ ] Register MCP handlers in `electron/main.ts`.
- [ ] Initialize manager during app ready.
- [ ] Decide whether enabled servers auto-connect on startup.
- [ ] Add safe shutdown/disconnect handling on app exit.

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
- [ ] Add a new settings section id, recommended: `mcp`.
- [ ] Update settings navigation metadata and keywords.
- [ ] Render a dedicated MCP section in `src/components/Settings/Settings.tsx`.

#### 2. Renderer state integration
- [ ] Create `src/mcp/McpContext.tsx`.
- [ ] Subscribe to MCP runtime state changes from `window.mcp`.
- [ ] Expose servers, states, tools, and pending approvals to the renderer.

#### 3. Server management UI
- [ ] Create `src/components/Settings/sections/McpSection.tsx`.
- [ ] Create add/edit dialog for servers.
- [ ] Create per-server card/list item UI.
- [ ] Show transport type, enabled state, connection state, and discovered tool count.
- [ ] Add connect/disconnect actions.

#### 4. Config forms
- [ ] Add common fields: name, enabled, auto-connect, timeout settings.
- [ ] Add stdio fields: command, args, cwd.
- [ ] Add remote fields: URL, headers, token references.
- [ ] Add env var editor with secret/plaintext distinction.
- [ ] Validate inputs before saving.

#### 5. Secret handling UX
- [ ] Reuse secure-storage save flow patterns from provider keys where possible.
- [ ] Ensure secret values are not persisted into renderer `localStorage`.
- [ ] Display masked secret state in forms.
- [ ] Support updating or clearing stored MCP secrets.

#### 6. Persistence behavior
- [ ] Ensure save/discard behavior matches existing Settings save bar expectations.
- [ ] Ensure server edits survive app restart.
- [ ] Ensure runtime state refreshes after save/connect/disconnect.

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
- [ ] Introduce a tool descriptor shape that supports dynamic JSON Schema inputs.
- [ ] Keep compatibility for built-in `web_search` and renderer-side `research_plan`.
- [ ] Add `origin` metadata, for example: `builtin-main`, `builtin-renderer`, `mcp`.
- [ ] Add reverse lookup metadata for namespaced MCP tools.

#### 2. Registry split
- [ ] Keep static built-in tool definitions separate from runtime MCP tools.
- [ ] Create renderer-side MCP tool registry adapter.
- [ ] Merge built-in and MCP tools at request time, not through one hardcoded array.

#### 3. Provider adapter compatibility
- [ ] Verify OpenRouter/Groq/Ollama/Alibaba adapters accept generic JSON Schema tool definitions.
- [ ] Keep Perplexity excluded from external tool exposure.
- [ ] Verify tool descriptions and parameter schemas survive provider conversion.

#### 4. Prompt/tool summary updates
- [ ] Update any tool-summary prompt helpers to include MCP tools only when connected and eligible.
- [ ] Keep skills prompt logic and built-in skill behavior intact.

#### 5. Tool parsing and formatting
- [ ] Ensure MCP namespaced tool calls parse back into `{ serverId, originalToolName }`.
- [ ] Keep tool result formatting backward compatible.

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
- [ ] Add MCP execution path separate from built-in `execute-tool` IPC usage.
- [ ] Route namespaced MCP tools through `window.mcp.executeTool(...)` or equivalent dedicated bridge action.
- [ ] Keep `research_plan` renderer-only and `web_search` main-process built-in.

#### 2. Runtime exposure policy
- [ ] Expose MCP tools only when the server is enabled.
- [ ] Expose MCP tools only when the server is connected.
- [ ] Expose MCP tools only when current provider supports tools.
- [ ] Expose MCP tools only when trust/approval policy allows them to be surfaced.

#### 3. Main-process tool execution
- [ ] Implement `tools/call` in `mcpConnection`.
- [ ] Return normalized result payloads back to renderer.
- [ ] Add timeout handling and cancellation boundaries.

#### 4. Chat loop integration
- [ ] Ensure `handleToolCalls` can process MCP results alongside built-in ones.
- [ ] Ensure follow-up tool result messages remain provider-compatible.
- [ ] Ensure failures produce model-visible tool errors instead of silent drops.

#### 5. Streaming and state updates
- [ ] Surface active MCP tool call state in chat.
- [ ] Ensure tool completion updates the current streaming state correctly.
- [ ] Avoid search-specific assumptions for generic MCP calls.

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
- [ ] Add per-server trust state.
- [ ] Define defaults for newly added servers: disabled, untrusted, approval required.
- [ ] Keep untrusted servers from exposing tools to models.

#### 2. Approval manager
- [ ] Create `electron/mcp/mcpApprovalManager.ts` if not already present.
- [ ] Add pending request registry.
- [ ] Add timeout expiry and auto-reject behavior.
- [ ] Add renderer resolution path.

#### 3. Approval UI
- [ ] Create `src/components/mcp/McpApprovalDialog.tsx`.
- [ ] Show server name, tool name, arguments, and risk notice.
- [ ] Add approve/reject actions.
- [ ] Support one clear pending approval flow at minimum.

#### 4. Policy controls
- [ ] Add server-level approval requirements to config UI.
- [ ] Optionally add per-server tool allowlist/blocklist scaffolding.
- [ ] Add execution timeout policy per server.

#### 5. Failure and recovery guards
- [ ] Reject stalled requests cleanly.
- [ ] Handle process crash or remote disconnect during pending approval.
- [ ] Return structured errors back into the tool pipeline.

#### 6. Auditability
- [ ] Attach execution metadata to MCP tool results.
- [ ] Include approval state, server id, duration, and outcome.

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
- [ ] Add generic tool result card UI for non-search tools.
- [ ] Show server, tool, status, duration, approval state, and formatted output.
- [ ] Fall back to readable JSON for arbitrary objects.
- [ ] Preserve special rendering for `web_search`.

#### 2. Error UX
- [ ] Show connection errors clearly.
- [ ] Show approval rejection distinctly from execution failure.
- [ ] Show timeout and disconnect errors distinctly.

#### 3. Streaming/chat polish
- [ ] Improve active-tool indicator for MCP tools.
- [ ] Avoid web-search-specific copy for generic tool runs.
- [ ] Ensure multi-tool sequences remain understandable.

#### 4. Usage and analytics
- [ ] Add basic local metrics for MCP executions.
- [ ] Count successful vs failed MCP tool calls.
- [ ] Track approval accept/reject counts.
- [ ] Consider exporting MCP activity in usage snapshots if consistent with existing privacy model.

### Repo touchpoints

- message rendering and tool result UI files
- usage metrics helpers if extended
- streaming utilities and tool-state UI

### Done when

- Users can understand what an MCP tool did.
- Errors are not opaque.
- The app can report basic MCP usage trends locally.

---

## Phase 7 - MCP Resources and Prompts

Goal: add non-tool MCP capabilities after tool execution is stable.

### Tasks

#### 1. Capability discovery
- [ ] Extend runtime state to cache resources and prompts in a structured way.
- [ ] Define whether resources/prompts are user-visible, model-visible, or both.

#### 2. Resource UX
- [ ] Add optional resource browser UI.
- [ ] Add fetch/read flow for selected resources.
- [ ] Define whether resources become tools, context attachments, or manual user actions.

#### 3. Prompt UX
- [ ] Add optional prompt browser.
- [ ] Define how MCP prompts are inserted into chat or agent flows.
- [ ] Avoid bypassing existing system-prompt controls.

#### 4. Safety and exposure rules
- [ ] Apply trust and approval rules to resource and prompt access too.
- [ ] Ensure resources/prompts do not widen IPC unsafely.

### Repo touchpoints

- `electron/mcp/*`
- `src/mcp/*`
- chat/input components if prompt insertion is added

### Done when

- Resources/prompts are integrated intentionally, not ad hoc.
- Their exposure model is documented and safe.

---

## Phase 8 - Remote Transport Hardening and Release Polish

Goal: finish remote readiness and make MCP production-grade.

### Tasks

#### 1. SSE hardening
- [ ] Finalize production SSE implementation.
- [ ] Add retry/backoff policy.
- [ ] Add auth header secret resolution and masking.
- [ ] Add robust request/stream error handling.

#### 2. WebSocket hardening
- [ ] Finalize production WebSocket implementation.
- [ ] Add heartbeat/staleness handling.
- [ ] Add reconnect/backoff policy.
- [ ] Add disconnect reason diagnostics.

#### 3. Packaging and environment checks
- [ ] Verify Electron packaging includes MCP runtime code cleanly.
- [ ] Verify no packaging step leaks MCP secrets.
- [ ] Verify Windows install/update flows do not break server config loading.

#### 4. DX and supportability
- [ ] Add developer docs for adding test MCP servers.
- [ ] Add troubleshooting section for local vs remote server failures.
- [ ] Add example configs for common servers.

#### 5. Release readiness
- [ ] Run full regression on built-in tools.
- [ ] Run transport-specific integration tests.
- [ ] Update `AGENTS.md` architecture one last time for released MCP shape.
- [ ] Update user-facing docs and release notes.

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

- [ ] Add unit tests for type normalization and config validation.
- [ ] Add unit tests for transport message handling.
- [ ] Add integration tests with a mock `stdio` MCP server.
- [ ] Add integration tests for SSE/WebSocket when enabled.
- [ ] Add UI tests for settings and approval flows.
- [ ] Run `npm test` after each meaningful phase.

### Documentation

- [ ] Keep `AGENTS.md` architecture current.
- [ ] Keep `docs/mcp-phase-1-plan.md` aligned with actual Phase 1 scope.
- [ ] Keep `docs/mcp-taskwise-plan.md` updated as tasks are completed or reprioritized.

### Security review

- [ ] Re-validate preload allowlists after every new MCP IPC channel.
- [ ] Re-check that secrets never flow into renderer persistence.
- [ ] Re-check that renderer cannot bypass approval or execute arbitrary tools.

### Migration safety

- [ ] Keep built-in `web_search` working at every intermediate step.
- [ ] Keep renderer-side `research_plan` working at every intermediate step.
- [ ] Keep provider tool support rules unchanged unless deliberately updated.

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
