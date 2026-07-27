import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Trash2 } from 'lucide-react'

import type { AgentTrustedActionMetadata } from '@/electron/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

function formatRisk(riskClass: AgentTrustedActionMetadata['riskClass']): string {
  switch (riskClass) {
    case 'high':
      return 'High risk'
    case 'elevated':
      return 'Elevated risk'
    case 'standard':
      return 'Standard risk'
    case 'unknown':
      return 'Legacy grant'
  }
}

function formatTimestamp(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp))
  } catch {
    return 'Unknown time'
  }
}

export function AgentTrustedActionsCard(): React.ReactElement {
  const [actions, setActions] = useState<AgentTrustedActionMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingMutation, setPendingMutation] = useState<string | 'all' | null>(null)
  const mountedRef = useRef(false)
  const mutationPendingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    let active = true

    const loadActions = async () => {
      if (!window.agentApproval) {
        if (active) {
          setError('Trusted actions are available only in the desktop app.')
          setLoading(false)
        }
        return
      }

      try {
        const nextActions = await window.agentApproval.listTrustedActions()
        if (active) setActions(nextActions)
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Trusted actions could not be loaded.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadActions()
    return () => {
      active = false
      mountedRef.current = false
    }
  }, [])

  const revoke = async (id: string) => {
    if (!window.agentApproval || mutationPendingRef.current) return
    mutationPendingRef.current = true
    setPendingMutation(id)
    setError('')
    try {
      if (!(await window.agentApproval.revokeTrustedAction(id))) {
        if (mountedRef.current) setError('That trusted action no longer exists.')
        return
      }
      if (mountedRef.current) {
        setActions((current) => current.filter((action) => action.id !== id))
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : 'Trusted action could not be revoked.')
      }
    } finally {
      mutationPendingRef.current = false
      if (mountedRef.current) setPendingMutation(null)
    }
  }

  const revokeAll = async () => {
    if (!window.agentApproval || mutationPendingRef.current) return
    mutationPendingRef.current = true
    setPendingMutation('all')
    setError('')
    try {
      await window.agentApproval.revokeAllTrustedActions()
      if (mountedRef.current) setActions([])
    } catch (cause) {
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : 'Trusted actions could not be revoked.')
      }
    } finally {
      mutationPendingRef.current = false
      if (mountedRef.current) setPendingMutation(null)
    }
  }

  return (
    <Card className="settings-list-card" aria-labelledby="trusted-agent-actions-heading">
      <div className="settings-list-row settings-list-row--stacked">
        <div className="settings-list-row__meta">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} aria-hidden="true" />
            <h3 id="trusted-agent-actions-heading" className="settings-list-row__label">
              Trusted exact-repeat actions
            </h3>
          </div>
          <div className="settings-list-row__description">
            These grants apply only when the tool and every argument match the originally approved
            action exactly. Only a one-way signature and sanitized metadata are stored; raw
            arguments are not retained.
          </div>
        </div>

        {error ? (
          <div className="text-sm text-destructive" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-muted-foreground" role="status">
            Loading trusted actions...
          </div>
        ) : error ? null : actions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No trusted exact-repeat actions.</div>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
            {actions.map((action) => (
              <li
                key={action.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs text-foreground">
                    {action.toolName}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatRisk(action.riskClass)} - Created {formatTimestamp(action.createdAt)} -
                    Last used {formatTimestamp(action.lastUsedAt)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingMutation !== null}
                  onClick={() => void revoke(action.id)}
                  aria-label={`Revoke trusted action for ${action.toolName}`}
                >
                  <Trash2 aria-hidden="true" />
                  {pendingMutation === action.id ? 'Revoking...' : 'Revoke'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || actions.length === 0 || pendingMutation !== null}
            onClick={() => void revokeAll()}
          >
            {pendingMutation === 'all' ? 'Revoking all...' : 'Revoke all trusted actions'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default AgentTrustedActionsCard
