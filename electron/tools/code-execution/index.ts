import { BrowserWindow } from 'electron'
import { trustedIpcMain as ipcMain } from '../../ipc/trustedIpc'
import { CodeExecutionApprovalManager } from './approvalManager'
import type { PendingCodeApproval } from './approvalManager'
import { setApprovalManager } from './service'

let approvalManager: CodeExecutionApprovalManager | null = null
let unsubscribeBroadcast: (() => void) | null = null

function getOrCreateApprovalManager(): CodeExecutionApprovalManager {
  if (!approvalManager) {
    approvalManager = new CodeExecutionApprovalManager()
  }
  return approvalManager
}

function broadcastPendingApprovals(pending: PendingCodeApproval[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('code-execution:pending-approval', pending)
    }
  }
}

export function registerCodeExecutionHandlers(): void {
  unregisterCodeExecutionHandlers()

  const manager = getOrCreateApprovalManager()
  setApprovalManager(manager)

  unsubscribeBroadcast = manager.onPendingApprovalsChange((pending) => {
    broadcastPendingApprovals(pending)
  })

  ipcMain.handle(
    'code-execution:resolve-approval',
    (_event, requestId: unknown, approved: unknown) => {
      if (typeof requestId !== 'string' || !requestId.trim()) {
        throw new Error('Invalid approval request ID')
      }
      return manager.resolveApproval(requestId.trim(), approved === true)
    }
  )
}

export function unregisterCodeExecutionHandlers(): void {
  ipcMain.removeHandler('code-execution:resolve-approval')
  if (unsubscribeBroadcast) {
    unsubscribeBroadcast()
    unsubscribeBroadcast = null
  }
}

export function disposeCodeExecutionApprovalManager(): void {
  if (approvalManager) {
    approvalManager.dispose()
  }
}
