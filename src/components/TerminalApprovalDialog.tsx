import React, { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ShieldCheck, Terminal, TimerReset } from 'lucide-react'

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
import type { PendingTerminalApproval } from '@/electron/types'

interface TerminalApprovalDialogProps {
  initialPending?: PendingTerminalApproval[]
}

export function TerminalApprovalDialog({
  initialPending = [],
}: TerminalApprovalDialogProps): React.ReactElement | null {
  const [pending, setPending] = useState<PendingTerminalApproval[]>(initialPending)
  const [isResolving, setIsResolving] = useState(false)
  const resolvedRef = useRef(false)
  const { showToast } = useToast()

  React.useEffect(() => {
    if (!window.terminal?.onPendingApproval) return
    const unsubscribe = window.terminal.onPendingApproval((list) => {
      setPending(list)
    })
    return unsubscribe
  }, [])

  const request = useMemo(() => {
    resolvedRef.current = false
    const sorted = [...pending].sort((a, b) => a.requestedAt - b.requestedAt)
    return sorted[0] ?? null
  }, [pending])

  const handleResolve = useCallback(
    async (approved: boolean) => {
      if (!request || !window.terminal?.resolveApproval || resolvedRef.current) return
      resolvedRef.current = true
      setIsResolving(true)
      try {
        await window.terminal.resolveApproval(request.id, approved)
        showToast(
          approved ? 'Terminal command approved.' : 'Terminal command rejected.',
          approved ? 'success' : 'warning'
        )
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error), 'error')
      } finally {
        setIsResolving(false)
      }
    },
    [request, showToast]
  )

  if (!request) return null

  const queuedCount = Math.max(0, pending.length - 1)
  const secondsRemaining = Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000))

  return (
    <AlertDialog
      open
      onOpenChange={(open) => (!open && !isResolving ? void handleResolve(false) : undefined)}
    >
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-emerald-500" />
            Approve terminal command
          </AlertDialogTitle>
          <AlertDialogDescription>
            {request.description || 'The assistant wants to run a PowerShell command.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">PowerShell</Badge>
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
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 text-amber-500" />
            This command runs directly on your machine. Review it carefully before approving.
          </div>

          {request.cwd && (
            <div className="space-y-1">
              <div className="font-medium text-foreground">Working directory</div>
              <div className="break-all rounded-md border border-border/70 bg-muted/35 px-3 py-2 font-mono text-xs text-muted-foreground">
                {request.cwd}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="font-medium text-foreground">Command</div>
            <div className="max-h-72 overflow-auto rounded-xl border border-border/70">
              <pre
                style={{
                  margin: 0,
                  padding: 16,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '0.8rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--theme-text-primary)',
                  background: 'transparent',
                }}
              >
                <code>{request.command}</code>
              </pre>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResolving}>Reject</AlertDialogCancel>
          <AlertDialogAction disabled={isResolving} onClick={() => void handleResolve(true)}>
            Approve
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default TerminalApprovalDialog
