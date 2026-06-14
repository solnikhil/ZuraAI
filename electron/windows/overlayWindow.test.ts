import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ZURA_ENABLE_MACOS_FLOATING_WINDOWS = 'true'
})

const browserWindowInstances: any[] = []

vi.mock('electron', () => {
  const BrowserWindow = vi.fn(function MockBrowserWindow() {
    let visible = false
    let bounds = { x: 0, y: 0, width: 0, height: 0 }
    const instance = {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => visible),
      getBounds: vi.fn(() => bounds),
      setBounds: vi.fn((next: Partial<typeof bounds>) => {
        bounds = { ...bounds, ...next }
      }),
      setAlwaysOnTop: vi.fn(),
      setVibrancy: vi.fn(),
      setBackgroundMaterial: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
      show: vi.fn(() => {
        visible = true
      }),
      hide: vi.fn(() => {
        visible = false
      }),
      focus: vi.fn(),
      destroy: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
      loadFile: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
    }
    browserWindowInstances.push(instance)
    return instance
  })

  return {
    app: { isPackaged: false },
    BrowserWindow,
    globalShortcut: {
      register: vi.fn(() => true),
      unregister: vi.fn(),
      isRegistered: vi.fn(() => true),
    },
    screen: {
      on: vi.fn(),
      removeListener: vi.fn(),
      getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 100 })),
      getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })),
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })),
    },
  }
})

import { globalShortcut } from 'electron'

import {
  applyOverlaySettings,
  cleanupOverlay,
  getOverlayState,
  selectOverlayMaterial,
  setOverlayContentHeight,
  showOverlay,
} from './overlayWindow'

const WINDOW_MARGIN = 20
const PILL_HEIGHT = 72
const WORK_AREA_WIDTH = 1440

describe('selectOverlayMaterial', () => {
  it('uses vibrancy on macOS', () => {
    expect(selectOverlayMaterial('darwin', 0)).toBe('vibrancy')
  })

  it('uses acrylic on Windows 11 22H2+ (build >= 22621)', () => {
    expect(selectOverlayMaterial('win32', 22631)).toBe('acrylic')
    expect(selectOverlayMaterial('win32', 22621)).toBe('acrylic')
  })

  it('falls back to css on older Windows builds', () => {
    expect(selectOverlayMaterial('win32', 19045)).toBe('css')
  })

  it('falls back to css on Linux', () => {
    expect(selectOverlayMaterial('linux', 0)).toBe('css')
  })
})

describe('overlayWindow', () => {
  beforeEach(() => {
    browserWindowInstances.length = 0
    vi.clearAllMocks()
    cleanupOverlay()
  })

  it('tracks shortcut registration state from overlay settings', () => {
    applyOverlaySettings({
      enabled: true,
      hotkey: 'CommandOrControl+Shift+/',
    })

    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+/',
      expect.any(Function)
    )
    expect(getOverlayState()).toMatchObject({
      enabled: true,
      shortcutRegistered: true,
      hotkey: 'CommandOrControl+Shift+/',
      mode: 'hidden',
    })
  })

  it('opens the overlay anchored to the top-right at pill height when the shortcut fires', async () => {
    applyOverlaySettings({ enabled: true, compactWidth: 380, expandedWidth: 480 })

    const shortcutHandler = (globalShortcut.register as any).mock.calls[0]?.[1]
    expect(typeof shortcutHandler).toBe('function')

    await shortcutHandler()

    expect(browserWindowInstances).toHaveLength(1)
    expect(browserWindowInstances[0].setBounds).toHaveBeenCalledWith(
      {
        x: WORK_AREA_WIDTH - 480 - WINDOW_MARGIN,
        y: WINDOW_MARGIN,
        width: 480,
        height: PILL_HEIGHT,
      },
      false
    )
    expect(browserWindowInstances[0].show).toHaveBeenCalled()
    expect(browserWindowInstances[0].focus).toHaveBeenCalled()
    expect(getOverlayState().mode).toBe('expanded')
  })

  it('does not show the overlay when the feature is disabled', async () => {
    applyOverlaySettings({ enabled: false })

    const state = await showOverlay()

    expect(browserWindowInstances).toHaveLength(0)
    expect(state.visible).toBe(false)
    expect(state.mode).toBe('hidden')
  })

  it('creates and shows the overlay window top-right when enabled', async () => {
    applyOverlaySettings({ enabled: true, compactWidth: 380, expandedWidth: 480 })

    const state = await showOverlay()

    expect(browserWindowInstances).toHaveLength(1)
    expect(browserWindowInstances[0].show).toHaveBeenCalled()
    expect(browserWindowInstances[0].focus).toHaveBeenCalled()
    expect(state.visible).toBe(true)
    expect(state.mode).toBe('expanded')
    expect(state.compactWidth).toBe(380)
    expect(state.expandedWidth).toBe(480)
  })

  it('grows the window to a clamped content height', async () => {
    applyOverlaySettings({ enabled: true, compactWidth: 380, expandedWidth: 480 })
    await showOverlay()
    browserWindowInstances[0].setBounds.mockClear()

    setOverlayContentHeight(300)
    expect(browserWindowInstances[0].setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ width: 480, height: 300 }),
      expect.any(Boolean)
    )

    browserWindowInstances[0].setBounds.mockClear()
    setOverlayContentHeight(99999)
    expect(browserWindowInstances[0].setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ height: 680 }),
      expect.any(Boolean)
    )

    browserWindowInstances[0].setBounds.mockClear()
    setOverlayContentHeight(10)
    expect(browserWindowInstances[0].setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ height: PILL_HEIGHT }),
      expect.any(Boolean)
    )
  })

  it('ignores non-finite content heights', async () => {
    applyOverlaySettings({ enabled: true, expandedWidth: 480 })
    await showOverlay()
    browserWindowInstances[0].setBounds.mockClear()

    setOverlayContentHeight(Number.NaN)
    expect(browserWindowInstances[0].setBounds).not.toHaveBeenCalled()
  })

  it('does not reposition a visible overlay during settings sync', async () => {
    applyOverlaySettings({ enabled: true, compactWidth: 380, expandedWidth: 480 })
    await showOverlay()

    browserWindowInstances[0].setBounds.mockClear()
    applyOverlaySettings({ enabled: true, compactWidth: 360, expandedWidth: 460 })

    expect(browserWindowInstances[0].setBounds).not.toHaveBeenCalled()
  })
})
