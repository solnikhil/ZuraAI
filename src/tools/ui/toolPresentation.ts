import type { ToolExecutionMetadata } from '../types'

export type ToolPresentationTone = 'success' | 'warning' | 'error' | 'neutral'

export interface ToolPresentationStatus {
  label: string
  tone: ToolPresentationTone
  description?: string
}

export interface ToolPresentationResultItem {
  key: string | null
  value: string
}

interface ToolPresentation {
  isMcp: boolean
  toolLabel: string
  serverLabel?: string
  combinedLabel: string
}

export interface ToolPresentationViewModel extends ToolPresentation {
  originalToolName: string
  subtitleLabel: string
  status: ToolPresentationStatus
  auditLine: string | null
  outputText: string
  outputItems: ToolPresentationResultItem[]
  durationMs?: number
  mcpMetadata: Extract<ToolExecutionMetadata, { origin: 'mcp' }> | null
  approvalLabel: string | null
  trustedLabel: string | null
}

export interface NormalizeToolPresentationInput {
  toolName: string
  result?: unknown
  error?: string
  success?: boolean
  metadata?: ToolExecutionMetadata
  executionTime?: number
}

function humanizeSlug(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getToolPresentation(toolName: string): ToolPresentation {
  const mcpMatch = /^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/i.exec(toolName)
  if (!mcpMatch) {
    const toolLabel = humanizeSlug(toolName)
    return {
      isMcp: false,
      toolLabel,
      combinedLabel: toolLabel,
    }
  }

  const [, serverSlug, toolSlug] = mcpMatch
  const toolLabel = humanizeSlug(toolSlug)
  const serverLabel = humanizeSlug(serverSlug)

  return {
    isMcp: true,
    toolLabel,
    serverLabel,
    combinedLabel: `${toolLabel} on ${serverLabel}`,
  }
}

export function normalizeToolPresentation(
  input: NormalizeToolPresentationInput
): ToolPresentationViewModel {
  const parsed = getToolPresentation(input.toolName)
  const namespacedToolName = /^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/i.exec(input.toolName)?.[2]
  const mcpMetadata = input.metadata?.origin === 'mcp' ? input.metadata : null
  const toolLabel = mcpMetadata
    ? humanizeSlug(mcpMetadata.originalToolName || parsed.toolLabel)
    : parsed.toolLabel
  const serverLabel = mcpMetadata?.serverName || parsed.serverLabel
  const isMcp = Boolean(mcpMetadata || parsed.isMcp)
  const error = input.error?.trim() || ''
  const status = getToolStatus(mcpMetadata, error, input.success)
  const durationMs = mcpMetadata?.durationMs ?? input.executionTime

  return {
    isMcp,
    originalToolName: mcpMetadata?.originalToolName || namespacedToolName || input.toolName,
    toolLabel,
    serverLabel,
    combinedLabel: isMcp && serverLabel ? `${toolLabel} on ${serverLabel}` : toolLabel,
    subtitleLabel: isMcp && serverLabel ? `${serverLabel} MCP` : 'Tool',
    status,
    auditLine: mcpMetadata ? formatMcpAuditLine(mcpMetadata) : null,
    outputText: error || stringifyToolValue(input.result),
    outputItems: extractToolResultItems(input.result),
    durationMs,
    mcpMetadata,
    approvalLabel: mcpMetadata ? formatMcpApprovalLabel(mcpMetadata.approvalState) : null,
    trustedLabel: mcpMetadata ? (mcpMetadata.trusted ? 'Trusted' : 'Untrusted') : null,
  }
}

function getToolStatus(
  metadata: Extract<ToolExecutionMetadata, { origin: 'mcp' }> | null,
  error: string,
  success?: boolean
): ToolPresentationStatus {
  if (!metadata) {
    if (error || success === false) {
      return { label: 'Failed', tone: 'error', description: classifyToolError(error) }
    }
    return { label: 'Completed', tone: 'success' }
  }

  if (metadata.approvalState === 'rejected' || metadata.outcome === 'rejected') {
    return {
      label: 'Rejected',
      tone: 'warning',
      description: 'The tool run was blocked by the current approval policy.',
    }
  }
  if (metadata.approvalState === 'timed_out' || metadata.outcome === 'timed_out') {
    return {
      label: 'Timed Out',
      tone: 'warning',
      description: 'The tool run expired before approval or execution completed.',
    }
  }
  if (metadata.approvalState === 'cancelled' || metadata.outcome === 'cancelled') {
    const disconnected = isDisconnectError(error)
    return {
      label: disconnected ? 'Disconnected' : 'Cancelled',
      tone: 'warning',
      description: disconnected
        ? 'The MCP server disconnected before the tool could finish.'
        : 'The tool run was cancelled before completion.',
    }
  }
  if (metadata.outcome === 'success' && success !== false && !error) {
    return { label: 'Completed', tone: 'success' }
  }

  if (isDisconnectError(error)) {
    return {
      label: 'Disconnected',
      tone: 'error',
      description: 'The MCP server connection dropped during execution.',
    }
  }
  if (isConnectionError(error)) {
    return {
      label: 'Connection Error',
      tone: 'error',
      description: 'The MCP tool could not reach its backing server or transport.',
    }
  }
  return {
    label: 'Failed',
    tone: 'error',
    description: error ? classifyToolError(error) : 'The MCP tool execution failed.',
  }
}

function isDisconnectError(error: string): boolean {
  return /disconnect|disconnected|closed|terminated|broken pipe|eof/i.test(error)
}

function isConnectionError(error: string): boolean {
  return /connect|connection|unreachable|refused|not connected|transport|network/i.test(error)
}

function classifyToolError(error: string): string {
  if (isDisconnectError(error)) return 'The MCP server disconnected before the tool completed.'
  if (isConnectionError(error)) return 'The MCP server could not be reached for this tool call.'
  return 'The tool execution returned an error.'
}

export function formatMcpApprovalLabel(
  approvalState: Extract<ToolExecutionMetadata, { origin: 'mcp' }>['approvalState']
): string {
  switch (approvalState) {
    case 'not-required':
      return 'No approval required'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'timed_out':
      return 'Approval timed out'
    default:
      return 'Approval cancelled'
  }
}

function formatMcpOutcomeLabel(
  outcome: Extract<ToolExecutionMetadata, { origin: 'mcp' }>['outcome']
): string {
  switch (outcome) {
    case 'success':
      return 'Success'
    case 'rejected':
      return 'Rejected'
    case 'timed_out':
      return 'Timed out'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Error'
  }
}

function formatMcpAuditLine(metadata: Extract<ToolExecutionMetadata, { origin: 'mcp' }>): string {
  return `${metadata.serverName} MCP • ${formatMcpApprovalLabel(metadata.approvalState)} • ${metadata.durationMs}ms • ${formatMcpOutcomeLabel(metadata.outcome)}`
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

function normalizePrimitiveValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return null
}

export function getToolArgumentSummary(args?: Record<string, unknown>): string | null {
  if (!args || typeof args !== 'object') {
    return null
  }

  const preferredKeys = [
    'description',
    'query',
    'url',
    'path',
    'filePath',
    'command',
    'prompt',
    'topic',
    'title',
    'name',
  ]

  for (const key of preferredKeys) {
    const value = normalizePrimitiveValue(args[key])
    if (value) {
      return truncateText(value, 72)
    }
  }

  for (const value of Object.values(args)) {
    const normalized = normalizePrimitiveValue(value)
    if (normalized) {
      return truncateText(normalized, 72)
    }
  }

  return null
}

export function stringifyToolValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === undefined) {
    return 'No output returned.'
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function extractToolResultItems(result: unknown): ToolPresentationResultItem[] {
  if (!result || typeof result !== 'object') return []
  const record = result as Record<string, unknown>
  const items: ToolPresentationResultItem[] = []

  for (const field of [
    'results',
    'items',
    'data',
    'files',
    'content',
    'entries',
    'resources',
    'tools',
    'prompts',
  ]) {
    if (!Array.isArray(record[field])) continue
    for (const item of record[field] as unknown[]) {
      if (typeof item === 'string' && item.trim()) {
        items.push({ key: null, value: item.trim() })
        continue
      }
      if (!item || typeof item !== 'object') continue
      const objectItem = item as Record<string, unknown>
      const title =
        objectItem.title ||
        objectItem.name ||
        objectItem.label ||
        objectItem.id ||
        objectItem.path ||
        objectItem.key
      const description =
        objectItem.description ||
        objectItem.content ||
        objectItem.value ||
        objectItem.text ||
        objectItem.snippet ||
        objectItem.message
      if (typeof title === 'string' && title.trim()) {
        items.push({
          key: title.trim(),
          value:
            typeof description === 'string' ? description.trim() : stringifyToolValue(objectItem),
        })
      } else if (typeof description === 'string' && description.trim()) {
        items.push({ key: null, value: description.trim() })
      } else {
        items.push({ key: null, value: stringifyToolValue(item) })
      }
    }
    if (items.length > 0) return items
  }

  if (record.content && typeof record.content === 'object' && !Array.isArray(record.content)) {
    for (const [key, value] of Object.entries(record.content as Record<string, unknown>)) {
      if (value !== null && value !== undefined) {
        items.push({ key, value: typeof value === 'string' ? value : stringifyToolValue(value) })
      }
    }
    if (items.length > 0) return items
  }

  for (const key of ['content', 'text', 'message', 'output', 'result', 'value', 'response']) {
    if (typeof record[key] === 'string' && record[key].trim()) {
      return [{ key: null, value: record[key].trim() }]
    }
  }

  const entries = Object.entries(record)
  if (entries.length <= 8 && entries.some(([key]) => !key.startsWith('_') && key !== 'type')) {
    for (const [key, value] of entries) {
      if (key.startsWith('_') || key === 'type' || value === null || value === undefined) continue
      items.push({ key, value: typeof value === 'string' ? value : stringifyToolValue(value) })
    }
  }
  return items
}
