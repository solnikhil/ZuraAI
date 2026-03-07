import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn, exec } from 'child_process'
import {
  setNativeBlur,
} from '../windows'
import { memoryMonitor, type MemoryMetrics } from '../performance/memoryMonitor'

const windowStateListenersAttached = new WeakSet<BrowserWindow>()

function emitWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.send('window-controls:state', {
    isMaximized: win.isMaximized(),
  })
}

function ensureWindowStateListeners(win: BrowserWindow): void {
  if (windowStateListenersAttached.has(win)) {
    return
  }

  const sendCurrentState = () => emitWindowState(win)
  win.on('maximize', sendCurrentState)
  win.on('unmaximize', sendCurrentState)
  win.on('enter-full-screen', sendCurrentState)
  win.on('leave-full-screen', sendCurrentState)
  win.on('closed', () => {
    windowStateListenersAttached.delete(win)
  })

  windowStateListenersAttached.add(win)
}

/**
 * Register all system IPC handlers
 */
export function registerSystemHandlers(): void {
  // Native blur toggle (acrylic on Windows, vibrancy on macOS)
  ipcMain.on('set-native-blur', (_event, enabled: boolean) => {
    setNativeBlur(!!enabled)
  })

  // Get app process metrics (CPU, memory usage per subprocess)
  ipcMain.handle('get-process-metrics', () => {
    const metrics = app.getAppMetrics()
    return metrics.map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      cpu: metric.cpu.percentCPUUsage,
      memory: Math.round(metric.memory.workingSetSize / 1024), // Convert to MB
      name: metric.name || metric.type,
    }))
  })

  // Memory monitoring handlers (Requirements 4.6, 6.6)
  // Get current memory metrics from the main process
  ipcMain.handle('memory:get-metrics', (): MemoryMetrics => {
    return memoryMonitor.getMemoryMetrics()
  })

  // Force memory cleanup (triggers garbage collection and cleanup callbacks)
  ipcMain.handle('memory:force-cleanup', () => {
    memoryMonitor.triggerCleanup()
    return { success: true, timestamp: Date.now() }
  })

  // Window controls handlers
  ipcMain.handle('window-controls:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    ensureWindowStateListeners(win)
    win.minimize()
  })

  ipcMain.handle('window-controls:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    ensureWindowStateListeners(win)
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    emitWindowState(win)
  })

  ipcMain.handle('window-controls:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window-controls:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    ensureWindowStateListeners(win)
    return win.isMaximized()
  })

  // Window resize handler (for transparent/frosted windows that lose native resize handles)
  ipcMain.handle('window-resize', (event, newBounds: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    // Validate that newBounds is an object with the required properties
    if (
      typeof newBounds !== 'object' ||
      newBounds === null ||
      !('x' in newBounds) ||
      !('y' in newBounds) ||
      !('width' in newBounds) ||
      !('height' in newBounds)
    ) {
      return
    }

    const bounds = newBounds as { x: unknown; y: unknown; width: unknown; height: unknown }

    // Validate all values are finite numbers
    const x = Number(bounds.x)
    const y = Number(bounds.y)
    const width = Number(bounds.width)
    const height = Number(bounds.height)

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
      return
    }

    // Clamp to minimum window dimensions
    const MIN_WIDTH = 900
    const MIN_HEIGHT = 600

    const clampedBounds = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(MIN_WIDTH, Math.round(width)),
      height: Math.max(MIN_HEIGHT, Math.round(height)),
    }

    win.setBounds(clampedBounds)
  })

  // Spawn terminal with command handler
  ipcMain.on('spawn-terminal-command', (_event, command, args) => {
    console.log('[SYSTEM] Spawning terminal command:', { command, args, platform: process.platform })

    if (process.platform === 'win32') {
      // Windows: spawn command in new terminal window using start command
      const argsStr = args && args.length > 0 ? args.map((a: string) => `"${a}"`).join(' ') : ''
      const fullCommand = `"${command}" ${argsStr}`

      // Use start to open a new cmd window that stays open
      const cmd = `start cmd /K "${fullCommand}"`

      console.log('[SYSTEM] Executing Windows command:', cmd)
      exec(cmd, (error) => {
        if (error) {
          console.error('[SYSTEM] Failed to spawn terminal:', error.message)
        }
      })
    } else if (process.platform === 'darwin') {
      // macOS: use Terminal.app with osascript
      const fullCommand = args && args.length > 0 ? `${command} ${args.join(' ')}` : command
      const script = `tell app "Terminal" to do script "${fullCommand}; read -n1"`
      exec(`osascript -e '${script}'`, (error, _stdout, _stderr) => {
        if (error) console.error('[SYSTEM] macOS exec error:', error.message)
        else console.log('[SYSTEM] macOS terminal opened')
      })
    } else {
      // Linux: use xterm or other terminal
      const fullCommand = args && args.length > 0 ? `${command} ${args.join(' ')}` : command
      const child = spawn('xterm', ['-e', 'bash', '-c', `${fullCommand}; echo "Press Enter to close..."; read`], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
    }
  })
}

/**
 * Unregister all system IPC handlers
 */
export function unregisterSystemHandlers(): void {
  ipcMain.removeAllListeners('set-native-blur')
  ipcMain.removeHandler('get-process-metrics')
  ipcMain.removeHandler('memory:get-metrics')
  ipcMain.removeHandler('memory:force-cleanup')
  ipcMain.removeAllListeners('spawn-terminal-command')
  ipcMain.removeHandler('window-resize')
  ipcMain.removeHandler('window-controls:minimize')
  ipcMain.removeHandler('window-controls:toggle-maximize')
  ipcMain.removeHandler('window-controls:close')
  ipcMain.removeHandler('window-controls:is-maximized')
}
