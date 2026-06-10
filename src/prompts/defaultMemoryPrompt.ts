// Default memory prompt — appended to the saved-memories block when the
// Memory skill is enabled. The assistant cannot manage the saved-memories
// list directly: durable facts are captured automatically by the background
// extraction pipeline (see `src/services/memoryExtraction.ts`). This prompt is
// passive guidance on how to *use* the injected memories.

export const defaultMemoryPrompt = `Use the saved memories above to personalize your replies:
- Treat them as durable facts about the user unless they contradict something in the current conversation; when there is a conflict, trust the current conversation.
- Do not recite or list memories back to the user unless they ask. Apply them naturally.
- You do not manage this list. Memories are captured automatically in the background, so do not claim to have saved, updated, or deleted anything.`
