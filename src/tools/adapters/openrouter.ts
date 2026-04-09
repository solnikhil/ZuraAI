// OpenRouter/OpenAI Function Calling Adapter
// Converts tool definitions to OpenAI-compatible format

import type { ToolDescriptor, ToolResult, OpenRouterToolCall, OpenRouterToolResultMessage } from '../types'

export {
  hasToolCalls,
  parseOpenRouterToolCalls,
  type ToolCallFallbackContext,
} from './openrouterToolCalls'

/**
 * OpenAI/OpenRouter tool format
 */
export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
      [key: string]: unknown
    }
  }
}

/**
 * Tool call from OpenAI response (re-export for backward compatibility)
 */
export type OpenAIToolCall = OpenRouterToolCall

function cloneJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneJsonSchema)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, cloneJsonSchema(nestedValue)])
  )
}

export function convertToOpenRouterFormat(tools: ToolDescriptor[]): OpenAITool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: cloneJsonSchema(tool.parameters) as OpenAITool['function']['parameters'],
    },
  }))
}

/** Max chars per tool result to avoid 400 from oversized payloads */
const MAX_TOOL_RESULT_CHARS = 32000

/**
 * Strip UI-only fields from web search data before sending to the model.
 * Removes favicon, source, displayed_link from results and images array
 * to reduce token usage and prevent models from echoing raw metadata.
 */
function stripUiFieldsFromToolData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const obj = data as Record<string, unknown>

  if (Array.isArray(obj.results)) {
    const cleaned: Record<string, unknown> = { query: obj.query }
    cleaned.results = (obj.results as Array<Record<string, unknown>>).map((result) => {
      const { favicon, source, displayed_link, ...rest } = result
      return rest
    })
    cleaned.resultCount = obj.resultCount
    return cleaned
  }

  return data
}

export function formatToolResultsForOpenRouter(
  toolCalls: Array<{ id: string; name: string }>,
  results: ToolResult[]
): OpenRouterToolResultMessage[] {
  return toolCalls.map((toolCall, index) => {
    const result = results[index]
    if (!result) {
      return {
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: 'Error: No result available for this tool call',
      }
    }

    const data =
      toolCall.name === 'web_search' && result.success
        ? stripUiFieldsFromToolData(result.data)
        : result.data
    const content = result.success ? JSON.stringify(data) : `Error: ${result.error}`
    const truncated =
      content.length > MAX_TOOL_RESULT_CHARS
        ? content.slice(0, MAX_TOOL_RESULT_CHARS) + '...[truncated]'
        : content

    return {
      role: 'tool' as const,
      tool_call_id: toolCall.id,
      content: truncated,
    }
  })
}
