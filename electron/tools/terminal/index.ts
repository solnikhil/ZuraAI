import { BrowserWindow, ipcMain } from 'electron'
import { TerminalApprovalManager } from './approvalManager'
import type { PendingTerminalApproval } from './approvalManager'
import { TERMINAL_APPROVAL_TIMEOUT_MS } from './constants'
import { setApprovalManager } from '../system-shell'

let approvalManager: TerminalApprovalManager | null = null
let unsubscribeBroadcast: (() => void) | null = null

function getOrCreateApprovalManager(): TerminalApprovalManager {
  if (!approvalManager) {
    approvalManager = new TerminalApprovalManager({ defaultTimeoutMs: TERMINAL_APPROVAL_TIMEOUT_MS })
  }
  return approvalManager
}

function broadcastPendingApprovals(pending: PendingTerminalApproval[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('terminal:pending-approval', pending)
    }
  }
}

export function registerTerminalHandlers(): void {
  unregisterTerminalHandlers()

  const manager = getOrCreateApprovalManager()
  setApprovalManager(manager)

  unsubscribeBroadcast = manager.onPendingApprovalsChange((pending) => {
    broadcastPendingApprovals(pending)
  })

  ipcMain.handle('terminal:resolve-approval', (_event, requestId: unknown, approved: unknown) => {
    if (typeof requestId !== 'string' || !requestId.trim()) {
      throw new Error('Invalid approval request ID')
    }
    return manager.resolveApproval(requestId.trim(), approved === true)
  })
}

export function unregisterTerminalHandlers(): void {
  ipcMain.removeHandler('terminal:resolve-approval')
  if (unsubscribeBroadcast) {
    unsubscribeBroadcast()
    unsubscribeBroadcast = null
  }
}

export function disposeTerminalApprovalManager(): void {
  if (approvalManager) {
    approvalManager.dispose()
  }
}
