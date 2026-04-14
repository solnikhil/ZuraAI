import { app, BrowserWindow, globalShortcut, screen } from 'electron'
import path from 'path'

import { getMainWindow, resolveDistPath, showMainWindow } from './mainWindow'

export type OverlayMode = 'hidden' | 'compact' | 'expanded'

export interface OverlaySettings {
  enabled: boolean
  launchOnStartup: boolean
  hotkey: string
  anchor: 'right'
  compactWidth: number
  expandedWidth: number
  promptAutoHideEnabled: boolean
  promptAutoHideTimeout: number
}

export interface OverlayState {
  visible: boolean
  mode: OverlayMode
  enabled: boolean
  shortcutRegistered: boolean
  hotkey: string
  launchOnStartup: boolean
  anchor: 'right'
  compactWidth: number
  expandedWidth: number
  promptAutoHideEnabled: boolean
  promptAutoHideTimeout: number
}

const DEFAULT_SETTINGS: OverlaySettings = {
  enabled: false,
  launchOnStartup: false,
  hotkey: 'CommandOrControl+Shift+/',
  anchor: 'right',
  compactWidth: 360,
  expandedWidth: 460,
  promptAutoHideEnabled: false,
  promptAutoHideTimeout: 120,
}

const WINDOW_HEIGHTS = {
  compact: 380,
  expanded: 560,
} as const

const MIN_WIDTH = 320
const MAX_WIDTH = 640
const WINDOW_MARGIN = 20

let overlayWindow: BrowserWindow | null = null
let overlaySettings: OverlaySettings = { ...DEFAULT_SETTINGS }
let overlayMode: Exclude<OverlayMode, 'hidden'> = 'expanded'
let registeredShortcut: string | null = null
let shortcutRegistered = false
let initialized = false
let destroyOnClose = false
let isDragging = false
let dragOffset = { x: 0, y: 0 }

interface OverlayAnchorBounds {
  x: number
  y: number
  width: number
  height: number
}

function clampWidth(width: number, fallback: number): number {
  if (!Number.isFinite(width)) return fallback
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)))
}

function sanitizeSettings(input: Partial<OverlaySettings>): OverlaySettings {
  const compactWidth = clampWidth(input.compactWidth ?? overlaySettings.compactWidth, DEFAULT_SETTINGS.compactWidth)
  const expandedWidth = Math.max(
    compactWidth,
    clampWidth(input.expandedWidth ?? overlaySettings.expandedWidth, DEFAULT_SETTINGS.expandedWidth)
  )

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : overlaySettings.enabled,
    launchOnStartup:
      typeof input.launchOnStartup === 'boolean'
        ? input.launchOnStartup
        : overlaySettings.launchOnStartup,
    hotkey:
      typeof input.hotkey === 'string' && input.hotkey.trim().length > 0
        ? input.hotkey.trim()
        : overlaySettings.hotkey,
    anchor: 'right',
    compactWidth,
    expandedWidth,
    promptAutoHideEnabled:
      typeof input.promptAutoHideEnabled === 'boolean'
        ? input.promptAutoHideEnabled
        : overlaySettings.promptAutoHideEnabled,
    promptAutoHideTimeout:
      typeof input.promptAutoHideTimeout === 'number' && Number.isFinite(input.promptAutoHideTimeout)
        ? Math.min(600, Math.max(30, Math.round(input.promptAutoHideTimeout)))
        : overlaySettings.promptAutoHideTimeout,
  }
}

function getModeDimensions(mode: Exclude<OverlayMode, 'hidden'>) {
  return {
    width: mode === 'expanded' ? overlaySettings.expandedWidth : overlaySettings.compactWidth,
    height: mode === 'expanded' ? WINDOW_HEIGHTS.expanded : WINDOW_HEIGHTS.compact,
  }
}

function getActiveDisplayWorkArea() {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    return screen.getDisplayMatching(mainWindow.getBounds()).workArea
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
}

function getOverlayBounds(mode: Exclude<OverlayMode, 'hidden'>) {
  const workArea = getActiveDisplayWorkArea()
  const { width, height } = getModeDimensions(mode)

  return {
    x: workArea.x + workArea.width - width - WINDOW_MARGIN,
    y: workArea.y + workArea.height - height - WINDOW_MARGIN,
    width,
    height,
  }
}

function applyWindowBounds(mode: Exclude<OverlayMode, 'hidden'>) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setBounds(getOverlayBounds(mode), false)
}

function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  const distPath = resolveDistPath(__dirname)
  const initialBounds = getOverlayBounds(overlayMode)

  overlayWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: MIN_WIDTH,
    minHeight: WINDOW_HEIGHTS.compact,
    maxWidth: MAX_WIDTH,
    maxHeight: WINDOW_HEIGHTS.expanded,
    title: 'ZuraAI Overlay',
    icon: path.join(process.env.PUBLIC || '', 'icon.png'),
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    autoHideMenuBar: true,
    backgroundMaterial: 'none',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
      backgroundThrottling: false,
      additionalArguments: ['--process-name=ZuraAI-Overlay'],
    },
  })

  overlayWindow.setAlwaysOnTop(true, 'floating')

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? overlayWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/overlay`)
    : overlayWindow.loadFile(path.join(distPath, 'index.html'), { hash: 'overlay' })

  void loadPromise.catch((error) => {
    console.error('[OVERLAY] Failed to load overlay window:', error)
  })

  overlayWindow.on('close', (event) => {
    if (destroyOnClose || !overlaySettings.enabled) {
      return
    }

    event.preventDefault()
    overlayWindow?.hide()
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

function unregisterShortcut() {
  if (registeredShortcut && globalShortcut.isRegistered(registeredShortcut)) {
    globalShortcut.unregister(registeredShortcut)
  }
  registeredShortcut = null
  shortcutRegistered = false
}

function registerShortcut() {
  unregisterShortcut()

  if (!overlaySettings.enabled || !overlaySettings.hotkey) {
    return
  }

  const success = globalShortcut.register(overlaySettings.hotkey, () => {
    const { x, y } = screen.getCursorScreenPoint()
    void showOverlayAtPosition(x, y, undefined, 'expanded')
  })

  if (!success) {
    console.warn(`[OVERLAY] Global shortcut registration failed: ${overlaySettings.hotkey}`)
    shortcutRegistered = false
    return
  }

  registeredShortcut = overlaySettings.hotkey
  shortcutRegistered = true
}

function handleDisplayMetricsChanged() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  applyWindowBounds(overlayMode)
}

export function initializeOverlay(): void {
  if (initialized) return
  initialized = true

  screen.on('display-metrics-changed', handleDisplayMetricsChanged)
  screen.on('display-added', handleDisplayMetricsChanged)
  screen.on('display-removed', handleDisplayMetricsChanged)
}

export function cleanupOverlay(): void {
  unregisterShortcut()
  screen.removeListener('display-metrics-changed', handleDisplayMetricsChanged)
  screen.removeListener('display-added', handleDisplayMetricsChanged)
  screen.removeListener('display-removed', handleDisplayMetricsChanged)

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    destroyOnClose = true
    overlayWindow.destroy()
    destroyOnClose = false
  }

  overlayWindow = null
}

export function getOverlayState(): OverlayState {
  const visible = Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())
  return {
    visible,
    mode: visible ? overlayMode : 'hidden',
    enabled: overlaySettings.enabled,
    shortcutRegistered,
    hotkey: overlaySettings.hotkey,
    launchOnStartup: overlaySettings.launchOnStartup,
    anchor: overlaySettings.anchor,
    compactWidth: overlaySettings.compactWidth,
    expandedWidth: overlaySettings.expandedWidth,
    promptAutoHideEnabled: overlaySettings.promptAutoHideEnabled,
    promptAutoHideTimeout: overlaySettings.promptAutoHideTimeout,
  }
}

export function applyOverlaySettings(input: Partial<OverlaySettings>): OverlayState {
  overlaySettings = sanitizeSettings(input)
  registerShortcut()

  if (!overlaySettings.enabled) {
    hideOverlay()
  } else if (overlayWindow && !overlayWindow.isDestroyed() && !overlayWindow.isVisible()) {
    applyWindowBounds(overlayMode)
  }

  return getOverlayState()
}

export async function showOverlay(): Promise<OverlayState> {
  if (!overlaySettings.enabled) {
    return getOverlayState()
  }

  overlayMode = 'expanded'
  const win = createOverlayWindow()
  applyWindowBounds(overlayMode)
  win.show()
  win.focus()

  return getOverlayState()
}

export async function hideOverlay(): Promise<OverlayState> {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }

  return getOverlayState()
}

export async function expandOverlay(): Promise<OverlayState> {
  if (!overlaySettings.enabled) {
    return getOverlayState()
  }

  overlayMode = 'expanded'
  const win = createOverlayWindow()
  applyWindowBounds(overlayMode)
  win.show()
  win.focus()

  return getOverlayState()
}

export async function collapseOverlay(): Promise<OverlayState> {
  if (!overlaySettings.enabled) {
    return getOverlayState()
  }

  return expandOverlay()
}

export async function toggleOverlay(): Promise<OverlayState> {
  if (!overlaySettings.enabled) {
    return getOverlayState()
  }

  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    return hideOverlay()
  }

  return expandOverlay()
}

export async function focusMainWindow(): Promise<void> {
  showMainWindow()
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null
}

export function startOverlayDrag(cursorX: number, cursorY: number): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  isDragging = true
  const bounds = overlayWindow.getBounds()
  dragOffset.x = cursorX - bounds.x
  dragOffset.y = cursorY - bounds.y
}

export function moveOverlayDrag(cursorX: number, cursorY: number): void {
  if (!isDragging || !overlayWindow || overlayWindow.isDestroyed()) return
  const bounds = overlayWindow.getBounds()
  overlayWindow.setBounds({
    x: cursorX - dragOffset.x,
    y: cursorY - dragOffset.y,
    width: bounds.width,
    height: bounds.height,
  })
}

export function endOverlayDrag(): void {
  isDragging = false
}

export async function showOverlayAtPosition(
  cursorX: number,
  cursorY: number,
  anchorBounds?: OverlayAnchorBounds,
  mode: Exclude<OverlayMode, 'hidden'> = 'expanded'
): Promise<BrowserWindow | null> {
  if (!overlaySettings.enabled) {
    return null
  }

  overlayMode = mode

  const win = createOverlayWindow()
  const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY })
  const workArea = display.workArea
  const { width: defaultWidth, height } = getModeDimensions(overlayMode)
  const width = anchorBounds?.width ?? defaultWidth

  const x = anchorBounds
    ? Math.max(workArea.x, Math.min(anchorBounds.x, workArea.x + workArea.width - width))
    : Math.max(workArea.x, Math.min(cursorX - width / 2, workArea.x + workArea.width - width - WINDOW_MARGIN))
  const y = anchorBounds
    ? Math.max(workArea.y, Math.min(anchorBounds.y, workArea.y + workArea.height - height))
    : Math.max(workArea.y, Math.min(cursorY - height / 2, workArea.y + workArea.height - height - WINDOW_MARGIN))

  win.setBounds({ x, y, width, height }, false)
  win.show()
  win.focus()

  return win
}
