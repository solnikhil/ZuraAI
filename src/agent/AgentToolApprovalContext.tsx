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
import type { ToolCall } from '@/tools/types'
import { describeToolCall, getToolStepKind } from './agentRun'
import { rememberToolApprovalToken } from '@/tools/toolApprovalTokens'

interface PendingApproval {
  id: string
  toolCall: ToolCall
  requestedAt: number
  resolve: (approved: boolean) => void
}

interface AgentToolApprovalContextValue {
  requestApproval: (toolCall: ToolCall) => Promise<boolean>
}

const AgentToolApprovalContext = createContext<AgentToolApprovalContextValue | null>(null)

export function AgentToolApprovalProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingApproval[]>([])
  const { showToast } = useToast()
  const resolvedIdsRef = useRef(new Set<string>())

  const requestApproval = useCallback(
    (toolCall: ToolCall) => {
      if (typeof window !== 'undefined' && window.agentApproval?.requestApproval) {
        const description = describeToolCall(toolCall)
        const kind = getToolStepKind(toolCall.name)
        const id = `agent-approval-${toolCall.id}-${Date.now()}`

        return window.agentApproval
          .requestApproval({
            id,
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
            if (decision.approved && decision.approvalToken) {
              rememberToolApprovalToken(toolCall.id, decision.approvalToken)
            }
            if (!decision.autonomous) {
              showToast(
                decision.approved
                  ? decision.trusted
                    ? 'Tool call trusted.'
                    : 'Tool call approved.'
                  : 'Tool call rejected.',
                decision.approved ? 'success' : 'warning'
              )
            }
            return decision.approved
          })
          .catch(() => false)
      }

      return new Promise<boolean>((resolve) => {
        setPending((prev) => [
          ...prev,
          {
            id: `agent-approval-${toolCall.id}-${Date.now()}`,
            toolCall,
            requestedAt: Date.now(),
            resolve,
          },
        ])
      })
    },
    [showToast]
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
      active.resolve(approved)
      setPending((prev) => prev.filter((request) => request.id !== active.id))
      showToast(
        approved ? 'Tool call approved.' : 'Tool call rejected.',
        approved ? 'success' : 'warning'
      )
    },
    [active, showToast]
  )

  const contextValue = useMemo(() => ({ requestApproval }), [requestApproval])

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
    return {
      requestApproval: async () => true,
    }
  }
  return context
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
            <Wrench className="h-5 w-5 text-[var(--theme-accent)]" />
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
              <TimerReset className="mr-1 h-3 w-3" />
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
            <XCircle className="mr-1.5 h-4 w-4" />
            Reject
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onResolve(true)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
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
