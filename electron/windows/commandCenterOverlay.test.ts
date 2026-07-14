// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browserWindowInstances: Array<{
  isDestroyed: ReturnType<typeof vi.fn>
  isVisible: ReturnType<typeof vi.fn>
  isFocused: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  setOpacity: ReturnType<typeof vi.fn>
  setBounds: ReturnType<typeof vi.fn>
  getBounds: ReturnType<typeof vi.fn>
  removeMenu: ReturnType<typeof vi.fn>
  setBackgroundMaterial?: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  webContents: {
    setWindowOpenHandler: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    setBackgroundThrottling?: ReturnType<typeof vi.fn>
  }
  loadURL: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
}> = []

vi.mock('electron', () => {
  class BrowserWindow {
    isDestroyed = vi.fn(() => false)
    isVisible = vi.fn(() => false)
    isFocused = vi.fn(() => false)
    hide = vi.fn(() => {
      this.isVisible.mockReturnValue(false)
    })
    show = vi.fn(() => {
      this.isVisible.mockReturnValue(true)
    })
    focus = vi.fn(() => {
      this.isFocused.mockReturnValue(true)
    })
    destroy = vi.fn(() => {
      this.isDestroyed.mockReturnValue(true)
    })
    setOpacity = vi.fn()
    setBounds = vi.fn()
    getBounds = vi.fn(() => ({ x: 0, y: 0, width: 760, height: 480 }))
    removeMenu = vi.fn()
    setBackgroundMaterial = vi.fn()
    on = vi.fn()
    once = vi.fn((event: string, cb: () => void) => {
      if (event === 'ready-to-show') {
        // Defer so create() can finish assigning module state
        queueMicrotask(() => {
          cb()
        })
      }
    })
    webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
    }
    loadURL = vi.fn(async () => undefined)
    loadFile = vi.fn(async () => undefined)

    constructor(public options: Record<string, unknown>) {
      browserWindowInstances.push(this as never)
    }
  }

  return {
    app: {
      isPackaged: true,
      getPath: () => '/tmp',
    },
    BrowserWindow,
    shell: { openExternal: vi.fn() },
    screen: {
      getDisplayNearestPoint: () => ({
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      }),
      getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    },
  }
})

vi.mock('../windowIcon', () => ({
  resolveAppIconPath: () => '/icon.png',
}))

vi.mock('./mainWindow', () => ({
  resolveDistPath: () => '/dist',
}))

describe('warm Command Center overlay', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    browserWindowInstances.length = 0
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173/'
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.VITE_DEV_SERVER_URL
  })

  it('keeps the hidden renderer warm briefly, then reclaims it', async () => {
    const overlay = await import('./commandCenterOverlay')

    overlay.preloadCommandCenterWindow()
    await vi.runAllTicks()
    overlay.showCommandCenterWindow()

    expect(browserWindowInstances).toHaveLength(1)
    const win = browserWindowInstances[0]
    win.isVisible.mockReturnValue(true)

    overlay.hideCommandCenterWindow()
    expect(win.hide).toHaveBeenCalled()
    expect(overlay.__isCommandCenterIdleDestroyScheduledForTests()).toBe(true)

    await vi.advanceTimersByTimeAsync(overlay.COMMAND_CENTER_IDLE_DESTROY_MS - 1)
    expect(win.destroy).not.toHaveBeenCalled()

    win.isVisible.mockReturnValue(false)
    overlay.showCommandCenterWindow()
    expect(browserWindowInstances).toHaveLength(1)
    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()

    overlay.hideCommandCenterWindow()
    await vi.advanceTimersByTimeAsync(overlay.COMMAND_CENTER_IDLE_DESTROY_MS)
    expect(win.destroy).toHaveBeenCalledOnce()
  }, 15_000)

  it('uses backgroundThrottling true so hidden overlay can sleep', async () => {
    const overlay = await import('./commandCenterOverlay')
    overlay.showCommandCenterWindow()
    await vi.runAllTicks()

    const created = browserWindowInstances[0]
    const prefs = (
      created as unknown as {
        options: {
          paintWhenInitiallyHidden: boolean
          webPreferences: { backgroundThrottling: boolean }
        }
      }
    ).options
    expect(prefs.paintWhenInitiallyHidden).toBe(true)
    expect(prefs.webPreferences.backgroundThrottling).toBe(true)
  })

  it('loads the dedicated packaged renderer entry', async () => {
    delete process.env.VITE_DEV_SERVER_URL
    const overlay = await import('./commandCenterOverlay')
    overlay.preloadCommandCenterWindow()
    await vi.runAllTicks()

    expect(browserWindowInstances[0].loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/command-center\.html$/)
    )
  })
})
