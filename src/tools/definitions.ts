// Tool Definitions - JSON Schema format compatible with OpenAI/Gemini function calling
// SECURITY: Only includes tools that are implemented and enabled.

import type { ToolDescriptor } from './types'
import { builtInMainToolDefinitions, builtInMainToolManifest } from './builtinTools'
import { memoryToolDefinitions } from './memoryTools'

export type ToolDefinition = ToolDescriptor

/**
 * Active built-in tools in ZuraAI.
 *
 * - Main-process tools (web_search, code_execution, computer_*) execute via
 *   the `execute-tool` IPC.
 * - Renderer-side tools (save_memory, update_memory, delete_memory,
 *   search_memories) execute through the `window.memory` bridge directly —
 *   the executor routes them based on `origin: 'builtin-renderer'`.
 *
 * Memory tools are gated at the request-shaping layer in
 * `src/hooks/useToolCalling.ts` by `settings.memoryEnabled` and
 * `settings.autoMemoryEnabled`; they are never exposed to the model when
 * either toggle is off.
 */
export const builtInToolDefinitions: ToolDefinition[] = [
  ...builtInMainToolDefinitions,
  ...memoryToolDefinitions,
]

export const toolDefinitions = builtInToolDefinitions
export { builtInMainToolManifest }

export function getBuiltinToolDefinitions(): ToolDefinition[] {
  return builtInToolDefinitions
}

export function getAllToolDefinitions(runtimeTools: ToolDescriptor[] = []): ToolDescriptor[] {
  return [...builtInToolDefinitions, ...runtimeTools]
}

/**
 * Get tool definition by name
 */
export function getToolByName(
  name: string,
  runtimeTools: ToolDescriptor[] = []
): ToolDescriptor | undefined {
  return getAllToolDefinitions(runtimeTools).find((t) => t.name === name)
}
