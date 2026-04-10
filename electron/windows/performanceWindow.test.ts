// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const browserWindowInstance = {
  isDestroyed: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  restore: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  removeMenu: vi.fn(),
  loadURL: vi.fn().mockResolvedValue(undefined),
  loadFile: vi.fn().mockResolvedValue(undefined),
  once: vi.fn(),
  on: vi.fn(),
  webContents: {
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
  },
}

const electronMocks = vi.hoisted(() => ({
  app: {
    isPackaged: false,
  },
  BrowserWindow: vi.fn(function MockBrowserWindow() {
    return browserWindowInstance
  }),
  shell: {
    openExternal: vi.fn(),
  },
}))

vi.mock('electron', () => electronMocks)
vi.mock('./mainWindow', () => ({
  getMainWindow: vi.fn(() => null),
  resolveDistPath: vi.fn(() => 'C:/app/dist'),
}))

describe('performanceWindow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('focuses the existing performance window instead of creating duplicates', async () => {
    const { createPerformanceWindow } = await import('./performanceWindow')

    const first = createPerformanceWindow()
    const second = createPerformanceWindow()

    expect(first).toBe(second)
    expect(electronMocks.BrowserWindow).toHaveBeenCalledTimes(1)
    expect(browserWindowInstance.show).toHaveBeenCalled()
    expect(browserWindowInstance.focus).toHaveBeenCalled()
  })
})
