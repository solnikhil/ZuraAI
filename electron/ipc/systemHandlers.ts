import { ipcMain, BrowserWindow, desktopCapturer, screen, app } from 'electron'
import { spawn, exec } from 'child_process'
import {
  setTitleBarOverlay,
  setNativeBlur,
  createMainWindow,
  getMainWindow,
  getOverlayWindow,
  hideOverlay,
  setCurrentScreenshot,
  getCurrentScreenshot,
  clearScreenshot,
} from '../windows'
import { memoryMonitor, type MemoryMetrics } from '../performance/memoryMonitor'

const MAX_SCREENSHOT_EDGE = 2560
const MAX_CROP_EDGE = 1536
const JPEG_QUALITY = 85

function clampNumber(value: unknown, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return min
  return Math.min(max, Math.max(min, num))
}

/**
 * Register all system IPC handlers
 */
export function registerSystemHandlers(): void {
  // Titlebar overlay handler (Windows only)
  ipcMain.on('set-titlebar-overlay', (_event, overlay) => {
    if (process.platform !== 'win32') return

    const color = overlay?.color
    const symbolColor = overlay?.symbolColor
    const height = overlay?.height

    if (typeof color !== 'string' || typeof symbolColor !== 'string') return

    const parsedHeight = typeof height === 'number' && Number.isFinite(height) ? Math.round(height) : undefined
    const safeHeight = parsedHeight !== undefined && parsedHeight >= 28 && parsedHeight <= 64 ? parsedHeight : undefined

    setTitleBarOverlay(color, symbolColor, safeHeight)
  })

  // Native blur toggle (acrylic on Windows, vibrancy on macOS)
  ipcMain.on('set-native-blur', (_event, enabled: boolean) => {
    setNativeBlur(!!enabled)
  })

  // Screen capture handler
  ipcMain.handle('capture-screen', async () => {
    const overlayWin = getOverlayWindow()
    overlayWin?.hide()

    await new Promise(resolve => setTimeout(resolve, 50))

    const displayBounds = screen.getPrimaryDisplay().bounds
    const maxEdge = Math.max(displayBounds.width, displayBounds.height)
    const scale = Math.min(1, MAX_SCREENSHOT_EDGE / Math.max(1, maxEdge))

    const thumbnailSize = {
      width: Math.max(1, Math.round(displayBounds.width * scale)),
      height: Math.max(1, Math.round(displayBounds.height * scale)),
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize,
      fetchWindowIcons: false,
    })

    const primarySource = sources[0]
    if (primarySource?.thumbnail) {
      setCurrentScreenshot(primarySource.thumbnail)
    }

    overlayWin?.show()
    overlayWin?.setAlwaysOnTop(true)

    return true
  })

  // Screenshot crop handler
  ipcMain.handle('crop-screenshot', async (_event, selection) => {
    const currentScreenshot = getCurrentScreenshot()
    if (!currentScreenshot) {
      return null
    }

    try {
      const displayBounds = screen.getPrimaryDisplay().bounds
      const imgSize = currentScreenshot.getSize()
      const scaleX = imgSize.width / Math.max(1, displayBounds.width)
      const scaleY = imgSize.height / Math.max(1, displayBounds.height)

      const x = clampNumber(selection?.x, 0, displayBounds.width) * scaleX
      const y = clampNumber(selection?.y, 0, displayBounds.height) * scaleY
      const width = clampNumber(selection?.width, 0, displayBounds.width) * scaleX
      const height = clampNumber(selection?.height, 0, displayBounds.height) * scaleY

      const cropRect = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      }

      if (cropRect.width <= 0 || cropRect.height <= 0) {
        return null
      }

      // Clamp crop rect to image bounds
      cropRect.x = Math.max(0, Math.min(cropRect.x, imgSize.width - 1))
      cropRect.y = Math.max(0, Math.min(cropRect.y, imgSize.height - 1))
      cropRect.width = Math.max(1, Math.min(cropRect.width, imgSize.width - cropRect.x))
      cropRect.height = Math.max(1, Math.min(cropRect.height, imgSize.height - cropRect.y))

      let croppedImage = currentScreenshot.crop(cropRect)

      // Resize large crops to reduce RAM and base64 payload size
      const croppedSize = croppedImage.getSize()
      const cropMaxEdge = Math.max(croppedSize.width, croppedSize.height)
      if (cropMaxEdge > MAX_CROP_EDGE) {
        const resizeScale = MAX_CROP_EDGE / cropMaxEdge
        croppedImage = croppedImage.resize({
          width: Math.max(1, Math.round(croppedSize.width * resizeScale)),
          height: Math.max(1, Math.round(croppedSize.height * resizeScale)),
        })
      }

      const base64Image = `data:image/jpeg;base64,${croppedImage.toJPEG(JPEG_QUALITY).toString('base64')}`

      // Drop the full-screen screenshot as soon as we have the crop
      clearScreenshot()

      return base64Image
    } catch (error) {
      console.error('[ERROR] Crop failed:', error)
      return null
    }
  })

  // Overlay control handlers
  ipcMain.on('close-overlay', () => {
    hideOverlay()
    clearScreenshot()
  })

  // Mouse events handler
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (typeof ignore !== 'boolean') return
    win?.setIgnoreMouseEvents(ignore, options)
  })

  // Open settings handler
  ipcMain.on('open-settings', () => {
    createMainWindow()
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

  // Window controls handlers (for transparent window maximize workaround)
  ipcMain.handle('window-controls:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window-controls:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      // Workaround: transparent windows can't use native maximize on Windows
      if (process.platform === 'win32') {
        const { workArea } = screen.getPrimaryDisplay()
        win.setBounds(workArea)
      } else {
        win.maximize()
      }
    }
  })

  ipcMain.handle('window-controls:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window-controls:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    // For transparent windows on Windows, also check if bounds match work area
    if (process.platform === 'win32') {
      const bounds = win.getBounds()
      const { workArea } = screen.getPrimaryDisplay()
      const isManualMax = Math.abs(bounds.x - workArea.x) < 2
        && Math.abs(bounds.y - workArea.y) < 2
        && Math.abs(bounds.width - workArea.width) < 2
        && Math.abs(bounds.height - workArea.height) < 2
      return win.isMaximized() || isManualMax
    }
    return win.isMaximized()
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
      exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
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
  ipcMain.removeAllListeners('set-titlebar-overlay')
  ipcMain.removeAllListeners('set-native-blur')
  ipcMain.removeHandler('capture-screen')
  ipcMain.removeHandler('crop-screenshot')
  ipcMain.removeAllListeners('close-overlay')
  ipcMain.removeAllListeners('set-ignore-mouse-events')
  ipcMain.removeAllListeners('open-settings')
  ipcMain.removeHandler('get-process-metrics')
  ipcMain.removeHandler('memory:get-metrics')
  ipcMain.removeHandler('memory:force-cleanup')
  ipcMain.removeAllListeners('spawn-terminal-command')
  ipcMain.removeHandler('window-controls:minimize')
  ipcMain.removeHandler('window-controls:toggle-maximize')
  ipcMain.removeHandler('window-controls:close')
  ipcMain.removeHandler('window-controls:is-maximized')
}
