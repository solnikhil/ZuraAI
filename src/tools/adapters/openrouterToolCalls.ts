import type { OpenRouterResponse, OpenRouterToolCall, ToolCall } from '../types'

export interface ToolCallFallbackContext {
  lastUserMessage?: string
  reasoning?: string
}

export type InlineToolMarkupFormat = 'xml' | 'dsml'

export interface InlineToolCallExtractionResult {
  toolCalls: ToolCall[]
  cleanedContent: string
  format: InlineToolMarkupFormat | null
  hadMarkup: boolean
  recoveredToolNames: string[]
  rawPreview: string
}

const DSML_BLOCK_PATTERN =
  /<\s*\|\s*\|\s*DSML\s*\|\s*\|\s*tool_calls\s*>[\s\S]*?<\s*\/\s*\|\s*\|\s*DSML\s*\|\s*\|\s*tool_calls\s*>/gi
const XML_TOOL_CALL_PATTERN = /<tool_call(?:s)?\b[^>]*>[\s\S]*?<\/tool_call(?:s)?>/gi
const XML_INVOKE_PATTERN = /<invoke\s+name=["'][^"']+["'][^>]*>[\s\S]*?<\/invoke>/gi

export function normalizeInlineToolCallMarkup(content: string): string {
  return content
    .replace(/\uFF1C/g, '<')
    .replace(/\uFF1E/g, '>')
    .replace(/\uFF0F/g, '/')
    .replace(/\uFF5C/g, '|')
}

function findToolNames(markup: string): string[] {
  const names = new Set<string>()
  for (const match of markup.matchAll(/<tool_name>([\s\S]*?)<\/tool_name>/gi)) {
    if (match[1]?.trim()) names.add(match[1].trim())
  }
  for (const match of markup.matchAll(
    /(?:<invoke|DSML\s*\|\s*\|\s*invoke)\s+name=["']([^"']+)["']/gi
  )) {
    if (match[1]?.trim()) names.add(match[1].trim())
  }
  return [...names]
}

/**
 * Detect and remove provider-emitted pseudo tool markup from visible text.
 *
 * Text/XML/DSML is never converted into an executable tool call. Providers
 * must use their native structured tool-call channel with schema-valid JSON.
 */
export function extractInlineToolCallsFromContent(
  content: string | null | undefined,
  _fallbackContext?: ToolCallFallbackContext | null
): InlineToolCallExtractionResult {
  const rawContent = normalizeInlineToolCallMarkup(typeof content === 'string' ? content : '')
  const dsmlMatches = Array.from(rawContent.matchAll(DSML_BLOCK_PATTERN))
  const xmlMatches = [
    ...Array.from(rawContent.matchAll(XML_TOOL_CALL_PATTERN)),
    ...Array.from(rawContent.matchAll(XML_INVOKE_PATTERN)),
  ]
  const matches = dsmlMatches.length > 0 ? dsmlMatches : xmlMatches
  const format: InlineToolMarkupFormat | null =
    dsmlMatches.length > 0 ? 'dsml' : xmlMatches.length > 0 ? 'xml' : null

  if (!format) {
    return {
      toolCalls: [],
      cleanedContent: rawContent,
      format: null,
      hadMarkup: false,
      recoveredToolNames: [],
      rawPreview: '',
    }
  }

  const markup = matches.map((match) => match[0]).join('\n')
  const cleanedContent = rawContent
    .replace(DSML_BLOCK_PATTERN, '')
    .replace(XML_TOOL_CALL_PATTERN, '')
    .replace(XML_INVOKE_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    toolCalls: [],
    cleanedContent,
    format,
    hadMarkup: true,
    recoveredToolNames: findToolNames(markup),
    rawPreview: markup.slice(0, 240),
  }
}

export const extractXmlToolCallsFromContent = extractInlineToolCallsFromContent

function parseNativeArguments(toolCall: OpenRouterToolCall): ToolCall {
  const rawArguments = toolCall.function.arguments?.trim() ?? ''
  if (!rawArguments) {
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: {},
      validationError:
        'Tool arguments were empty. Return one JSON object matching the tool schema.',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawArguments)
  } catch {
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: {},
      validationError:
        'Tool arguments were not valid JSON. Return one JSON object matching the tool schema.',
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: {},
      validationError: 'Tool arguments must be a JSON object matching the tool schema.',
    }
  }

  return {
    id: toolCall.id,
    name: toolCall.function.name,
    arguments: parsed as Record<string, unknown>,
  }
}

export function parseOpenRouterToolCalls(response: OpenRouterResponse): ToolCall[] {
  return (response.choices?.[0]?.message?.tool_calls ?? []).map(parseNativeArguments)
}

export function hasToolCalls(response: OpenRouterResponse): boolean {
  return Boolean(response.choices?.[0]?.message?.tool_calls?.length)
}
