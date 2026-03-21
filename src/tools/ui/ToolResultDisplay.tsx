import { useState } from 'react'
import type { ToolExecutionMetadata } from '../types'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Search,
  AlertCircle,
  AlertTriangle,
  Globe,
  Wrench,
  CheckCircle,
  XCircle,
  Clock,
  ShieldCheck,
} from '../../components/icons'
import { getWebToolLabel, inferWebToolModeFromResultData } from './webToolDisplay'
import {
  getToolPresentation,
  getToolValuePreview,
  stringifyToolValue,
} from './toolPresentation'

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
    if (error) {
      return (
        <div className="tool-result tool-result-error">
          <div className="tool-result-header">
            <AlertCircle size={16} />
            <span>Tool Error: {displayName}</span>
          </div>
          <div className="tool-result-error-message">{error}</div>
          {mcpMetadata && <div className="tool-result-error-message">{formatMcpAuditLine(mcpMetadata)}</div>}
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

  const status = getGenericToolStatus(mcpMetadata, error)
  const previewSource = error || result
  const previewText = getToolValuePreview(previewSource)
  const resultBody = stringifyToolValue(result)
  const detailBody = error || resultBody
  const detailLabel = error ? 'Error Details' : 'Output'

  return (
    <div className={`tool-result tool-result-generic tool-result-status-${status.tone}`}>
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
                  : 'Tool result'}
            </span>
          </div>
        </div>
        <div className="tool-result-badge-row">
          <span className={`tool-result-status-badge tool-result-status-badge-${status.tone}`}>
            {status.label}
          </span>
            {mcpMetadata && (
              <span className="tool-result-inline-meta">
                <ShieldCheck size={12} />
                {formatApprovalLabel(mcpMetadata.approvalState)}
            </span>
          )}
          {durationMs !== undefined && (
            <span className="tool-result-inline-meta">
              <Clock size={12} />
              {durationMs}ms
            </span>
          )}
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {!isExpanded && previewText && <div className="tool-result-preview">{previewText}</div>}

      {isExpanded && (
        <div className="tool-result-body">
          <div className="tool-result-meta-grid">
            <div className="tool-result-meta-item">
              <span className="tool-result-meta-label">Status</span>
              <span className="tool-result-meta-value">{status.label}</span>
            </div>
            {mcpMetadata && (
              <>
                <div className="tool-result-meta-item">
                  <span className="tool-result-meta-label">Server</span>
                  <span className="tool-result-meta-value">{mcpMetadata.serverName}</span>
                </div>
                <div className="tool-result-meta-item">
                  <span className="tool-result-meta-label">Approval</span>
                  <span className="tool-result-meta-value">
                    {formatApprovalLabel(mcpMetadata.approvalState)}
                  </span>
                </div>
                <div className="tool-result-meta-item">
                  <span className="tool-result-meta-label">Trusted</span>
                  <span className="tool-result-meta-value">
                    {mcpMetadata.trusted ? 'Trusted' : 'Untrusted'}
                  </span>
                </div>
                <div className="tool-result-meta-item">
                  <span className="tool-result-meta-label">Outcome</span>
                  <span className="tool-result-meta-value">{formatOutcomeLabel(mcpMetadata.outcome)}</span>
                </div>
                <div className="tool-result-meta-item">
                  <span className="tool-result-meta-label">Server ID</span>
                  <span className="tool-result-meta-value">{mcpMetadata.serverId}</span>
                </div>
              </>
            )}
            {durationMs !== undefined && (
              <div className="tool-result-meta-item">
                <span className="tool-result-meta-label">Duration</span>
                <span className="tool-result-meta-value">{durationMs}ms</span>
              </div>
            )}
          </div>

          {mcpMetadata && <div className="tool-result-audit-line">{formatMcpAuditLine(mcpMetadata)}</div>}
          {status.description && <div className="tool-result-audit-line">{status.description}</div>}

          {toolArguments && Object.keys(toolArguments).length > 0 && (
            <div className="tool-result-section">
              <div className="tool-result-section-label">Input</div>
              <pre className="tool-result-json">{stringifyToolValue(toolArguments)}</pre>
            </div>
          )}

          <div className="tool-result-section">
            <div className="tool-result-section-label">{detailLabel}</div>
            <pre className="tool-result-json">{detailBody}</pre>
          </div>
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
