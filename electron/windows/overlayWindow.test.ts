import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ZURA_ENABLE_MACOS_FLOATING_WINDOWS = 'true'
})

const browserWindowInstances: any[] = []

vi.mock('electron', () => {
  const BrowserWindow = vi.fn(function MockBrowserWindow() {
    let visible = false
    const instance = {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => visible),
      setBounds: vi.fn(),
      setAlwaysOnTop: vi.fn(),
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
  showOverlayAtPosition,
  showOverlay,
} from './overlayWindow'

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

  it('opens overlay directly when the global shortcut fires', async () => {
    applyOverlaySettings({ enabled: true, compactWidth: 380, expandedWidth: 480 })

    const shortcutHandler = (globalShortcut.register as any).mock.calls[0]?.[1]
    expect(typeof shortcutHandler).toBe('function')

    await shortcutHandler()

    expect(browserWindowInstances).toHaveLength(1)
    expect(browserWindowInstances[0].setBounds).toHaveBeenCalledWith(
      {
        x: 0,
        y: 0,
        width: 480,
        height: 680,
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

  it('creates and shows the overlay window in compact mode when enabled', async () => {
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

  it('opens anchored overlay at the prompt popup origin', async () => {
    applyOverlaySettings({ enabled: true, compactWidth: 380, expandedWidth: 480 })

    await showOverlayAtPosition(500, 500, {
      x: 420,
      y: 210,
      width: 500,
      height: 236,
    })

    expect(browserWindowInstances).toHaveLength(1)
    expect(browserWindowInstances[0].setBounds).toHaveBeenCalledWith(
      {
        x: 420,
        y: 210,
        width: 500,
        height: 680,
      },
      false
    )
    expect(browserWindowInstances[0].show).toHaveBeenCalled()
    expect(browserWindowInstances[0].focus).toHaveBeenCalled()
  })

  it('does not recenter a visible overlay during settings sync', async () => {
    applyOverlaySettings({ enabled: true, compactWidth: 380, expandedWidth: 480 })

    await showOverlayAtPosition(500, 500, {
      x: 420,
      y: 210,
      width: 500,
      height: 236,
    })

    browserWindowInstances[0].setBounds.mockClear()
    applyOverlaySettings({ enabled: true, compactWidth: 360, expandedWidth: 460 })

    expect(browserWindowInstances[0].setBounds).not.toHaveBeenCalled()
  })
})
