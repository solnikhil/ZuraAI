import { BrowserWindow } from 'electron'
import { trustedIpcMain as ipcMain } from '../../ipc/trustedIpc'
import { ComputerUseApprovalManager } from './approvalManager'
import type { PendingComputerAction } from './approvalManager'
import { setApprovalManager } from './service'

let approvalManager: ComputerUseApprovalManager | null = null
let unsubscribeBroadcast: (() => void) | null = null

function getOrCreateApprovalManager(): ComputerUseApprovalManager {
  if (!approvalManager) {
    approvalManager = new ComputerUseApprovalManager()
  }
  return approvalManager
}

function broadcastPending(pending: PendingComputerAction[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('computer-use:pending-approval', pending)
    }
  }
}

export function registerComputerUseHandlers(): void {
  unregisterComputerUseHandlers()

  const manager = getOrCreateApprovalManager()
  setApprovalManager(manager)

  unsubscribeBroadcast = manager.onPendingChange((pending) => {
    broadcastPending(pending)
  })

  ipcMain.handle(
    'computer-use:resolve-approval',
    (_event, requestId: unknown, approved: unknown) => {
      if (typeof requestId !== 'string' || !requestId.trim()) {
        throw new Error('Invalid approval request ID')
      }
      return manager.resolveApproval(requestId.trim(), approved === true)
    }
  )
}

export function unregisterComputerUseHandlers(): void {
  ipcMain.removeHandler('computer-use:resolve-approval')
  if (unsubscribeBroadcast) {
    unsubscribeBroadcast()
    unsubscribeBroadcast = null
  }
}

export function disposeComputerUseApprovalManager(): void {
  if (approvalManager) {
    approvalManager.dispose()
  }
}
