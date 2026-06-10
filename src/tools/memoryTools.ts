/**
 * Memory is no longer a model-callable tool surface.
 *
 * The in-conversation memory tools (`save_memory`, `update_memory`,
 * `delete_memory`, `search_memories`) were removed: durable facts are now
 * captured exclusively by the background extraction pipeline
 * (`src/services/memoryExtraction.ts`), and saved memories are injected into
 * the prompt for read-only context (`src/prompts/buildMemoryBlock.ts`).
 *
 * This module retains only the historical tool-name constant so that older
 * chat sessions — which may have persisted `origin: 'tool'` memory tool
 * results in their message `toolResults` — keep suppressing the generic tool
 * result card instead of rendering a stray, unsupported tool entry.
 */

export const MEMORY_TOOL_NAMES = [
  'save_memory',
  'update_memory',
  'delete_memory',
  'search_memories',
] as const

export type MemoryToolName = (typeof MEMORY_TOOL_NAMES)[number]

export function isMemoryToolName(name: string): name is MemoryToolName {
  return (MEMORY_TOOL_NAMES as readonly string[]).includes(name)
}
