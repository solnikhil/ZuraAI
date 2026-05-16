import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { PendingCodeApproval } from '@/electron/types'
import {
  getPreloadedMarkdown,
  waitForMarkdownPreload,
  type SyntaxHighlighterComponent,
} from '@/utils/markdownPreloader'

function ApprovalSyntaxBlock({
  code,
  language,
}: {
  code: string
  language: string
}): React.ReactElement {
  const [highlighter, setHighlighter] = useState<SyntaxHighlighterComponent | null>(
    () => getPreloadedMarkdown().syntaxHighlighter
  )
  const [style, setStyle] = useState<Record<string, React.CSSProperties> | null>(
    () => getPreloadedMarkdown().prismStyle
  )

  useEffect(() => {
    let cancelled = false
    if (highlighter && style) return

    void waitForMarkdownPreload().then(() => {
      if (cancelled) return
      const preloaded = getPreloadedMarkdown()
      setHighlighter(() => preloaded.syntaxHighlighter)
      setStyle(preloaded.prismStyle)
    })

    return () => {
      cancelled = true
    }
  }, [highlighter, style])

  if (!highlighter || !style) {
    return (
      <pre
        style={{
          margin: 0,
          padding: 16,
          whiteSpace: 'pre-wrap',
          fontSize: '0.8rem',
          color: 'var(--theme-text-primary)',
          background: 'transparent',
        }}
      >
        <code>{code}</code>
      </pre>
    )
  }

  const SyntaxHighlighter = highlighter
  return (
    <SyntaxHighlighter
      language={language}
      style={style}
      customStyle={{
        margin: 0,
        borderRadius: 'var(--radius)',
        fontSize: '0.8rem',
      }}
    >
      {code}
    </SyntaxHighlighter>
  )
}

interface CodeExecutionApprovalDialogProps {
  initialPending?: PendingCodeApproval[]
}

export function CodeExecutionApprovalDialog({
  initialPending = [],
}: CodeExecutionApprovalDialogProps): React.ReactElement | null {
  const [pending, setPending] = useState<PendingCodeApproval[]>(initialPending)
  const [isResolving, setIsResolving] = useState(false)
  const resolvedRef = useRef(false)
  const { showToast } = useToast()

  useEffect(() => {
    if (!window.codeExecution?.onPendingApproval) return
    const unsubscribe = window.codeExecution.onPendingApproval((list) => {
      setPending(list)
    })
    return unsubscribe
  }, [])

  const request = useMemo(
    () => {
      resolvedRef.current = false
      const sorted = [...pending].sort((a, b) => a.requestedAt - b.requestedAt)
      return sorted[0] ?? null
    },
    [pending]
  )

  const handleResolve = useCallback(async (approved: boolean) => {
    if (!request || !window.codeExecution?.resolveApproval || resolvedRef.current) return
    resolvedRef.current = true
    setIsResolving(true)
    try {
      await window.codeExecution.resolveApproval(request.id, approved)
      showToast(
        approved ? 'Code execution approved.' : 'Code execution rejected.',
        approved ? 'success' : 'warning'
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setIsResolving(false)
    }
  }, [request, showToast])

  if (!request) return null

  const queuedCount = Math.max(0, pending.length - 1)
  const secondsRemaining = Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000))
  const langLabel = request.language === 'python' ? 'Python' : 'JavaScript'
  const syntaxLang = request.language === 'python' ? 'python' : 'javascript'

  return (
    <AlertDialog open onOpenChange={(open) => (!open && !isResolving ? void handleResolve(false) : undefined)}>
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-violet-500" />
            Approve code execution
          </AlertDialogTitle>
          <AlertDialogDescription>
            The assistant wants to run {langLabel} code.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{langLabel}</Badge>
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
            Code runs on a remote sandbox (OnlineCompiler). No access to your files or network.
          </div>

          <div className="space-y-2">
            <div className="font-medium text-foreground">Code</div>
            <div className="max-h-72 overflow-auto rounded-xl border border-border/70">
              <ApprovalSyntaxBlock code={request.code} language={syntaxLang} />
            </div>
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

export default CodeExecutionApprovalDialog
