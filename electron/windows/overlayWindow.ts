import os from 'os'
import { app, BrowserWindow, globalShortcut, screen } from 'electron'
import path from 'path'

import { OVERLAY_IDLE_HEIGHT } from '../../src/components/overlay/overlayLayout'
import { getMainWindow, resolveDistPath, showMainWindow } from './mainWindow'
import { resolveAppIconPath } from '../windowIcon'
import { trackAnalyticsEvent } from '../analytics'

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

// The redesigned overlay is a single-width Siri/Spotlight surface whose height is
// content-driven: it opens as a short "pill" and grows into a taller "card" as the
// renderer measures its content and reports the target height via IPC.
const PILL_HEIGHT = OVERLAY_IDLE_HEIGHT
const MAX_CONTENT_HEIGHT = 680
const MIN_WIDTH = 320
const MAX_WIDTH = 640
const WINDOW_MARGIN = 20
const OVERLAY_SUPPORTED =
  process.platform !== 'darwin' || process.env.ZURA_ENABLE_MACOS_FLOATING_WINDOWS === 'true'

export type OverlayMaterialKind = 'vibrancy' | 'acrylic' | 'css'

// Windows 11 22H2 is the first build where `backgroundMaterial: 'acrylic'` is supported.
const WINDOWS_11_22H2_BUILD = 22621

let overlayWindow: BrowserWindow | null = null
let overlaySettings: OverlaySettings = { ...DEFAULT_SETTINGS }
let registeredShortcut: string | null = null
let shortcutRegistered = false
let initialized = false
let destroyOnClose = false
let isDragging = false
const dragOffset = { x: 0, y: 0 }

/**
 * Pure platform/material decision so it can be unit-tested without Electron.
 * - macOS  → native `vibrancy` (true desktop blur + native animation)
 * - Win11 22H2+ → native `acrylic` background material
 * - everything else (Win10, Linux) → CSS-approximated dark glass fallback
 */
export function selectOverlayMaterial(
  platform: NodeJS.Platform,
  windowsBuild: number
): OverlayMaterialKind {
  if (platform === 'darwin') return 'vibrancy'
  if (platform === 'win32' && windowsBuild >= WINDOWS_11_22H2_BUILD) return 'acrylic'
  return 'css'
}

function getWindowsBuildNumber(): number {
  // os.release() looks like '10.0.22631' on Windows; the third segment is the build.
  const parts = os.release().split('.')
  const build = Number(parts[2])
  return Number.isFinite(build) ? build : 0
}

function resolveOverlayMaterial(): OverlayMaterialKind {
  return selectOverlayMaterial(process.platform, getWindowsBuildNumber())
}

function applyOverlayMaterial(win: BrowserWindow, kind: OverlayMaterialKind): void {
  try {
    if (kind === 'vibrancy') {
      win.setVibrancy('hud')
    } else if (kind === 'acrylic') {
      win.setBackgroundMaterial?.('acrylic')
    }
    // 'css' relies on the renderer's translucent glass fallback; nothing to do here.
  } catch (error) {
    console.warn('[OVERLAY] Failed to apply window material:', error)
  }
}

function clampWidth(width: number, fallback: number): number {
  if (!Number.isFinite(width)) return fallback
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)))
}

function sanitizeSettings(input: Partial<OverlaySettings>): OverlaySettings {
  if (!OVERLAY_SUPPORTED) {
    return {
      ...DEFAULT_SETTINGS,
      enabled: false,
      launchOnStartup: false,
    }
  }

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

// The pill and the card share a single width (Siri-style); we use the configured
// expanded width as the canonical overlay width.
function getOverlayWidth(): number {
  return clampWidth(overlaySettings.expandedWidth, DEFAULT_SETTINGS.expandedWidth)
}

function getActiveDisplayWorkArea() {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    return screen.getDisplayMatching(mainWindow.getBounds()).workArea
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
}

function clampHeight(
  height: number,
  workArea: { y: number; height: number },
  top: number
): number {
  const available = workArea.y + workArea.height - top - WINDOW_MARGIN
  const max = Math.max(PILL_HEIGHT, Math.min(MAX_CONTENT_HEIGHT, available))
  if (!Number.isFinite(height)) return PILL_HEIGHT
  return Math.min(max, Math.max(PILL_HEIGHT, Math.round(height)))
}

// Top-right anchored bounds against the active display work area.
function getOverlayBounds(height: number = PILL_HEIGHT) {
  const workArea = getActiveDisplayWorkArea()
  const width = getOverlayWidth()
  const top = workArea.y + WINDOW_MARGIN

  return {
    x: workArea.x + workArea.width - width - WINDOW_MARGIN,
    y: top,
    width,
    height: clampHeight(height, workArea, top),
  }
}

// Re-pin the overlay to the top-right corner while preserving its current height.
function repositionOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const bounds = overlayWindow.getBounds()
  overlayWindow.setBounds(getOverlayBounds(bounds.height), false)
}

function createOverlayWindow(): BrowserWindow {
  if (!OVERLAY_SUPPORTED) {
    throw new Error('Overlay is disabled on macOS.')
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  const distPath = resolveDistPath(__dirname)
  const initialBounds = getOverlayBounds(PILL_HEIGHT)
  const isMacOS = process.platform === 'darwin'
  const materialKind = resolveOverlayMaterial()
  // Acrylic fills the entire window and cannot combine with `transparent: true`;
  // every other path keeps a transparent window and lets the renderer draw glass.
  const useAcrylic = materialKind === 'acrylic'

  overlayWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: MIN_WIDTH,
    minHeight: PILL_HEIGHT,
    maxWidth: MAX_WIDTH,
    maxHeight: MAX_CONTENT_HEIGHT,
    title: 'ZuraAI Overlay',
    icon: resolveAppIconPath(),
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: !useAcrylic,
    backgroundColor: useAcrylic ? '#1c1c1ecc' : '#00000000',
    hasShadow: isMacOS,
    autoHideMenuBar: true,
    backgroundMaterial: useAcrylic ? 'acrylic' : 'none',
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
  if (isMacOS) {
    overlayWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true })
  }

  applyOverlayMaterial(overlayWindow, materialKind)

  const overlayHash = `overlay?material=${materialKind}`
  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? overlayWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/${overlayHash}`)
    : overlayWindow.loadFile(path.join(distPath, 'index.html'), { hash: overlayHash })

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

  if (!OVERLAY_SUPPORTED || !overlaySettings.enabled || !overlaySettings.hotkey) {
    return
  }

  const success = globalShortcut.register(overlaySettings.hotkey, () => {
    void showOverlay('shortcut')
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
  repositionOverlay()
}

export function initializeOverlay(): void {
  if (!OVERLAY_SUPPORTED) return
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
    mode: visible ? 'expanded' : 'hidden',
    enabled: OVERLAY_SUPPORTED && overlaySettings.enabled,
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
    void hideOverlay()
  } else if (overlayWindow && !overlayWindow.isDestroyed() && !overlayWindow.isVisible()) {
    repositionOverlay()
  }

  return getOverlayState()
}

export async function showOverlay(source: string = 'unknown'): Promise<OverlayState> {
  if (!OVERLAY_SUPPORTED || !overlaySettings.enabled) {
    return getOverlayState()
  }

  const win = createOverlayWindow()
  repositionOverlay()
  win.show()
  win.focus()

  void trackAnalyticsEvent('overlay_opened', { source })

  return getOverlayState()
}

export async function hideOverlay(): Promise<OverlayState> {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }

  return getOverlayState()
}

export async function expandOverlay(): Promise<OverlayState> {
  return showOverlay('command_palette')
}

export async function collapseOverlay(): Promise<OverlayState> {
  return showOverlay('command_palette')
}

export async function toggleOverlay(): Promise<OverlayState> {
  if (!OVERLAY_SUPPORTED || !overlaySettings.enabled) {
    return getOverlayState()
  }

  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    return hideOverlay()
  }

  return showOverlay('toggle')
}

export async function focusMainWindow(): Promise<void> {
  showMainWindow()
}

/**
 * Content-driven sizing for the pill→card animation. The renderer measures its
 * content and reports a target height; the window grows/shrinks downward while the
 * top-right corner stays pinned. macOS gets a native animated resize; Windows snaps
 * to the target in a single step to avoid the confirmed acrylic-resize flicker bug
 * (electron/electron#46753).
 */
export function setOverlayContentHeight(height: number): OverlayState {
  if (!overlayWindow || overlayWindow.isDestroyed()) return getOverlayState()
  if (!Number.isFinite(height)) return getOverlayState()

  const bounds = overlayWindow.getBounds()
  const workArea = getActiveDisplayWorkArea()
  const target = clampHeight(height, workArea, bounds.y)

  if (target === bounds.height) return getOverlayState()

  const animate = process.platform === 'darwin'
  overlayWindow.setBounds(
    { x: bounds.x, y: bounds.y, width: bounds.width, height: target },
    animate
  )

  return getOverlayState()
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
