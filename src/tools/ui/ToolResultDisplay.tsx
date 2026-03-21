import { useState } from 'react'
import type { ToolExecutionMetadata } from '../types'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Search,
  AlertCircle,
  Globe,
} from '../../components/icons'
import { getWebToolLabel, inferWebToolModeFromResultData } from './webToolDisplay'

import './ToolResultDisplay.css'

// Present tool names in a human-readable form.
function formatToolDisplayName(name: string): string {
  const mcpMatch = /^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/i.exec(name)
  if (mcpMatch) {
    const [, serverSlug, toolSlug] = mcpMatch
    return `${humanizeSlug(toolSlug)} (${humanizeSlug(serverSlug)} MCP)`
  }

  return name.replace(/_/g, ' ')
}

function humanizeSlug(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

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
  sessionId?: string
  messageId?: string
  toolResultIndex?: number
}

export default function ToolResultDisplay({
  toolName,
  result,
  error,
  metadata,
  sessionId: _sessionId,
  messageId: _messageId,
  toolResultIndex: _toolResultIndex,
}: ToolResultDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const displayName = formatToolDisplayName(toolName)

  if (error) {
    return (
      <div className="tool-result tool-result-error">
        <div className="tool-result-header">
          <AlertCircle size={16} />
          <span>Tool Error: {displayName}</span>
        </div>
        <div className="tool-result-error-message">{error}</div>
        {metadata?.origin === 'mcp' && <div className="tool-result-error-message">{formatMcpAuditLine(metadata)}</div>}
      </div>
    )
  }

  if (toolName === 'web_search') {
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

  return (
    <div className="tool-result tool-result-generic">
      <div
        className="tool-result-header tool-result-clickable"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>Tool: {displayName}</span>
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>

      {metadata?.origin === 'mcp' && <div className="tool-result-error-message">{formatMcpAuditLine(metadata)}</div>}

      {isExpanded && <pre className="tool-result-json">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}

function formatMcpAuditLine(metadata: Extract<ToolExecutionMetadata, { origin: 'mcp' }>): string {
  const approvalText = metadata.approvalState === 'not-required'
    ? 'No approval required'
    : metadata.approvalState === 'approved'
      ? 'Approved'
      : metadata.approvalState === 'rejected'
        ? 'Rejected'
        : metadata.approvalState === 'timed_out'
          ? 'Approval timed out'
          : 'Approval cancelled'

  return `${metadata.serverName} MCP • ${approvalText} • ${metadata.durationMs}ms • ${metadata.outcome}`
}
