// OpenRouter/OpenAI Function Calling Adapter
// Converts tool definitions to OpenAI-compatible format

import type { ToolDescriptor, ToolResult, OpenRouterToolResultMessage } from '../types'

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
 * Shape web search data for the model.
 *
 * UI-only fields are removed, but source/date/citation guidance is preserved so
 * the follow-up synthesis can behave like a grounded search assistant instead
 * of treating the results as generic JSON.
 */
function stripUiFieldsFromToolData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const obj = data as Record<string, unknown>

  if (Array.isArray(obj.results)) {
    const cleaned: Record<string, unknown> = {
      query: obj.query,
      source: obj.source,
      searchDepth: obj.searchDepth,
      extractDepth: obj.extractDepth,
      intent: obj.intent,
      message: obj.message,
      guidance: [
        'Use only these returned results for web-grounded claims; do not fill missing facts from memory.',
        'Cite important claims with bracket numbers matching the result_index values below.',
        'Prefer official, primary, current, and directly relevant sources; check date/page age signals when recency matters.',
        'If results are insufficient, conflicting, stale, or off-topic, say so clearly instead of overstating certainty.',
      ],
    }
    cleaned.results = (obj.results as Array<Record<string, unknown>>).map((result, index) => {
      const { favicon, source, displayed_link, score, ...rest } = result
      return {
        result_index: index + 1,
        source,
        score,
        ...rest,
      }
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

    const metadata = result.metadata
    if (
      toolCall.name === 'web_search' &&
      metadata &&
      (metadata.origin === 'builtin-main' || metadata.origin === 'builtin-renderer') &&
      metadata.executionDisposition === 'skipped'
    ) {
      return {
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content:
          'No additional web_search results were returned for this over-budget request. Ignore this tool result in the final answer and use only previously returned search evidence.',
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
