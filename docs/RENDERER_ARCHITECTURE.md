# Renderer Architecture

This document describes ownership and lifecycle rules inside the React renderer. The security and
process boundary remains defined by `AGENTS.md`: the renderer is untrusted, and privileged work is
available only through narrow preload bridges.

## Provider nesting and state ownership

`DashboardApp` assembles the renderer providers. State should live in the narrowest owner that must
coordinate it:

- Settings contexts own sanitized preferences, model configuration, and secure-value presence
  markers. They never own readable secret values.
- `ChatHistoryProvider` owns the metadata-first session index, folder metadata, loaded chat windows,
  and chat/artifact mutations.
- Streaming contexts own transient output for the active run. Completed output is committed through
  chat-history actions.
- MCP and agent approval contexts coordinate their renderer-visible runtime state; they do not grant
  permissions beyond the main-process policy.
- Shell contexts own navigation and layout state only.

Prefer selector hooks for frequently rendered state. Mutation APIs should remain stable and should
not require components to know persistence details.

## Chat persistence and session windowing

Electron is the authoritative chat store. The renderer keeps a lightweight index and loads only a
recent message window for active/recent sessions. Inactive sessions are pruned back to metadata so
large histories do not accumulate in the renderer heap.

`ChatHistoryProvider` preserves the public contexts and selector hooks but delegates its mechanisms:

- `chatHistoryDomain.ts` owns pure normalization, index projection, and session/folder operations.
- `chatHistoryRepository.ts` owns Electron chat-store calls and local-storage adaptation.
- `useChatHistoryPersistence.ts` owns dirty revisions, debounced queues, self-change accounting, and
  best-effort final flushes.
- `useLoadedSessionCache.ts` owns full/windowed loading, recent-session tracking, artifact merging,
  and bounded pruning.

Provider callback tests must render the real provider and invoke its public actions. Do not copy an
action's state transformation into a test-local helper, because that can pass after the production
callback diverges.

Session and index writes are debounced independently. The following invariants apply:

1. A failed session write remains pending; a later mutation must retry the newest snapshot.
2. A newer snapshot queued while an older one is in flight must never be overwritten by the older
   snapshot or removed from the queue.
3. Provider unmount attempts a best-effort flush of pending session and index writes.
4. Each renderer-originated store mutation accounts for one expected `chat-store:changed` event.
   Concurrent self events must not be mistaken for external changes, and an external event following
   them must not be hidden.
5. External reloads do not replace optimistic local state while unsaved local revisions exist.

The unmount flush is best effort because renderer teardown cannot await React effect cleanup. Durable
shutdown guarantees belong in Electron main, not in a renderer `beforeunload` handler.

## Streaming lifecycle

A chat run progresses through request preparation, provider streaming, optional tool/research rounds,
final synthesis, and commit. Cancellation must stop provider work, suppress later transient updates,
and leave persistence in a coherent state. Partial output stays transient until the final commit unless
the explicit stop/error path preserves it.

Send and regeneration share these rules:

- Build provider input from an immutable snapshot of the conversation and settings.
- Do not mutate `Message`, `responseVersions`, tool results, or thinking blocks obtained from context.
- Resolve credentials and execute provider networking through the main-owned provider runtime.
- Commit the provider's final result rather than a stale throttled/transient snapshot.
- Treat title generation and memory extraction as follow-up work that cannot invalidate the chat
  response.

## Settings persistence and migrations

`zura-settings` contains sanitized renderer preferences only. `settingsStore.ts` parses untrusted JSON,
strips secret fields, applies compatibility migrations, merges defaults, and normalizes the result.

Future migration work should use ordered, idempotent transforms:

```text
stored JSON -> secret stripping -> vN-to-vN+1 migrations -> defaults -> runtime normalization
```

Each transform should have fixture tests for the previous stored shape and its expected current shape.
Compatibility aliases such as legacy `skills` versus `extensions` must have an explicit removal version.
Do not add a migration that reads secret values back into renderer state.

The current renderer settings schema is version 3. `settingsMigrations.ts` owns the contiguous
`vN -> vN+1` chain and persists `settingsSchemaVersion`; `settingsStore.ts` owns runtime validation
after migration. A retired persisted key must be removed in a numbered migration and represented in a
fixture. Migration code and fixtures may be deleted only when the minimum supported stored schema is
advanced deliberately and called out in release notes. Records from a newer application version are
never downgraded. Security-sensitive retired fields may additionally be stripped during every parse.

Renderer `codeExecutionAutoApprove`, `terminalAutoApprove`, and `computerUseAutoApprove` preferences
are retired and stripped. They never grant tool authority. Approval and exact-repeat trust are issued
and validated by main through the approval flow.

## Provider Hub extension points

Provider identity, secrets, model-list fields, setup kind, dashboards, and catalogue capabilities are
owned by `providerSettingsRegistry.ts`. `providerHubDescriptors.ts` adapts that registry into the
settings view's model collections and browser-preview connectivity strategies. Provider Hub UI should
consume those typed descriptors rather than add provider-ID branches for model storage or connectivity.

## Styling ownership

Global tokens, typography, and the shared flat `zura-menu-*` primitives live in `src/styles`. Feature
styles should remain beside their feature. `src/components/Settings/Settings.css` is the ordered
Settings style entrypoint; it imports `base`, `usage`, `shared`, `provider`, `appearance`, `mcp`, and
`memory` section sheets in that order. Keep this order stable unless a deliberate visual migration is
tested, because the split preserves the former monolith's cascade. Shared card rules have one Settings
owner, while the flat `zura-menu-*` primitives remain owned by `src/styles/shared.css`.

## Sidebar list composition

`sidebarChatListModel.ts` is the pure projection from grouped sessions, folders, time buckets, and
collapse state to stable list items. `SidebarChatList` coordinates listbox focus, drag/drop, and dialog
state; focused row, section-toggle, and dialog components own their direct interactions and accessible
labels. Changes to ordering or collapse behavior belong in the pure model and its tests rather than in
render branches.

## Testing expectations

Pure normalization and formatting logic should use focused unit tests. Provider/context behavior must
also have integration tests that render the real provider and exercise its public actions. In
particular, persistence tests should cover rejected IPC writes, concurrent self-change events, queued
newer snapshots, unmount flushing, and external reload gating.
