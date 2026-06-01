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

  const requestApproval = useCallback((toolCall: ToolCall) => {
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
  }, [])

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
      showToast(approved ? 'Tool call approved.' : 'Tool call rejected.', approved ? 'success' : 'warning')
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

  return (
    <AlertDialog open onOpenChange={(open) => (!open ? onResolve(false) : undefined)}>
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[var(--theme-accent)]" />
            Approve tool call
          </AlertDialogTitle>
          <AlertDialogDescription>{description.title}: {description.summary}</AlertDialogDescription>
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

          <div className="rounded-xl border border-border/70 bg-muted/35 p-4 text-muted-foreground">
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 text-amber-500" />
            Agent Mode requires approval before every tool call. Review the arguments before continuing.
          </div>

          <div className="space-y-2">
            <div className="font-medium text-foreground">Arguments</div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-background/80 p-4 text-xs text-foreground">
              {JSON.stringify(request.toolCall.arguments, null, 2)}
            </pre>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onResolve(false)}>
            <XCircle className="mr-1.5 h-4 w-4" />
            Reject
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onResolve(true)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Approve
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
