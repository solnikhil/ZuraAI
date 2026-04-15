# Codebase Quality Cleanup TODOs

## 1) Deduplicate and Consolidate Code (DRY)
- [x] Consolidate repeated provider model update branches in `src/components/Settings/sections/ProviderHubSection.tsx`.
- [x] Deduplicate model display name logic by introducing `src/providers/modelDisplayName.ts` and reusing it in titlebar/popup surfaces.
- [ ] Consolidate Provider Hub connectivity state transitions and probe logic into shared helpers.
- [ ] Consolidate repeated IPC registration/unregistration boilerplate where it reduces complexity.

## 2) Consolidate Shared Type Definitions
- [x] Create shared chat domain types in `src/chat/types.ts`.
- [x] Rewire `src/contexts/ChatSessionManager.ts` to use shared chat types instead of context-defined types.
- [x] Re-export shared chat types from `src/contexts/ChatHistoryContext.tsx` for compatibility.
- [ ] Continue migrating type-only imports from context modules to shared type modules.

## 3) Remove Unused Code (Knip-Driven)
- [x] Remove verified-unused files (themes/tool barrels, unused UI primitives, old demo/sidebar sections).
- [x] Remove verified-unused direct dependencies: `@radix-ui/react-checkbox`, `@radix-ui/react-progress`, `@radix-ui/react-dropdown-menu`, `next-themes`.
- [x] Remove stale `knip` ignore for `next-themes` and clean related Vite chunk hints.
- [ ] Re-run `knip` and triage remaining uncertain candidates (`playwright`, barrel-path test references).

## 4) Untangle Circular Dependencies (Madge-Driven)
- [x] Break the `ChatHistoryContext` <-> `ChatSessionManager` cycle by extracting shared chat types.
- [ ] Re-run `madge --circular` across `src/**` and `electron/**` and verify zero cycles.
- [ ] Add a lightweight import-boundary guard to prevent manager/context back-edges from returning.

## 5) Remove Weak Types (`any`, unsafe casts, loose unknowns)
- [x] Replace `regenerateMessage(message: any, ...)` with a strong typed contract in `useStreamingChat`.
- [ ] Replace broad IPC bridge signatures with channel-mapped typings.
- [ ] Remove remaining unsafe casts in streaming/provider orchestration and parser boundaries.
- [ ] Keep `unknown` only at trusted boundaries with explicit narrowing/guards.

## 6) Remove Unnecessary Defensive `try/catch` / Silent Error Hiding
- [x] Replace empty/silent catches in titlebar window controls with narrow warning logs.
- [x] Replace empty catch in About window app-info load with explicit warning.
- [x] Remove unnecessary date parsing `try/catch` in About window and rely on validity checks.
- [x] Replace silent fallback catch in `electron/windows/mainWindow.ts` inline error page load path with explicit warning.
- [ ] Continue auditing and narrowing silent catches/fallbacks in broader renderer/main flow.

## 7) Remove Deprecated / Legacy / Fallback Paths
- [ ] Audit and stage removals for legacy migration paths (`chat-store:migrate`, old setting migrations) behind compatibility guardrails.
- [ ] Remove dead sync chat-store APIs only after verifying no external/test reliance.
- [ ] Remove `streamResponses=false` compatibility branches once full streaming-only enforcement is validated.
- [ ] Keep only resilience-critical fallbacks (e.g., explicit network fallback strategies) with clear logging.

## 8) Remove AI Slop, Stubs, and Low-Value Comments
- [x] Remove stale regenerate-flow comment in `useStreamingChat`.
- [x] Compress verbose narrative comments in `electron/ipc/chatStoreHandlers.ts` into concise, useful comments.
- [x] Reduce stale transitional comments in `ChatHistoryContext` loading flow.
- [ ] Continue pruning obvious/restatement comments in high-noise modules.

## Execution Mode: Option 1 (Conservative)
- [x] **Phase 1: safe/no-regret cleanup**: high-confidence dead code removal, first-pass DRY consolidation, targeted strong typing, and silent-catch cleanup.
- [ ] **Phase 2: structural quality improvements**: deeper type consolidation, runtime/IPC contract tightening, and larger refactors.
- [ ] Legacy migration and compatibility fallback paths are intentionally preserved for now; defer removal until post-cleanup validation.
