import {
  app,
  ipcMain,
  BrowserWindow,
  Menu,
  clipboard,
  dialog,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron'
import { openArtifactExternally } from '../artifacts/openArtifactExternally'
import { getAppRuntimeInfo } from '../runtimeInfo'
import { showAboutWindow } from '../windows'
import type {
  AppMenuCommand,
  NativeContextMenuAction,
  NativeContextMenuRequest,
} from '../../src/electron/types'

const HELP_URL = 'https://github.com/solnikhil/ZuraAI'
const APP_MENU_COMMANDS = new Set<AppMenuCommand>([
  'new-chat',
  'open-settings',
  'open-about',
  'reload',
  'toggle-devtools',
  'reset-zoom',
  'zoom-in',
  'zoom-out',
  'toggle-fullscreen',
  'minimize',
  'toggle-maximize',
  'close-window',
  'open-help',
])

/**
 * Tracks which windows already have window-state listeners attached.
 *
 * The main window can ask for its maximize/fullscreen state multiple times over
 * the lifetime of the app. This guard prevents us from attaching duplicate
 * listeners to the same `BrowserWindow`, which would otherwise cause repeated
 * `window-controls:state` events and unnecessary memory usage.
 */
const windowStateListenersAttached = new WeakSet<BrowserWindow>()

/**
 * Sends the current window state to the renderer that owns the window.
 *
 * This is used by the custom title bar so the renderer can stay in sync with
 * native maximize/fullscreen transitions that happen in the main process.
 */
function emitWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.send('window-controls:state', {
    isMaximized: win.isMaximized(),
  })
}

/**
 * Ensures native window state changes are mirrored back to the renderer.
 *
 * Electron does not automatically keep a custom renderer title bar in sync with
 * native maximize and fullscreen changes, so we subscribe once per window and
 * emit the latest state whenever those events fire.
 */
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

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function sanitizeContextMenuRequest(value: unknown): NativeContextMenuRequest | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const request = value as Record<string, unknown>

  const hasSelection = request.hasSelection
  const isEditable = request.isEditable
  const isContentEditable = request.isContentEditable
  const hasLink = request.hasLink
  const linkUrl = request.linkUrl
  const mouseX = request.mouseX
  const mouseY = request.mouseY
  const isDev = request.isDev
  const kind = request.kind
  const isPinnedChatRow = request.isPinnedChatRow
  const isChatRowInFolder = request.isChatRowInFolder

  if (
    !isBoolean(hasSelection) ||
    !isBoolean(isEditable) ||
    !isBoolean(isContentEditable) ||
    !isBoolean(hasLink) ||
    typeof linkUrl !== 'string' ||
    typeof mouseX !== 'number' ||
    typeof mouseY !== 'number' ||
    !Number.isFinite(mouseX) ||
    !Number.isFinite(mouseY) ||
    !isBoolean(isDev) ||
    (kind !== undefined && kind !== 'default' && kind !== 'chat-row') ||
    (isPinnedChatRow !== undefined && !isBoolean(isPinnedChatRow)) ||
    (isChatRowInFolder !== undefined && !isBoolean(isChatRowInFolder))
  ) {
    return null
  }

  return {
    hasSelection,
    isEditable,
    isContentEditable,
    hasLink,
    linkUrl,
    mouseX: Math.round(mouseX),
    mouseY: Math.round(mouseY),
    isDev,
    kind: kind === 'chat-row' ? 'chat-row' : 'default',
    isPinnedChatRow: isPinnedChatRow === true,
    isChatRowInFolder: isChatRowInFolder === true,
  }
}

function sendContextMenuAction(win: BrowserWindow, action: NativeContextMenuAction): void {
  if (win.isDestroyed()) return
  win.webContents.send('context-menu:action', action)
}

function maybeGetSafeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function isAppMenuCommand(value: unknown): value is AppMenuCommand {
  return typeof value === 'string' && APP_MENU_COMMANDS.has(value as AppMenuCommand)
}

async function executeAppMenuCommand(
  event: IpcMainInvokeEvent,
  command: AppMenuCommand
): Promise<boolean> {
  const win = BrowserWindow.fromWebContents(event.sender)

  switch (command) {
    case 'new-chat':
      event.sender.send('app:new-chat')
      return true
    case 'open-settings':
      event.sender.send('settings:navigate', 'providers')
      return true
    case 'open-about':
      showAboutWindow()
      return true
    case 'reload':
      event.sender.reload()
      return true
    case 'toggle-devtools':
      if (app.isPackaged) return false
      event.sender.toggleDevTools()
      return true
    case 'reset-zoom':
      event.sender.setZoomLevel(0)
      return true
    case 'zoom-in':
      event.sender.setZoomLevel(event.sender.getZoomLevel() + 0.5)
      return true
    case 'zoom-out':
      event.sender.setZoomLevel(event.sender.getZoomLevel() - 0.5)
      return true
    case 'toggle-fullscreen':
      if (!win) return false
      win.setFullScreen(!win.isFullScreen())
      emitWindowState(win)
      return true
    case 'minimize':
      if (!win) return false
      ensureWindowStateListeners(win)
      win.minimize()
      return true
    case 'toggle-maximize':
      if (!win) return false
      ensureWindowStateListeners(win)
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
      emitWindowState(win)
      return true
    case 'close-window':
      win?.close()
      return Boolean(win)
    case 'open-help':
      await shell.openExternal(HELP_URL)
      return true
  }
}

/**
 * Registers IPC channels that expose OS- and window-level capabilities to the
 * renderer through the preload allowlist.
 *
 * These handlers sit on the trusted side of the Electron boundary. The renderer
 * is treated as untrusted, so anything registered here should stay narrow,
 * explicit, and safe to call from UI code.
 */
export function registerSystemHandlers(): void {
  /**
   * Native window controls exposed to the custom renderer title bar.
   *
   * These handlers intentionally resolve the target window from the sender's
   * `webContents` instead of accepting a window identifier from the renderer.
   * That keeps the IPC surface scoped to the caller's own window.
   */
  ipcMain.handle('window-controls:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    ensureWindowStateListeners(win)
    win.minimize()
  })

  /**
   * Toggles maximize state for the sender's window and immediately publishes the
   * updated state back to the renderer.
   *
   * Channel: `window-controls:toggle-maximize`
   * Type: request/response
   */
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

  /**
   * Closes the sender's window.
   *
   * Channel: `window-controls:close`
   * Type: request/response
   */
  ipcMain.handle('window-controls:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  /**
   * Returns whether the sender's window is currently maximized.
   *
   * Channel: `window-controls:is-maximized`
   * Type: request/response
   */
  ipcMain.handle('window-controls:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    ensureWindowStateListeners(win)
    return win.isMaximized()
  })

  /**
   * Executes one fixed app-menu command from the custom Windows titlebar menu.
   *
   * Channel: `app-menu:command`
   * Type: request/response
   */
  ipcMain.handle('app-menu:command', async (event, command: unknown) => {
    if (!isAppMenuCommand(command)) return false
    return executeAppMenuCommand(event, command)
  })

  /**
   * Returns app/runtime metadata for the titlebar about dialog.
   *
   * Channel: `app-info:get`
   * Type: request/response
   */
  ipcMain.handle('app-info:get', () => {
    return getAppRuntimeInfo()
  })

  /**
   * Returns a development-only process memory snapshot for RAM profiling.
   *
   * Channel: `app-info:get-memory-report`
   * Type: request/response
   */
  ipcMain.handle('app-info:get-memory-report', async () => {
    if (app.isPackaged) return null
    const currentProcess = await process.getProcessMemoryInfo()
    return {
      capturedAt: new Date().toISOString(),
      currentProcess,
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

  /**
   * Opens the dedicated About window.
   *
   * Channel: `app-info:open-about-window`
   * Type: request/response
   */
  ipcMain.handle('app-info:open-about-window', () => {
    showAboutWindow()
  })

  /**
   * Opens a URL in the default browser.
   *
   * Channel: `shell:open-external`
   * Type: request/response
   *
   * Only allows http/https URLs to prevent security issues.
   */
  ipcMain.handle('shell:open-external', async (_event, url: unknown) => {
    if (typeof url !== 'string') return

    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return
      }
      await shell.openExternal(url)
    } catch (error) {
      console.warn('[system-handlers] Invalid URL passed to shell:open-external', error)
    }
  })

  /**
   * Writes an artifact to userData and opens it with the OS default app.
   *
   * Channel: `artifacts:open-external`
   * Type: request/response
   */
  ipcMain.handle('artifacts:open-external', async (_event, payload: unknown) => {
    return openArtifactExternally(payload)
  })

  /**
   * Opens DevTools and inspects the element at the given coordinates.
   *
   * Channel: `devtools:inspect-element`
   * Type: request/response
   *
   * Only works in development mode. Coordinates are from the renderer's
   * perspective (clientX/clientY from the contextmenu event).
   */
  ipcMain.handle('devtools:inspect-element', (event, x: unknown, y: unknown) => {
    if (!app.isPackaged) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        const coordX = typeof x === 'number' ? Math.round(x) : 0
        const coordY = typeof y === 'number' ? Math.round(y) : 0
        win.webContents.inspectElement(coordX, coordY)
      }
    }
  })

  /**
   * Reads plain text from the OS clipboard through the trusted main process.
   *
   * Channel: `clipboard:read-text`
   * Type: request/response
   */
  ipcMain.handle('clipboard:read-text', () => {
    try {
      return clipboard.readText()
    } catch {
      return ''
    }
  })

  ipcMain.handle('context-menu:show', async (event, request: unknown) => {
    if (process.platform !== 'darwin') {
      return
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const sanitizedRequest = sanitizeContextMenuRequest(request)
    if (!sanitizedRequest) return

    const template: MenuItemConstructorOptions[] = []
    const {
      hasSelection,
      isEditable,
      isContentEditable,
      hasLink,
      linkUrl,
      mouseX,
      mouseY,
      isDev,
      kind,
      isPinnedChatRow,
      isChatRowInFolder,
    } = sanitizedRequest

    const showEditActions = isEditable || isContentEditable
    const safeLinkUrl = hasLink ? maybeGetSafeHttpUrl(linkUrl) : null

    if (kind === 'chat-row') {
      template.push(
        { label: 'Rename', click: () => sendContextMenuAction(win, 'chat-rename') },
        {
          label: isPinnedChatRow ? 'Unpin' : 'Pin',
          click: () => sendContextMenuAction(win, isPinnedChatRow ? 'chat-unpin' : 'chat-pin'),
        },
        { label: 'Duplicate', click: () => sendContextMenuAction(win, 'chat-duplicate') },
        ...(isChatRowInFolder
          ? [
              {
                label: 'Remove from Space',
                click: () => sendContextMenuAction(win, 'chat-remove-from-folder'),
              },
            ]
          : []),
        { type: 'separator' },
        { label: 'Delete', click: () => sendContextMenuAction(win, 'chat-delete') }
      )
    } else if (safeLinkUrl) {
      template.push(
        {
          label: 'Open Link in Browser',
          click: () => {
            void shell.openExternal(safeLinkUrl)
          },
        },
        {
          label: 'Copy Link Address',
          click: () => {
            clipboard.writeText(safeLinkUrl)
          },
        },
        { type: 'separator' }
      )
    }

    if (kind === 'default' && showEditActions) {
      template.push(
        { label: 'Undo', click: () => sendContextMenuAction(win, 'undo') },
        { label: 'Redo', click: () => sendContextMenuAction(win, 'redo') },
        { type: 'separator' },
        { label: 'Cut', enabled: hasSelection, click: () => sendContextMenuAction(win, 'cut') },
        { label: 'Copy', enabled: hasSelection, click: () => sendContextMenuAction(win, 'copy') },
        { label: 'Paste', click: () => sendContextMenuAction(win, 'paste') },
        { type: 'separator' },
        { label: 'Select All', click: () => sendContextMenuAction(win, 'select-all') }
      )
    } else if (kind === 'default' && hasSelection) {
      template.push(
        { label: 'Copy', click: () => sendContextMenuAction(win, 'copy') },
        { type: 'separator' },
        { label: 'Select All', click: () => sendContextMenuAction(win, 'select-all') }
      )
    } else if (kind === 'default') {
      template.push({ label: 'Select All', click: () => sendContextMenuAction(win, 'select-all') })
    }

    if (!app.isPackaged && isDev) {
      template.push(
        { type: 'separator' },
        {
          label: 'Inspect Element',
          click: () => {
            if (!win.isDestroyed()) {
              win.webContents.inspectElement(mouseX, mouseY)
            }
          },
        }
      )
    }

    Menu.buildFromTemplate(template).popup({ window: win })
  })

  /**
   * Shows a native macOS delete confirmation for chat rows.
   *
   * Channel: `native-dialog:confirm-delete-chat`
   * Type: request/response
   *
   * This intentionally exposes only one fixed confirmation prompt instead of a
   * generic arbitrary-message dialog surface.
   */
  ipcMain.handle('native-dialog:confirm-delete-chat', async (event) => {
    if (process.platform !== 'darwin') {
      return false
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'none' as const,
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      destructiveId: 0,
      message: 'Delete chat?',
      detail: 'This action cannot be undone. This will permanently delete this conversation.',
      noLink: true,
    }

    const result =
      win && !win.isDestroyed()
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options)

    return result.response === 0
  })

  /**
   * Applies explicit bounds to the sender's window.
   *
   * Channel: `window-resize`
   * Type: request/response
   *
   * This exists to support the custom frameless shell on Windows where native
   * resize affordances may not be available. Input is treated as untrusted and
   * validated defensively before any bounds are applied.
   */
  ipcMain.handle('window-resize', (event, newBounds: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    // Validate that the renderer passed the minimum shape required for bounds.
    // We avoid trusting object structure from IPC input.
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

    // Coerce incoming values and reject anything non-finite so malformed input
    // cannot produce invalid BrowserWindow bounds.
    const x = Number(bounds.x)
    const y = Number(bounds.y)
    const width = Number(bounds.width)
    const height = Number(bounds.height)

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return
    }

    // Enforce a minimum size so the window remains usable even if the renderer
    // requests dimensions that are too small for the application's layout.
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
}

/**
 * Removes all system IPC handlers registered by `registerSystemHandlers`.
 *
 * This is mainly useful during teardown, reload, or test flows where the main
 * process may be initialized more than once and duplicate handler registration
 * would otherwise throw.
 */
export function unregisterSystemHandlers(): void {
  ipcMain.removeHandler('window-resize')
  ipcMain.removeHandler('window-controls:minimize')
  ipcMain.removeHandler('window-controls:toggle-maximize')
  ipcMain.removeHandler('window-controls:close')
  ipcMain.removeHandler('window-controls:is-maximized')
  ipcMain.removeHandler('app-menu:command')
  ipcMain.removeHandler('app-info:get')
  ipcMain.removeHandler('app-info:get-memory-report')
  ipcMain.removeHandler('app-info:open-about-window')
  ipcMain.removeHandler('shell:open-external')
  ipcMain.removeHandler('artifacts:open-external')
  ipcMain.removeHandler('devtools:inspect-element')
  ipcMain.removeHandler('clipboard:read-text')
  ipcMain.removeHandler('context-menu:show')
  ipcMain.removeHandler('native-dialog:confirm-delete-chat')
}
