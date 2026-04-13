import { ipcMain } from 'electron'

import {
  applyOverlaySettings,
  collapseOverlay,
  expandOverlay,
  focusMainWindow,
  getOverlayState,
  hideOverlay,
  showOverlay,
  startOverlayDrag,
  moveOverlayDrag,
  endOverlayDrag,
  toggleOverlay,
  type OverlaySettings,
} from '../windows/overlayWindow'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sanitizeOverlaySettings(input: unknown): Partial<OverlaySettings> {
  if (!isRecord(input)) return {}

  const settings: Partial<OverlaySettings> = {}

  if (typeof input.enabled === 'boolean') settings.enabled = input.enabled
  if (typeof input.launchOnStartup === 'boolean') settings.launchOnStartup = input.launchOnStartup
  if (typeof input.hotkey === 'string') settings.hotkey = input.hotkey
  if (input.anchor === 'right') settings.anchor = 'right'

  if (typeof input.compactWidth === 'number') settings.compactWidth = input.compactWidth
  if (typeof input.expandedWidth === 'number') settings.expandedWidth = input.expandedWidth

  return settings
}

export function registerOverlayHandlers(): void {
  ipcMain.handle('overlay:show', () => showOverlay())
  ipcMain.handle('overlay:hide', () => hideOverlay())
  ipcMain.handle('overlay:toggle', () => toggleOverlay())
  ipcMain.handle('overlay:expand', () => expandOverlay())
  ipcMain.handle('overlay:collapse', () => collapseOverlay())
  ipcMain.handle('overlay:get-state', () => getOverlayState())
  ipcMain.handle('overlay:focus-main-window', () => focusMainWindow())
  ipcMain.handle('overlay:apply-settings', (_event, settings: unknown) =>
    applyOverlaySettings(sanitizeOverlaySettings(settings))
  )
  ipcMain.on('overlay:drag-start', (_event, cursorX: number, cursorY: number) => {
    startOverlayDrag(cursorX, cursorY)
  })
  ipcMain.on('overlay:drag-move', (_event, cursorX: number, cursorY: number) => {
    moveOverlayDrag(cursorX, cursorY)
  })
  ipcMain.on('overlay:drag-end', () => {
    endOverlayDrag()
  })
}

export function unregisterOverlayHandlers(): void {
  ipcMain.removeHandler('overlay:show')
  ipcMain.removeHandler('overlay:hide')
  ipcMain.removeHandler('overlay:toggle')
  ipcMain.removeHandler('overlay:expand')
  ipcMain.removeHandler('overlay:collapse')
  ipcMain.removeHandler('overlay:get-state')
  ipcMain.removeHandler('overlay:focus-main-window')
  ipcMain.removeHandler('overlay:apply-settings')
  ipcMain.removeAllListeners('overlay:drag-start')
  ipcMain.removeAllListeners('overlay:drag-move')
  ipcMain.removeAllListeners('overlay:drag-end')
}