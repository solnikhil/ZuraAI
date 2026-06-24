import { useState } from 'react'
import type { ToolExecutionMetadata } from '../types'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  Globe,
  Search,
  Wrench,
  CheckCircle,
  XCircle,
} from '../../components/icons'
import { getWebToolLabel, inferWebToolModeFromResultData } from './webToolDisplay'
import { getToolPresentation, stringifyToolValue } from './toolPresentation'

import './ToolResultDisplay.css'

interface SearchResult {
  title: string
  url: string
  snippet: string
  favicon?: string
  // LobeHub-compatible metadata fields
  source?: string
  displayed_link?: string
  date?: string
}

interface ImageResult {
  url: string
  description?: string
}

interface WebSearchResult {
  query?: string
  results?: SearchResult[]
  images?: ImageResult[]
  imageCount?: number
  searchDepth?: string
  extractDepth?: string
  source?: string
  intent?: string
  answer?: string
}

interface ToolResultDisplayProps {
  toolName: string
  result: unknown
  error?: string
  metadata?: ToolExecutionMetadata
  toolArguments?: Record<string, unknown>
  executionTime?: number
  sessionId?: string
  messageId?: string
  toolResultIndex?: number
}

export default function ToolResultDisplay({
  toolName,
  result,
  error,
  metadata,
  toolArguments,
  executionTime,
  sessionId: _sessionId,
  messageId: _messageId,
  toolResultIndex: _toolResultIndex,
}: ToolResultDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const toolPresentation = getToolPresentation(toolName)
  const displayName = toolPresentation.toolLabel
  const mcpMetadata = metadata?.origin === 'mcp' ? metadata : null
  const durationMs = mcpMetadata?.durationMs ?? executionTime

  if (toolName === 'web_search') {
    const skippedReason = (metadata as any)?.skippedReason
    if (skippedReason === 'budget') {
      // Render budget exhaustion as a normal-ish tool result (not a scary "Tool Error")
      // so the user sees the attempt + outcome exactly like other web_search calls.
      return (
        <div className="tool-result tool-result-search tool-result-budget">
          <div className="tool-result-header">
            <AlertCircle size={16} />
            <span>Web Search: {String(toolArguments?.query || 'query')}</span>
            <span className="tool-result-badge">Budget reached</span>
          </div>
          <div
            className="tool-result-error-message"
            style={{ color: 'var(--theme-text-warning, #f59e0b)' }}
          >
            {error || 'Search budget for this response has been reached. No additional results.'}
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="tool-result tool-result-error">
          <div className="tool-result-header">
            <AlertCircle size={16} />
            <span>Tool Error: {displayName}</span>
          </div>
          <div className="tool-result-error-message">{error}</div>
          {mcpMetadata && (
            <div className="tool-result-error-message">{formatMcpAuditLine(mcpMetadata)}</div>
          )}
        </div>
      )
    }

    const searchResult = result as WebSearchResult | undefined
    const mode = inferWebToolModeFromResultData(searchResult) || 'search'
    const modeLabel = getWebToolLabel(mode)
    const resultLabel = mode === 'extract' ? 'pages' : 'results'
    const depth = mode === 'extract' ? searchResult?.extractDepth : searchResult?.searchDepth
    const depthBadgeText =
      depth === 'advanced' ? 'Advanced' : mode === 'extract' && depth === 'basic' ? 'Basic' : null
    const hasImages = (searchResult?.images?.length ?? 0) > 0
    const imageCount = searchResult?.imageCount || searchResult?.images?.length || 0

    return (
      <div
        className={`tool-result tool-result-search${mode === 'extract' ? ' tool-result-extract' : ''}`}
      >
        <div
          className="tool-result-header tool-result-clickable"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {mode === 'extract' ? <Globe size={16} /> : <Search size={16} />}
          <span>
            {modeLabel}: {searchResult?.query}
          </span>
          <span className="tool-result-count">
            {searchResult?.results?.length || 0} {resultLabel}
            {imageCount > 0 && ` • ${imageCount} images`}
          </span>
          {mode === 'extract' && <span className="tool-result-badge">Extract</span>}
          {depthBadgeText && <span className="tool-result-badge">{depthBadgeText}</span>}
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>

        {searchResult?.answer && <div className="tool-result-answer">{searchResult.answer}</div>}

        {isExpanded && hasImages && (
          <div className="search-images-gallery">
            {searchResult!.images!.slice(0, 6).map((img: ImageResult, i: number) => (
              <a
                key={i}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                className="search-image-item"
              >
                <img
                  src={img.url}
                  alt={img.description || `Image ${i + 1}`}
                  loading="lazy"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </a>
            ))}
          </div>
        )}

        {isExpanded && (searchResult?.results?.length ?? 0) > 0 && (
          <div className="search-results-list">
            {searchResult!.results!.map((r: SearchResult, i: number) => (
              <div key={i} className="search-result-item">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="search-result-title"
                >
                  {r.favicon && (
                    <img
                      src={r.favicon}
                      alt=""
                      className="search-result-favicon"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  )}
                  {r.title}
                  <ExternalLink size={12} />
                </a>
                <div className="search-result-url">
                  {r.displayed_link || r.url}
                  {r.date && <span className="search-result-date"> • {r.date}</span>}
                </div>
                {r.source && r.source !== r.displayed_link?.split(' › ')[0] && (
                  <div className="search-result-source">{r.source}</div>
                )}
                <p className="search-result-snippet">{r.snippet}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (toolName === 'artifact_create' || toolName === 'artifact_update') {
    const data = result as Record<string, unknown> | undefined
    const title = typeof data?.title === 'string' ? data.title : String(toolArguments?.title || 'Artifact')
    const kind = typeof data?.kind === 'string' ? data.kind : 'artifact'
    const versionId = typeof data?.versionId === 'string' ? data.versionId : ''
    return (
      <div className={`tool-result tool-result-mcp tool-result-mcp-status-${error ? 'error' : 'success'}`}>
        <div className="tool-result-header">
          <div className="tool-result-heading">
            <span className="tool-result-leading-icon">
              {error ? <XCircle size={16} /> : <CheckCircle size={16} />}
            </span>
            <div className="tool-result-title-group">
              <span className="tool-result-title">
                {toolName === 'artifact_create' ? 'Artifact created' : 'Artifact updated'}
              </span>
              <span className="tool-result-subtitle">
                {title} · {kind}{versionId ? ` · ${versionId.slice(0, 8)}` : ''}
              </span>
            </div>
          </div>
          <span className={`tool-result-mcp-status tool-result-mcp-status-${error ? 'error' : 'success'}`}>
            {error ? 'Failed' : 'Saved'}
          </span>
        </div>
        {error && <div className="tool-result-error-message">{error}</div>}
      </div>
    )
  }

  if (toolName === 'code_execution') {
    const data = result as Record<string, unknown> | undefined
    const stdout = typeof data?.stdout === 'string' ? data.stdout : ''
    const stderr = typeof data?.stderr === 'string' ? data.stderr : ''
    const exitCode = typeof data?.exitCode === 'number' ? data.exitCode : null
    const lang =
      typeof data?.language === 'string'
        ? data.language
        : typeof toolArguments?.language === 'string'
          ? toolArguments.language
          : 'code'
    const langLabel = lang === 'python' ? 'Python' : lang === 'javascript' ? 'JavaScript' : lang
    const hasOutput = stdout || stderr || error

    return (
      <div
        className={`tool-result tool-result-mcp tool-result-mcp-status-${error ? 'error' : 'success'}`}
      >
        <div
          className="tool-result-header tool-result-clickable"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="tool-result-heading">
            <span className="tool-result-leading-icon">
              {error ? <XCircle size={16} /> : <CheckCircle size={16} />}
            </span>
            <div className="tool-result-title-group">
              <span className="tool-result-title">Code Execution</span>
              <span className="tool-result-subtitle">
                {langLabel}
                {exitCode !== null && exitCode !== 0 ? ` • exit ${exitCode}` : ''}
              </span>
            </div>
          </div>
          <div className="tool-result-badge-row">
            <span
              className={`tool-result-mcp-status tool-result-mcp-status-${error ? 'error' : 'success'}`}
            >
              {error ? 'Failed' : 'Completed'}
            </span>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {isExpanded && (
          <div className="tool-result-body">
            {error && (
              <div className="tool-result-mcp-detail-row">
                <span className="tool-result-mcp-detail-label">Error</span>
                <pre className="tool-result-mcp-detail-value" style={{ whiteSpace: 'pre-wrap' }}>
                  {error}
                </pre>
              </div>
            )}
            {stdout && (
              <div className="tool-result-mcp-detail-row">
                <span className="tool-result-mcp-detail-label">Output</span>
                <pre
                  className="tool-result-mcp-detail-value"
                  style={{ whiteSpace: 'pre-wrap', maxHeight: '300px', overflow: 'auto' }}
                >
                  {stdout}
                </pre>
              </div>
            )}
            {stderr && (
              <div className="tool-result-mcp-detail-row">
                <span className="tool-result-mcp-detail-label">Stderr</span>
                <pre
                  className="tool-result-mcp-detail-value"
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxHeight: '200px',
                    overflow: 'auto',
                    color: 'var(--theme-text-warning, #f59e0b)',
                  }}
                >
                  {stderr}
                </pre>
              </div>
            )}
            {!hasOutput && (
              <div className="tool-result-mcp-detail-row">
                <span className="tool-result-mcp-detail-value">No output produced.</span>
              </div>
            )}
            {durationMs != null && (
              <div className="tool-result-mcp-detail-row">
                <span className="tool-result-mcp-detail-label">Duration</span>
                <span className="tool-result-mcp-detail-value">{durationMs}ms</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (toolName.startsWith('computer_')) {
    const data = result as Record<string, unknown> | undefined
    const action =
      typeof data?.action === 'string' ? data.action : toolName.replace('computer_', '')
    const screenshot =
      typeof data?.screenshot === 'string'
        ? data.screenshot
        : typeof data?.image === 'string'
          ? data.image
          : null
    const screenW = typeof data?.screenWidth === 'number' ? data.screenWidth : null
    const screenH = typeof data?.screenHeight === 'number' ? data.screenHeight : null
    const actionLabel =
      action === 'screenshot'
        ? 'Screenshot'
        : action === 'click'
          ? 'Click'
          : action === 'type'
            ? 'Type'
            : action === 'key'
              ? 'Key Press'
              : action === 'scroll'
                ? 'Scroll'
                : action === 'cursor_position'
                  ? 'Move Cursor'
                  : action

    return (
      <div
        className={`tool-result tool-result-mcp tool-result-mcp-status-${error ? 'error' : 'success'}`}
      >
        <div
          className="tool-result-header tool-result-clickable"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="tool-result-heading">
            <span className="tool-result-leading-icon">
              {error ? <XCircle size={16} /> : <CheckCircle size={16} />}
            </span>
            <div className="tool-result-title-group">
              <span className="tool-result-title">{actionLabel}</span>
              {screenW && screenH && (
                <span className="tool-result-subtitle">
                  {screenW}×{screenH}
                </span>
              )}
            </div>
          </div>
          <div className="tool-result-badge-row">
            <span
              className={`tool-result-mcp-status tool-result-mcp-status-${error ? 'error' : 'success'}`}
            >
              {error ? 'Failed' : 'Done'}
            </span>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {isExpanded && (
          <div className="tool-result-body">
            {error && (
              <div className="tool-result-mcp-detail-row">
                <span className="tool-result-mcp-detail-label">Error</span>
                <pre className="tool-result-mcp-detail-value" style={{ whiteSpace: 'pre-wrap' }}>
                  {error}
                </pre>
              </div>
            )}
            {screenshot && (
              <div style={{ padding: '8px 12px' }}>
                <img
                  src={`data:image/png;base64,${screenshot}`}
                  alt={`${actionLabel} result`}
                  style={{
                    width: '100%',
                    maxHeight: '300px',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    background: '#000',
                  }}
                />
              </div>
            )}
            {durationMs != null && (
              <div className="tool-result-mcp-detail-row">
                <span className="tool-result-mcp-detail-label">Duration</span>
                <span className="tool-result-mcp-detail-value">{durationMs}ms</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const status = getGenericToolStatus(mcpMetadata, error)
  const resultBody = stringifyToolValue(result)
  const detailBody = error || resultBody
  const outputItems = extractResultItems(result)
  const hasStructuredOutput = outputItems.length > 0

  return (
    <div className={`tool-result tool-result-mcp tool-result-mcp-status-${status.tone}`}>
      <div
        className="tool-result-header tool-result-clickable"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="tool-result-heading">
          <span className="tool-result-leading-icon">
            {status.tone === 'success' ? (
              <CheckCircle size={16} />
            ) : status.tone === 'warning' ? (
              <AlertTriangle size={16} />
            ) : status.tone === 'error' ? (
              <XCircle size={16} />
            ) : (
              <Wrench size={16} />
            )}
          </span>
          <div className="tool-result-title-group">
            <span className="tool-result-title">{displayName}</span>
            <span className="tool-result-subtitle">
              {mcpMetadata
                ? `${mcpMetadata.serverName} MCP`
                : toolPresentation.isMcp && toolPresentation.serverLabel
                  ? `${toolPresentation.serverLabel} MCP`
                  : 'Tool'}
            </span>
          </div>
        </div>
        <div className="tool-result-badge-row">
          <span className={`tool-result-mcp-status tool-result-mcp-status-${status.tone}`}>
            {status.label}
          </span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {isExpanded && (
        <div className="tool-result-body">
          {hasStructuredOutput ? (
            <div className="mcp-result-list">
              {outputItems.slice(0, 10).map((item, i) => (
                <div key={i} className="mcp-result-item">
                  {item.key && <div className="mcp-result-item-key">{item.key}</div>}
                  <div className="mcp-result-item-value">{item.value}</div>
                </div>
              ))}
              {outputItems.length > 10 && (
                <div
                  className="mcp-result-item"
                  style={{ fontStyle: 'italic', color: 'var(--theme-text-muted)' }}
                >
                  +{outputItems.length - 10} more items
                </div>
              )}
            </div>
          ) : (
            <pre className="tool-result-json">{detailBody}</pre>
          )}

          <McpDetailsSection
            metadata={mcpMetadata}
            toolArguments={toolArguments}
            status={status}
            durationMs={durationMs}
          />
        </div>
      )}
    </div>
  )
}

function getGenericToolStatus(
  metadata: Extract<ToolExecutionMetadata, { origin: 'mcp' }> | null,
  error?: string
): { label: string; tone: 'success' | 'warning' | 'error' | 'neutral'; description?: string } {
  const errorText = error?.trim() || ''

  if (!metadata) {
    return errorText
      ? { label: 'Error', tone: 'error', description: classifyGenericError(errorText) }
      : { label: 'Completed', tone: 'success' }
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
    return {
      label: isDisconnectError(errorText) ? 'Disconnected' : 'Cancelled',
      tone: 'warning',
      description: isDisconnectError(errorText)
        ? 'The MCP server disconnected before the tool could finish.'
        : 'The tool run was cancelled before completion.',
    }
  }

  switch (metadata.outcome) {
    case 'success':
      return { label: 'Completed', tone: 'success' }
    default:
      if (isDisconnectError(errorText)) {
        return {
          label: 'Disconnected',
          tone: 'error',
          description: 'The MCP server connection dropped during execution.',
        }
      }
      if (isConnectionError(errorText)) {
        return {
          label: 'Connection Error',
          tone: 'error',
          description: 'The MCP tool could not reach its backing server or transport.',
        }
      }
      return {
        label: 'Failed',
        tone: 'error',
        description: errorText ? classifyGenericError(errorText) : 'The MCP tool execution failed.',
      }
  }
}

function isDisconnectError(error: string): boolean {
  return /disconnect|disconnected|closed|terminated|broken pipe|eof/i.test(error)
}

function isConnectionError(error: string): boolean {
  return /connect|connection|unreachable|refused|not connected|transport|network/i.test(error)
}

function classifyGenericError(error: string): string {
  if (isDisconnectError(error)) {
    return 'The MCP server disconnected before the tool completed.'
  }

  if (isConnectionError(error)) {
    return 'The MCP server could not be reached for this tool call.'
  }

  return 'The tool execution returned an error.'
}

function formatApprovalLabel(
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

function formatOutcomeLabel(
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
  return `${metadata.serverName} MCP • ${formatApprovalLabel(metadata.approvalState)} • ${metadata.durationMs}ms • ${formatOutcomeLabel(metadata.outcome)}`
}

interface ResultItem {
  key: string | null
  value: string
}

function extractResultItems(result: unknown): ResultItem[] {
  if (!result || typeof result !== 'object') {
    return []
  }

  const record = result as Record<string, unknown>
  const items: ResultItem[] = []

  const arrayFields = [
    'results',
    'items',
    'data',
    'files',
    'content',
    'entries',
    'resources',
    'tools',
    'prompts',
  ]
  for (const field of arrayFields) {
    if (Array.isArray(record[field])) {
      const arr = record[field] as unknown[]
      for (const item of arr) {
        if (typeof item === 'string') {
          if (item.trim()) {
            items.push({ key: null, value: item.trim() })
          }
        } else if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          const title = obj.title || obj.name || obj.label || obj.id || obj.path || obj.key
          const desc =
            obj.description || obj.content || obj.value || obj.text || obj.snippet || obj.message
          if (typeof title === 'string' && title.trim()) {
            items.push({
              key: title.trim(),
              value: typeof desc === 'string' ? desc.trim() : stringifyToolValue(obj),
            })
          } else if (typeof desc === 'string' && desc.trim()) {
            items.push({ key: null, value: desc.trim() })
          } else {
            items.push({ key: null, value: stringifyToolValue(item) })
          }
        }
      }
      if (items.length > 0) return items
    }
  }

  if (record.content && typeof record.content === 'object' && !Array.isArray(record.content)) {
    const content = record.content as Record<string, unknown>
    for (const [key, value] of Object.entries(content)) {
      if (value !== null && value !== undefined) {
        items.push({ key, value: typeof value === 'string' ? value : stringifyToolValue(value) })
      }
    }
    if (items.length > 0) return items
  }

  const primitiveKeys = ['content', 'text', 'message', 'output', 'result', 'value', 'response']
  for (const key of primitiveKeys) {
    if (typeof record[key] === 'string') {
      const val = (record[key] as string).trim()
      if (val) {
        return [{ key: null, value: val }]
      }
    }
  }

  const entries = Object.entries(record)
  if (entries.length <= 8 && entries.some(([k]) => !k.startsWith('_') && k !== 'type')) {
    for (const [key, value] of entries) {
      if (key.startsWith('_') || key === 'type') continue
      if (value !== null && value !== undefined) {
        items.push({ key, value: typeof value === 'string' ? value : stringifyToolValue(value) })
      }
    }
    if (items.length > 0) return items
  }

  return []
}

function McpDetailsSection({
  metadata,
  toolArguments,
  status,
  durationMs,
}: {
  metadata: Extract<ToolExecutionMetadata, { origin: 'mcp' }> | null
  toolArguments?: Record<string, unknown>
  status: { label: string; tone: string; description?: string }
  durationMs?: number
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <>
      <button
        className="mcp-details-toggle"
        onClick={(e) => {
          e.stopPropagation()
          setIsExpanded(!isExpanded)
        }}
      >
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Details
      </button>

      {isExpanded && (
        <div className="mcp-details-content">
          <div className="tool-result-meta-grid" style={{ marginTop: 0 }}>
            <div className="tool-result-meta-item">
              <span className="tool-result-meta-label">Status</span>
              <span className="tool-result-meta-value">{status.label}</span>
            </div>
            {metadata && (
              <>
                <div className="tool-result-meta-item">
                  <span className="tool-result-meta-label">Server</span>
                  <span className="tool-result-meta-value">{metadata.serverName}</span>
                </div>
                <div className="tool-result-meta-item">
                  <span className="tool-result-meta-label">Approval</span>
                  <span className="tool-result-meta-value">
                    {formatApprovalLabel(metadata.approvalState)}
                  </span>
                </div>
                <div className="tool-result-meta-item">
                  <span className="tool-result-meta-label">Trusted</span>
                  <span className="tool-result-meta-value">
                    {metadata.trusted ? 'Trusted' : 'Untrusted'}
                  </span>
                </div>
                {durationMs !== undefined && (
                  <div className="tool-result-meta-item">
                    <span className="tool-result-meta-label">Duration</span>
                    <span className="tool-result-meta-value">{durationMs}ms</span>
                  </div>
                )}
              </>
            )}
          </div>

          {metadata && <div className="tool-result-audit-line">{formatMcpAuditLine(metadata)}</div>}
          {status.description && <div className="tool-result-audit-line">{status.description}</div>}

          {toolArguments && Object.keys(toolArguments).length > 0 && (
            <div className="tool-result-section">
              <div className="tool-result-section-label">Input</div>
              <pre className="tool-result-json">{stringifyToolValue(toolArguments)}</pre>
            </div>
          )}
        </div>
      )}
    </>
  )
}
