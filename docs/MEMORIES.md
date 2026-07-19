# Memory and personalization

ZuraAI can remember short, durable facts about you across chats — similar to “saved memories” in other assistants. Memories stay on your machine.

This is a contributor map. Architecture rules still live in [`AGENTS.md`](../AGENTS.md).

## What users see

- Add, edit, and delete memories in **Settings → Personalization / Memory**.
- When automatic memory is enabled, the assistant can save/update/delete/search memories through tools.
- A compact memory block can be added to the system prompt so the model sees relevant facts.
- When the model changes memory, the chat can show a small “memory updated” indicator.

## Important settings

| Setting | Effect |
| ------- | ------ |
| Memory enabled | Master switch. Off = no memory block, no memory tools |
| Auto memory enabled | When master is on, the model may manage memories itself |

Manual editing in Settings still works when the master switch is on.

## Where the code lives

| Concern | Place |
| ------- | ----- |
| Disk store | `electron/memoryStore.ts` |
| IPC | `electron/ipc/memoryStoreHandlers.ts` |
| Preload bridge | `window.memory.*` |
| Settings UI | `src/components/Settings/sections/MemorySection.tsx` |
| Prompt block | `src/prompts/buildMemoryBlock.ts` |
| Tools | `src/tools/memoryTools.ts` |

## Data rules of thumb

- Memories are short text facts, not full chat logs.
- Scope can be global or project/folder related depending on product settings.
- Writes should go through the main-process store, not renderer inventing files.
- Do not send memory contents to analytics.

## Folder-aware memory

When chats belong to a folder/project, memory scope can include global memories, folder memories, or folder-only mode. Keep the scope rules explicit in code and tests so a “folder-only” project never silently pulls global facts back in.
