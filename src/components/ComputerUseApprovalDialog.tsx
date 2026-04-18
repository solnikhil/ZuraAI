import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Monitor, MousePointer, Keyboard, TimerReset } from 'lucide-react'

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

interface PendingComputerAction {
  id: string
  action: string
  args: Record<string, unknown>
  screenshot?: string
  requestedAt: number
  expiresAt: number
}

function describeAction(action: string, args: Record<string, unknown>): string {
  switch (action) {
    case 'click': return `Click at (${args.x}, ${args.y})${args.button && args.button !== 'left' ? ` [${args.button}]` : ''}`
    case 'type': return `Type: "${String(args.text ?? '').slice(0, 60)}${String(args.text ?? '').length > 60 ? '…' : ''}"`
    case 'key': return `Press: ${args.key}`
    case 'scroll': return `Scroll ${args.direction} at (${args.x}, ${args.y})`
    case 'cursor_position': return `Move cursor to (${args.x}, ${args.y})`
    default: return action
  }
}

function actionIcon(action: string) {
  if (action === 'type' || action === 'key') return <Keyboard className="h-5 w-5 text-emerald-500" />
  if (action === 'click' || action === 'cursor_position') return <MousePointer className="h-5 w-5 text-emerald-500" />
  return <Monitor className="h-5 w-5 text-emerald-500" />
}

export function ComputerUseApprovalDialog(): React.ReactElement | null {
  const [pending, setPending] = useState<PendingComputerAction[]>([])
  const [isResolving, setIsResolving] = useState(false)
  const resolvedRef = useRef(false)
  const { showToast } = useToast()

  useEffect(() => {
    if (!window.computerUse?.onPendingApproval) return
    const unsubscribe = window.computerUse.onPendingApproval((list) => {
      setPending(list as PendingComputerAction[])
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!window.computerUse?.onKilled) return
    const unsubscribe = window.computerUse.onKilled(() => {
      showToast('Computer Use stopped — Esc+Esc', 'warning')
    })
    return unsubscribe
  }, [showToast])

  const request = useMemo(() => {
    resolvedRef.current = false
    const sorted = [...pending].sort((a, b) => a.requestedAt - b.requestedAt)
    return sorted[0] ?? null
  }, [pending])

  const handleResolve = useCallback(async (approved: boolean) => {
    if (!request || !window.computerUse?.resolveApproval || resolvedRef.current) return
    resolvedRef.current = true
    setIsResolving(true)
    try {
      await window.computerUse.resolveApproval(request.id, approved)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setIsResolving(false)
    }
  }, [request, showToast])

  if (!request) return null

  const queuedCount = Math.max(0, pending.length - 1)
  const secondsRemaining = Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000))

  return (
    <AlertDialog open onOpenChange={(open) => (!open && !isResolving ? void handleResolve(false) : undefined)}>
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {actionIcon(request.action)}
            Approve computer action
          </AlertDialogTitle>
          <AlertDialogDescription>
            {describeAction(request.action, request.args)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{request.action}</Badge>
            <Badge variant="outline">
              <TimerReset className="mr-1 h-3 w-3" />
              {secondsRemaining}s
            </Badge>
            {queuedCount > 0 && <Badge variant="destructive">{queuedCount} more queued</Badge>}
          </div>

          {request.screenshot && (
            <div className="overflow-hidden rounded-xl border border-border/70">
              <img
                src={`data:image/png;base64,${request.screenshot}`}
                alt="Current screen"
                className="w-full"
                style={{ maxHeight: '300px', objectFit: 'contain', background: '#000' }}
              />
            </div>
          )}

          <div className="rounded-xl border border-border/70 bg-muted/35 p-3 text-muted-foreground text-xs">
            Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Esc</kbd>+<kbd className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Esc</kbd> to emergency stop all actions
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

export default ComputerUseApprovalDialog
