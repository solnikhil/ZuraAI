import { lazy, Suspense, useEffect, useState } from 'react'

import { isMacOSRuntime } from '../utils/platform'
import type { PendingCodeApproval, PendingTerminalApproval } from '../electron/types'

const CodeExecutionApprovalDialog = lazy(() =>
  import('./CodeExecutionApprovalDialog').then((module) => ({
    default: module.CodeExecutionApprovalDialog,
  }))
)
const TerminalApprovalDialog = lazy(() =>
  import('./TerminalApprovalDialog').then((module) => ({
    default: module.TerminalApprovalDialog,
  }))
)
const ComputerUseApprovalDialog = lazy(() =>
  import('./ComputerUseApprovalDialog').then((module) => ({
    default: module.ComputerUseApprovalDialog,
  }))
)

export function CodeExecutionApprovalHost() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingCodeApproval[] | null>(null)

  useEffect(() => {
    if (!window.codeExecution?.onPendingApproval) return
    return window.codeExecution.onPendingApproval((pending) => {
      setPendingApprovals(pending.length > 0 ? pending : null)
    })
  }, [])

  if (!pendingApprovals) return null

  return (
    <Suspense fallback={null}>
      <CodeExecutionApprovalDialog initialPending={pendingApprovals} />
    </Suspense>
  )
}

export function TerminalApprovalHost() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingTerminalApproval[] | null>(null)

  useEffect(() => {
    if (!window.terminal?.onPendingApproval) return
    return window.terminal.onPendingApproval((pending) => {
      setPendingApprovals(pending.length > 0 ? pending : null)
    })
  }, [])

  if (!pendingApprovals) return null

  return (
    <Suspense fallback={null}>
      <TerminalApprovalDialog initialPending={pendingApprovals} />
    </Suspense>
  )
}

export function ComputerUseApprovalHost() {
  if (isMacOSRuntime()) return null

  return (
    <Suspense fallback={null}>
      <ComputerUseApprovalDialog />
    </Suspense>
  )
}
