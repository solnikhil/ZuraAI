// Tool Definitions - JSON Schema format compatible with OpenAI/Gemini function calling
// SECURITY: Only includes tools that are implemented and enabled.

import type { ToolDescriptor } from './types'
import { builtInMainToolDefinitions, builtInMainToolManifest } from './builtinTools'
import { artifactToolDefinitions } from './artifactTools'

export type ToolDefinition = ToolDescriptor

/**
 * Active built-in tools in ZuraAI.
 *
 * - Main-process tools (web_search, code_execution, computer_*) execute via
 *   the `execute-tool` IPC.
 *
 * Memory is no longer a model-callable tool surface: saved memories are
 * injected into the prompt for context, and durable facts are captured by the
 * background extraction pipeline (`src/services/memoryExtraction.ts`) rather
 * than mid-conversation tool calls.
 */
export const builtInToolDefinitions: ToolDefinition[] = [
  ...builtInMainToolDefinitions,
  ...artifactToolDefinitions,
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
