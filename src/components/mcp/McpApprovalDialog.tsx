import React, { useMemo, useState } from 'react'

import { AlertTriangle, ShieldCheck, TimerReset } from 'lucide-react'

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
import { useMcp } from '@/mcp/McpContext'

export function McpApprovalDialog(): React.ReactElement | null {
  const { pendingApprovals, resolveApproval } = useMcp()
  const { showToast } = useToast()
  const [isResolving, setIsResolving] = useState(false)

  const request = useMemo(
    () => [...pendingApprovals].sort((left, right) => left.requestedAt - right.requestedAt)[0] ?? null,
    [pendingApprovals]
  )

  if (!request) {
    return null
  }

  const queuedCount = Math.max(0, pendingApprovals.length - 1)
  const secondsRemaining = Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000))

  const handleResolve = async (approved: boolean) => {
    setIsResolving(true)
    try {
      await resolveApproval(request.id, approved)
      showToast(
        approved
          ? `Approved ${request.toolName} on ${request.serverName}.`
          : `Rejected ${request.toolName} on ${request.serverName}.`,
        approved ? 'success' : 'warning'
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => (!open && !isResolving ? void handleResolve(false) : undefined)}>
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Approve MCP tool execution
          </AlertDialogTitle>
          <AlertDialogDescription>
            {request.serverName} wants to run `{request.toolName}` with the arguments below.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{request.serverName}</Badge>
            <Badge variant="outline">{formatTransportLabel(request.serverTransport)}</Badge>
            <Badge variant="outline">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Approval required
            </Badge>
            <Badge variant="outline">
              <TimerReset className="mr-1 h-3 w-3" />
              Expires in {secondsRemaining}s
            </Badge>
            {queuedCount > 0 && <Badge variant="destructive">{queuedCount} more queued</Badge>}
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/35 p-4 text-muted-foreground">
            {getRiskNotice(request.serverTransport)}
          </div>

          <div className="space-y-2">
            <div className="font-medium text-foreground">Arguments</div>
            <pre className="max-h-72 overflow-auto rounded-xl border border-border/70 bg-background/80 p-4 text-xs text-foreground">
              {JSON.stringify(request.arguments, null, 2)}
            </pre>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResolving}>
            Reject
          </AlertDialogCancel>
          <AlertDialogAction disabled={isResolving} onClick={() => void handleResolve(true)}>
            Approve
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function formatTransportLabel(transport: string): string {
  switch (transport) {
    case 'stdio':
      return 'Local stdio'
    case 'sse':
      return 'Remote SSE'
    case 'websocket':
      return 'Remote WebSocket'
    default:
      return 'MCP'
  }
}

function getRiskNotice(transport: string): string {
  if (transport === 'stdio') {
    return 'This server is a local process. Approved calls may read files, spawn subprocesses, or touch your machine depending on how that server is implemented.'
  }

  return 'This server is remote. Approved calls may send request arguments and any server-side context to an external endpoint before returning a result.'
}

export default McpApprovalDialog
