import { BrowserWindow, ipcMain, Notification as ElectronNotification } from 'electron'

interface NativeNotificationRequest {
  title: string
  body: string
  notificationId?: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isValidNativeNotificationRequest(payload: unknown): payload is NativeNotificationRequest {
  if (typeof payload !== 'object' || payload === null) return false

  const candidate = payload as Record<string, unknown>
  if (!isNonEmptyString(candidate.title)) return false
  if (!isNonEmptyString(candidate.body)) return false
  if (candidate.notificationId !== undefined && typeof candidate.notificationId !== 'string') return false
  return true
}

function focusWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

export function registerNotificationHandlers(): void {
  ipcMain.handle('notification:native', (event, payload: unknown) => {
    if (!isValidNativeNotificationRequest(payload)) {
      return { success: false, error: 'Invalid native notification payload' }
    }

    try {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender)
      const notification = new ElectronNotification({
        title: payload.title,
        body: payload.body,
      })

      notification.on('click', () => {
        const targetWindow = sourceWindow ?? BrowserWindow.getAllWindows().at(0)
        if (!targetWindow) return

        focusWindow(targetWindow)
        targetWindow.webContents.send('notification:native-click', {
          notificationId: payload.notificationId,
        })
      })

      notification.show()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown native notification error'
      console.warn('[NotificationHandlers] Failed to show native notification:', message)
      return { success: false, error: message }
    }
  })
}

export function unregisterNotificationHandlers(): void {
  ipcMain.removeHandler('notification:native')
}
