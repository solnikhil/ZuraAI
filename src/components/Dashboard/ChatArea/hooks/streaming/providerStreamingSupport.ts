import type { FileAttachment, ToolCallResult } from '../../../../../chat/types'
import type { ServiceAssistantMessage, ToolDefinition } from '../../../../../services/types'
import { normalizeInlineToolCallMarkup } from '../../../../../tools/adapters/openrouterToolCalls'
import type { ChatDiagnosticRequestShape } from '../../../../../diagnostics/chatDiagnostics'
import type { NormalizedUsage } from './types'

export type ProviderStreamingMessages = Array<
  ServiceAssistantMessage & { images?: string[]; thinking?: string }
>

const TOOL_MARKUP_PREVIEW_LIMIT = 240

const MID_STREAM_MARKUP_PATTERNS: ReadonlyArray<{
  format: 'dsml' | 'xml'
  pattern: RegExp
}> = [
  { format: 'dsml', pattern: /<\s*\|\s*\|\s*DSML\s*\|\s*\|\s*(?:tool_calls|invoke)\b/i },
  { format: 'xml', pattern: /<\s*invoke\s+name=["']/i },
  { format: 'xml', pattern: /<\s*tool_call(?:s)?\s*>/i },
]

function buildToolInventoryMessage(tools: ToolDefinition[] | null): ServiceAssistantMessage | null {
  if (!Array.isArray(tools) || tools.length === 0) return null

  const lines = tools.map((tool) => {
    const name = tool.function.name
    const description = tool.function.description?.trim()
    const prefix = name.startsWith('mcp__') ? 'MCP tool' : 'Built-in tool'
    return `- ${name} (${prefix})${description ? `: ${description}` : ''}`
  })

  return {
    role: 'system',
    content: [
      'Current tool inventory for this request:',
      ...lines,
      'Use this inventory when the user asks which tools or MCP servers are loaded.',
    ].join('\n'),
  }
}

export function addToolInventoryMessage(
  messages: ServiceAssistantMessage[],
  tools: ToolDefinition[] | null
): ServiceAssistantMessage[] {
  const inventoryMessage = buildToolInventoryMessage(tools)
  if (!inventoryMessage) return messages

  const firstSystemIndex = messages.findIndex((message) => message.role === 'system')
  if (firstSystemIndex < 0) return [inventoryMessage, ...messages]

  return [
    ...messages.slice(0, firstSystemIndex + 1),
    inventoryMessage,
    ...messages.slice(firstSystemIndex + 1),
  ]
}

export function detectMidStreamMarkup(content: string): 'dsml' | 'xml' | null {
  if (!content) return null
  const normalizedContent = normalizeInlineToolCallMarkup(content)
  for (const { format, pattern } of MID_STREAM_MARKUP_PATTERNS) {
    if (pattern.test(normalizedContent)) return format
  }
  return null
}

export function findMidStreamMarkupStart(content: string): number | null {
  if (!content) return null
  const normalizedContent = normalizeInlineToolCallMarkup(content)
  let start: number | null = null
  for (const { pattern } of MID_STREAM_MARKUP_PATTERNS) {
    const match = normalizedContent.match(pattern)
    if (match?.index != null && (start === null || match.index < start)) start = match.index
  }
  return start
}

export function resolveFollowUpSplitMarkerBlockCount(
  round: number | undefined,
  visibleContentBlockBaseline: number | null,
  completedBlockCount: number
): number {
  if (round === 1) return visibleContentBlockBaseline ?? completedBlockCount
  return completedBlockCount
}

function isToolFollowUpNarration(content: string): boolean {
  const normalized = content.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!normalized) return false

  return (
    /\blet me\b.*\b(?:search|look up|check|verify|confirm|grab|find|pull)\b/.test(normalized) ||
    /\bi(?:'ll| will)\b.*\b(?:search|look up|check|verify|confirm|grab|find|pull)\b/.test(
      normalized
    ) ||
    /\b(?:searching|checking|verifying|confirming)\b.*\b(?:now|next|again)\b/.test(normalized)
  )
}

export function resolveCommittedRoundContent(options: {
  isToolFollowUpRound: boolean
  roundFinishReason: string | null
  roundStartContent: string
  roundContent: string
  finalRoundContent: string
  suppressedInlineToolMarkup: boolean
}): string {
  const {
    isToolFollowUpRound,
    roundFinishReason,
    roundStartContent,
    roundContent,
    finalRoundContent,
    suppressedInlineToolMarkup,
  } = options

  if (!isToolFollowUpRound || roundFinishReason !== 'tool_calls' || suppressedInlineToolMarkup) {
    return finalRoundContent
  }

  const markupStart = findMidStreamMarkupStart(roundContent)
  const cleanRoundText =
    markupStart !== null ? roundContent.slice(0, markupStart).trimEnd() : roundContent.trimEnd()

  if (!cleanRoundText || isToolFollowUpNarration(cleanRoundText)) return roundStartContent
  return `${roundStartContent}${cleanRoundText}`
}

export function logToolMarkupLeak(
  event: 'detected' | 'suppressed-during-no-tools-pass' | 'recovery-failed',
  details: Record<string, unknown>
): void {
  console.warn('[tool-markup-leak]', event, details)
}

export function mergeGeneratedFiles(
  existing: FileAttachment[],
  incoming: FileAttachment[]
): FileAttachment[] {
  if (incoming.length === 0) return existing

  const merged = [...existing]
  const seen = new Set(existing.map((file) => file.data))
  for (const file of incoming) {
    if (seen.has(file.data)) continue
    seen.add(file.data)
    merged.push(file)
  }
  return merged
}

export function extractWebSearchQueries(toolResults: ToolCallResult[] | undefined): string[] {
  return (toolResults || [])
    .filter((result) => result.toolCall.name === 'web_search')
    .map((result) => String(result.toolCall.arguments?.query || '').trim())
    .filter(Boolean)
}

export function hasNonWebToolResults(toolResults: ToolCallResult[] | undefined): boolean {
  return (toolResults || []).some((result) => result.toolCall.name !== 'web_search')
}

export function getUserContextText(messages: ProviderStreamingMessages): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    if (typeof message.content === 'string') return message.content

    return message.content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text?.trim() || '')
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

function countCacheMarkers(messages: ProviderStreamingMessages): number {
  return messages.reduce((count, message) => {
    if (!Array.isArray(message.content)) return count
    return count + message.content.filter((part) => Boolean(part.cache_control)).length
  }, 0)
}

export function buildRequestShape(
  messages: ProviderStreamingMessages,
  toolCount: number,
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
): ChatDiagnosticRequestShape {
  return {
    roleOrder: messages.map((message) => message.role),
    textLengths: messages.map((message) => {
      if (typeof message.content === 'string') return message.content.length
      return message.content
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .reduce((total, part) => total + (part.text?.length || 0), 0)
    }),
    contentTypes: messages.map((message) => {
      if (typeof message.content === 'string') return message.content ? 'text' : 'empty'
      return message.content.length > 0 ? 'parts' : 'empty'
    }),
    partTypes: messages.map((message) =>
      Array.isArray(message.content) ? message.content.map((part) => part.type) : []
    ),
    hasReasoning: messages.map((message) => Boolean(message.reasoning)),
    hasThinking: messages.map((message) => Boolean(message.thinking)),
    toolCount,
    toolChoice:
      typeof toolChoice === 'string'
        ? toolChoice
        : toolChoice && typeof toolChoice === 'object'
          ? 'function'
          : undefined,
    cacheMarkerCount: countCacheMarkers(messages),
  }
}

export function buildResearchStatus(
  currentRound: number,
  maxRounds: number,
  isSearching: boolean,
  currentSearches?: string[]
) {
  const normalizedSearches = (currentSearches || []).filter(Boolean)
  return {
    currentRound,
    maxRounds,
    currentSearch: normalizedSearches[0],
    currentSearches: normalizedSearches.length > 0 ? normalizedSearches : undefined,
    isSearching,
  }
}

export interface VisibleAnswerRound {
  content: string
  usage: NormalizedUsage
  firstTokenTime: number | null
}

export { TOOL_MARKUP_PREVIEW_LIMIT }
