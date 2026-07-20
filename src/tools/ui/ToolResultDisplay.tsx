/**
 * Live post-message tool surfaces.
 * Only allowlisted tools render here (artifacts + MCP add review).
 * Generic agent/OS/MCP cards are intentionally not rendered.
 */

import { useState } from 'react'
import { CheckCircle, Wrench, XCircle } from '../../components/icons'
import { useOptionalMcp } from '../../mcp/McpContext'
import type { McpAgentAddApproveResult, McpAgentAddReview } from '../../mcp/addRequestTypes'
import { shouldShowLiveToolResultCard } from './liveToolResultCards'

import './ToolResultDisplay.css'

interface ToolResultDisplayProps {
  toolName: string
  result: unknown
  error?: string
  toolArguments?: Record<string, unknown>
  /** Unused — kept so ChatArea can pass through without branching. */
  metadata?: unknown
  executionTime?: number
  sessionId?: string
  messageId?: string
  toolResultIndex?: number
}

export default function ToolResultDisplay({
  toolName,
  result,
  error,
  toolArguments,
}: ToolResultDisplayProps) {
  if (!shouldShowLiveToolResultCard(toolName)) {
    return null
  }

  if (toolName === 'artifact_create' || toolName === 'artifact_update') {
    return (
      <ArtifactResultCard
        toolName={toolName}
        result={result}
        error={error}
        toolArguments={toolArguments}
      />
    )
  }

  if (toolName === 'mcp_request_add') {
    return <McpRequestAddCard result={result} error={error} />
  }

  return null
}

function ArtifactResultCard({
  toolName,
  result,
  error,
  toolArguments,
}: {
  toolName: 'artifact_create' | 'artifact_update' | string
  result: unknown
  error?: string
  toolArguments?: Record<string, unknown>
}) {
  const data = result as Record<string, unknown> | undefined
  const title =
    typeof data?.title === 'string' ? data.title : String(toolArguments?.title || 'Artifact')
  const kind = typeof data?.kind === 'string' ? data.kind : 'artifact'
  const versionId = typeof data?.versionId === 'string' ? data.versionId : ''

  return (
    <div
      className={`tool-result tool-result-product tool-result-status-${error ? 'error' : 'success'}`}
    >
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
              {title} · {kind}
              {versionId ? ` · ${versionId.slice(0, 8)}` : ''}
            </span>
          </div>
        </div>
        <span className={`tool-result-status tool-result-status-${error ? 'error' : 'success'}`}>
          {error ? 'Failed' : 'Saved'}
        </span>
      </div>
      {error && <div className="tool-result-error-message">{error}</div>}
    </div>
  )
}

function McpRequestAddCard({ result, error }: { result: unknown; error?: string }) {
  const [mcpAddActionState, setMcpAddActionState] = useState<'idle' | 'approving' | 'cancelling'>(
    'idle'
  )
  const [mcpAddResult, setMcpAddResult] = useState<McpAgentAddApproveResult | null>(null)
  const [mcpAddError, setMcpAddError] = useState<string | null>(null)
  const mcp = useOptionalMcp()

  const review = normalizeMcpAddReview(result)
  const currentStatus = mcpAddResult?.status ?? review?.status ?? (error ? 'failed' : 'pending')
  const canAct = Boolean(review?.canAdd && currentStatus === 'pending' && mcp)
  const tone = mcpAddTone(currentStatus, error || mcpAddError)

  const approve = async () => {
    if (!review || !mcp || mcpAddActionState !== 'idle') return
    setMcpAddActionState('approving')
    setMcpAddError(null)
    try {
      setMcpAddResult(await mcp.approvePendingAddRequest(review.requestId))
    } catch (approvalError) {
      setMcpAddError(toErrorMessage(approvalError))
    } finally {
      setMcpAddActionState('idle')
    }
  }

  const cancel = async () => {
    if (!review || !mcp || mcpAddActionState !== 'idle') return
    setMcpAddActionState('cancelling')
    setMcpAddError(null)
    try {
      await mcp.cancelPendingAddRequest(review.requestId)
      setMcpAddResult({
        requestId: review.requestId,
        status: 'cancelled',
        requiredSecrets: review.requiredSecrets,
      })
    } catch (cancelError) {
      setMcpAddError(toErrorMessage(cancelError))
    } finally {
      setMcpAddActionState('idle')
    }
  }

  return (
    <div className={`tool-result tool-result-product tool-result-status-${tone}`}>
      <div className="tool-result-header">
        <div className="tool-result-heading">
          <span className="tool-result-leading-icon">
            {currentStatus === 'connected' ? <CheckCircle size={16} /> : <Wrench size={16} />}
          </span>
          <div className="tool-result-title-group">
            <span className="tool-result-title">
              {review ? `Add MCP: ${review.serverName}` : 'Add MCP'}
            </span>
            <span className="tool-result-subtitle">
              {review ? `${review.sourceLabel} · ${review.transport}` : 'Review required'}
            </span>
          </div>
        </div>
        <span className={`tool-result-status tool-result-status-${tone}`}>
          {formatMcpAddStatus(currentStatus)}
        </span>
      </div>

      {review ? (
        <div className="tool-result-body mcp-add-review">
          <div className="mcp-add-reason">{review.reason}</div>
          <div className="mcp-add-grid">
            <div>
              <span>Source</span>
              <strong>{review.sourceLabel}</strong>
            </div>
            <div>
              <span>Auth</span>
              <strong>{formatAuthMode(review.authMode)}</strong>
            </div>
            <div>
              <span>Transport</span>
              <strong>{review.transport}</strong>
            </div>
            <div>
              <span>Trust</span>
              <strong>Untrusted after connect</strong>
            </div>
          </div>
          {(review.command || review.url) && (
            <pre className="mcp-add-command">
              {review.command ? [review.command, ...(review.args ?? [])].join(' ') : review.url}
            </pre>
          )}
          {review.requiredSecrets.length > 0 && (
            <div className="mcp-add-note">Required setup: {review.requiredSecrets.join(', ')}</div>
          )}
          {review.riskNotes.length > 0 && (
            <div className="mcp-add-notes">
              {review.riskNotes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          )}
          {(error || mcpAddError || mcpAddResult?.error) && (
            <div className="tool-result-error-message">
              {error || mcpAddError || mcpAddResult?.error}
            </div>
          )}
          {mcpAddResult?.status === 'needs_setup' && (
            <div className="mcp-add-note">
              Server was added. Finish the required auth setup in MCP settings, then connect it.
            </div>
          )}
          {mcpAddResult?.status === 'connected' && (
            <div className="mcp-add-note">
              Connected. Review and trust discovered tools before the agent can use them.
            </div>
          )}
          {currentStatus === 'pending' && (
            <div className="mcp-add-actions">
              <button
                type="button"
                className="mcp-add-primary"
                disabled={!canAct || mcpAddActionState !== 'idle'}
                onClick={() => void approve()}
              >
                {mcpAddActionState === 'approving' ? 'Adding...' : 'Add and connect'}
              </button>
              <button
                type="button"
                className="mcp-add-secondary"
                disabled={!mcp || mcpAddActionState !== 'idle'}
                onClick={() => void cancel()}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="tool-result-body">
          <pre className="tool-result-json">
            {error || (typeof result === 'string' ? result : JSON.stringify(result, null, 2))}
          </pre>
        </div>
      )}
    </div>
  )
}

function normalizeMcpAddReview(result: unknown): McpAgentAddReview | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const record = result as Record<string, unknown>
  if (typeof record.requestId !== 'string' || typeof record.serverName !== 'string') return null
  return record as unknown as McpAgentAddReview
}

function formatMcpAddStatus(status: string): string {
  switch (status) {
    case 'connected':
      return 'Connected'
    case 'needs_setup':
      return 'Needs setup'
    case 'cancelled':
      return 'Cancelled'
    case 'failed':
      return 'Failed'
    case 'added':
      return 'Added'
    default:
      return 'Review'
  }
}

function mcpAddTone(
  status: string,
  error?: string | null
): 'success' | 'warning' | 'error' | 'neutral' {
  if (error || status === 'failed') return 'error'
  if (status === 'connected') return 'success'
  if (status === 'needs_setup' || status === 'cancelled') return 'warning'
  return 'neutral'
}

function formatAuthMode(mode: string): string {
  switch (mode) {
    case 'oauth2Pkce':
      return 'OAuth sign-in'
    case 'envSecret':
      return 'Environment secret'
    case 'headerSecret':
      return 'Header secret'
    case 'bearerToken':
      return 'Bearer token'
    case 'basicAuth':
      return 'Basic auth'
    case 'jsonCredential':
      return 'JSON credential'
    case 'connectionString':
      return 'Connection string'
    default:
      return 'No auth'
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
