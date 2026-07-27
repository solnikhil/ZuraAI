# Agent Mode improvement plan

Status: production foundation implemented; later phases remain a roadmap  
Date: 2026-07-26  
Scope: reliability, safety, progress UX, long-running work, and optional multi-agent execution

## Implementation snapshot

This working tree now implements the production-critical foundation identified by the audit:

- A visible, persisted Agent timeline with live phase, approval, verification, budget, elapsed-time, blocker, Stop, and emergency-stop guidance.
- A sender/run-bound main runtime with finite 30-minute, 120-call, and 50-mutation ceilings; categorical exhaustion reasons; and cancellation propagated to queued approvals, shell process trees, code execution, MCP requests, and background-window ownership.
- Evidence-gated verification with typed postconditions, explicit `initial → recovery → verified/failed` progression, exactly one recovery attempt, and terminal status that cannot claim success when evidence is contradicted or inconclusive.
- A bounded main-owned approval FIFO with structured outcomes and sender/run cancellation, plus revocable exact-repeat grants whose signatures remain in encrypted main storage.
- Centralized Agent/Chat mode transitions, autonomy revocation on exit, a React lifecycle/accessibility pass, sanitized run telemetry, and privacy-safe durable tool-step metadata.

The later roadmap remains intentionally unimplemented where it would require a larger architecture decision: durable cross-restart checkpoints, context compaction, provider-token budgets, risk-tier policy editors, and in-product parallel subagent execution. Those should build on this runtime instead of bypassing its ownership, approval, budget, and verification boundaries.

## Executive summary

ZuraAI already has unusually strong desktop-control safety primitives: exact tool schemas, main-issued one-use approval tokens, a main-owned autonomous-mode policy, a Windows background-window reservation, an emergency stop, mutation-aware verification checkpoints, and systemic-failure detection. The next step is not to add more tools. It is to turn these pieces into an explicit agent runtime with truthful state, evidence-gated completion, bounded recovery, and a visible execution record.

The highest-priority changes are:

1. Fix correctness bugs in approval queuing, Agent Mode toggling, verification termination, and final run status.
2. Render the existing `AgentRun` data as a live, persisted timeline. It is currently recorded but not shown.
3. Replace the research-loop-shaped orchestration with a dedicated `discover -> plan -> act -> verify -> report` state machine.
4. Separate capability boundaries from approval policy. "Autonomous" should reduce prompts inside an explicit scope, not become a single global all-tools switch.
5. Add compacted working state and resumable checkpoints for long tasks.
6. Introduce subagents only after the single-agent runtime is reliable, starting with bounded read-only research, review, and test work.

The proposed implementation sequence is intentionally incremental. Phases 0 and 1 should materially improve Agent Mode without moving provider orchestration into a new process.

## What exists today

### Strong foundations to keep

- The renderer remains untrusted and privileged execution crosses narrow preload/main boundaries.
- Tool calls are schema-validated and allowlisted before execution (`src/tools/toolManager.ts:242-272`, `electron/tools/validateBuiltinToolInvocation.ts`).
- Approval authority is a one-use token bound in main to sender, tool, and arguments (`electron/tools/toolApprovalAuthorizations.ts`, `electron/windows/agentApprovalOverlay.ts:66-113`).
- Main owns the persisted Fully autonomous policy and requires a native confirmation before enabling it (`electron/windows/agentApprovalOverlay.ts:39-67`).
- Windows Agent Mode has exact-window ownership and a background guard, limiting interference with the user's desktop (`electron/tools/background-window/`).
- File, app/window, visual, shell, and generic mutations already select different verification strategies (`src/agent/reliability.ts:115-185`).
- The loop stops when distinct tools return the same infrastructure failure (`src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts:932-938,1216-1220`).
- Tool batches preserve result ordering and execute approved calls concurrently (`src/tools/toolManager.ts:222-313,357-390`).

### Current runtime shape

```text
Chat send/regenerate
  -> renderer ChatRunController
  -> provider stream
  -> model tool calls
  -> renderer validation/budget/approval coordination
  -> preload/main tool execution
  -> tool results returned to the model
  -> mutation checkpoint injected into the same follow-up loop
  -> final assistant message
```

Agent Mode currently changes the exposed tool surface, approval callbacks, and run metadata. It does not yet have a separate agent orchestrator. General tool work and agent verification share the research follow-up loop and its 50-round safety cap (`src/providers/providerRegistry.ts:168-172`, `useProviderStreaming.ts:956-1263`).

The initial "plan" is static safety metadata. Only the task text varies; the model does not create milestones and the runtime does not enforce them (`src/agent/reliability.ts:64-73`, `src/agent/agentRun.ts:38-65`).

## Confirmed gaps

### P0: concurrent approval requests can cancel an earlier request

The native approval overlay has one global active request. Starting another calls `finishActive({ approved: false })` before showing the new one (`electron/windows/agentApprovalOverlay.ts:133-147`). Concurrent runs or approval sources can therefore make an earlier request look user-rejected. The renderer's fallback dialog has a FIFO queue, but Electron uses the native bridge and bypasses that fallback (`src/agent/AgentToolApprovalContext.tsx:40-103`).

Change: add a main-owned FIFO queue scoped by sender and run. A window close should resolve only the displayed request; run cancellation should remove only that run's queued requests. The overlay should display the queued count and originating task.

### P0: the run ledger is invisible and can become stale

`useStreamingChat` creates and updates plan, approval, tool, and verification steps (`src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts:587-705`). `StreamingMessage` carries `agentRun`, but `MessageRenderer` never renders it. The renderer memo comparators also ignore changes to `agentRun` (`StreamingMessage.tsx:140-194`, `MessageRenderer/messagePropsComparison.ts:87-193`).

Change: add a compact `AgentRunTimeline` above the final answer with phase, current action, approval state, verification result, elapsed time, blocker, and Stop. Persist a collapsed summary after completion. Compare an `agentRun.revision` rather than deeply serializing every step.

### P0: Agent Mode can remain selected after its capability is disabled

The composer transition writes `assistantMode: enabled ? 'agent' : assistantMode`, so turning the capability off while already in Agent Mode leaves `assistantMode` equal to `agent` (`src/components/Dashboard/ChatArea/InputArea.tsx:195-203`). Settings labels the capability toggle "Enable Agent Mode" but changes only the skill state (`src/components/Settings/sections/ComputerUseSection.tsx:18-55`).

Change: centralize mode transitions. Entering Agent Mode sets the mode and required capability state; exiting always returns to Chat and releases active run/window ownership. Decide explicitly whether exit also disables Fully autonomous mode, then test that invariant across composer and Settings entry points.

### P0: verification can fail while the run reports success

`didVerificationSucceed` currently treats any successful preferred read-only call as proof unless it reports an unchanged visual (`src/agent/reliability.ts:187-198`). It does not evaluate a requested postcondition. In the valid-tool-result failure branch, recovery state can reset and continue toward the global cap (`useProviderStreaming.ts:1233-1252`). Regardless of verification state, normal finalization marks the run `completed` (`useStreamingChat.ts:713-725`).

Change:

- Replace the two verification booleans with `initial | recovery | verified | failed`.
- Give each mutating checkpoint a typed postcondition and acceptable evidence kinds.
- After one failed recovery, prevent further mutations, emit `onVerificationComplete(false)`, and produce a grounded blocker.
- Add terminal statuses `completed_verified`, `completed_unverified`, `failed`, and `cancelled` (or an orthogonal `completion` plus `verification` field).
- Never derive verification solely from tool dispatch success.

### P0: general Agent work has no authoritative total budget

`toolManager` supports `remainingToolCallBudget`, but interactive Agent calls do not supply it and the fallback is `Number.MAX_SAFE_INTEGER` (`src/tools/toolManager.ts:229-231`). The practical backstop is therefore mostly the renderer's 50-round loop, and one round can contain many calls. A renderer-only counter would still not be an authority boundary.

Change: add a main-owned run policy/usage ledger bound to sender and opaque run ID. Enforce wall-clock, total-call, mutation, Computer Use, MCP, and per-risk limits at the main tool/MCP boundaries. The renderer can display remaining budget but cannot increase it. Budget exhaustion must become a typed terminal/blocker reason rather than a synthetic generic tool failure.

### P0: Stop does not cancel all dispatched work

The current Stop path aborts provider streaming and releases the background reservation, but renderer tool timeouts use `Promise.race` without cancelling work already dispatched to main or MCP (`src/tools/executor.ts:54-74,117-143`). `Esc+Esc` is registered through Computer Use/background ownership, so it is not a universal kill switch for a file-, shell-, code-, or MCP-only run.

Change: add a main run registry and cancellation IPC that cancels pending approvals, terminates cancellable shell/code/MCP work, rejects new dispatches for the run, and releases all reservations. Every Agent timeline needs a persistent Stop control; keep `Esc+Esc` as the additional desktop emergency path.

### P1: approval infrastructure errors are mislabeled as rejection

Any approval-bridge error becomes `false` (`AgentToolApprovalContext.tsx:74`) and is recorded as user rejection. The missing-provider fallback returns `true` (`:126-132`), which is a fail-open path outside the expected provider tree.

Change: use a structured result: `approved_once | approved_session | approved_policy | rejected | timed_out | unavailable | cancelled | error`. Fail closed when approval authority is missing. Surface retryable infrastructure errors separately from an intentional rejection.

### P1: failed execution loses its useful trace

On provider/runtime failure, the active streaming message and run trace are removed and replaced by a plain assistant error (`useStreamingChat.ts:787-818`).

Change: retain the sanitized run ledger, mark unfinished items cancelled or failed, attach a failure category, and offer "Retry from checkpoint" and "Copy diagnostics". Raw arguments, user text, titles, HWNDs, images, and secrets must not enter diagnostics.

### P1: persistent trust has no management surface

"Always allow exact repeat" signatures persist in secure storage, but users cannot inspect sanitized metadata or revoke individual grants (`electron/windows/agentApprovalOverlay.ts:31,291-312`).

Change: add a main-backed Trusted actions view with tool, risk class, creation time, last-used time, and revoke controls. Keep raw argument values and signature authority in main.

### P2: capability reporting and planning are misleading

The run reports web, code, and MCP as `approval-required` even though approval is tool-specific and some calls are read-only (`src/agent/agentRun.ts:19-36`, `src/tools/approvalPolicy.ts`). The static plan is shown internally as completed before any discovery.

Change: report actual capability profiles and approval policy separately. Rename the current static row to "Safety strategy" until a real plan exists.

Regenerate also currently disables tools and does not create a new Agent run (`src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts:977-1018`). Define this behavior explicitly: either regenerate is answer-only and the UI says so, or it creates a fresh run that must re-observe state and obtain fresh authority. It must never silently replay prior mutations.

## Target runtime

```text
User goal
  -> DISCOVER: inspect context and available capabilities
  -> PLAN: produce milestones + definition of done + risk/cost estimate
  -> ACT: execute one dependency-ready batch within policy and budgets
  -> VERIFY: evaluate fresh evidence against explicit postconditions
       -> verified: advance milestone
       -> failed: one strategy-changing recovery, then stop grounded
  -> REPORT: summarize outcome, evidence, changes, and remaining blockers
```

Use two related but distinct data models:

1. `AgentRunState`: authoritative execution phases and item lifecycle.
2. `AgentPlan`: user-readable milestones that can be updated with a recorded reason.

A suggested run model:

```ts
interface AgentRunState {
  id: string
  revision: number
  status: 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled'
  phase: 'discover' | 'plan' | 'act' | 'verify' | 'report'
  verification: 'not_required' | 'pending' | 'verified' | 'unverified'
  policySnapshot: AgentPolicySnapshot
  budget: AgentBudgetState
  plan: AgentMilestone[]
  items: AgentRunItem[]
  evidence: AgentEvidenceRef[]
  blocker?: AgentBlocker
}
```

Each item should have `queued`, `started`, and one authoritative terminal event. Items should be correlated to run, model turn, tool call, approval, checkpoint, and optional parent/child run IDs. Opaque IDs remain trusted context and never become model-editable arguments.

### Definition of done and evidence

Planning should yield machine-readable postconditions, not free-form confidence. Examples:

| Action                     | Postcondition                                                   | Preferred evidence            |
| -------------------------- | --------------------------------------------------------------- | ----------------------------- |
| Write a file               | Target exists and expected content/hash is present              | `file_read` / stat            |
| Run a build                | Process exits 0 and expected output exists                      | captured exit + artifact stat |
| Change an app setting      | Exact control exposes expected value/state                      | fresh UIA state               |
| Perform visual-only action | Targeted image shows expected state                             | fresh targeted screenshot     |
| MCP mutation               | Resource can be read back with matching stable identifier/value | MCP read tool                 |

The verifier should receive the requested postcondition, fresh evidence, and a read-only tool subset. For high-risk or write-heavy work, an optional independent read-only reviewer can assess outcome and evidence without sharing the implementing model's narrative assumptions.

### Budgets and loop policy

Replace the shared global iteration cap as the primary control with explicit per-run budgets:

- model turns
- total tool calls and mutating tool calls
- verification attempts per checkpoint
- elapsed time
- estimated token/cost budget where the provider exposes usage
- Computer Use actions
- child agents and child-agent tokens/tool calls

Budgets should be policy inputs with conservative product defaults, not model arguments. A retry consumes budget only when it uses a materially different strategy. Repeating an identical failed action should stop immediately.

### Capability profiles and approval policy

Treat technical authority and conversational autonomy as separate axes.

Capability profiles could include:

- Read local/project context
- Write within selected roots
- Public/cached network access
- Live network access
- Run code or shell within selected roots
- MCP read / MCP write
- Background-safe desktop automation
- Foreground desktop control

Approval policy then decides whether a permitted capability needs consent: every time, once, for this run, for a narrow saved rule, or denied. Main computes the exact capability delta and issues the existing one-use authorization. "Fully autonomous" should become a clearly scoped profile with optional expiry, not silently widen the technical boundary.

## Long-running work and context

Use four context tiers:

1. Immutable instructions and current user constraints.
2. Active working set for the current milestone.
3. Compacted run summary containing decisions, unresolved items, failures, policy grants, budget state, and evidence references.
4. Durable project/user memory, kept separate from task-local state.

Compaction must be a visible run item. It should never silently discard rejected approvals, unresolved blockers, failed mutations, definition-of-done clauses, or evidence pointers. Persist checkpoints so an interrupted run can resume by re-observing external state before acting; do not assume the desktop or an MCP resource is unchanged.

## Subagent design

Subagents are useful, but they should not be the first fix. Their initial purpose should be context isolation and parallel read work, not multiplying autonomous mutations.

### Initial allowed uses

- repository/app exploration
- web research with distinct questions
- test execution and result summarization
- read-only review or verification
- triage of independent evidence sources

### Required constraints

- Parent assigns a bounded goal, output schema, deadline, and budget.
- Child permissions are the intersection of parent permissions and task scope; never broader.
- Child returns a compact summary plus evidence references, not its entire transcript.
- Parent remains responsible for synthesis and final completion status.
- Only dependency-independent tasks run concurrently.
- External UI mutations against the same app/window are serialized through the existing exact-target lease.
- Parallel file writes require isolated worktrees/staging areas and an explicit merge/review step; until then, children remain read-only.
- Child status and cost are visible in the parent run timeline and cancellable independently.

An implementation order is: read-only child runs -> independent verifier child -> isolated file-write children -> broader MCP/app delegation.

## Progress and control UX

The active Agent Mode surface should show execution-backed state rather than model narration:

- current phase and milestone
- running/queued tools with sanitized summaries
- elapsed time and budget remaining
- approval request with risk, scope, and task context
- verification evidence and recovery state
- child agents and their statuses
- a persistent Stop control and visible `Esc+Esc` emergency-stop hint
- exact blocker when the run cannot continue

The composer Agent pill should distinguish manual approval from scoped autonomy. Completed runs should collapse to a one-line result (`Verified`, `Unverified`, `Failed`, or `Cancelled`) with expandable evidence and diagnostics.

## Implementation roadmap

### Phase 0 — correctness and truthful status

- Add a main-owned approval FIFO keyed by sender/run.
- Add the main-owned policy/budget ledger and end-to-end run cancellation.
- Centralize Agent Mode enter/exit invariants.
- Implement the bounded verification checkpoint state machine.
- Add verified/unverified terminal semantics.
- Preserve failed run traces and classify approval infrastructure failures.
- Replace contradictory legacy tests that assert approval flags are ignored.

Exit criteria: no approval is lost; no unverified run is labeled completed/verified; disabling Agent Mode reliably returns to Chat; Stop prevents new work and cancels supported in-flight work; main enforces finite run budgets; a failed run retains a useful sanitized trace.

### Phase 1 — visible dedicated orchestrator

- Render `AgentRunTimeline` and fix memoization.
- Split agent orchestration from the research loop while retaining the shared provider streaming primitives.
- Add real milestones, postconditions, evidence refs, and per-run budgets.
- Add run-specific privacy-safe diagnostics and analytics.

Exit criteria: every active run has an observable phase/current item; completion is evidence-gated; tool/retry/time budgets are enforced independently of research depth.

### Phase 2 — scoped autonomy and resumability

- Introduce capability profiles and structured approval decisions.
- Add trusted-action management/revocation.
- Add task-local compaction and resumable checkpoints.
- Re-observe external state before resuming.

Exit criteria: users can explain and revoke what is authorized; long tasks can compact/resume without losing constraints, failures, or definition of done.

### Phase 3 — bounded subagents

- Add read-only child runs with parent/child ledger links.
- Add independent reviewer/verifier children.
- Add isolation before any parallel child writes.
- Expose child lifecycle, budgets, cancellation, and summaries in the parent timeline.

Exit criteria: child work cannot widen authority, mutate shared targets concurrently, or hide cost/failure from the parent run.

## Test and evaluation plan

### Deterministic tests

- Two concurrent approval requests are queued and resolved independently.
- Cancelling one run removes only its approval requests.
- IPC error/timeout/unavailable states never appear as user rejection and never execute a tool.
- Agent Mode enable/disable remains consistent across Settings and composer.
- A successful mutation followed by non-proving evidence ends unverified after one recovery.
- A verifying read-back produces verified completion.
- Provider failure after a mutation preserves the run trace.
- `agentRun.revision` updates the active and historical timeline.
- Trusted-action revocation prevents the next automatic approval.
- Compaction preserves constraints, blockers, incomplete milestones, and evidence refs.
- Child permissions are always a subset of parent permissions.
- Same-window desktop mutations serialize; independent read tasks may run concurrently.

### Scenario evaluations

Build a repeatable suite for:

- simple read-only answers
- multi-file edits plus typecheck/tests
- a failing build requiring diagnosis and a changed retry strategy
- multi-step desktop UI work with background reservation
- unavoidable foreground-control blocker
- MCP mutation and read-back verification
- user rejection midway through a run
- lost provider/network/approval bridge
- emergency stop during execution
- Stop or renderer timeout during shell/MCP execution
- long run crossing a compaction boundary
- parallel research and independent review

Track task success by an external evaluator or deterministic postcondition, not the agent's own final text.

### Product metrics

- verified task success rate
- false-success rate (reported success without satisfied postcondition)
- unverified-completion rate
- approval prompts and approval latency per successful task
- recovery success and repeated-identical-action rate
- desktop interference incidents
- P50/P95 task duration, tool calls, tokens, and estimated cost
- resumptions that succeed without duplicated mutation
- child-agent contribution versus added cost

Analytics must remain opt-in and sanitized. Never emit prompt text, tool arguments, file contents/paths, window titles/HWNDs, screenshots, secrets, or MCP payloads.

## Lessons from Codex (documented versus inferred)

The following are documented public Codex behaviors or interfaces:

- Codex uses sandboxing as the technical boundary and approvals as a separate consent policy. It can run tests, linters, and commands, and exposes logs/test output as review evidence. See [Introducing Codex](https://openai.com/index/introducing-codex/) and [Running Codex safely at OpenAI](https://openai.com/index/running-codex-safely/).
- The Codex app supports parallel tasks in separate threads and isolated Git worktrees, and provides reviewable changes. See [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/).
- Codex's app-server protocol models threads, turns, typed items, lifecycle events, structured approvals, and context compaction. See the official [`app-server` README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md).
- Codex separates conversational planning from a checklist/progress mechanism and recommends concise progress updates for longer work. See the official [Plan Mode template](https://github.com/openai/codex/blob/main/codex-rs/collaboration-mode-templates/templates/plan.md) and [base instructions](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/prompts/base_instructions/default.md).
- Public Codex materials describe context compaction and long-running task practices. See [Unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/) and the [Codex long-running work guide](https://cdn.openai.com/pdf/8a9f00cf-d379-4e20-b06f-dd7ba5196a11/OAI_WhitePaper_Codex-maxxing26.pdf).

The target runtime, risk model, verification contracts, subagent constraints, and phased roadmap in this document are recommendations inferred for ZuraAI. They are not claims that Codex uses the same internal implementation.

## Architecture-document impact when implemented

This proposal alone does not change runtime architecture. When implementation begins, update the Architecture section of `AGENTS.md` in the same PR/commit for any of the following:

- a new main-owned agent-run service or persistence location
- new/changed IPC channels for run events, approval queues, diagnostics, or trusted-action management
- subagent processes/workers, worktrees, or parent/child execution flow
- new compaction/checkpoint persistence
- changed approval, tool, provider, or packaging assumptions
