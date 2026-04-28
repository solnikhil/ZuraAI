// Tool Definitions - JSON Schema format compatible with OpenAI/Gemini function calling
// SECURITY: Only includes tools that are implemented and enabled.

import type { ToolDescriptor } from './types'
import { builtInMainToolDefinitions, builtInMainToolManifest } from './builtinTools'

export type ToolDefinition = ToolDescriptor

/**
 * Active tools in ZuraAI
 * web_search is a main-process IPC tool.
 */
export const builtInToolDefinitions: ToolDefinition[] = builtInMainToolDefinitions

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
