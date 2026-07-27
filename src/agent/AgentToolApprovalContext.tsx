import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, TimerReset, Wrench, XCircle } from 'lucide-react'

import { useToast } from '@/components/shared'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import type { AgentApprovalOverlayDecision, AgentApprovalOverlayOutcome } from '@/electron/types'
import type { ToolCall } from '@/tools/types'
import { describeToolCall, getToolStepKind } from './agentRun'
import { trackAgentApprovalResolved } from './agentAnalytics'

interface PendingApproval {
  id: string
  toolCall: ToolCall
  requestedAt: number
  resolve: (decision: AgentApprovalOverlayDecision) => void
}

export interface AgentApprovalRequestContext {
  runId?: string
  taskTitle?: string
}

interface AgentToolApprovalContextValue {
  requestApproval: (toolCall: ToolCall, context?: AgentApprovalRequestContext) => Promise<boolean>
  requestApprovalDecision: (
    toolCall: ToolCall,
    context?: AgentApprovalRequestContext
  ) => Promise<AgentApprovalOverlayDecision>
}

const AgentToolApprovalContext = createContext<AgentToolApprovalContextValue | null>(null)

export function AgentToolApprovalProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingApproval[]>([])
  const { showToast } = useToast()
  const resolvedIdsRef = useRef(new Set<string>())

  const requestApprovalDecision = useCallback(
    (toolCall: ToolCall, context?: AgentApprovalRequestContext) => {
      const requestedAt = Date.now()
      if (typeof window !== 'undefined' && window.agentApproval?.requestApproval) {
        const description = describeToolCall(toolCall)
        const kind = getToolStepKind(toolCall.name)
        const id = `agent-approval-${toolCall.id}-${Date.now()}`

        return window.agentApproval
          .requestApproval({
            id,
            ...(context?.runId ? { runId: context.runId } : {}),
            ...(context?.taskTitle ? { taskTitle: context.taskTitle } : {}),
            title: description.title,
            summary: description.summary,
            toolName: toolCall.name,
            kind,
            arguments: getReadableArgumentRows(toolCall.arguments).map(({ label, value }) => ({
              label,
              value,
            })),
            toolArguments: toolCall.arguments,
          })
          .then((decision) => {
            trackApprovalDecision(decision, requestedAt, false)
            if (!decision.autonomous) showApprovalOutcomeToast(decision, showToast)
            return decision
          })
          .catch(() => {
            const decision = createApprovalDecision('error')
            trackApprovalDecision(decision, requestedAt, false)
            showApprovalOutcomeToast(decision, showToast)
            return decision
          })
      }

      return new Promise<AgentApprovalOverlayDecision>((resolve) => {
        setPending((prev) => [
          ...prev,
          {
            id: `agent-approval-${toolCall.id}-${Date.now()}`,
            toolCall,
            requestedAt: Date.now(),
            resolve,
          },
        ])
      }).then((decision) => {
        trackApprovalDecision(decision, requestedAt, true)
        return decision
      })
    },
    [showToast]
  )

  const requestApproval = useCallback(
    async (toolCall: ToolCall, context?: AgentApprovalRequestContext) =>
      (await requestApprovalDecision(toolCall, context)).approved,
    [requestApprovalDecision]
  )

  const active = useMemo(
    () => [...pending].sort((left, right) => left.requestedAt - right.requestedAt)[0] ?? null,
    [pending]
  )

  const resolveActive = useCallback(
    (approved: boolean) => {
      if (!active) return
      if (resolvedIdsRef.current.has(active.id)) return
      resolvedIdsRef.current.add(active.id)
      const decision = createApprovalDecision(approved ? 'approved_once' : 'rejected')
      active.resolve(decision)
      setPending((prev) => prev.filter((request) => request.id !== active.id))
      showApprovalOutcomeToast(decision, showToast)
    },
    [active, showToast]
  )

  const contextValue = useMemo(
    () => ({ requestApproval, requestApprovalDecision }),
    [requestApproval, requestApprovalDecision]
  )

  return (
    <AgentToolApprovalContext.Provider value={contextValue}>
      {children}
      <AgentToolApprovalDialog
        request={active}
        queuedCount={Math.max(0, pending.length - 1)}
        onResolve={resolveActive}
      />
    </AgentToolApprovalContext.Provider>
  )
}

export function useAgentToolApproval(): AgentToolApprovalContextValue {
  const context = useContext(AgentToolApprovalContext)
  if (!context) {
    const unavailableDecision = async () => createApprovalDecision('unavailable')
    return {
      requestApproval: async () => false,
      requestApprovalDecision: unavailableDecision,
    }
  }
  return context
}

function createApprovalDecision(
  outcome: AgentApprovalOverlayOutcome
): AgentApprovalOverlayDecision {
  return {
    approved:
      outcome === 'approved_once' ||
      outcome === 'approved_session' ||
      outcome === 'approved_policy',
    outcome,
  }
}

function trackApprovalDecision(
  decision: AgentApprovalOverlayDecision,
  requestedAt: number,
  fallback: boolean
): void {
  trackAgentApprovalResolved({
    outcome: decision.outcome,
    source: fallback
      ? 'fallback'
      : decision.autonomous
        ? 'autonomous'
        : decision.trusted
          ? 'trusted'
          : 'manual',
    durationMs: Date.now() - requestedAt,
  })
}

function showApprovalOutcomeToast(
  decision: AgentApprovalOverlayDecision,
  showToast: ReturnType<typeof useToast>['showToast']
): void {
  switch (decision.outcome) {
    case 'approved_once':
      showToast('Tool call approved.', 'success')
      return
    case 'approved_session':
      showToast('Tool call approved for this Agent run.', 'success')
      return
    case 'approved_policy':
      showToast(
        decision.trusted ? 'Tool call trusted.' : 'Tool call approved by policy.',
        'success'
      )
      return
    case 'rejected':
      showToast('Tool call rejected.', 'warning')
      return
    case 'timed_out':
      showToast('Tool approval timed out.', 'warning')
      return
    case 'cancelled':
      showToast('Tool approval cancelled.', 'info')
      return
    case 'unavailable':
      showToast('Tool approval is unavailable.', 'error')
      return
    case 'error':
      showToast('Tool approval failed. Try again.', 'error')
  }
}

function AgentToolApprovalDialog({
  request,
  queuedCount,
  onResolve,
}: {
  request: PendingApproval | null
  queuedCount: number
  onResolve: (approved: boolean) => void
}) {
  if (!request) return null

  const description = describeToolCall(request.toolCall)
  const kind = getToolStepKind(request.toolCall.name)
  const argumentRows = getReadableArgumentRows(request.toolCall.arguments)

  return (
    <AlertDialog open onOpenChange={(open) => (!open ? onResolve(false) : undefined)}>
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[var(--theme-accent)]" aria-hidden="true" />
            Approve Agent Mode action
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description.title}
            {description.summary ? ` - ${description.summary}` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="min-w-0 space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{kind}</Badge>
            <Badge variant="outline">{request.toolCall.name}</Badge>
            <Badge variant="outline">
              <TimerReset className="mr-1 h-3 w-3" aria-hidden="true" />
              Manual approval
            </Badge>
            {queuedCount > 0 && <Badge variant="destructive">{queuedCount} queued</Badge>}
          </div>

          <div className="rounded-lg border border-[var(--theme-warning)]/25 bg-[var(--theme-warning-bg)] p-4 text-[var(--theme-text-secondary)]">
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 text-[var(--theme-warning)]" />
            Review the action before continuing. Approve once for this run, or always allow this
            exact same call only if you expect it to repeat unchanged.
          </div>

          <div className="space-y-2">
            <div className="font-medium text-foreground">What Agent Mode will send</div>
            <div className="max-h-72 overflow-auto rounded-lg border border-border/70 bg-background/80">
              {argumentRows.length > 0 ? (
                <dl className="divide-y divide-border/60">
                  {argumentRows.map((row) => (
                    <div key={row.key} className="grid gap-1 p-3 sm:grid-cols-[9rem_1fr] sm:gap-3">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </dt>
                      <dd className="min-w-0 whitespace-pre-wrap break-words text-xs text-foreground">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="p-3 text-xs text-muted-foreground">No arguments</div>
              )}
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onResolve(false)}>
            <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Reject
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onResolve(true)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Approve once
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function getReadableArgumentRows(
  args: ToolCall['arguments']
): Array<{ key: string; label: string; value: string }> {
  if (!args || typeof args !== 'object') return []

  return Object.entries(args)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      key,
      label: formatArgumentLabel(key),
      value: formatArgumentValue(value),
    }))
}

function formatArgumentLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatArgumentValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
