# Memory & Personalization

ZuraAI ships a ChatGPT-style "saved memories" feature that lets the assistant
remember short, durable facts about the user across chats. Memories are stored
locally on disk; nothing leaves the device.

This doc is a quick reference for contributors. The authoritative architecture
notes live in [`AGENTS.md`](../AGENTS.md) under **Memory & Personalization**.

## What it does

- Users can manually add, edit, and delete memories in **Settings →
  Personalization → Memory**.
- The assistant can manage memories autonomously through four tool calls
  (`save_memory`, `update_memory`, `delete_memory`, `search_memories`) when both
  master toggles are on. Each mutation fires a sonner toast.
- All memories are injected into the system prompt of every conversation as a
  "Model Set Context" block — same approach ChatGPT uses (no embeddings, no
  vector search).
- An inline pill renders inside assistant messages whenever the model touches
  memory: collapsed it shows "Memory updated · N changes"; expanded it shows
  the diff with "was: …" for updates.

## Where the code lives

| Concern                  | File                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| Persistence              | `electron/memoryStore.ts` (`memory-index.json` under `userData`)                  |
| IPC handlers             | `electron/ipc/memoryStoreHandlers.ts`                                             |
| Renderer bridge          | `electron/preload.ts` (`window.memory.*`)                                         |
| Renderer types           | `src/electron/types.ts` (`Memory`, `MemoryAPI`, `MemoryScope`)                    |
| Settings UI              | `src/components/Settings/sections/MemorySection.tsx`                              |
| Settings toggles         | `settings.memoryEnabled`, `settings.autoMemoryEnabled` in `SettingsConfigContext` |
| Prompt block             | `src/prompts/buildMemoryBlock.ts`                                                 |
| Prompt assembly hook     | `src/utils/promptSelection.ts` (`getEffectiveSystemPrompt`)                       |
| Tool definitions         | `src/tools/memoryTools.ts`                                                        |
| Tool executor routing    | `src/tools/executor.ts`                                                           |
| Tool gating              | `src/hooks/useToolCalling.ts`                                                     |
| Inline pill              | `src/components/chat/MemoryUpdatePill.tsx`                                        |
| Chat-message integration | `src/components/Dashboard/ChatArea/MessageRenderer/index.tsx`                     |

## Settings

Two booleans drive the feature:

- `settings.memoryEnabled` — master toggle. When false:
  - the memory block is **not** appended to the system prompt
  - memory tools are **not** exposed to the model
- `settings.autoMemoryEnabled` — when true (and `memoryEnabled` is also true)
  the four memory tools are exposed so the assistant can manage memories
  itself. When false, only the user can manage memories from the Settings panel.

Both default to `true`. Manual memory management always works as long as
`memoryEnabled` is true.

## Data model

```ts
interface Memory {
  id: string                  // uuid
  content: string             // ≤ 1000 chars
  createdAt: number
  updatedAt: number
  source: 'user' | 'model'
  scope: { type: 'global' } | { type: 'project'; projectId: string }
  sessionId?: string          // chat where the model saved it
}
```

Caps and limits:

- `MEMORY_CAP = 200` entries (oldest by `updatedAt` are evicted FIFO)
- `MAX_MEMORY_CONTENT_LENGTH = 1000` characters per memory
- `MEMORY_BLOCK_TOKEN_BUDGET ≈ 2000` tokens for the injected block (oldest
  bullets dropped first when exceeded; logs a `console.warn` when truncating)

## Concurrency

`memoryStore.withWriteLock` serializes the entire read-modify-write cycle so
that concurrent mutations (e.g. the user editing in Settings while the model
calls `save_memory`) cannot lose writes. Reads outside the lock use a 1-second
TTL cache for hot-path performance.

## Forward compatibility — projects/folders

The data model already carries a `scope` field. v1 always writes
`{ type: 'global' }`. When the projects/folders feature ships:

1. Thread the active `projectId` into `loadMemoryBlock(settings, { type: 'project', projectId })`.
2. Pass the same scope to `window.memory.list(scope)` in the Settings panel.
3. Optionally extend the model tool args to allow scope per-call.

No schema migration is required — old global memories continue to surface in
both global and project contexts (`filterMemoriesByScope` returns project +
global entries when the project scope is active).

## Out of scope (v1)

These are deliberate non-goals so the v1 surface stays small and ships fast.
They can be layered in later without breaking changes:

- Embeddings / vector search.
- Mem0-style auto-extraction pipeline (LLM-judge ADD/UPDATE/DELETE/NOOP).
- Dense AI-generated "profile summary" memory (ChatGPT's "User Knowledge
  Memories"); the data model already accommodates a `source: 'system-summary'`
  variant when we add it.
- Per-provider memory.
- Undo timer for user-initiated deletes.
- Diagnostics counters in `electron/chatDiagnostics.ts`.

## Privacy

All memories are written to a single JSON file under
`app.getPath('userData')/memory-index.json` and never transmitted anywhere on
their own. Memories *are* injected into the system prompt of every chat
request, which means they are sent to whichever AI provider the user is
chatting with. This is the same trust model as the existing system prompt and
chat history. Users can review, edit, or wipe the entire store from the
Settings panel.
