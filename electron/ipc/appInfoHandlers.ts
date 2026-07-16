import { app, BrowserWindow } from 'electron'
import { getAppRuntimeInfo } from '../runtimeInfo'
import { showAboutWindow } from '../windows'
import { trustedIpcMain as ipcMain } from './trustedIpc'

export function registerAppInfoHandlers(): void {
  ipcMain.handle('app-info:get', () => getAppRuntimeInfo())
  ipcMain.handle('app-info:get-memory-report', async () => {
    if (app.isPackaged) return null
    return {
      capturedAt: new Date().toISOString(),
      currentProcess: await process.getProcessMemoryInfo(),
      appMetrics: app.getAppMetrics().map((metric) => ({
        pid: metric.pid,
        type: metric.type,
        name: metric.name,
        memory: metric.memory,
        cpu: metric.cpu,
        creationTime: metric.creationTime,
      })),
    }
  })
  ipcMain.handle('app-info:open-about-window', () => showAboutWindow())
  ipcMain.handle('devtools:inspect-element', (event, x: unknown, y: unknown) => {
    if (app.isPackaged) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    win.webContents.inspectElement(
      typeof x === 'number' ? Math.round(x) : 0,
      typeof y === 'number' ? Math.round(y) : 0
    )
  })
}

export function unregisterAppInfoHandlers(): void {
  ipcMain.removeHandler('app-info:get')
  ipcMain.removeHandler('app-info:get-memory-report')
  ipcMain.removeHandler('app-info:open-about-window')
  ipcMain.removeHandler('devtools:inspect-element')
}
