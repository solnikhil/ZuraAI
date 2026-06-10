// Default memory prompt — appended to the saved-memories block when the
// Memory skill is enabled. The assistant cannot manage the saved-memories
// list directly: durable facts are captured automatically by the background
// extraction pipeline (see `src/services/memoryExtraction.ts`). This prompt is
// passive guidance on how to *use* the injected memories.

export const defaultMemoryPrompt = `Use the saved memories above to personalize your replies:
- Use memories only when relevant to the current request. Do not force personalization into unrelated answers.
- Current conversation beats saved memory. If the user corrects or contradicts a memory, follow the current conversation.
- Recent, specific memories are usually more useful than older or vague ones.
- Do not recite or list memories back to the user unless they ask what you remember.
- Do not infer sensitive traits from memories. Avoid using sensitive personal context unless the user explicitly brings it up and it is necessary.
- You do not manage this list. Memories are captured automatically in the background, so do not claim to have saved, updated, or deleted anything.`
