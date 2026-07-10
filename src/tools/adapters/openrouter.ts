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
function isLikelyBase64Image(value: string): boolean {
  if (value.length < 200) return false
  if (value.startsWith('data:image/')) return true
  return value.length > 500 && /^[A-Za-z0-9+/=\r\n]+$/.test(value.slice(0, 120))
}

/**
 * Strip multi-MB base64 screenshots from tool payloads before they go to the model.
 * Keep dimensions / media refs so the model still knows a capture occurred.
 */
function stripBinaryToolMedia(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(stripBinaryToolMedia)
  }
  if (!data || typeof data !== 'object') return data

  const obj = data as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if ((key === 'image' || key === 'screenshot') && typeof value === 'string' && isLikelyBase64Image(value)) {
      next[key] = '[screenshot omitted — use dimensions/mediaRef; re-capture if needed]'
      continue
    }
    if (key === 'image' && value && typeof value === 'object') {
      next[key] = stripBinaryToolMedia(value)
      continue
    }
    next[key] = stripBinaryToolMedia(value)
  }
  return next
}

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
      const { source, score, ...rest } = result
      delete rest.favicon
      delete rest.displayed_link
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

  return stripBinaryToolMedia(data)
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
          'Web search budget for this response has been reached. No additional results were returned. Use the search evidence gathered from previous tool calls and provide your final synthesized answer now.',
      }
    }

    const data = result.success
      ? toolCall.name === 'web_search'
        ? stripUiFieldsFromToolData(result.data)
        : stripBinaryToolMedia(result.data)
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
